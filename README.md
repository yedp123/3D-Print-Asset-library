# 3D Print Asset Library

An asset browsing and management desktop application tailored for 3D printing enthusiasts and Bambu Studio users.

> **Note:** This project was vibe coded in a freestyle manner with no specific architecture in mind. Expect pragmatism, rapid iteration, and direct solutions over strict design patterns!

<img width="1920" height="1040" alt="Preview_2" src="https://github.com/user-attachments/assets/702eade9-9e4d-4ce7-92a0-985bdbdf5353" />


---

## Overview

Managing large libraries of 3D printing models (`.3mf`, `.step`, `.stl`, `.obj`) can quickly get messy. This app provides a fast, dark-mode desktop interface to index, preview, search, tag, and inspect your 3D assets directly from your local or network drives.

### Key Features

- **Folder-per-Model Indexing:** Scans your library folders for models, automatically picking up custom preview images and 3D files (`.3mf`, `.stp`, `.step`, `.stl`, `.obj`).
- **Deep `.3mf` Inspection:** Stream-reads `.3mf` project metadata, automatically extracting plate preview thumbnails, estimated print times, filament weights, and calculated material costs.
- **Filament Color Matching:** Extracts embedded filament colors from `.3mf` files and matches them to real-world filaments using color distance calculations.
- **Interactive Multi-File Badges:** Format badges show available file types with single-click reveal in Windows Explorer or multi-file dropdown pickers.
- **Unified 1-Image Carousel:** Smooth preview carousel showing custom folder images and auto-extracted `.3mf` plate renders.
- **Direct Bambu Studio Launch:** Open project files directly in Bambu Studio with a single click.
- **Search & Tagging:** Filter models by name, category tags, or filament colors.

---

## Tech Stack

- **Backend:** [Tauri v2](https://v2.tauri.app/) (Rust)
- **Frontend:** React 18, TypeScript, Vite
- **Styling & UI:** TailwindCSS, Lucide React
- **System Integration:** Windows Explorer file reveal via `dunce` UNC path normalization

---

## Getting Started

### Prerequisites

1. **Node.js** (v18 or later recommended)
2. **Rust & Cargo** ([Install Rust](https://www.rust-lang.org/tools/install))
3. Windows C++ Build Tools (required by Tauri on Windows)
4. (Optional) [Bambu Studio](https://bambulab.com/en/download/studio) installed

### Installation & Running

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yedp123/3D-Print-Asset-library.git
   cd "3D Print Asset library"
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Start development mode:**
   ```bash
   npm run tauri dev
   ```

4. **Build a standalone release executable:**
   ```bash
   npm run tauri build
   ```

---

## Configuration

The application reads and writes `config.json` and `filament_catalog.json` located right next to the executable (in release mode) or at the project root (in dev mode). You can configure your library root folder and Bambu Studio executable path directly within the UI or via `config.json`.
