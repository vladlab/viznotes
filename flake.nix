{
  description = "vizNotes — Tauri 2 + Vue 3 desktop app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ (import rust-overlay) ];
        };

        rustToolchain = pkgs.rust-bin.stable.latest.default;

        tauriDeps = with pkgs; [
          pkg-config
          gobject-introspection
          openssl
          libsoup_3
          webkitgtk_4_1
          gtk3
          glib
          cairo
          pango
          gdk-pixbuf
          atk
          harfbuzz
          gsettings-desktop-schemas
          dconf
          xdg-utils
        ];

        libraryPath = pkgs.lib.makeLibraryPath tauriDeps;

      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs_22
            rustToolchain
            pkgs.cargo-tauri
            pkgs.patchelf
          ] ++ tauriDeps;

          shellHook = ''
            export LD_LIBRARY_PATH="${libraryPath}:$LD_LIBRARY_PATH"
            export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"
            export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"
            export GIO_EXTRA_MODULES="${pkgs.dconf.lib}/lib/gio/modules"

            # WebKitGTK workarounds for Wayland + NVIDIA
            #Rexport GDK_BACKEND=x11
            export WEBKIT_DISABLE_DMABUF_RENDERER=1

            echo "🚀 vizNotes dev environment (Tauri 2)"
            echo "   node: $(node --version)"
            echo "   cargo: $(cargo --version 2>/dev/null || echo 'n/a')"
            echo ""
            echo "Commands:"
            echo "   npm install                # install JS deps (first time)"
            echo "   npm run tauri dev          # run desktop app"
            echo "   npm run dev                # web-only dev server"
            echo "   ./build-appimage.sh        # build portable AppImage"
          '';
        };
      }
    );
}
