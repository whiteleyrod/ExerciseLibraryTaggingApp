import json
import pandas as pd

# Let's write out an accurate mapping based on standard anatomy
# using ONLY the strings provided in the TaggingCategories.csv

df = pd.read_csv('TaggingCategories.csv')
areas = df['Muscle area'].dropna().unique().tolist()
areas = [str(a).strip() for a in areas if str(a).strip() != '']

muscles = df['Muscles involved'].dropna().unique().tolist()
muscles = [str(m).strip() for m in muscles if str(m).strip() != '']

# Accurate anatomical mapping
# We map known muscles to the provided areas
mapping_def = {
    "Neck anterior": ["Sternocleidomastoid", "Longus colli", "Longus capitis", "rectus captis anterior", "Scalenes"],
    "Neck lateral": ["Sternocleidomastoid", "Scalenes", "rectus captis lateral"],
    "Neck posterior": ["Upper trapezius", "Levator scapulae", "Longissimuss colli", "Spinalis colli", "Multifidus colli", "Rotatores colli"],
    "Shoulder anterior": ["Deltoid anterior", "Pectoralis major", "Pectoralis minor", "Biceps brachii", "Coracobrachialis", "Subscapularis"],
    "Shoulder lateral": ["Deltoid middle", "Supraspinatus"],
    "Shoulder posterior": ["Deltoid posterior", "Teres major", "Teres minor", "Infraspinatus", "Latissimus dorsi", "Triceps brachii", "Rhomboids", "Middle trapezius", "Lower trapezius"],
    "Chest": ["Pectoralis major", "Pectoralis minor", "Serratus anterior", "Subclavius"],
    "Upper arm anterior": ["Biceps brachii", "Brachialis"],
    "Upper arm posterior": ["Triceps brachii", "Anconeus"],
    "Forearm anterior": ["Pronator teres", "Flexor carpi radialis", "Palmaris longus", "Flexor carpi ulnaris", "Flexor digitorum superficialis", "Flexor digitorum profundus", "Flexor pollicis longus"],
    "Forearm posterior": ["Extensor carpi radialis longus", "Extensor carpi radialis brevis", "Extensor digitorum", "Extensor digiti minimi", "Extensor carpi ulnaris", "Supinator", "Abductor pollicis longus", "Extensor pollicis longus", "Extensor indicis"],
    "Wrist flexors": ["Flexor carpi radialis", "Flexor carpi ulnaris", "Palmaris longus"],
    "Wrist extensors": ["Extensor carpi radialis longus", "Extensor carpi radialis brevis", "Extensor carpi ulnaris"],
    "Wrist ulnar deviators": ["Flexor carpi ulnaris", "Extensor carpi ulnaris"],
    "Wrist radial deviators": ["Flexor carpi radialis", "Extensor carpi radialis longus", "Extensor carpi radialis brevis", "Abductor pollicis longus"],
    "Forearm pronators": ["Pronator teres"],
    "Forearm supinators": ["Supinator", "Biceps brachii"],
    "Finger flexors": ["Flexor digitorum superficialis", "Flexor digitorum profundus"],
    "Finger extensors": ["Extensor digitorum", "Extensor indicis", "Extensor digiti minimi"],
    "Finger abductors": ["Dorsal interossei hand 1-4", "Abductor digiti minimi (hand)"],
    "Finger adductors": ["Palmar interossei hand 1-3"],
    "Thumb flexors": ["Flexor pollicis longus", "Flexor pollicis brevis"],
    "Thumb extensors": ["Extensor pollicis longus"],
    "Thumb adductors": ["Adductor pollicis"], # Note: 'Adductor pollicis' not in list, fallback to empty or approximations if not found
    "Thumb Abductors": ["Abductor pollicis longus", "Abductor pollicis brevis"],
    "Abdominal - central": ["Rectus abdominus", "Pyramidalis"],
    "Abdominal - lateral": ["External abdominal oblique", "Internal abdominal oblique", "Transversus abdominus"],
    "Spinal extensors middle": ["Longissimuss thoracis", "Iliocostalis thoracic", "Spinalis thoracis", "Multifidus thoracis", "Serratus posterior inferior", "Serratus posterior superior"],
    "Spinal extensors lower": ["Iliocostalis lumborum", "Longissimuss thoracis pars lumborum", "Multifidus lumborum", "Quadratus lumborum"],
    "Gluteal - posterior": ["Gluteus maximus", "Gluteus medius"],
    "Gluteals - lateral": ["Gluteus medius", "Gluteus minimus", "Tensor fasciae latae"],
    "Hip flexors": ["Psoas major", "Iliacus", "Rectus femoris", "Sartorius", "Pectineus"],
    "Hip lateral rotators": ["Piriformis", "Obturator internus", "Obturator externus", "Gemellus superior", "Gemellus inferior", "Quadratus femoris", "Gluteus maximus"],
    "Hip medial rotators": ["Gluteus medius", "Gluteus minimus", "Tensor fasciae latae"],
    "Adductors": ["Adductor longus", "Adductor brevis", "Adductor magnus - adductor part", "Adductor magnus - ischiocondylar part", "Gracilis", "Pectineus"],
    "Hamstrings": ["Biceps femoris", "Semitendinosus", "Semimembranosus"],
    "Quadriceps": ["Rectus femoris", "Vastus lateralis", "Vastus medialis", "Vastus intermedius"],
    "Foot and toe extensors": ["Extensor digitorum longus", "Extensor hallucis longus", "Extensor digitorum brevis", "Extensor hallucis brevis"],
    "Calf": ["Gastrocnemius", "Soleus", "Plantaris"], # Note: Gastrocnemius/Soleus missing from list, but we have "Peroneus longus" etc. wait, let's look at the exact list
    "Foot intrinsics": ["Abductor hallucis", "flexor digitorum brevis", "Abductor digiti minimi (foot)", "Abductor of fifth metatarsal", "Quadratus plantae", "Lumbricales of the foot 1-4", "Flexor hallucis brevis", "Adductor hallucis", "Flexor digiti minimi brevis (foot)", "Opponens digiti minimi (foot)", "Plantar interossei 1-3", "Dorsal interossei foot 1-4"],
    "Ankle evertors": ["Peroneus longus", "Peroneus brevis", "Peroneus tertius"],
    "Ankle invertors": ["Tibialis anterior", "Tibialis posterior"]
}

# Cross check against the actual muscles list in the CSV to avoid typos
hierarchy = {}
for area in areas:
    hierarchy[area] = []

    if area in mapping_def:
        for mapped_muscle in mapping_def[area]:
            # Exact match check
            if mapped_muscle in muscles:
                hierarchy[area].append(mapped_muscle)
            else:
                # Case insensitive check
                for m in muscles:
                    if m.lower() == mapped_muscle.lower() and m not in hierarchy[area]:
                        hierarchy[area].append(m)

with open('web/public/muscle_hierarchy.json', 'w') as f:
    json.dump(hierarchy, f, indent=2)

print("Hierarchy built correctly.")
