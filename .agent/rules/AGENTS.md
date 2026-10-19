# Project: Bambu Studio 3D Asset & Filament Manager (Tauri v2 + Rust + React + TypeScript)

## 1. Core Architecture & Non-Negotiable Technical Constraints
- **Stack:** Tauri v2 (Rust backend), React 18, Vite, TypeScript, TailwindCSS, Lucide React icons.
- **Portable Config Next to Executable:** NEVER use OS `%APPDATA%` for `config.json` or `filament_catalog.json`. In Production, resolve paths relative to `std::env::current_exe()?.parent()`. In Dev mode (`cfg!(debug_assertions)`), fallback to the workspace root directory so hot-reloading does not loop.
- **UNC Path Normalization & Explorer Compatibility:** Always use the `dunce` crate when normalizing paths on Windows. Never pass `\\?\` extended-length path prefixes to `explorer.exe /select,<path>`, or Windows Explorer will fail to highlight the file.
- **Resilient Folder Scanning:** Each top-level subfolder inside `root_path` is ONE `ModelEntry`. Scan known subfolders (`previews`, `3mf`, `stp`, `step`, `stl`, `obj`) case-insensitively, AND catch any loose matching files directly inside the model folder root.
- **1-Image Gallery System:** Every Model Card and Detail Modal must use a unified 1-image viewport featuring left/right hover arrows (`e.stopPropagation()` so clicking arrows on a card does NOT trigger the modal) and interactive bottom pagination dots indicating image order (custom `previews/` images first, followed by auto-extracted `.3mf` plate thumbnails).
- **Multi-File Format Badges:** If a format folder (e.g., `/stp/`) has 1 file, clicking `[STP]` immediately reveals and highlights that file in Windows Explorer. If it has >1 files (e.g., `[STP (3)]`), clicking the badge opens a compact popover menu allowing the user to either open the `/stp/` folder or click a specific file to highlight in Explorer.

## 2. Agent Roles (Invoke in Prompts via Role Name)
- **`[ROLE: RUST_ARCHITECT]`**: Owns `src-tauri/`. Specializes in portable path resolution, UNC network path conversion, `explorer.exe /select` shell execution, and incremental `_library_cache.json` indexing.
- **`[ROLE: 3MF_SURGEON]`**: Owns `src-tauri/src/threemf.rs`. Specializes in stream-reading `.3mf` ZIP headers (`zip` crate), parsing `Metadata/project_settings.config` (JSON) and `Metadata/slice_info.config` (XML), extracting `Metadata/plate_*.png` to `.thumbnails/`, and matching hex colors against `filament_catalog.json` via RGB Delta-E distance.
- **`[ROLE: UI_DIRECTOR]`**: Owns `src/`. Specializes in clean dark-mode industrial UI (Bambu Studio aesthetic), the 1-image carousel with arrows + bottom dots, multi-file format badge popovers, and the search + filament color swatch filter bar.

## 3. Strict Coding Safeguards
- Modify ONLY the files and functions explicitly demanded in the current prompt.
- Do NOT remove, refactor, or break existing working functionalities, types, or Tauri commands.
- Always log clear `[DEBUG]` messages in both Rust (`println!`) and Frontend (`console.log`) for verification.