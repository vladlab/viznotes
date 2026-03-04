# vizNotes

A spatial note-taking application built with Vue 3 and Tauri 2. Notes live on an infinite canvas with rich text editing, nested containers, arrows, bidirectional links, and file integration.

## Getting Started

```bash
# With Nix (recommended)
nix develop
npm install
npm run tauri dev

# Without Nix
npm install
npm run tauri dev
```

Requires Node.js, Rust toolchain, and Tauri 2 prerequisites. Optional: FFmpeg/ffprobe for media analysis features.

## Architecture

**Frontend:** Vue 3 + Vite + TypeScript
**Editor:** TipTap 3 (ProseMirror)
**Desktop shell:** Tauri 2 (Rust)
**Storage:** Local JSON files in a user-chosen vault folder

```
~/my-vault/
├── meta.json
├── assets/          # images, waveforms
└── pages/
    └── <id>.json    # { page, notes, arrows, links }
```

## Core Concepts

**Notes** are the fundamental unit. Each note has a head (title), optional body (rich text), optional container (child notes), and optional links to other notes. Notes can be freely positioned on the canvas or nested inside other notes' containers.

**Containers** hold child notes in either list or columns layout. A week view, for example, is a columns-container with 7 day-column children, each a list-container. Nesting is unlimited.

**Arrows** are bezier curves connecting any two notes with configurable anchor points.

**Links** are bidirectional many-to-many relationships between notes on the same page. Distinct from arrows — links are metadata, arrows are visual.

**Pages** are separate canvases navigable via the sidebar. Notes can link to other pages, with breadcrumb navigation for traversal.

## Features

### Canvas
- Infinite pan/zoom canvas
- Split view — two panes viewing different pages simultaneously
- Box and lasso selection, multi-select group operations
- Drag-and-drop reordering within and between containers
- Canvas context menu with week view generator

### Notes
- Rich text editing with markdown shortcuts, tables, task lists, images
- Per-section folding — independently collapse Data, Notes, Container, and Links sections
- Node types (Default, Note, Timeline, File, Status) with colored header bars
- Customizable note colors, resize handles
- Copy/paste and duplicate with full hierarchy preservation

### File Notes
- Drag files onto the canvas to create file notes with path references
- Click the file icon to reveal the file in your system file manager (with file selection on macOS, Linux via DBus, Windows)
- File replacement — drop a new file onto an existing file note to update the reference; old file info is preserved in version history
- Missing file detection — icon turns red when the referenced file no longer exists
- Media analysis via FFmpeg: stream info, codec details, timecode, duration
- Waveform generation for audio tracks

### Data System
Each note has an auto-generated Data section (autoBody) with named subsections that update independently:
- **Path** — current file path (replaced on file swap)
- **Analysis** — ffprobe output and waveform images (replaced on re-analysis)
- **File History** — timestamped log of previous file references (appended)

### Undo/Redo
Full undo/redo across all operations: note creation/deletion, moves, edits, arrow manipulation, link changes, container reordering, and fold state changes.

### Export
- HTML export of selected notes with full hierarchy
- File table export (tab-separated) for file notes
- JSON page import/export

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Hold to pan canvas |
| `Tab` | Toggle fold on selected notes |
| `Delete` / `Backspace` | Delete selected notes/arrows |
| `Escape` | Deselect / cancel linking / stop editing |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+C` | Copy selected notes |
| `Ctrl+V` | Paste |
| `Ctrl+D` | Duplicate selected notes |
| `Ctrl+E` | Export selected as HTML |
| `Ctrl+Shift+E` | Export file table |
| `Ctrl+Shift+T` | Open settings |
| Double-click canvas | Create new note |
| Double-click note | Edit note |
| Double-click container | Add child note |

## Settings

- UI scale
- Font family (system fonts)
- Scroll mode (touchpad / mouse)
- Theme (dark / paper)

## Tech Stack

- **Vue 3.5** — reactive UI with composition API
- **Tauri 2** — lightweight desktop shell, Rust backend for file I/O, FFmpeg integration
- **TipTap 3** — ProseMirror-based rich text with markdown, tables, images, task lists
- **Vite 7** — build tooling
- **Nix flake** — reproducible dev environment
