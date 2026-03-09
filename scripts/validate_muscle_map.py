from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_CSV = ROOT / 'TaggingCategories.csv'
MUSCLE_MAP_JSON = ROOT / 'web' / 'public' / 'muscle_selector_map.json'


def load_taxonomy_rows() -> list[dict[str, str]]:
    with TAXONOMY_CSV.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        rows = [{k: (v or '').strip() for k, v in row.items()} for row in reader]
    return rows


def load_taxonomy_muscle_areas(rows: list[dict[str, str]]) -> set[str]:
    values = {(row.get('Muscle area') or '').strip() for row in rows}
    return {value for value in values if value}


def load_muscle_map_tags() -> set[str]:
    payload = json.loads(MUSCLE_MAP_JSON.read_text(encoding='utf-8'))
    entries = payload.get('entries', [])
    return {str(entry.get('tag', '')).strip() for entry in entries if str(entry.get('tag', '')).strip()}


def load_lookup_covered_areas(rows: list[dict[str, str]]) -> set[str]:
    involved_to_areas: dict[str, set[str]] = {}
    for row in rows:
        area = (row.get('Muscle area') or '').strip()
        involved = (row.get('Muscles involved') or '').strip()
        if not area or not involved:
            continue
        key = involved.lower()
        involved_to_areas.setdefault(key, set()).add(area)

    unique_lookup_areas: set[str] = set()
    for areas in involved_to_areas.values():
        if len(areas) == 1:
            unique_lookup_areas.update(areas)
    return unique_lookup_areas


def main() -> int:
    taxonomy_rows = load_taxonomy_rows()
    taxonomy = load_taxonomy_muscle_areas(taxonomy_rows)
    mapping = load_muscle_map_tags()
    lookup_areas = load_lookup_covered_areas(taxonomy_rows)
    runtime_covered = mapping | lookup_areas

    missing = sorted(taxonomy - mapping)
    missing_runtime = sorted(taxonomy - runtime_covered)
    extras = sorted(mapping - taxonomy)

    if not missing_runtime and not extras:
        print(f'OK: runtime coverage verified for {len(taxonomy)} muscle areas.')
        if missing:
            print(f'Info: {len(missing)} areas are resolved via Muscles involved lookup fallback.')
        return 0

    print('Mapping mismatch detected:')
    if missing:
        print('Missing from muscle_selector_map.json:')
        for item in missing:
            print(f'  - {item}')
    if missing_runtime:
        print('Unresolved by runtime (selector map + lookup fallback):')
        for item in missing_runtime:
            print(f'  - {item}')
    if extras:
        print('Present in muscle_selector_map.json but not in TaggingCategories:')
        for item in extras:
            print(f'  - {item}')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
