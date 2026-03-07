# Exercise Tagging App

Initial MVP scaffold for physiotherapist exercise tagging, based on `ExerciseTaggingAppProjectPlan.md`.

## What is implemented (MVP foundation)

- React + TypeScript web app scaffold in `web/`
- Loads real data from:
  - `web/public/ExerciseName_Link.csv`
  - `web/public/TaggingCategories.csv`
- Exercise library list with search and multi-select
- Tag editor for:
  - Muscle Area (searchable multi-select)
  - Planes of Movement (joint-row matrix)
- Copy/Paste tagging with formal semantics:
  - Global mode: `Replace` or `Merge`
  - Field-level override: `Use global`, `Replace`, `Merge`
  - Include toggles for Muscle Area and Planes Matrix
- Canonical plane normalization (`Saggital` -> `Sagittal`)
- Local persistence of tags in browser `localStorage`

## Run locally

```bash
cd web
npm install
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173`).

## Validate build

```bash
cd web
npm run build
```

## Suggested next implementation steps

1. Add backend API + database schema (`Exercise`, `TagDefinition`, `ExerciseTagValue`, `TagPasteOperation`, `AuditEvent`)
2. Add auth + role-based permissions
3. Add server-side validation + normalization service
4. Add paste preview API and conflict handling
5. Add audit history screens and export workflows

## GitHub push

If this folder is not yet connected to GitHub, run:

```bash
git init
git add .
git commit -m "Initial MVP scaffold for exercise tagging app"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

If remote already exists, set/update as needed:

```bash
git remote -v
git remote set-url origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```
