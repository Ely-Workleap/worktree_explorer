# Worktree Explorer

A desktop app to manage Git worktrees. Scan a root folder for repositories, view worktree status at a glance, and create/delete/open worktrees with one click.

Built with **Tauri v2** (Rust backend) + **React** + **TypeScript** + **Tailwind CSS v4** + **shadcn/ui**.

## Features

- **Repository scanning** — Recursively discovers Git repos with worktrees under a configurable root folder
- **Worktree status** — Shows branch name, dirty/clean state, ahead/behind counts, and file change count
- **Create worktrees** — New branch (with searchable base branch picker) or existing branch
- **Delete worktrees** — With confirmation dialog, handles locked worktrees
- **Merge base branch** — One-click merge of the base branch into a worktree (stored in `.worktree-meta.json`)
- **Open in editors** — VS Code, Visual Studio, Explorer, or Terminal buttons on every worktree card
- **Dark mode** — Toggle between light and dark themes (persisted in localStorage)
- **Auto-refresh** — Worktree status refreshes on window focus

## Prerequisites

- **Node.js** >= 20
- **Rust** (stable MSVC toolchain on Windows)
- **Microsoft C++ Build Tools** (Visual Studio with "Desktop development with C++")

## Development

```bash
# Install frontend dependencies
npm install

# Run in development mode (opens the app window with hot-reload)
npm run tauri dev
```

On Windows with a non-standard MSVC installation, use the provided scripts that set up the build environment:

```bash
# Development
run.bat

# Build / other tauri commands
build.bat build
```

## Build

```bash
npm run tauri build
```

The installer will be in `src-tauri/target/release/bundle/`.

## Project Structure

```
├── src/                        # React frontend
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── layout/             # Header, Sidebar, MainPanel
│   │   ├── worktree/           # WorktreeCard, CreateDialog, etc.
│   │   └── settings/           # SettingsDialog
│   ├── hooks/                  # React Query hooks
│   ├── lib/                    # Tauri invoke wrappers, store, utils
│   └── types/                  # TypeScript interfaces
├── src-tauri/                  # Rust backend
│   └── src/
│       ├── commands/           # Tauri command handlers
│       └── git/                # Git operations (git2 + walkdir)
├── build.bat                   # Windows build with MSVC env setup
└── run.bat                     # Windows dev launcher
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 |
| Backend | Rust, git2 (vendored libgit2), walkdir |
| Frontend | React 19, TypeScript, Vite 7 |
| Styling | Tailwind CSS v4, shadcn/ui, Radix UI |
| State management | TanStack React Query |
| Persistence | @tauri-apps/plugin-store, localStorage |
