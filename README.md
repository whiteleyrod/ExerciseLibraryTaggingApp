# Exercise Tagging App

Web application for physiotherapist exercise tagging with high-throughput workflows (search, multi-select, copy/paste semantics, and dockable pane layout).

## Current Implementation Status (March 2026)

### Built and working
- React + TypeScript SPA in `web/`.
- Exercise loading and preview from `web/public/ExerciseName_Link.csv`.
- Dockable pane system with draggable pane reordering, horizontal/vertical resize, reset, and presets.
- 4-row layout (`2 / 3 / 4 / 3`) with vertical page scrolling to access lower panes.
- Tagging panes for:
  - Muscle area map + manual area selection
  - Muscles involved (grouped from workbook)
  - Joints pane + planes matrix
  - Equipment (8 category groups from workbook)
  - Body position (multi-select)
  - Difficulty (slider)
  - Level (multi-select, sourced from `TaggingCategories.csv` column `Level`)
- Copy/paste workflow with merge/replace semantics and per-field includes.
- Local persistence of tags in browser `localStorage`.

### Data source model in use
- Source CSVs/workbooks are authored at repo root.
- Runtime app reads from `web/public/*` (served by Vite).
- When source files are updated, sync/regenerate to `web/public` before testing.

## Data Files and Their Usage

- `TaggingCategories.csv`
  - Source-of-truth taxonomy for body position, difficulty, and level.
  - Synced runtime copy: `web/public/TaggingCategories.csv`.
- `Muscle, joint, area.xlsx`
  - Source workbook for muscle area + grouped muscles/joints panes.
  - Runtime outputs:
    - `web/public/MuscleJointArea.csv`
    - `web/public/MusclePaneGroups.csv`
    - JSON mirrors of both files
- `EquipmentTags.xlsx`
  - Source workbook for equipment categories and item lists.
  - Runtime outputs:
    - `web/public/EquipmentTags.csv`
    - `web/public/EquipmentTags.json`

## Scripts

Run from repo root:

```bash
.venv/Scripts/python.exe scripts/export_muscle_joint_area.py
.venv/Scripts/python.exe scripts/validate_muscle_map.py
```

`export_muscle_joint_area.py` now exports:
- Muscle taxonomy/group assets from `Muscle, joint, area.xlsx`
- Equipment assets from `EquipmentTags.xlsx`

`validate_muscle_map.py` verifies mapping consistency against current taxonomy.

## UI / UX Notes

- Pane drag/reorder is header-only, preventing accidental pane drag when interacting with controls (e.g., difficulty slider).
- Joints pane layout responds to pane width (not only viewport width).
- Row/column resizers rebalance remaining space across sibling panes.

## Local Development

```bash
cd web
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`).

## Build Validation

```bash
cd web
npm run build
```

## Remaining Major Roadmap Items

1. Backend API + database persistence layer
2. Auth + role-based access control
3. Server-side audit trail and history UI
4. Conflict handling and robust multi-user concurrency
5. Export/review workflows for production operations
