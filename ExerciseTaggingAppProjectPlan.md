# Exercise Tagging App – Project Plan

## 1) Purpose

Build a web app for physiotherapists to efficiently tag exercises in the exercise library, with a core focus on speed, consistency, and quality at scale.

The app must support:
- 7,000+ exercises (and growing)
- 5–10 concurrent physiotherapist taggers
- Fast assignment of structured tags
- Copy tags from one exercise and paste onto one or many target exercises, then edit only differences

## 2) Success Criteria

### Business outcomes
- Reduce average tagging time per exercise by at least 50% compared to manual entry.
- Reach 95% library coverage with complete tags.
- Minimize inconsistent tagging across clinicians.

### Product outcomes
- User can copy tags from any exercise and paste to selected exercises in 2–3 clicks.
- User can bulk select multiple exercises and apply copied tags in one action.
- User can paste in either mode:
	- Replace all tags
	- Merge tags (keep existing + add missing)
- System maintains full audit history of who changed what and when.

### Quality outcomes
- <2 seconds median load time for exercise list/search.
- <1 second median save response for single exercise update.
- No silent data overwrite (conflict handling required).

## 3) Scope

### In scope (MVP)
- Secure login and role-based access.
- Exercise browsing with search, filters, and pagination/virtualization.
- Exercise detail panel with editable structured tag fields.
- Copy/Paste tags workflow (single and multi-select targets).
- Bulk tag editing and review before save.
- Versioning and audit log.
- Import existing exercise list and links.
- Export tagged dataset (CSV/XLSX).

### Out of scope (MVP)
- AI auto-tagging (future phase).
- Advanced analytics dashboards beyond operational reporting.
- Mobile-native apps.

## 4) Users & Roles

- **Tagger (Physiotherapist):** create/update tags, copy/paste tags, bulk edits.
- **Reviewer (Senior Physio/Lead):** validate tagging quality, approve corrections.
- **Admin:** manage users, tag taxonomy, system settings, imports/exports.

## 5) Functional Requirements

### 5.1 Exercise Management
- Display exercise name, media/link, current tag completeness, last updated by/date.
- Support text search and multi-filter (e.g., muscle area, equipment, body position, difficulty).
- Support keyboard-friendly navigation for high-volume data entry.

### 5.2 Tagging Form
- Structured fields based on taxonomy (e.g., muscle, joint, body position, planes of movement, level, stream, equipment).
- Required/optional field rules.
- Controlled vocabularies (dropdown, multi-select, chips) to enforce consistency.
- Field validation and inline error feedback.

### 5.2.1 Widget Strategy for Muscle Area
- Use a **grouped searchable multi-select** as the primary widget (typeahead + checkbox list + selected chips).
- Source of truth is taxonomy-driven (from `TaggingCategories`), not free text.
- Default grouping for fast scan:
	- Neck
	- Shoulder/Chest
	- Upper arm/Forearm/Wrist/Hand
	- Abdominal/Spinal
	- Gluteal/Hip
	- Thigh (Quad/Hamstring/Adductors)
	- Lower leg/Foot
- Support keyboard-first entry:
	- type to filter
	- arrow keys to navigate
	- Enter to select
	- Backspace to remove last chip
- Add **quick actions** for repetitive work:
	- "Use previous value"
	- "Use copied values"
	- "Clear all"
- For scalability, virtualize long option lists and debounce search input.

### 5.2.2 Widget Strategy for Planes of Movement
- Use a **matrix widget**: rows = joint regions, columns = planes.
- Joint rows (from current taxonomy):
	- Hip, Knee, Ankle, Midfoot, Toes
	- Shoulder, Elbow, Wrist, MCP, Fingers
	- Cervical, Thoracic, Lumbar
- Planes are fixed controlled options:
	- Frontal
	- Sagittal
	- Transverse
- Each row supports multi-select across planes (checkbox pills/toggles).
- Add row-level quick actions:
	- "All 3 planes"
	- "Clear row"
	- "Copy row to…" (e.g., copy Hip setup to Knee)
- Add global quick actions:
	- "Apply same planes to lower limb rows"
	- "Apply same planes to spine rows"
- Display compact summary chips in exercise list filters (e.g., `Hip: Frontal+Sagittal`).

### 5.3 Copy/Paste Tags (Core)
- Copy tags from source exercise.
- Paste to one target exercise or many selected exercises.
- Paste modes:
	- **Replace All:** overwrite all editable tag fields.
	- **Merge Missing:** fill only empty fields on targets.
	- **Selective Fields:** user chooses which fields to apply.
- Preview summary before save:
	- number of exercises affected
	- fields changed
	- conflict warnings
- Undo last bulk paste action within session.

### 5.4 Bulk Operations
- Multi-select exercises from list.
- Apply common tags to selected set.
- Optional “mark as reviewed” status update.

### 5.5 Audit, Quality, and Review
- Store immutable audit events for all create/update/delete tag actions.
- Show change history per exercise.
- Reviewer can flag inconsistent or incomplete tags.

## 6) Non-Functional Requirements

