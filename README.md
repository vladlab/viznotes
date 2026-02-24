# DeepNotes Lite

A spatial note-taking app inspired by [DeepNotes](https://deepnotes.app). Runs as a web app (IndexedDB) or Tauri desktop app (local JSON files).

## Quick Start — Desktop (Tauri)

```bash
nix develop
npm install
npm run tauri dev
```

## Quick Start — Web Only

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Data stored in IndexedDB.

## Storage

**Web:** IndexedDB via Dexie.js  
**Desktop:** Vault-based — pick any folder, all data stored as readable JSON

```
~/Documents/my-vault/
├── meta.json
└── pages/
    ├── V1StGXR8_Z5j.json   # { page, notes, arrows }
    └── abc123def456.json
```

## Features

- Infinite spatial canvas with pan/zoom
- Rich text editing (Tiptap)
- Infinitely nested notes
- Spatial + list container modes
- Bezier curve arrows with fixed anchors
- Drag-to-reconnect arrow endpoints
- Page linking with breadcrumb navigation
- Box/lasso selection, multi-select group drag
- Full undo/redo
- Drag-and-drop files → notes with path links
- Note colors, resize, collapse
- JSON export/import
- Vault picker (Obsidian-style folder selection)
