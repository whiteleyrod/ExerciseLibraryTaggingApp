from __future__ import annotations

import csv
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_CSV = ROOT / 'web' / 'public' / 'MuscleJointArea.csv'
OUTPUT_JSON = ROOT / 'web' / 'public' / 'muscle_map.json'
OUTPUT_SVG = ROOT / 'web' / 'public' / 'muscle_map.svg'


RegionBounds = tuple[int, int, int, int]

FRONT_BODY_REGION_BOUNDS: dict[str, RegionBounds] = {
    'neck': (86, 80, 58, 34),
    'shoulder_chest': (56, 118, 120, 56),
    'abdomen': (76, 178, 78, 72),
    'upper_arm': (40, 254, 152, 52),
    'hip': (76, 310, 78, 44),
    'thigh': (62, 358, 106, 92),
    'lower_leg_foot': (58, 454, 114, 92),
}

BACK_BODY_REGION_BOUNDS: dict[str, RegionBounds] = {
    'neck': (406, 80, 58, 34),
    'back_upper': (376, 118, 120, 58),
    'back_mid': (396, 180, 78, 72),
    'upper_arm': (360, 256, 152, 50),
    'glute_hip': (396, 310, 78, 44),
    'hamstring_thigh': (384, 358, 102, 90),
    'calf_foot': (380, 452, 110, 94),
}

FRONT_HAND_REGION_BOUNDS: dict[str, RegionBounds] = {
    'forearm': (742, 114, 102, 116),
    'wrist': (742, 234, 102, 36),
    'thumb': (742, 274, 46, 60),
    'fingers': (790, 274, 54, 60),
}

BACK_HAND_REGION_BOUNDS: dict[str, RegionBounds] = {
    'forearm': (1062, 114, 102, 116),
    'wrist': (1062, 234, 102, 36),
    'thumb': (1062, 274, 46, 60),
    'fingers': (1110, 274, 54, 60),
}


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


def is_hand_forearm_tag(tag: str) -> bool:
    text = tag.lower()
    hand_terms = ['forearm', 'wrist', 'thumb', 'finger', 'hand', 'metacarp']
    return any(term in text for term in hand_terms)


def infer_region(tag: str, view: str, panel: str) -> str:
    text = tag.lower()

    if panel in {'front_hand', 'back_hand'}:
        if 'wrist' in text:
            return 'wrist'
        if 'thumb' in text:
            return 'thumb'
        if any(term in text for term in ['finger', 'metacarp', 'hand']):
            return 'fingers'
        return 'forearm'

    if 'neck' in text or 'cervical' in text:
        return 'neck'

    if view == 'front':
        if any(term in text for term in ['shoulder', 'chest', 'deltoid', 'pectoral', 'subclavius']):
            return 'shoulder_chest'
        if any(term in text for term in ['upper arm', 'biceps', 'triceps', 'brachialis', 'anconeus']):
            return 'upper_arm'
        if any(term in text for term in ['abdominal', 'oblique', 'transversus']):
            return 'abdomen'
        if any(term in text for term in ['hip', 'psoas', 'iliacus', 'tensor fasciae', 'rotator']):
            return 'hip'
        if any(term in text for term in ['thigh', 'quadriceps', 'adductor', 'vastus', 'gracilis', 'rectus femoris']):
            return 'thigh'
        return 'lower_leg_foot'

    if any(term in text for term in ['trapezius', 'rhombo', 'infraspinatus', 'teres', 'shoulder posterior']):
        return 'back_upper'
    if any(term in text for term in ['upper arm', 'biceps', 'triceps', 'brachialis', 'anconeus']):
        return 'upper_arm'
    if any(term in text for term in ['spinal', 'lumbar', 'thoracic', 'multifidus', 'quadratus']):
        return 'back_mid'
    if any(term in text for term in ['glute', 'hip', 'piriformis', 'obturator', 'gemellus']):
        return 'glute_hip'
    if any(term in text for term in ['hamstring', 'biceps femoris', 'semitendinosus', 'semimembranosus']):
        return 'hamstring_thigh'
    return 'calf_foot'


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
        view = infer_view(tag)
        panel = f'{view}_hand' if is_hand_forearm_tag(tag) else f'{view}_body'
        entries.append(
            {
                'id': identifier,
                'tag': tag,
                'view': view,
                'panel': panel,
                'region': infer_region(tag, view, panel),
            }
        )
    return entries