- **Performance:** responsive with 7,000+ exercises and expected growth.
- **Scalability:** support concurrent edits by 10+ users.
- **Reliability:** autosave or explicit save with clear unsaved-change indicators.
- **Security:** authenticated access, role-based authorization, encrypted data in transit and at rest.
- **Data integrity:** optimistic locking/version checks to prevent accidental overwrite.
- **Usability:** low-click workflow optimized for repetitive data entry.

## 7) Proposed Architecture

### Frontend
- Web SPA (React + TypeScript recommended).
- Componentized tag editor with reusable controlled inputs.
- Global state for selected exercises + copied tag payload.

### Backend API
- REST API (or GraphQL) for exercises, tags, bulk operations, and audit logs.
- Endpoints for copy/paste preview + apply.
- Server-side validation of tag schema and permissions.

### Data Layer
- Relational database (PostgreSQL recommended).
- Key entities:
	- `Exercise`
	- `TagDefinition` (taxonomy metadata)
	- `ExerciseTagValue`
	- `TagPasteOperation`
	- `AuditEvent`
	- `User`, `Role`

### Infrastructure
- Cloud-hosted app service + managed DB.
- Object/link storage integration for exercise media links.
- Scheduled backup and monitoring/alerting.

## 8) Data Model Principles

- Separate **tag definitions** from **tag values** to allow taxonomy evolution.
- Support single-value and multi-value fields.
- Store provenance metadata:
	- created_by, updated_by
	- created_at, updated_at
	- source of change (manual edit, paste operation, bulk update)
- Keep audit events append-only.
- Add **taxonomy normalization layer** before persisting values:
	- canonical value: `Sagittal`
	- accepted alias on import: `Saggital`
- Persist canonical codes + labels (e.g., `sagittal`, `frontal`, `transverse`) to avoid spelling drift.
- Store muscle area as `tag_option_id` references, not raw strings.

### 8.1 Taxonomy Observations from Current Sheets (March 2026 Snapshot)
- `TaggingCategories` contains ~42 non-empty `Muscle area` values in the current seed data.
- All `Planes of movement *` columns currently use a 3-value set: Frontal, Saggital/Sagittal, Transverse.
- `ExerciseName&Link` has 1300+ exercise rows in the current file, so widgets must remain responsive now and scale to 7000+.
- Recommendation: lock planes as fixed enum and keep muscle area taxonomy-managed by admin UI.

### 8.2 Final Canonical Value Map (Confirmed)

Taxonomy baseline is now confirmed from `TaggingCategories`.

#### 8.2.1 Canonical enums
- Planes of movement enum (all plane fields):
	- `frontal` -> `Frontal`
	- `sagittal` -> `Sagittal`
	- `transverse` -> `Transverse`

#### 8.2.2 Alias-to-canonical mapping (ingest + migration)
- Planes of movement:
	- `Saggital` -> `Sagittal`
	- `saggital` -> `Sagittal`
	- `sagittal` -> `Sagittal`
- Equipment:
	- `Total gym` -> `Total Gym`

#### 8.2.3 Normalization pipeline (applied before validation)
1. Trim leading/trailing whitespace.
2. Collapse repeated internal spaces to one space.
3. Case-fold for lookup only (preserve canonical display case on write).
4. Apply alias map by field.
5. Validate against allowed options for that field.
6. Reject unknown values with actionable error (field, value, allowed examples).

#### 8.2.4 Storage rules
- Persist canonical `option_code` and `option_label` only.
- Preserve original imported raw value in audit metadata for traceability.
- Never re-introduce aliases in exports; always export canonical labels.

#### 8.2.5 Governance
- Alias map is admin-managed, versioned, and auditable.
- Any new alias requires reviewer approval and migration preview count before apply.

## 9) UX Workflow (Target)

1. User searches/filter list to find source exercise.
2. User opens source and clicks **Copy Tags**.
3. User selects target exercise(s) from list.
4. User clicks **Paste Tags**.
5. User chooses paste mode (Replace/Merge/Selective).
6. User reviews preview of impacted fields.
7. User confirms apply.
8. System saves changes and logs one grouped audit operation.

### 9.1 UX Flow for Muscle Area + Plane Widgets

1. User opens an exercise and lands on tagging panel.
2. In **Muscle area**, user types to filter and selects one or more grouped options.
3. In **Planes matrix**, user ticks applicable planes per joint row.
4. User optionally clicks **Copy Tags** and pastes to selected exercises.
5. In paste preview, user can keep only muscle/plane fields checked (selective paste).
6. User confirms; system saves and records grouped audit entry.

## 10) Paste Semantics Spec

### 10.1 Precedence Model
- Paste uses a two-level precedence rule:
	1. **Field-level strategy override** (if set)
	2. **Global paste mode** (fallback)
- If no field-level override exists, global mode applies.
- Recommended defaults:
	- Single target paste -> `Replace`
	- Multi-target paste -> `Merge`

### 10.2 Global Modes
- `Replace`:
	- Overwrite included target fields with source values.
	- Empty source value is treated as a deliberate clear.
