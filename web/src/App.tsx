import { useEffect, useMemo, useState } from 'react'
import Papa, { type ParseResult } from 'papaparse'
import './App.css'

type Exercise = {
  id: string
  name: string
  link: string
}

type Plane = 'Frontal' | 'Sagittal' | 'Transverse'
type JointRow =
  | 'Hip'
  | 'Knee'
  | 'Ankle'
  | 'Midfoot'
  | 'Toes'
  | 'Shoulder'
  | 'Elbow'
  | 'Wrist'
  | 'MCP'
  | 'Fingers'
  | 'Cervical'
  | 'Thoracic'
  | 'Lumbar'

type TagState = {
  muscleAreas: string[]
  planes: Record<JointRow, Plane[]>
}

type PasteMode = 'Replace' | 'Merge'
type FieldMode = 'Global' | PasteMode

type MuscleRegion = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  matchTerms: string[]
}

const JOINT_ROWS: JointRow[] = [
  'Hip',
  'Knee',
  'Ankle',
  'Midfoot',
  'Toes',
  'Shoulder',
  'Elbow',
  'Wrist',
  'MCP',
  'Fingers',
  'Cervical',
  'Thoracic',
  'Lumbar',
]

const PLANES: Plane[] = ['Frontal', 'Sagittal', 'Transverse']

const ALIAS_MAP: Record<string, string> = {
  saggital: 'Sagittal',
  sagittal: 'Sagittal',
  frontal: 'Frontal',
  transverse: 'Transverse',
}

const STORAGE_KEY = 'exercise-tagging-app-tags-v1'

const MUSCLE_REGIONS: MuscleRegion[] = [
  { id: 'neck', label: 'Neck', x: 145, y: 30, width: 70, height: 35, matchTerms: ['neck', 'cervical'] },
  {
    id: 'shoulder-chest',
    label: 'Shoulder/Chest',
    x: 110,
    y: 70,
    width: 140,
    height: 55,
    matchTerms: ['shoulder', 'chest', 'deltoid', 'pectoral', 'subclavius', 'scap'],
  },
  {
    id: 'upper-arm',
    label: 'Upper Arm',
    x: 95,
    y: 130,
    width: 170,
    height: 45,
    matchTerms: ['upper arm', 'biceps', 'triceps', 'brachialis', 'anconeus'],
  },
  {
    id: 'forearm-hand',
    label: 'Forearm/Hand',
    x: 80,
    y: 180,
    width: 200,
    height: 55,
    matchTerms: ['forearm', 'wrist', 'thumb', 'finger', 'hand', 'metacarp'],
  },
  {
    id: 'abdominal-spinal',
    label: 'Abdominal/Spinal',
    x: 120,
    y: 130,
    width: 120,
    height: 105,
    matchTerms: ['abdominal', 'oblique', 'lumbar', 'thoracic', 'spinal', 'multifidus', 'quadratus', 'transversus'],
  },
  {
    id: 'gluteal-hip',
    label: 'Gluteal/Hip',
    x: 120,
    y: 240,
    width: 120,
    height: 45,
    matchTerms: ['glute', 'hip', 'psoas', 'iliacus', 'piriformis', 'obturator', 'gemellus', 'tensor fasciae latae'],
  },
  {
    id: 'thigh',
    label: 'Thigh',
    x: 115,
    y: 290,
    width: 130,
    height: 85,
    matchTerms: ['thigh', 'quadriceps', 'hamstring', 'adductor', 'gracilis', 'vastus', 'rectus femoris', 'biceps femoris'],
  },
  {
    id: 'lower-leg-foot',
    label: 'Lower Leg/Foot',
    x: 110,
    y: 380,
    width: 140,
    height: 110,
    matchTerms: ['calf', 'ankle', 'foot', 'toe', 'tibialis', 'peroneus', 'hallucis', 'digitorum', 'plantar', 'metatarsal'],
  },
]

