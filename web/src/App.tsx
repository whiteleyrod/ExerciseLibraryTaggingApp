import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
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

type MuscleMapEntry = {
  id: string
  tag: string
  view: 'front' | 'back'
}

type MuscleMapPayload = {
  version: number
  entries: MuscleMapEntry[]
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

const JOINT_LABEL_TO_ROW: Record<string, JointRow> = {
  hip: 'Hip',
  knee: 'Knee',
  ankle: 'Ankle',
  midfoot: 'Midfoot',
  toes: 'Toes',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist: 'Wrist',
  metacarpophalangeal: 'MCP',
  finger: 'Fingers',
  fingers: 'Fingers',
  cervical_spine: 'Cervical',
  thoracic_spine: 'Thoracic',
  lumbar_spine: 'Lumbar',
}

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

const normalizeLookupValue = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

const formatSourceIdForTooltip = (value: string): string => {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/-\d+$/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
  if (!cleaned) {
    return ''
  }

  return cleaned.replace(/(^|\s)([a-z])/g, (_full, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
}

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

async function parseJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`)
  }
  return (await response.json()) as T
}

const prepareSelectorSvg = (markup: string, view: 'front' | 'back'): string => {
  const parser = new DOMParser()
  const documentNode = parser.parseFromString(markup, 'image/svg+xml')
  const svg = documentNode.documentElement
  svg.setAttribute('data-view', view)
  const excludedLabels = new Set(['background', 'front', 'back', 'back_superficial'])

  documentNode.querySelectorAll('g').forEach((group) => {
    const labelValue = group.getAttribute('inkscape:label') ?? ''
    const normalizedLabel = labelValue
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    const identifier = group.getAttribute('id') ?? ''
    const sourceId = normalizedLabel && !normalizedLabel.startsWith('layer') ? normalizedLabel : identifier
    if (!sourceId) {
      return
    }

    const isMuscleGroup =
      group.classList.contains('muscle') ||
      (normalizedLabel.length > 0 && !normalizedLabel.startsWith('layer') && !excludedLabels.has(normalizedLabel))
    if (!isMuscleGroup) {
      return
    }

    group.classList.add('muscle')
    group.setAttribute('data-source-id', sourceId)
    group.setAttribute('data-map-key', `${view}:${sourceId}`)
  })

  return new XMLSerializer().serializeToString(documentNode)
}

const prepareJointsSvg = (markup: string): string => {
  const parser = new DOMParser()
  const documentNode = parser.parseFromString(markup, 'image/svg+xml')
  const svg = documentNode.documentElement
  svg.setAttribute('data-view', 'joints')

  documentNode.querySelectorAll('g').forEach((group) => {
    const labelValue = group.getAttribute('inkscape:label') ?? ''
    const normalizedLabel = labelValue
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    if (!normalizedLabel || normalizedLabel === 'scaffold' || normalizedLabel === 'skeleton') {
      return
    }

    const mappedRow = JOINT_LABEL_TO_ROW[normalizedLabel]
    if (!mappedRow) {
      return
    }

    group.classList.add('joint-zone')
    group.setAttribute('data-joint-row', mappedRow)
  })

  return new XMLSerializer().serializeToString(documentNode)
}

const isLikelyVideoLink = (value: string): boolean => {
  const link = value.toLowerCase()
  return link.includes('.mp4') || link.includes('.mov') || link.includes('.m4v') || link.includes('.webm')
}

function App() {
  const muscleMapRef = useRef<HTMLDivElement | null>(null)
  const jointsMapRef = useRef<HTMLDivElement | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [muscleAreaOptions, setMuscleAreaOptions] = useState<string[]>([])
  const [muscleMap, setMuscleMap] = useState<MuscleMapPayload>({ version: 1, entries: [] })
  const [frontMuscleSvg, setFrontMuscleSvg] = useState('')
  const [backMuscleSvg, setBackMuscleSvg] = useState('')
  const [jointsSvg, setJointsSvg] = useState('')
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
  const [selectedJointRow, setSelectedJointRow] = useState<JointRow | null>(null)
  const [jointTooltip, setJointTooltip] = useState<{ visible: boolean; text: string; x: number; y: number }>({
    visible: false,
    text: '',
    x: 0,
    y: 0,
  })
  const [tooltip, setTooltip] = useState<{ visible: boolean; text: string; x: number; y: number }>({
    visible: false,
    text: '',
    x: 0,
    y: 0,
  })

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        const [exerciseRows, taxonomyRows, muscleMapPayload, frontSvg, backSvg, jointsSvgText] = await Promise.all([
          parseCsv<{ ExerciseName?: string; Link?: string }>('/ExerciseName_Link.csv'),
          parseCsv<{ 'Muscle area'?: string }>('/TaggingCategories.csv'),
          parseJson<MuscleMapPayload>('/muscle_selector_map.json'),
          fetch('/Front_superficial.svg').then(async (response) => {
            if (!response.ok) {
              throw new Error('Failed to load Front_superficial.svg')
            }
            return response.text()
          }),
          fetch('/Back_superficial.svg').then(async (response) => {
            if (!response.ok) {
              throw new Error('Failed to load Back_superficial.svg')
            }
            return response.text()
          }),
          fetch('/joints.svg').then(async (response) => {
            if (!response.ok) {
              throw new Error('Failed to load joints.svg')
            }
            return response.text()
          }),
        ])

        const parsedExercises: Exercise[] = exerciseRows
          .filter((row) => (row.ExerciseName ?? '').trim().length > 0)
          .map((row, index) => {
            const name = (row.ExerciseName ?? '').trim()
            return {
            id: `${name}::${index}`,
            name,
            link: (row.Link ?? '').trim(),
            }
          })

        const areas = taxonomyRows
          .map((row) => (row['Muscle area'] ?? '').trim())
          .filter((value) => value.length > 0)

        const savedTags = localStorage.getItem(STORAGE_KEY)
        if (savedTags) {
          setTagsByExercise(JSON.parse(savedTags) as Record<string, TagState>)
        }

        setExercises(parsedExercises)
        setMuscleAreaOptions(uniqueSorted(areas))
        setMuscleMap(muscleMapPayload)
        setFrontMuscleSvg(prepareSelectorSvg(frontSvg, 'front'))
        setBackMuscleSvg(prepareSelectorSvg(backSvg, 'back'))
        setJointsSvg(prepareJointsSvg(jointsSvgText))

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
    const query = normalizeLookupValue(searchQuery)
    if (!query) {
      return exercises
    }
    return exercises.filter((exercise) => normalizeLookupValue(exercise.name).includes(query))
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

  const mapKeyToTagMap = useMemo(() => {
    const map: Record<string, string> = {}
    muscleMap.entries.forEach((entry) => {
      map[`${entry.view}:${entry.id}`] = entry.tag
    })
    return map
  }, [muscleMap.entries])

  const normalizedOptionMap = useMemo(() => {
    const map: Record<string, string> = {}
    muscleAreaOptions.forEach((option) => {
      map[normalizeLookupValue(option)] = option
    })
    return map
  }, [muscleAreaOptions])

  const missingFromMap = useMemo(() => {
    const mappedTags = new Set(muscleMap.entries.map((entry) => entry.tag))
    return muscleAreaOptions.filter((option) => !mappedTags.has(option))
  }, [muscleMap.entries, muscleAreaOptions])

  const mapOnlyTags = useMemo(() => {
    const taxonomyTags = new Set(muscleAreaOptions)
    return uniqueSorted(muscleMap.entries.map((entry) => entry.tag).filter((tag) => !taxonomyTags.has(tag)))
  }, [muscleMap.entries, muscleAreaOptions])

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

  const resolveClickedMuscleTag = (muscleElement: Element): string | null => {
    const mapKey = muscleElement.getAttribute('data-map-key') ?? ''
    const mappedByKey = mapKeyToTagMap[mapKey]
    if (mappedByKey) {
      return mappedByKey
    }

    const sourceId = muscleElement.getAttribute('data-source-id') ?? ''
    const tooltipText =
      muscleElement.querySelector('.tooltip-trigger')?.getAttribute('data-tooltip-text') ??
      muscleElement.querySelector('title')?.textContent ??
      ''

    const candidates = [sourceId, tooltipText]
      .map((item) => normalizeLookupValue(item))
      .filter((item) => item.length > 0)

    for (const candidate of candidates) {
      if (normalizedOptionMap[candidate]) {
        return normalizedOptionMap[candidate]
      }
    }

    return null
  }

  const toggleMuscleTag = (mappedTag: string) => {
    if (!mappedTag) {
      return
    }
    toggleMuscleArea(mappedTag)
  }

  const handleMuscleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null
    if (!target) {
      return
    }

    const muscleElement = target.closest('g.muscle') as Element | null
    if (!muscleElement) {
      return
    }

    const mappedTag = resolveClickedMuscleTag(muscleElement)
    if (!mappedTag) {
      return
    }

    toggleMuscleTag(mappedTag)
  }

  const handleMuscleMapMove = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null
    const container = muscleMapRef.current
    if (!target || !container) {
      return
    }

    const muscleElement = target.closest('g.muscle') as Element | null
    if (!muscleElement) {
      if (tooltip.visible) {
        setTooltip((current) => ({ ...current, visible: false }))
      }
      return
    }

    const mapKey = muscleElement.getAttribute('data-map-key') ?? ''
    const mappedTag = mapKeyToTagMap[mapKey]
    const sourceId = muscleElement.getAttribute('data-source-id') ?? ''
    const sourceLabel = formatSourceIdForTooltip(sourceId)

    const tooltipText =
      sourceLabel ||
      (muscleElement.querySelector('.tooltip-trigger')?.getAttribute('data-tooltip-text') ??
        muscleElement.querySelector('title')?.textContent ??
        mappedTag ??
        'Muscle')

    const bounds = container.getBoundingClientRect()
    setTooltip({
      visible: true,
      text: tooltipText,
      x: event.clientX - bounds.left + 14,
      y: event.clientY - bounds.top + 14,
    })
  }

  const handleMuscleMapLeave = () => {
    setTooltip((current) => ({ ...current, visible: false }))
  }

  const handleJointsMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null
    if (!target) {
      return
    }

    const jointElement = target.closest('g.joint-zone') as Element | null
    if (!jointElement) {
      return
    }

    const jointRow = jointElement.getAttribute('data-joint-row') as JointRow | null
    if (!jointRow) {
      return
    }

    setSelectedJointRow(jointRow)
  }

  const handleJointsMapMove = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null
    const container = jointsMapRef.current
    if (!target || !container) {
      return
    }

    const jointElement = target.closest('g.joint-zone') as Element | null
    if (!jointElement) {
      if (jointTooltip.visible) {
        setJointTooltip((current) => ({ ...current, visible: false }))
      }
      return
    }

    const jointRow = jointElement.getAttribute('data-joint-row') ?? 'Joint'
    const bounds = container.getBoundingClientRect()
    setJointTooltip({
      visible: true,
      text: jointRow,
      x: event.clientX - bounds.left + 12,
      y: event.clientY - bounds.top + 12,
    })
  }

  const handleJointsMapLeave = () => {
    setJointTooltip((current) => ({ ...current, visible: false }))
  }

  useEffect(() => {
    if (!muscleMapRef.current) {
      return
    }

    const regions = Array.from(muscleMapRef.current.querySelectorAll('g.muscle'))
    regions.forEach((region) => {
      const resolvedTag = resolveClickedMuscleTag(region)
      const selected = resolvedTag ? activeTags.muscleAreas.includes(resolvedTag) : false
      region.classList.toggle('selected', selected)
      region.classList.add('interactive-zone')
    })
  }, [activeTags.muscleAreas, mapKeyToTagMap, normalizedOptionMap, frontMuscleSvg, backMuscleSvg])

  useEffect(() => {
    if (!jointsMapRef.current) {
      return
    }

    const jointNodes = Array.from(jointsMapRef.current.querySelectorAll('g.joint-zone'))
    jointNodes.forEach((node) => {
      const nodeJoint = node.getAttribute('data-joint-row')
      const isSelected = selectedJointRow !== null && nodeJoint === selectedJointRow
      node.classList.toggle('selected', isSelected)
    })
  }, [jointsSvg, selectedJointRow])

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

                <div className="muscle-map-shell">
                  <div className="muscle-map-with-selection">
                    <div
                      ref={muscleMapRef}
                      className="muscle-map-panels"
                      onClick={handleMuscleMapClick}
                      onMouseMove={handleMuscleMapMove}
                      onMouseLeave={handleMuscleMapLeave}
                      role="img"
                      aria-label="Clickable muscle map"
                    >
                      <div className="muscle-map-panel">
                        <div className="muscle-map-title">Front</div>
                        <div className="muscle-map-svg" dangerouslySetInnerHTML={{ __html: frontMuscleSvg }} />
                      </div>
                      <div className="muscle-map-panel">
                        <div className="muscle-map-title">Back</div>
                        <div className="muscle-map-svg" dangerouslySetInnerHTML={{ __html: backMuscleSvg }} />
                      </div>
                      {tooltip.visible && (
                        <div
                          className="muscle-tooltip"
                          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
                          role="tooltip"
                        >
                          {tooltip.text}
                        </div>
                      )}
                    </div>

                    <aside className="selected-muscles-panel" aria-label="Selected muscle areas">
                      <h4>Selected Muscle Areas</h4>
                      {activeTags.muscleAreas.length === 0 ? (
                        <p className="empty-selection">Click muscles to add selections.</p>
                      ) : (
                        <div className="selected-muscle-buttons">
                          {activeTags.muscleAreas.map((area) => (
                            <button key={area} className="selected-muscle-btn" onClick={() => toggleMuscleArea(area)}>
                              {area}
                              <span className="remove-mark" aria-hidden="true">
                                ×
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </aside>
                  </div>
                </div>

                <p className="helper-text">Click a muscle shape to toggle exactly one matching tag from TaggingCategories.</p>

                {(missingFromMap.length > 0 || mapOnlyTags.length > 0) && (
                  <div className="mapping-warning">
                    <strong>Mapping check:</strong>
                    {missingFromMap.length > 0 && <p>Missing SVG mapping for: {missingFromMap.join(', ')}</p>}
                    {mapOnlyTags.length > 0 && <p>Mapped tags not in taxonomy: {mapOnlyTags.join(', ')}</p>}
                  </div>
                )}

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
                <h3>Joints</h3>
                <div className="joints-pane">
                  <div
                    ref={jointsMapRef}
                    className="joints-map"
                    onClick={handleJointsMapClick}
                    onMouseMove={handleJointsMapMove}
                    onMouseLeave={handleJointsMapLeave}
                    role="img"
                    aria-label="Clickable joints map"
                  >
                    <div className="joints-map-svg" dangerouslySetInnerHTML={{ __html: jointsSvg }} />
                    {jointTooltip.visible && (
                      <div
                        className="joint-tooltip"
                        style={{ left: `${jointTooltip.x}px`, top: `${jointTooltip.y}px` }}
                        role="tooltip"
                      >
                        {jointTooltip.text}
                      </div>
                    )}
                  </div>

                  <aside className="joint-options-panel" aria-label="Joint options">
                    <h4>{selectedJointRow ? `${selectedJointRow} options` : 'Select a joint'}</h4>
                    {selectedJointRow ? (
                      <div className="joint-plane-buttons">
                        {PLANES.map((plane) => {
                          const checked = (activeTags.planes[selectedJointRow] ?? []).includes(plane)
                          const label = plane === 'Sagittal' ? 'Saggital' : plane
                          return (
                            <button
                              key={`${selectedJointRow}-${plane}`}
                              className={`joint-plane-btn ${checked ? 'active' : ''}`}
                              onClick={() => togglePlane(selectedJointRow, plane)}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="empty-selection">Click a joint circle to choose planes.</p>
                    )}
                  </aside>
                </div>
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
                      <tr key={row} className={selectedJointRow === row ? 'joint-row-focused' : ''}>
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