- `Merge`:
	- Add source values without removing existing target values.
	- Empty source value causes no change.
- `Selective`:
	- User chooses included fields/rows; each included field then follows its selected mode (`Replace` or `Merge`).

### 10.3 Muscle Area Semantics (Multi-select Set)
- `Replace`:
	- `target.muscle_area = source.muscle_area`
	- If source set is empty, target set is cleared (subject to required-field guard).
- `Merge`:
	- `target.muscle_area = union(target.muscle_area, source.muscle_area)`
	- Never removes existing target values.
	- If source set is empty, no change.

### 10.4 Planes Matrix Semantics (Row -> Set of Planes)
- Matrix rows: Hip, Knee, Ankle, Midfoot, Toes, Shoulder, Elbow, Wrist, MCP, Fingers, Cervical, Thoracic, Lumbar.
- `Replace` (per included row):
	- `target[row] = source[row]`
	- Empty source row clears target row (subject to required-field guard).
- `Merge` (per included row):
	- `target[row] = union(target[row], source[row])`
	- Never removes existing row values.
	- Empty source row causes no change.
- Rows not included in selective paste remain unchanged.

### 10.5 Normalization and Validation Order
1. Normalize source values using canonical map before diffing (`Saggital` -> `Sagittal`).
2. Validate source values against allowed options per field.
3. Compute field/row diffs according to selected semantics.
4. Enforce required-field guards before commit.
5. Persist canonical values and audit event.

### 10.6 Safety Rules
- **Required-field guard:** block operations that would clear required values.
- **Destructive action confirmation:** require explicit confirmation for any replace operation that clears data.
- **Preview-first:** always show adds/removes/clears before apply.
- **No silent overwrite:** if target changed since load, require refresh/retry (optimistic locking).

### 10.7 Paste Preview Contract
- Preview shows:
	- Number of target exercises.
	- Per-field and per-row change counts.
	- Explicit lists of `Added`, `Removed`, `Cleared`, `Unchanged`.
	- Warnings for blocked changes (required fields, conflicts).
- User can deselect fields/rows from preview before final apply.

### 10.8 Audit Contract
- One grouped audit operation per paste action with:
	- actor, timestamp, source exercise id
	- target exercise ids
	- mode (`Replace`/`Merge`/`Selective`)
	- included fields/rows
	- before/after snapshots (or compact diffs)
	- blocked/skipped change reasons

## 11) Security & Compliance

- SSO integration if available (Azure AD/Entra ID).
- Role-based permission matrix for edit/review/admin actions.
- Full audit trail retained per policy.
- Least-privilege access for database and admin functions.

## 12) Implementation Roadmap

### Phase 0: Discovery & Design (1–2 weeks)
- Finalize taxonomy fields and validation rules.
- Confirm workflows with physiotherapist stakeholders.
- Produce UI wireframes and acceptance criteria.

### Phase 1: MVP Build (4–6 weeks)
- Auth + user roles.
- Exercise list/search/detail.
- Tag editor and single-save flows.
- Copy/paste tags with preview and bulk apply.
- Basic audit log and export.

### Phase 2: Stabilization (2–3 weeks)
- Performance tuning for large lists.
- Conflict handling and robust error recovery.
- QA/UAT fixes.

### Phase 3: Rollout & Adoption (1–2 weeks)
- Train 5–10 physiotherapists.
- Pilot with subset of exercises.
- Full rollout for entire library.

## 13) Testing Strategy

- **Unit tests:** tag validation, merge/replace logic, paste field selection.
- **Integration tests:** bulk paste transaction integrity and audit logging.
- **E2E tests:** clinician workflows from search to save/review.
- **Performance tests:** 7,000+ exercise list, concurrent tag saves.
- **UAT:** real physiotherapists validate speed and usability.

## 14) Risks & Mitigations

- **Inconsistent taxonomy usage** → strict controlled vocab + reviewer checks.
- **Bulk edit mistakes** → mandatory preview + undo + audit rollback support.
- **Concurrency conflicts** → optimistic locking + conflict resolution prompt.
- **Adoption resistance** → involve clinicians in design + short training loops.

## 15) Operational Reporting

- Tagging progress by user and by category.
- Completeness score per exercise.
- Number of bulk operations and error rates.
- Review backlog and turnaround time.

## 16) Definition of Done (MVP)

MVP is complete when:
- Users can search and tag exercises reliably.
- Copy/paste tags works for single and multiple exercises with preview.
- Audit trail captures all tag changes.
- Performance targets are met on production-like data.
- UAT sign-off is received from physiotherapy stakeholders.

## 17) Immediate Next Steps

1. Define exact paste behavior for muscle area and planes matrix (replace vs merge precedence).
2. Create wireframes for:
	- grouped muscle area selector
	- planes matrix widget
	- selective paste preview
3. Implement normalization service with field-specific alias map and validation errors.
4. Run one-time migration to canonicalize existing non-canonical values (starting with `Saggital` and `Total gym`).
5. Validate widget prototypes with 2–3 physiotherapists using real exercises.
