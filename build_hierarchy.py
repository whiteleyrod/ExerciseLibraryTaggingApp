import pandas as pd
import json

df = pd.read_csv('TaggingCategories.csv')

# Build the hierarchy: mapping each "Muscle area" to a list of "Muscles involved"
hierarchy = {}

for _, row in df.iterrows():
    muscle = row['Muscles involved']
    area = row['Muscle area']

    if pd.isna(muscle) or pd.isna(area):
        continue

    muscle = str(muscle).strip()
    area = str(area).strip()

    if not muscle or not area:
        continue

    if area not in hierarchy:
        hierarchy[area] = []

    if muscle not in hierarchy[area]:
        hierarchy[area].append(muscle)

# Output the hierarchy to JSON
with open('web/public/muscle_hierarchy.json', 'w') as f:
    json.dump(hierarchy, f, indent=2)

print("Hierarchy built.")
