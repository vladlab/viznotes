#!/usr/bin/env bash
#
# Build a portable AppImage for vizNotes.
# Run from within `nix develop`.
#
set -euo pipefail

PNAME="viznotes"
VERSION="0.1.0"
BINARY_NAME="viznotes"
APPDIR="$(pwd)/target/appimage/${PNAME}.AppDir"
TOOLS_DIR="$(pwd)/target/appimage/tools"

echo "──── Step 1: Build frontend ────"
npm run build:web

echo "──── Step 2: Build Rust binary ────"
cd src-tauri
cargo build --release --features tauri/custom-protocol
cd ..

BINARY="src-tauri/target/release/${BINARY_NAME}"
if [ ! -f "$BINARY" ]; then
  echo "ERROR: Binary not found at $BINARY"
  exit 1
fi

echo "──── Step 3: Assemble AppDir ────"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin"
mkdir -p "$APPDIR/usr/share/applications"
mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"

cp "$BINARY" "$APPDIR/usr/bin/${BINARY_NAME}"

# .desktop file
cat > "$APPDIR/${PNAME}.desktop" << EOF
[Desktop Entry]
Name=vizNotes
Exec=${BINARY_NAME}
Icon=${PNAME}
Type=Application
Categories=Utility;
EOF
cp "$APPDIR/${PNAME}.desktop" "$APPDIR/usr/share/applications/"

# Icon
ICON_SRC="src-tauri/icons/icon.png"
if [ -f "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$APPDIR/${PNAME}.png"
  cp "$ICON_SRC" "$APPDIR/usr/share/icons/hicolor/256x256/apps/${PNAME}.png"
else
  echo "WARNING: No icon found at $ICON_SRC"
  printf '\x89PNG\r\n\x1a\n' > "$APPDIR/${PNAME}.png"
fi

# AppRun — launches through bundled ld-linux to avoid host glibc mismatch
cat > "$APPDIR/AppRun" << 'APPRUN'
#!/usr/bin/env bash
SELF=$(readlink -f "$0")
HERE=${SELF%/*}
export PATH="${HERE}/usr/bin:${PATH}"
export XDG_DATA_DIRS="${HERE}/usr/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
export GIO_MODULE_DIR="${HERE}/usr/lib/gio/modules:${GIO_MODULE_DIR:-}"
exec "${HERE}/usr/lib/ld-linux-x86-64.so.2" \
  --library-path "${HERE}/usr/lib" \
  "${HERE}/usr/bin/BINARY_NAME" "$@"
APPRUN
sed -i "s/BINARY_NAME/${BINARY_NAME}/g" "$APPDIR/AppRun"
chmod +x "$APPDIR/AppRun"

echo "──── Step 4: Bundle shared libraries ────"
mkdir -p "$APPDIR/usr/lib"

# Bundle the dynamic linker itself (doesn't appear in ldd "=>" output)
LINKER=$(patchelf --print-interpreter "$APPDIR/usr/bin/${BINARY_NAME}" 2>/dev/null) || true
if [ -n "$LINKER" ] && [ -f "$LINKER" ]; then
  cp -L "$LINKER" "$APPDIR/usr/lib/ld-linux-x86-64.so.2"
fi

copy_deps() {
  local binary="$1"
  local libs
  libs=$(ldd "$binary" 2>/dev/null | grep "=> /" | awk '{print $3}') || true
  for lib in $libs; do
    local dest="$APPDIR/usr/lib/$(basename "$lib")"
    if [ ! -f "$dest" ]; then
      cp -L "$lib" "$dest" 2>/dev/null || true
    fi
  done
}

copy_deps "$APPDIR/usr/bin/${BINARY_NAME}"

# Recursively resolve deps of deps
for _pass in 1 2 3; do
  for lib in "$APPDIR"/usr/lib/*.so*; do
    if [ -f "$lib" ]; then
      copy_deps "$lib"
    fi
  done
done

echo "  Bundled $(ls "$APPDIR/usr/lib/" | wc -l) libraries"

# Make everything writable (nix store copies are read-only)
chmod -R u+w "$APPDIR"

# Patch ALL nix store references out of every binary and library
echo "  Patching nix store references..."

patch_elf() {
  local file="$1"
  local rpath_target="$2"  # $ORIGIN for libs, $ORIGIN/../lib for binary

  # Set rpath
  patchelf --set-rpath "$rpath_target" "$file" 2>/dev/null || true

  # Replace any NEEDED entries with full /nix/store paths
  local needed_list
  needed_list=$(patchelf --print-needed "$file" 2>/dev/null) || true
  for needed in $needed_list; do
    if [[ "$needed" == /nix/store/* ]]; then
      local base
      base=$(basename "$needed")
      patchelf --replace-needed "$needed" "$base" "$file" 2>/dev/null || true
      # Bundle the lib if not already present
      if [ ! -f "$APPDIR/usr/lib/$base" ] && [ -f "$needed" ]; then
        cp -L "$needed" "$APPDIR/usr/lib/$base"
        chmod u+w "$APPDIR/usr/lib/$base"
      fi
    fi
  done
}

# Patch main binary (rpath only — interpreter is bypassed by AppRun's ld-linux invocation)
patch_elf "$APPDIR/usr/bin/${BINARY_NAME}" '$ORIGIN/../lib'

# Patch all libraries (multiple passes to catch newly added deps)
for _pass in 1 2 3; do
  for lib in "$APPDIR"/usr/lib/*.so*; do
    if [ -f "$lib" ]; then
      patch_elf "$lib" '$ORIGIN'
    fi
  done
done

# Verify no nix store references remain
echo "  Verifying..."
nix_remaining=0
for file in "$APPDIR/usr/bin/${BINARY_NAME}" "$APPDIR"/usr/lib/*.so*; do
  if [ -f "$file" ] && patchelf --print-rpath "$file" 2>/dev/null | grep -q "/nix/store"; then
    echo "  WARNING: rpath still has nix ref: $(basename "$file")"
    nix_remaining=$((nix_remaining + 1))
  fi
  if [ -f "$file" ] && patchelf --print-needed "$file" 2>/dev/null | grep -q "/nix/store"; then
    echo "  WARNING: NEEDED still has nix ref: $(basename "$file")"
    nix_remaining=$((nix_remaining + 1))
  fi
done
echo "  Final count: $(ls "$APPDIR/usr/lib/" | wc -l) libraries, $nix_remaining nix refs remaining"

echo "──── Step 5: Get appimagetool ────"
mkdir -p "$TOOLS_DIR"
APPIMAGETOOL="$TOOLS_DIR/appimagetool-x86_64.AppImage"
if [ ! -f "$APPIMAGETOOL" ]; then
  echo "  Downloading appimagetool..."
  curl -L -o "$APPIMAGETOOL" \
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
  chmod +x "$APPIMAGETOOL"
fi

echo "──── Step 6: Build AppImage ────"
OUTPUT="vizNotes-${VERSION}-x86_64.AppImage"
export APPIMAGE_EXTRACT_AND_RUN=1
ARCH=x86_64 "$APPIMAGETOOL" "$APPDIR" "$OUTPUT"

echo ""
echo "✅ Built: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "   Run anywhere: ./$OUTPUT"