def write_svg(entries: list[dict[str, str]]) -> None:
    width = 1240
    height = 620

    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg"',
        f'     width="{width}" height="{height}" viewBox="0 0 {width} {height}"',
        '     role="img" aria-label="Normalized muscle map front and back">',
        '  <defs>',
        '    <style>',
        '      .panel-bg { fill: #f8fafc; stroke: #cbd5e1; stroke-width: 1; }',
        '      .panel-title { font: 600 16px sans-serif; fill: #0f172a; }',
        '      .silhouette { fill: #e2e8f0; stroke: #94a3b8; stroke-width: 1.2; }',
        '      .muscle-zone { fill: rgba(59, 130, 246, 0.22); stroke: #1d4ed8; stroke-width: 1; cursor: pointer; }',
        '    </style>',
        '  </defs>',
        '  <rect class="panel-bg" x="20" y="20" width="270" height="580" rx="14"/>',
        '  <rect class="panel-bg" x="340" y="20" width="270" height="580" rx="14"/>',
        '  <rect class="panel-bg" x="660" y="20" width="270" height="580" rx="14"/>',
        '  <rect class="panel-bg" x="980" y="20" width="270" height="580" rx="14"/>',
        '  <text class="panel-title" x="36" y="48">Body Front</text>',
        '  <text class="panel-title" x="356" y="48">Body Back</text>',
        '  <text class="panel-title" x="676" y="48">Hand/Forearm Front</text>',
        '  <text class="panel-title" x="996" y="48">Hand/Forearm Back</text>',
        '  <circle class="silhouette" cx="115" cy="68" r="20"/>',
        '  <rect class="silhouette" x="102" y="88" width="26" height="20" rx="7"/>',
        '  <rect class="silhouette" x="72" y="110" width="86" height="82" rx="28"/>',
        '  <rect class="silhouette" x="82" y="192" width="66" height="94" rx="22"/>',
        '  <rect class="silhouette" x="46" y="132" width="22" height="150" rx="11"/>',
        '  <rect class="silhouette" x="162" y="132" width="22" height="150" rx="11"/>',
        '  <rect class="silhouette" x="82" y="286" width="66" height="32" rx="13"/>',
        '  <rect class="silhouette" x="86" y="318" width="24" height="210" rx="11"/>',
        '  <rect class="silhouette" x="120" y="318" width="24" height="210" rx="11"/>',
        '  <circle class="silhouette" cx="435" cy="68" r="20"/>',
        '  <rect class="silhouette" x="422" y="88" width="26" height="20" rx="7"/>',
        '  <rect class="silhouette" x="392" y="110" width="86" height="82" rx="28"/>',
        '  <rect class="silhouette" x="402" y="192" width="66" height="94" rx="22"/>',
        '  <rect class="silhouette" x="366" y="132" width="22" height="150" rx="11"/>',
        '  <rect class="silhouette" x="482" y="132" width="22" height="150" rx="11"/>',
        '  <rect class="silhouette" x="402" y="286" width="66" height="32" rx="13"/>',
        '  <rect class="silhouette" x="406" y="318" width="24" height="210" rx="11"/>',
        '  <rect class="silhouette" x="440" y="318" width="24" height="210" rx="11"/>',
        '  <rect class="silhouette" x="756" y="84" width="76" height="170" rx="20"/>',
        '  <rect class="silhouette" x="744" y="254" width="100" height="30" rx="10"/>',
        '  <rect class="silhouette" x="732" y="284" width="28" height="86" rx="12"/>',
        '  <rect class="silhouette" x="764" y="284" width="20" height="94" rx="10"/>',
        '  <rect class="silhouette" x="788" y="284" width="20" height="94" rx="10"/>',
        '  <rect class="silhouette" x="812" y="284" width="20" height="94" rx="10"/>',
        '  <rect class="silhouette" x="1080" y="84" width="76" height="170" rx="20"/>',
        '  <rect class="silhouette" x="1068" y="254" width="100" height="30" rx="10"/>',
        '  <rect class="silhouette" x="1056" y="284" width="28" height="86" rx="12"/>',
        '  <rect class="silhouette" x="1088" y="284" width="20" height="94" rx="10"/>',
        '  <rect class="silhouette" x="1112" y="284" width="20" height="94" rx="10"/>',
        '  <rect class="silhouette" x="1136" y="284" width="20" height="94" rx="10"/>',
    ]

    by_panel_region: dict[tuple[str, str], list[dict[str, str]]] = {}
    for entry in entries:
        key = (entry['panel'], entry['region'])
        by_panel_region.setdefault(key, []).append(entry)

    def place_region(panel_name: str, region_name: str, bounds: RegionBounds) -> None:
        items = by_panel_region.get((panel_name, region_name), [])
        if not items:
            return

        x, y, w, h = bounds
        count = len(items)
        cols = 1 if count <= 2 else 2 if count <= 8 else 3
        rows = math.ceil(count / cols)

        outer_pad = 6
        gap = 4
        cell_w = max(16, int((w - (outer_pad * 2) - ((cols - 1) * gap)) / cols))
        cell_h = max(12, int((h - (outer_pad * 2) - ((rows - 1) * gap)) / rows))

        for index, item in enumerate(items):
            row = index // cols
            col = index % cols
            cell_x = x + outer_pad + col * (cell_w + gap)
            cell_y = y + outer_pad + row * (cell_h + gap)
            radius = max(4, min(10, int(cell_h * 0.35)))
            svg.append(
                f'  <rect id="{item["id"]}" class="muscle-zone" x="{cell_x}" y="{cell_y}" width="{cell_w}" height="{cell_h}" rx="{radius}"><title>{item["tag"]}</title></rect>'
            )

    for name, bounds in FRONT_BODY_REGION_BOUNDS.items():
        place_region('front_body', name, bounds)
    for name, bounds in BACK_BODY_REGION_BOUNDS.items():
        place_region('back_body', name, bounds)
    for name, bounds in FRONT_HAND_REGION_BOUNDS.items():
        place_region('front_hand', name, bounds)
    for name, bounds in BACK_HAND_REGION_BOUNDS.items():
        place_region('back_hand', name, bounds)

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