const createEmptyTags = (): TagState => ({
  muscleAreas: [],
  planes: JOINT_ROWS.reduce(
    (accumulator, row) => ({ ...accumulator, [row]: [] }),
    {} as Record<JointRow, Plane[]>,
  ),
})

const normalizePlane = (value: string): Plane | null => {
  const normalized = ALIAS_MAP[value.trim().toLowerCase()]
  if (!normalized) {
    return null
  }
  return normalized as Plane
}

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b))

const parseCsv = async <T extends Record<string, string>>(url: string): Promise<T[]> => {
  const response = await fetch(url)
  const content = await response.text()
  return new Promise((resolve, reject) => {
    Papa.parse<T>(content, {
      header: true,
      skipEmptyLines: true,
      complete: (result: ParseResult<T>) => resolve(result.data),
      error: (error: Error) => reject(error),
    })
  })
}

const isLikelyVideoLink = (value: string): boolean => {
  const link = value.toLowerCase()
  return link.includes('.mp4') || link.includes('.mov') || link.includes('.m4v') || link.includes('.webm')
}

function App() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [muscleAreaOptions, setMuscleAreaOptions] = useState<string[]>([])
  const [tagsByExercise, setTagsByExercise] = useState<Record<string, TagState>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewLoadError, setPreviewLoadError] = useState(false)
  const [copiedTags, setCopiedTags] = useState<TagState | null>(null)
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null)
  const [globalPasteMode, setGlobalPasteMode] = useState<PasteMode>('Merge')
  const [includeMuscleAreas, setIncludeMuscleAreas] = useState(true)
  const [includePlanes, setIncludePlanes] = useState(true)
  const [muscleAreaMode, setMuscleAreaMode] = useState<FieldMode>('Global')
  const [planesMode, setPlanesMode] = useState<FieldMode>('Global')

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        const [exerciseRows, taxonomyRows] = await Promise.all([
          parseCsv<{ ExerciseName?: string; Link?: string }>('/ExerciseName_Link.csv'),
          parseCsv<{ 'Muscle area'?: string }>('/TaggingCategories.csv'),
        ])

        const parsedExercises: Exercise[] = exerciseRows
          .filter((row) => (row.ExerciseName ?? '').trim().length > 0)
          .map((row) => ({
            id: (row.ExerciseName ?? '').trim(),
            name: (row.ExerciseName ?? '').trim(),
            link: (row.Link ?? '').trim(),
          }))

        const areas = taxonomyRows
          .map((row) => (row['Muscle area'] ?? '').trim())
          .filter((value) => value.length > 0)

        const savedTags = localStorage.getItem(STORAGE_KEY)
        if (savedTags) {
          setTagsByExercise(JSON.parse(savedTags) as Record<string, TagState>)
        }

        setExercises(parsedExercises)
        setMuscleAreaOptions(uniqueSorted(areas))

        if (parsedExercises.length > 0) {
          setSelectedIds(new Set([parsedExercises[0].id]))
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load data files.')
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tagsByExercise))
  }, [tagsByExercise])

  const filteredExercises = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return exercises
    }
    return exercises.filter((exercise) => exercise.name.toLowerCase().includes(query))
  }, [exercises, searchQuery])

  const activeExercise = useMemo(() => {
    const firstSelectedId = Array.from(selectedIds)[0]
    if (!firstSelectedId) {
      return null
    }
    return exercises.find((exercise) => exercise.id === firstSelectedId) ?? null
  }, [exercises, selectedIds])

  const activeTags = useMemo(() => {
    if (!activeExercise) {
      return createEmptyTags()
    }
    return tagsByExercise[activeExercise.id] ?? createEmptyTags()
  }, [activeExercise, tagsByExercise])

  const regionOptionMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    MUSCLE_REGIONS.forEach((region) => {
      const matches = muscleAreaOptions.filter((option) => {
        const normalized = option.toLowerCase()
        return region.matchTerms.some((term) => normalized.includes(term))
      })
      map[region.id] = uniqueSorted(matches)
    })
    return map
  }, [muscleAreaOptions])

  useEffect(() => {
    setPreviewLoadError(false)
  }, [activeExercise?.id])

  const updateActiveTags = (updater: (current: TagState) => TagState) => {
    if (!activeExercise) {
      return
    }
    setTagsByExercise((current) => ({
      ...current,
      [activeExercise.id]: updater(current[activeExercise.id] ?? createEmptyTags()),
    }))
  }

  const toggleExerciseSelection = (exerciseId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(exerciseId)) {
        next.delete(exerciseId)
      } else {
        next.add(exerciseId)
      }
      return next
    })
  }

  const selectOnlyExercise = (exerciseId: string) => {
    setSelectedIds(new Set([exerciseId]))
  }

  const toggleMuscleArea = (value: string) => {
    updateActiveTags((current) => {
      const exists = current.muscleAreas.includes(value)
      const next = exists
        ? current.muscleAreas.filter((item) => item !== value)
        : [...current.muscleAreas, value]
      return {
        ...current,
        muscleAreas: uniqueSorted(next),
      }
    })
  }

  const toggleMuscleRegion = (regionId: string) => {
    const mappedAreas = regionOptionMap[regionId] ?? []
    if (mappedAreas.length === 0) {
      return
    }

    updateActiveTags((current) => {
      const allSelected = mappedAreas.every((area) => current.muscleAreas.includes(area))
      const next = allSelected
        ? current.muscleAreas.filter((area) => !mappedAreas.includes(area))
        : [...current.muscleAreas, ...mappedAreas]
      return {
        ...current,
        muscleAreas: uniqueSorted(next),
      }
    })
  }

  const togglePlane = (row: JointRow, plane: Plane) => {
    updateActiveTags((current) => {
      const rowValues = current.planes[row] ?? []
      const exists = rowValues.includes(plane)
      const nextRowValues = exists ? rowValues.filter((value) => value !== plane) : [...rowValues, plane]
      return {
        ...current,
        planes: {
          ...current.planes,
          [row]: uniqueSorted(nextRowValues) as Plane[],
        },
      }
    })
  }

  const clearPlaneRow = (row: JointRow) => {
    updateActiveTags((current) => ({
      ...current,
      planes: {
        ...current.planes,
        [row]: [],
      },
    }))
  }

  const setAllPlanesForRow = (row: JointRow) => {
    updateActiveTags((current) => ({
      ...current,
      planes: {
        ...current.planes,
        [row]: [...PLANES],
      },
    }))
  }

  const handleCopyTags = () => {
    if (!activeExercise) {
      return
    }
    setCopiedTags(JSON.parse(JSON.stringify(activeTags)) as TagState)
    setCopiedFrom(activeExercise.name)
  }

  const resolveMode = (fieldMode: FieldMode): PasteMode => (fieldMode === 'Global' ? globalPasteMode : fieldMode)

  const applyPasteToTarget = (target: TagState, source: TagState): TagState => {
    const next: TagState = {
      muscleAreas: [...target.muscleAreas],
      planes: { ...target.planes },
    }

    if (includeMuscleAreas) {
      const mode = resolveMode(muscleAreaMode)
      if (mode === 'Replace') {
        next.muscleAreas = uniqueSorted(source.muscleAreas)
      } else {
        next.muscleAreas = uniqueSorted([...target.muscleAreas, ...source.muscleAreas])
      }
    }

    if (includePlanes) {
      const mode = resolveMode(planesMode)
      const nextPlanes: Record<JointRow, Plane[]> = { ...target.planes }
      JOINT_ROWS.forEach((row) => {
        const sourceRow = source.planes[row] ?? []
        const normalizedSource = sourceRow
          .map((plane) => normalizePlane(plane))
          .filter((plane): plane is Plane => plane !== null)

        if (mode === 'Replace') {
          nextPlanes[row] = uniqueSorted(normalizedSource) as Plane[]
        } else {
          nextPlanes[row] = uniqueSorted([...(nextPlanes[row] ?? []), ...normalizedSource]) as Plane[]
        }
      })
      next.planes = nextPlanes
    }

    return next
  }

  const handlePasteTags = () => {
    if (!copiedTags || selectedIds.size === 0) {
      return
    }

    const targets = Array.from(selectedIds)
    const confirmation = window.confirm(
      `Apply copied tags from "${copiedFrom ?? 'source'}" to ${targets.length} selected exercise(s)?`,
    )
    if (!confirmation) {
      return
    }

    setTagsByExercise((current) => {
      const next = { ...current }
      targets.forEach((targetId) => {
        const existing = current[targetId] ?? createEmptyTags()
        next[targetId] = applyPasteToTarget(existing, copiedTags)
      })
      return next
    })
  }

  if (loading) {
    return <div className="app-shell">Loading exercises and taxonomy...</div>
  }

  if (error) {
    return <div className="app-shell">Failed to load data: {error}</div>
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Exercise Tagging App (MVP)</h1>
        <p>
          {exercises.length} exercises loaded • {selectedIds.size} selected
        </p>
      </header>

      <div className="layout">
        <section className="panel">
          <h2>Exercise Library</h2>

          {activeExercise && (
            <div className="preview-card">
              <div className="preview-title">Preview: {activeExercise.name}</div>
              <div className="preview-media">
                {activeExercise.link && !previewLoadError && isLikelyVideoLink(activeExercise.link) ? (
                  <video
                    controls
                    preload="metadata"
                    src={activeExercise.link}
                    onError={() => setPreviewLoadError(true)}
                  />
                ) : (
                  <div className="preview-fallback">
                    {previewLoadError ? 'Preview unavailable for this link.' : 'No embeddable preview available.'}
                  </div>
                )}
              </div>
              {activeExercise.link && (
                <a href={activeExercise.link} target="_blank" rel="noreferrer">
                  Open exercise link
                </a>
              )}
            </div>
          )}

          <input
            className="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search exercise name..."
          />
          <div className="list">
            {filteredExercises.map((exercise) => {
              const checked = selectedIds.has(exercise.id)
              return (
                <div key={exercise.id} className={`list-item ${activeExercise?.id === exercise.id ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleExerciseSelection(exercise.id)}
                    aria-label={`Select ${exercise.name}`}
                  />
                  <button className="link-btn" onClick={() => selectOnlyExercise(exercise.id)}>
                    {exercise.name}
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel editor">
          {!activeExercise && <p>Select an exercise to start tagging.</p>}
          {activeExercise && (
            <>
              <div className="editor-header">
                <h2>{activeExercise.name}</h2>
                {activeExercise.link && (
                  <a href={activeExercise.link} target="_blank" rel="noreferrer">
                    Open exercise link
                  </a>
                )}
              </div>

              <div className="toolbar">
                <button onClick={handleCopyTags}>Copy Tags</button>
                <button onClick={handlePasteTags} disabled={!copiedTags || selectedIds.size === 0}>
                  Paste to Selected
                </button>
                <span className="copied-source">{copiedFrom ? `Copied from: ${copiedFrom}` : 'No copied tags yet'}</span>
              </div>

              <div className="paste-config">
                <h3>Paste Semantics</h3>
                <div className="config-grid">
                  <label>
                    Global mode
                    <select value={globalPasteMode} onChange={(event) => setGlobalPasteMode(event.target.value as PasteMode)}>
                      <option value="Merge">Merge</option>
                      <option value="Replace">Replace</option>
                    </select>
                  </label>

                  <label>
                    Muscle area mode
                    <select value={muscleAreaMode} onChange={(event) => setMuscleAreaMode(event.target.value as FieldMode)}>
                      <option value="Global">Use global</option>
                      <option value="Merge">Merge</option>
                      <option value="Replace">Replace</option>
                    </select>
                  </label>

                  <label>
                    Planes mode
                    <select value={planesMode} onChange={(event) => setPlanesMode(event.target.value as FieldMode)}>
                      <option value="Global">Use global</option>
                      <option value="Merge">Merge</option>
                      <option value="Replace">Replace</option>
                    </select>
                  </label>
                </div>

                <div className="toggle-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={includeMuscleAreas}
                      onChange={(event) => setIncludeMuscleAreas(event.target.checked)}
                    />
                    Include muscle area
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={includePlanes}
                      onChange={(event) => setIncludePlanes(event.target.checked)}
                    />
                    Include planes matrix
                  </label>
                </div>
              </div>

              <div className="field-group">
                <h3>Muscle Area</h3>

                <div className="muscle-map-shell" role="img" aria-label="Clickable muscle area map">
                  <svg viewBox="0 0 360 520" className="muscle-map">
                    <ellipse cx="180" cy="22" rx="24" ry="20" className="body-outline" />
                    <rect x="162" y="45" width="36" height="25" rx="8" className="body-outline" />
                    <rect x="130" y="70" width="100" height="70" rx="24" className="body-outline" />
                    <rect x="145" y="140" width="70" height="120" rx="20" className="body-outline" />
                    <rect x="95" y="95" width="30" height="155" rx="15" className="body-outline" />
                    <rect x="235" y="95" width="30" height="155" rx="15" className="body-outline" />
                    <rect x="145" y="260" width="70" height="40" rx="16" className="body-outline" />
                    <rect x="145" y="300" width="30" height="160" rx="15" className="body-outline" />
                    <rect x="185" y="300" width="30" height="160" rx="15" className="body-outline" />

                    {MUSCLE_REGIONS.map((region) => {
                      const mappedAreas = regionOptionMap[region.id] ?? []
                      const selectedCount = mappedAreas.filter((area) => activeTags.muscleAreas.includes(area)).length
                      const isSelected = mappedAreas.length > 0 && selectedCount > 0
                      const isDisabled = mappedAreas.length === 0
                      return (
                        <g key={region.id}>
                          <rect
                            x={region.x}
                            y={region.y}
                            width={region.width}
                            height={region.height}
                            rx={10}
                            className={`region-overlay ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                            onClick={() => toggleMuscleRegion(region.id)}
                          />
                          <text x={region.x + 8} y={region.y + 22} className="region-label">
                            {region.label}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                </div>

                <p className="helper-text">Click body regions to add/remove mapped muscle areas.</p>

                <div className="chip-row">
                  {activeTags.muscleAreas.map((area) => (
                    <span key={area} className="chip">
                      {area}
                    </span>
                  ))}
                </div>

                <details>
                  <summary>Manual fine-tune muscle areas</summary>
                  <div className="option-grid">
                    {muscleAreaOptions.map((option) => (
                    <label key={option} className="option-item">
                      <input
                        type="checkbox"
                        checked={activeTags.muscleAreas.includes(option)}
                        onChange={() => toggleMuscleArea(option)}
                      />
                      {option}
                    </label>
                    ))}
                  </div>
                </details>
              </div>

              <div className="field-group">
                <h3>Planes of Movement Matrix</h3>
                <table className="planes-table">
                  <thead>
                    <tr>
                      <th>Joint</th>
                      {PLANES.map((plane) => (
                        <th key={plane}>{plane}</th>
                      ))}
                      <th>Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {JOINT_ROWS.map((row) => (
                      <tr key={row}>
                        <td>{row}</td>
                        {PLANES.map((plane) => (
                          <td key={`${row}-${plane}`}>
                            <input
                              type="checkbox"
                              checked={(activeTags.planes[row] ?? []).includes(plane)}
                              onChange={() => togglePlane(row, plane)}
                              aria-label={`${row} ${plane}`}
                            />
                          </td>
                        ))}
                        <td>
                          <div className="row-actions">
                            <button onClick={() => setAllPlanesForRow(row)}>All 3</button>
                            <button onClick={() => clearPlaneRow(row)}>Clear</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default App
