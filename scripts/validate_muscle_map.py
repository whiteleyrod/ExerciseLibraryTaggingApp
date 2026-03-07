from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_CSV = ROOT / 'TaggingCategories.csv'
MUSCLE_MAP_JSON = ROOT / 'web' / 'public' / 'muscle_map.json'


def load_taxonomy_muscle_areas() -> set[str]:
    with TAXONOMY_CSV.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        values = {(row.get('Muscle area') or '').strip() for row in reader}
    return {value for value in values if value}


def load_muscle_map_tags() -> set[str]:
    payload = json.loads(MUSCLE_MAP_JSON.read_text(encoding='utf-8'))
    entries = payload.get('entries', [])
    return {str(entry.get('tag', '')).strip() for entry in entries if str(entry.get('tag', '')).strip()}


def main() -> int:
    taxonomy = load_taxonomy_muscle_areas()
    mapping = load_muscle_map_tags()

    missing = sorted(taxonomy - mapping)
    extras = sorted(mapping - taxonomy)

    if not missing and not extras:
        print(f'OK: 1:1 mapping verified for {len(taxonomy)} muscle areas.')
        return 0

    print('Mapping mismatch detected:')
    if missing:
        print('Missing from muscle_map.json:')
        for item in missing:
            print(f'  - {item}')
    if extras:
        print('Present in muscle_map.json but not in TaggingCategories:')
        for item in extras:
            print(f'  - {item}')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
