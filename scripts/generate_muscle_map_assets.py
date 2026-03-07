from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_CSV = ROOT / 'TaggingCategories.csv'
OUTPUT_JSON = ROOT / 'web' / 'public' / 'muscle_map.json'
OUTPUT_SVG = ROOT / 'web' / 'public' / 'muscle_map.svg'


def slugify(value: str) -> str:
    base = value.strip().lower()
    base = re.sub(r'[^a-z0-9]+', '_', base)
    base = re.sub(r'_+', '_', base).strip('_')
    if not base:
        base = 'unknown'
    return f'muscle_{base}'


def infer_view(tag: str) -> str:
    text = tag.lower()
    back_terms = [
        'posterior',
        'spinal',
        'lumbar',
        'thoracic',
        'glute',
        'hamstring',
        'calf',
        'back',
        'extensor',
        'trapezius',
        'rhombo',
        'infraspinatus',
        'teres',
    ]
    if any(term in text for term in back_terms):
        return 'back'
    return 'front'


def load_muscle_areas() -> list[str]:
    with TAXONOMY_CSV.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        values = {(row.get('Muscle area') or '').strip() for row in reader}
    return sorted([value for value in values if value])


def to_entries(muscle_areas: list[str]) -> list[dict[str, str]]:
    seen: dict[str, int] = {}
    entries: list[dict[str, str]] = []
    for tag in muscle_areas:
        identifier = slugify(tag)
        if identifier in seen:
            seen[identifier] += 1
            identifier = f'{identifier}_{seen[identifier]}'
        else:
            seen[identifier] = 1
        entries.append(
            {
                'id': identifier,
                'tag': tag,
                'view': infer_view(tag),
            }
        )
    return entries


def write_svg(entries: list[dict[str, str]]) -> None:
    front = [entry for entry in entries if entry['view'] == 'front']
    back = [entry for entry in entries if entry['view'] == 'back']

    card_width = 250
    row_height = 34
    margin = 16
    top_pad = 64

    max_rows = max(len(front), len(back), 1)
    height = top_pad + max_rows * row_height + 24
    width = 2 * card_width + 3 * margin

    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg"',
        f'     width="{width}" height="{height}" viewBox="0 0 {width} {height}"',
        '     role="img" aria-label="Normalized muscle map front and back">',
        '  <defs>',
        '    <style>',
        '      .panel-bg { fill: #f8fafc; stroke: #cbd5e1; stroke-width: 1; }',
        '      .panel-title { font: 600 16px sans-serif; fill: #0f172a; }',
        '      .muscle-zone { fill: #e2e8f0; stroke: #94a3b8; stroke-width: 1; cursor: pointer; }',
        '      .zone-label { font: 12px sans-serif; fill: #0f172a; pointer-events: none; user-select: none; }',
        '    </style>',
        '  </defs>',
        f'  <rect class="panel-bg" x="{margin}" y="{margin}" width="{card_width}" height="{height - margin * 2}" rx="10"/>',
        f'  <rect class="panel-bg" x="{2 * margin + card_width}" y="{margin}" width="{card_width}" height="{height - margin * 2}" rx="10"/>',
        f'  <text class="panel-title" x="{margin + 10}" y="{margin + 24}">Front View</text>',
        f'  <text class="panel-title" x="{2 * margin + card_width + 10}" y="{margin + 24}">Back View</text>',
    ]

    def add_rows(items: list[dict[str, str]], x_origin: int) -> None:
        for index, entry in enumerate(items):
            y = top_pad + index * row_height
            svg.append(
                f'  <rect id="{entry["id"]}" class="muscle-zone" x="{x_origin + 10}" y="{y}" width="{card_width - 20}" height="26" rx="8"/>'
            )
            svg.append(
                f'  <text class="zone-label" x="{x_origin + 18}" y="{y + 17}">{entry["tag"]}</text>'
            )

    add_rows(front, margin)
    add_rows(back, 2 * margin + card_width)

    svg.append('</svg>')
    OUTPUT_SVG.write_text('\n'.join(svg), encoding='utf-8')


def main() -> None:
    muscle_areas = load_muscle_areas()
    entries = to_entries(muscle_areas)

    OUTPUT_JSON.write_text(json.dumps({'version': 1, 'entries': entries}, indent=2), encoding='utf-8')
    write_svg(entries)

    print(f'Generated {len(entries)} mappings.')
    print(f'JSON: {OUTPUT_JSON}')
    print(f'SVG:  {OUTPUT_SVG}')


if __name__ == '__main__':
    main()
