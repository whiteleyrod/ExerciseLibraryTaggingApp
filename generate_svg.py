import xml.etree.ElementTree as ET

# List of muscles based on the TaggingCategories.csv
muscles = [
    "Neck anterior", "Neck lateral", "Neck posterior",
    "Shoulder anterior", "Shoulder lateral", "Shoulder posterior",
    "Chest", "Upper arm anterior", "Upper arm posterior",
    "Forearm anterior", "Forearm posterior", "Wrist flexors", "Wrist extensors",
    "Wrist ulnar deviators", "Wrist radial deviators", "Forearm pronators", "Forearm supinators",
    "Finger flexors", "Finger extensors", "Finger abductors", "Finger adductors",
    "Thumb flexors", "Thumb extensors", "Thumb adductors", "Thumb Abductors",
    "Abdominal - central", "Abdominal - lateral",
    "Spinal extensors middle", "Spinal extensors lower",
    "Gluteal - posterior", "Gluteals - lateral",
    "Hip flexors", "Hip lateral rotators", "Hip medial rotators",
    "Adductors", "Hamstrings", "Quadriceps",
    "Foot and toe extensors", "Calf", "Foot intrinsics",
    "Ankle evertors", "Ankle invertors"
]

def create_muscle_map():
    svg = ET.Element('svg', xmlns="http://www.w3.org/2000/svg", viewBox="0 0 1000 1000")

    # Just create basic groups or paths for front/back as placeholders for MVP
    # This will be mapped 1:1 with TaggingCategories

    front_group = ET.SubElement(svg, 'g', id="front_view", transform="translate(250, 0)")
    back_group = ET.SubElement(svg, 'g', id="back_view", transform="translate(750, 0)")

    # Simple algorithm to distribute paths

    for i, m in enumerate(muscles):
        # We'll just create dummy paths (rects or similar) as "areas"
        # In reality, this would be an artist-created SVG with exact paths
        # But we need machine-readable IDs
        m_id = m.lower().replace(" ", "_").replace("-", "_")

        # Decide if it goes to front or back randomly for the dummy script
        group = front_group if i % 2 == 0 else back_group

        y = (i // 2) * 40

        path = ET.SubElement(group, 'rect',
                             id=m_id,
                             x="0", y=str(y), width="100", height="30",
                             fill="lightgray", stroke="black",
                             **{'data-muscle-area': m}) # Adding the exact text from the spreadsheet as data-attr

    tree = ET.ElementTree(svg)
    ET.indent(tree, space="  ", level=0)
    tree.write("web/public/anatomical_map.svg", encoding="utf-8", xml_declaration=True)

    import json
    # Create the mapping dictionary
    mapping = []
    for m in muscles:
        m_id = m.lower().replace(" ", "_").replace("-", "_")
        mapping.append({
            "id": m_id,
            "muscle_area": m,
            "body_region": "Unknown" # can be expanded
        })

    with open("web/public/muscle_map.json", "w") as f:
        json.dump(mapping, f, indent=2)

create_muscle_map()
