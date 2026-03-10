import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import Papa, { type ParseResult } from 'papaparse'
import './App.css'

type Exercise = {
  id: string
  name: string
  link: string
}

type TaxonomyRow = {
  'Muscle area'?: string
  'Muscles involved'?: string
  'Joints involved'?: string
}

type PaneGroupRow = {
  Group?: string
  'Muscle Area Tag'?: string
  'Muscles Involved'?: string
  'Joints Involved'?: string
}

type EquipmentGroupRow = {
  Category?: string
  'Equipment Included'?: string
}

type TaggingCategoryRow = {
  'Body position'?: string
  Difficulty?: string
  Level?: string
  'Limbs used'?: string
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
  equipment: string[]
  bodyPositions: string[]
  difficulty: number | null
  levels: string[]
  limbsUsed: string[]
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

type PaneId =
  | 'exercise-library'
  | 'exercise-list'
  | 'batch-paste'
  | 'session-controls'
  | 'muscle-map'
  | 'muscles-involved'
  | 'equipment'
  | 'body-position'
  | 'difficulty'
  | 'level'
  | 'limbs-used'
  | 'joints'
  | 'planes-matrix'

type DockSlot = PaneId | null

type ResizeSession =
  | {
      type: 'column'
      rowIndex: number
      paneIndex: number
      startClient: number
      startSize: number
    }
  | {
      type: 'row'
      rowIndex: number
      startClient: number
      startSize: number
    }

type LayoutPreset = {
  id: 'balanced' | 'map-focus' | 'library-focus'
  label: string
  rowHeights: number[]
  rowWidths: number[][]
}

type BatchInputRow = {
  rowNumber: number
  name: string
  link: string
  matchedExercise: Exercise | null
  issue: string | null
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

const DOCK_ROW_SIZES = [2, 3, 4, 4]

const MIN_ROW_SIZE = 0.12
const MIN_COLUMN_SIZE = 0.15

const DEFAULT_DOCK_ASSIGNMENTS: DockSlot[] = [
  'exercise-library',
  'exercise-list',
  'session-controls',
  'muscle-map',
  'joints',
  'muscles-involved',
  'equipment',
  'planes-matrix',
  'batch-paste',
  'body-position',
  'difficulty',
  'level',
  'limbs-used',
]

const DEFAULT_ROW_HEIGHTS = [0.2, 0.25, 0.27, 0.28]

const DEFAULT_ROW_WIDTHS = DOCK_ROW_SIZES.map((columns) => Array.from({ length: columns }, () => 1 / columns))

const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    rowHeights: [...DEFAULT_ROW_HEIGHTS],
    rowWidths: DEFAULT_ROW_WIDTHS.map((row) => [...row]),
  },
  {
    id: 'map-focus',
    label: 'Map Focus',
    rowHeights: [0.28, 0.29, 0.22, 0.21],
    rowWidths: [[0.4, 0.6], [0.45, 0.25, 0.3], [0.2, 0.2, 0.2, 0.2], [0.25, 0.25, 0.25, 0.25]],
  },
  {
    id: 'library-focus',
    label: 'Library Focus',
    rowHeights: [0.28, 0.24, 0.24, 0.24],
    rowWidths: [[0.65, 0.35], [0.34, 0.33, 0.33], [0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25]],
  },
]

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
  equipment: [],
  bodyPositions: [],
  difficulty: null,
  levels: [],
  limbsUsed: [],
  planes: JOINT_ROWS.reduce(
    (accumulator, row) => ({ ...accumulator, [row]: [] }),
    {} as Record<JointRow, Plane[]>,
  ),
})

type LegacyTagShape = Partial<TagState> & {
  bodyPosition?: string | null
  level?: string | null
  limbsUsedLegacy?: string | null
}

const normalizeTagState = (value: LegacyTagShape | null | undefined): TagState => {
  const normalizedPlanes = JOINT_ROWS.reduce(
    (accumulator, row) => {
      const rowPlanes = value?.planes?.[row] ?? []
      const normalizedRow = rowPlanes
        .map((plane) => normalizePlane(String(plane)))
        .filter((plane): plane is Plane => plane !== null)

      return {
        ...accumulator,
        [row]: uniqueSorted(normalizedRow) as Plane[],
      }
    },
    {} as Record<JointRow, Plane[]>,
  )

  return {
    muscleAreas: uniqueSorted(value?.muscleAreas ?? []),
    equipment: uniqueSorted(value?.equipment ?? []),
    bodyPositions: uniqueSorted(
      Array.isArray(value?.bodyPositions)
        ? value.bodyPositions.map((item) => String(item))
        : value?.bodyPosition
          ? [String(value.bodyPosition)]
          : [],
    ),
    difficulty:
      typeof value?.difficulty === 'number'
        ? value.difficulty
        : value?.difficulty !== null && value?.difficulty !== undefined && String(value.difficulty).trim().length > 0
          ? Number(value.difficulty)
          : null,
    levels: uniqueSorted(
      Array.isArray(value?.levels)
        ? value.levels.map((item) => String(item))
        : value?.level
          ? [String(value.level)]
          : [],
    ),
    limbsUsed: uniqueSorted(
      Array.isArray(value?.limbsUsed)
        ? value.limbsUsed.map((item) => String(item))
        : value?.limbsUsedLegacy
          ? [String(value.limbsUsedLegacy)]
          : [],
    ),
    planes: normalizedPlanes,
  }
}

const normalizePlane = (value: string): Plane | null => {
  const normalized = ALIAS_MAP[value.trim().toLowerCase()]
  if (!normalized) {
    return null
  }
  return normalized as Plane
}

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b))

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const normalizeLookupValue = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

const splitCommaValues = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const formatPaneGroupTitle = (groupKey: string): string => {
  if (groupKey === 'upperbody') {
    return 'Upper body'
  }
  if (groupKey === 'trunk&core') {
    return 'Trunk & core'
  }
  if (groupKey === 'lowerbody') {
    return 'Lower body'
  }
  return groupKey
    .replace(/[_&-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)([a-z])/g, (_full, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
}

const inferJointRowsFromText = (jointLabel: string): JointRow[] => {
  const normalized = normalizeLookupValue(jointLabel)
  const rows = new Set<JointRow>()

  if (normalized.includes('cervical')) {
    rows.add('Cervical')
  }
  if (normalized.includes('thoracic') || normalized.includes('intervertebral')) {
    rows.add('Thoracic')
  }
  if (normalized.includes('lumbar') || normalized.includes('sacroiliac') || normalized.includes('pelvic tilt')) {
    rows.add('Lumbar')
  }
  if (normalized.includes('shoulder') || normalized.includes('glenohumeral')) {
    rows.add('Shoulder')
  }
  if (normalized.includes('elbow')) {
    rows.add('Elbow')
  }
  if (normalized.includes('wrist') || normalized.includes('radiocarpal')) {
    rows.add('Wrist')
  }
  if (normalized.includes('metacarpophalangeal') || normalized === 'mcp') {
    rows.add('MCP')
  }
  if (normalized.includes('finger') || normalized.includes('interphalangeal')) {
    rows.add('Fingers')
  }
  if (normalized.includes('hip')) {
    rows.add('Hip')
  }
  if (normalized.includes('knee')) {
    rows.add('Knee')
  }
  if (normalized.includes('ankle') || normalized.includes('talocrural') || normalized.includes('subtalar')) {
    rows.add('Ankle')
  }
  if (normalized.includes('midfoot') || normalized.includes('tarso metatarsal') || normalized.includes('tarsometatarsal')) {
    rows.add('Midfoot')
  }
  if (normalized.includes('toe')) {
    rows.add('Toes')
  }

  return JOINT_ROWS.filter((row) => rows.has(row))
}

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
  const dockLayoutRef = useRef<HTMLDivElement | null>(null)
  const dockRowRefs = useRef<Array<HTMLDivElement | null>>([])
  const lastMuscleClickRef = useRef<{ key: string; timestamp: number } | null>(null)
  const lastJointClickRef = useRef<{ key: string; timestamp: number } | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [muscleAreaOptions, setMuscleAreaOptions] = useState<string[]>([])
  const [muscleMap, setMuscleMap] = useState<MuscleMapPayload>({ version: 1, entries: [] })
  const [frontMuscleSvg, setFrontMuscleSvg] = useState('')
  const [backMuscleSvg, setBackMuscleSvg] = useState('')
  const [jointsSvg, setJointsSvg] = useState('')
  const [tagsByExercise, setTagsByExercise] = useState<Record<string, TagState>>({})
  const [taxonomyRows, setTaxonomyRows] = useState<TaxonomyRow[]>([])
  const [paneGroupRows, setPaneGroupRows] = useState<PaneGroupRow[]>([])
  const [equipmentGroupRows, setEquipmentGroupRows] = useState<EquipmentGroupRow[]>([])
  const [bodyPositionOptions, setBodyPositionOptions] = useState<string[]>([])
  const [levelOptions, setLevelOptions] = useState<string[]>([])
  const [limbsUsedOptions, setLimbsUsedOptions] = useState<string[]>([])
  const [difficultyMin, setDifficultyMin] = useState(0)
  const [difficultyMax, setDifficultyMax] = useState(10)
  const [searchQuery, setSearchQuery] = useState('')
  const [batchInputText, setBatchInputText] = useState('')
  const [batchRows, setBatchRows] = useState<BatchInputRow[]>([])
  const [batchFilteredExerciseIds, setBatchFilteredExerciseIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewLoadError, setPreviewLoadError] = useState(false)
  const [copiedTags, setCopiedTags] = useState<TagState | null>(null)
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null)
  const [globalPasteMode, setGlobalPasteMode] = useState<PasteMode>('Merge')
  const [includeMuscleAreas, setIncludeMuscleAreas] = useState(true)
  const [includeEquipment, setIncludeEquipment] = useState(true)
  const [includePlanes, setIncludePlanes] = useState(true)
  const [muscleAreaMode, setMuscleAreaMode] = useState<FieldMode>('Global')
  const [equipmentMode, setEquipmentMode] = useState<FieldMode>('Global')
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
  const [dockAssignments, setDockAssignments] = useState<DockSlot[]>(DEFAULT_DOCK_ASSIGNMENTS)
  const [draggedPaneId, setDraggedPaneId] = useState<PaneId | null>(null)
  const [rowHeights, setRowHeights] = useState<number[]>([...DEFAULT_ROW_HEIGHTS])
  const [rowWidths, setRowWidths] = useState<number[][]>(DEFAULT_ROW_WIDTHS.map((row) => [...row]))
  const [activeResizeSession, setActiveResizeSession] = useState<ResizeSession | null>(null)
  const [activePreset, setActivePreset] = useState<LayoutPreset['id'] | 'custom'>('balanced')

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        const [
          exerciseRows,
          loadedTaxonomyRows,
          loadedPaneGroupRows,
          loadedEquipmentRows,
          loadedTaggingCategoryRows,
          muscleMapPayload,
          frontSvg,
          backSvg,
          jointsSvgText,
        ] = await Promise.all([
          parseCsv<{ ExerciseName?: string; Link?: string }>('/ExerciseName_Link.csv'),
          parseCsv<TaxonomyRow>('/MuscleJointArea.csv'),
          parseCsv<PaneGroupRow>('/MusclePaneGroups.csv'),
          parseCsv<EquipmentGroupRow>('/EquipmentTags.csv'),
          parseCsv<TaggingCategoryRow>('/TaggingCategories.csv'),
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

        const areas = [
          ...loadedTaxonomyRows.map((row) => (row['Muscle area'] ?? '').trim()),
          ...loadedPaneGroupRows.map((row) => (row['Muscle Area Tag'] ?? '').trim()),
        ].filter((value) => value.length > 0)

        const positions = uniqueSorted(
          loadedTaggingCategoryRows
            .map((row) => (row['Body position'] ?? '').trim())
            .filter((value) => value.length > 0),
        )

        const levels = uniqueSorted(
          loadedTaggingCategoryRows
            .map((row) => (row.Level ?? '').trim())
            .filter((value) => value.length > 0),
        )

        const limbsUsed = uniqueSorted(
          loadedTaggingCategoryRows
            .map((row) => (row['Limbs used'] ?? '').trim())
            .filter((value) => value.length > 0),
        )

        const difficultyValues = loadedTaggingCategoryRows
          .map((row) => Number((row.Difficulty ?? '').trim()))
          .filter((value) => Number.isFinite(value))

        const minDifficulty = difficultyValues.length > 0 ? Math.min(...difficultyValues) : 0
        const maxDifficulty = difficultyValues.length > 0 ? Math.max(...difficultyValues) : 10

        const savedTags = localStorage.getItem(STORAGE_KEY)
        if (savedTags) {
          const parsed = JSON.parse(savedTags) as Record<string, Partial<TagState>>
          const normalizedEntries = Object.entries(parsed).map(([exerciseId, tagState]) => [
            exerciseId,
            normalizeTagState(tagState),
          ])
          setTagsByExercise(Object.fromEntries(normalizedEntries))
        }

        setExercises(parsedExercises)
        setTaxonomyRows(loadedTaxonomyRows)
        setPaneGroupRows(loadedPaneGroupRows)
        setEquipmentGroupRows(loadedEquipmentRows)
        setBodyPositionOptions(positions)
        setLevelOptions(levels)
        setLimbsUsedOptions(limbsUsed)
        setDifficultyMin(minDifficulty)
        setDifficultyMax(maxDifficulty)
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
    const base = exercises.filter((exercise) => batchFilteredExerciseIds.has(exercise.id))

    if (!query) {
      return base
    }

    return base.filter((exercise) => normalizeLookupValue(exercise.name).includes(query))
  }, [exercises, searchQuery, batchFilteredExerciseIds])

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
    return normalizeTagState(tagsByExercise[activeExercise.id])
  }, [activeExercise, tagsByExercise])

  const exercisesByNormalizedName = useMemo(() => {
    const map = new Map<string, Exercise[]>()
    exercises.forEach((exercise) => {
      const key = normalizeLookupValue(exercise.name)
      const existing = map.get(key) ?? []
      existing.push(exercise)
      map.set(key, existing)
    })
    return map
  }, [exercises])

  const parseBatchRows = () => {
    const lines = batchInputText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0) {
      setBatchRows([])
      setBatchFilteredExerciseIds(new Set())
      return
    }

    const parsed: BatchInputRow[] = []

    lines.forEach((line, index) => {
      const columns = line.split('\t')
      const first = (columns[0] ?? '').trim()
      const second = (columns[1] ?? '').trim()

      const firstNormalized = normalizeLookupValue(first)
      const secondNormalized = normalizeLookupValue(second)

      const headerRow = index === 0 && firstNormalized.includes('exercise') && secondNormalized.includes('link')
      if (headerRow) {
        return
      }

      if (!first && !second) {
        return
      }

      const candidates = exercisesByNormalizedName.get(firstNormalized) ?? []
      const matchedExercise =
        second.length > 0
          ? candidates.find((candidate) => normalizeLookupValue(candidate.link) === normalizeLookupValue(second)) ??
            candidates[0] ??
            null
          : candidates[0] ?? null

      parsed.push({
        rowNumber: index + 1,
        name: first,
        link: second,
        matchedExercise,
        issue: !first ? 'Missing exercise name' : matchedExercise ? null : 'Exercise not found in loaded library',
      })
    })

    setBatchRows(parsed)

    const matchedIds = parsed
      .map((row) => row.matchedExercise?.id)
      .filter((id): id is string => Boolean(id))

    setBatchFilteredExerciseIds(new Set(matchedIds))
  }

  const selectParsedExercises = () => {
    const ids = batchRows
      .map((row) => row.matchedExercise?.id)
      .filter((id): id is string => Boolean(id))

    if (ids.length === 0) {
      return
    }

    setSelectedIds(new Set(ids))
  }

  const batchOutputText = useMemo(() => {
    if (batchRows.length === 0) {
      return ''
    }

    const header = [
      'Exercise Name',
      'Link',
      'Status',
      'Muscle area',
      'Equipment',
      'Body position',
      'Difficulty',
      'Level',
      'Limbs used',
      ...JOINT_ROWS.map((row) => `Planes ${row}`),
    ]

    const rows = batchRows.map((row) => {
      const tags = row.matchedExercise ? normalizeTagState(tagsByExercise[row.matchedExercise.id]) : createEmptyTags()

      const planeCells = JOINT_ROWS.map((jointRow) => (tags.planes[jointRow] ?? []).join(', '))

      return [
        row.name,
        row.link,
        row.issue ?? 'OK',
        tags.muscleAreas.join(', '),
        tags.equipment.join(', '),
        tags.bodyPositions.join(', '),
        tags.difficulty === null ? '' : String(tags.difficulty),
        tags.levels.join(', '),
        tags.limbsUsed.join(', '),
        ...planeCells,
      ]
    })

    return [header, ...rows].map((line) => line.join('\t')).join('\n')
  }, [batchRows, tagsByExercise])

  const copyBatchOutput = async () => {
    if (!batchOutputText) {
      return
    }

    try {
      await navigator.clipboard.writeText(batchOutputText)
    } catch (clipboardError) {
      window.alert(
        clipboardError instanceof Error
          ? `Failed to copy output: ${clipboardError.message}`
          : 'Failed to copy output to clipboard.',
      )
    }
  }

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

  const musclesInvolvedLookup = useMemo(() => {
    const involvedToAreas = new Map<string, Set<string>>()

    const addCandidate = (muscleName: string, areaTag: string) => {
      const normalizedMuscle = normalizeLookupValue(muscleName)
      const normalizedArea = normalizeLookupValue(areaTag)
      if (!normalizedMuscle || !normalizedArea) {
        return
      }

      if (!involvedToAreas.has(normalizedMuscle)) {
        involvedToAreas.set(normalizedMuscle, new Set())
      }
      involvedToAreas.get(normalizedMuscle)?.add(areaTag)
    }

    taxonomyRows.forEach((row) => {
      const area = (row['Muscle area'] ?? '').trim()
      const involved = (row['Muscles involved'] ?? '').trim()
      if (!area || !involved) {
        return
      }

      addCandidate(involved, area)
    })

    paneGroupRows.forEach((row) => {
      const area = (row['Muscle Area Tag'] ?? '').trim()
      const involvedList = (row['Muscles Involved'] ?? '').trim()
      if (!area || !involvedList) {
        return
      }

      splitCommaValues(involvedList).forEach((muscleName) => addCandidate(muscleName, area))
    })

    const areaByNormalizedOption: Record<string, string> = {}
    muscleAreaOptions.forEach((option) => {
      areaByNormalizedOption[normalizeLookupValue(option)] = option
    })

    const singleAreaByMuscle: Record<string, string> = {}
    involvedToAreas.forEach((areas, involved) => {
      if (areas.size === 1) {
        singleAreaByMuscle[involved] = Array.from(areas)[0]
      }
    })

    const normalizedMuscleCandidates = Object.entries(singleAreaByMuscle).map(([normalizedMuscle, area]) => ({
      normalizedMuscle,
      area,
      tokens: normalizedMuscle.split(' ').filter((token) => token.length > 2),
    }))

    const findAreaByCandidate = (candidate: string): string | null => {
      if (!candidate) {
        return null
      }

      const directOption = areaByNormalizedOption[candidate]
      if (directOption) {
        return directOption
      }

      if (singleAreaByMuscle[candidate]) {
        return singleAreaByMuscle[candidate]
      }

      const candidateTokens = candidate.split(' ').filter((token) => token.length > 2)
      let bestArea: string | null = null
      let bestScore = 0

      normalizedMuscleCandidates.forEach((entry) => {
        let score = 0

        if (candidate.includes(entry.normalizedMuscle) || entry.normalizedMuscle.includes(candidate)) {
          score += 4
        }

        const overlapCount = entry.tokens.filter((token) => candidateTokens.includes(token)).length
        score += overlapCount

        if (score > bestScore) {
          bestScore = score
          bestArea = entry.area
        }
      })

      return bestScore >= 2 ? bestArea : null
    }

    return {
      singleAreaByMuscle,
      findAreaByCandidate,
    }
  }, [taxonomyRows, paneGroupRows, muscleAreaOptions])

  const groupedMusclePaneSections = useMemo(() => {
    const grouped = new Map<string, Array<{ area: string; muscles: string[]; joints: string[] }>>()

    paneGroupRows.forEach((row) => {
      const groupKey = (row.Group ?? '').trim().toLowerCase()
      const area = (row['Muscle Area Tag'] ?? '').trim()
      if (!groupKey || !area) {
        return
      }

      const muscles = splitCommaValues((row['Muscles Involved'] ?? '').trim())
      const joints = splitCommaValues((row['Joints Involved'] ?? '').trim())
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, [])
      }

      grouped.get(groupKey)?.push({ area, muscles, joints })
    })

    return Array.from(grouped.entries())
      .map(([groupKey, entries]) => ({
        groupKey,
        title: formatPaneGroupTitle(groupKey),
        entries: entries.sort((left, right) => left.area.localeCompare(right.area)),
      }))
      .sort((left, right) => left.title.localeCompare(right.title))
  }, [paneGroupRows])

  const groupedJointPaneSections = useMemo(() => {
    return groupedMusclePaneSections
      .map((section) => {
        const labels = new Set<string>()
        section.entries.forEach((entry) => {
          entry.joints.forEach((jointLabel) => labels.add(jointLabel))
        })

        const joints = Array.from(labels)
          .map((label) => ({
            label,
            rows: inferJointRowsFromText(label),
          }))
          .filter((item) => item.rows.length > 0)
          .sort((left, right) => left.label.localeCompare(right.label))

        return {
          groupKey: section.groupKey,
          title: section.title,
          joints,
        }
      })
      .filter((section) => section.joints.length > 0)
  }, [groupedMusclePaneSections])

  const groupedEquipmentPaneSections = useMemo(() => {
    const grouped = new Map<string, Set<string>>()
    const orderedCategories: string[] = []

    equipmentGroupRows.forEach((row) => {
      const category = (row.Category ?? '').trim()
      if (!category) {
        return
      }

      if (!grouped.has(category)) {
        grouped.set(category, new Set())
        orderedCategories.push(category)
      }

      splitCommaValues((row['Equipment Included'] ?? '').trim()).forEach((item) => {
        grouped.get(category)?.add(item)
      })
    })

    return orderedCategories.map((category) => ({
      category,
      equipment: uniqueSorted(Array.from(grouped.get(category) ?? [])),
    }))
  }, [equipmentGroupRows])

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
      [activeExercise.id]: updater(normalizeTagState(current[activeExercise.id])),
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

  const toggleEquipmentTag = (value: string) => {
    updateActiveTags((current) => {
      const exists = current.equipment.includes(value)
      const next = exists ? current.equipment.filter((item) => item !== value) : [...current.equipment, value]
      return {
        ...current,
        equipment: uniqueSorted(next),
      }
    })
  }

  const setBodyPositionTag = (value: string) => {
    updateActiveTags((current) => ({
      ...current,
      bodyPositions: current.bodyPositions.includes(value)
        ? current.bodyPositions.filter((item) => item !== value)
        : uniqueSorted([...current.bodyPositions, value]),
    }))
  }

  const setLevelTag = (value: string) => {
    updateActiveTags((current) => ({
      ...current,
      levels: current.levels.includes(value) ? current.levels.filter((item) => item !== value) : uniqueSorted([...current.levels, value]),
    }))
  }

  const setDifficultyTag = (value: number | null) => {
    updateActiveTags((current) => ({
      ...current,
      difficulty: value,
    }))
  }

  const setLimbsUsedTag = (value: string) => {
    updateActiveTags((current) => ({
      ...current,
      limbsUsed: current.limbsUsed.includes(value)
        ? current.limbsUsed.filter((item) => item !== value)
        : uniqueSorted([...current.limbsUsed, value]),
    }))
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

      const mappedFromInvolved = musclesInvolvedLookup.singleAreaByMuscle[candidate]
      if (mappedFromInvolved) {
        return mappedFromInvolved
      }

      const fuzzyMappedArea = musclesInvolvedLookup.findAreaByCandidate(candidate)
      if (fuzzyMappedArea) {
        return fuzzyMappedArea
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

    const now = Date.now()
    const last = lastMuscleClickRef.current
    if (last && last.key === mappedTag && now - last.timestamp < 180) {
      return
    }
    lastMuscleClickRef.current = { key: mappedTag, timestamp: now }

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

    const now = Date.now()
    const last = lastJointClickRef.current
    if (last && last.key === jointRow && now - last.timestamp < 180) {
      return
    }
    lastJointClickRef.current = { key: jointRow, timestamp: now }

    setSelectedJointRow((current) => (current === jointRow ? null : jointRow))
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
      region.classList.remove('selected')
      region.classList.add('interactive-zone')
    })

    regions.forEach((region) => {
      const resolvedTag = resolveClickedMuscleTag(region)
      const selected = resolvedTag ? activeTags.muscleAreas.includes(resolvedTag) : false
      if (!selected) {
        return
      }

      region.classList.add('selected')

      let ancestor = region.parentElement
      while (ancestor && ancestor !== muscleMapRef.current) {
        if (ancestor.classList.contains('muscle')) {
          ancestor.classList.add('selected')
        }
        ancestor = ancestor.parentElement
      }
    })
  }, [activeTags.muscleAreas, mapKeyToTagMap, normalizedOptionMap, musclesInvolvedLookup, frontMuscleSvg, backMuscleSvg])

  useEffect(() => {
    if (!jointsMapRef.current) {
      return
    }

    const jointNodes = Array.from(jointsMapRef.current.querySelectorAll('g.joint-zone'))
    jointNodes.forEach((node) => {
      const nodeJoint = node.getAttribute('data-joint-row')
      const isFocused = selectedJointRow !== null && nodeJoint === selectedJointRow
      const isTagged =
        nodeJoint !== null &&
        JOINT_ROWS.includes(nodeJoint as JointRow) &&
        ((activeTags.planes[nodeJoint as JointRow] ?? []).length > 0)

      node.classList.toggle('selected', isFocused || isTagged)
    })
  }, [jointsSvg, selectedJointRow, activeTags.planes])

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
      equipment: [...target.equipment],
      bodyPositions: [...target.bodyPositions],
      difficulty: target.difficulty,
      levels: [...target.levels],
      limbsUsed: [...target.limbsUsed],
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

    if (includeEquipment) {
      const mode = resolveMode(equipmentMode)
      if (mode === 'Replace') {
        next.equipment = uniqueSorted(source.equipment)
      } else {
        next.equipment = uniqueSorted([...target.equipment, ...source.equipment])
      }
    }

    next.bodyPositions = uniqueSorted([...target.bodyPositions, ...source.bodyPositions])
    next.difficulty = source.difficulty
    next.levels = uniqueSorted([...target.levels, ...source.levels])
    next.limbsUsed = uniqueSorted([...target.limbsUsed, ...source.limbsUsed])

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
        const existing = normalizeTagState(current[targetId])
        next[targetId] = applyPasteToTarget(existing, copiedTags)
      })
      return next
    })
  }

  const handlePaneDragStart = (paneId: PaneId) => {
    setDraggedPaneId(paneId)
  }

  const handlePaneDragEnd = () => {
    setDraggedPaneId(null)
  }

  const handleDockDrop = (targetIndex: number) => {
    if (!draggedPaneId) {
      return
    }

    setDockAssignments((current) => {
      const sourceIndex = current.findIndex((paneId) => paneId === draggedPaneId)
      if (sourceIndex === -1 || sourceIndex === targetIndex) {
        return current
      }

      const next = [...current]
      const targetPane = next[targetIndex]
      next[targetIndex] = draggedPaneId
      next[sourceIndex] = targetPane
      return next
    })
    setDraggedPaneId(null)
  }

  const resetPaneLayout = () => {
    setDockAssignments([...DEFAULT_DOCK_ASSIGNMENTS])
    setRowHeights([...DEFAULT_ROW_HEIGHTS])
    setRowWidths(DEFAULT_ROW_WIDTHS.map((row) => [...row]))
    setActivePreset('custom')
  }

  const applyLayoutPreset = (presetId: LayoutPreset['id']) => {
    const preset = LAYOUT_PRESETS.find((item) => item.id === presetId)
    if (!preset) {
      return
    }

    setRowHeights([...preset.rowHeights])
    setRowWidths(preset.rowWidths.map((row) => [...row]))
    setActivePreset(preset.id)
  }

  const startColumnResize = (rowIndex: number, paneIndex: number, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const row = rowWidths[rowIndex]
    if (!row || paneIndex < 0 || paneIndex >= row.length) {
      return
    }

    setActiveResizeSession({
      type: 'column',
      rowIndex,
      paneIndex,
      startClient: event.clientX,
      startSize: row[paneIndex],
    })
    setActivePreset('custom')
  }

  const startRowResize = (rowIndex: number, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (rowIndex < 0 || rowIndex >= rowHeights.length) {
      return
    }

    setActiveResizeSession({
      type: 'row',
      rowIndex,
      startClient: event.clientY,
      startSize: rowHeights[rowIndex],
    })
    setActivePreset('custom')
  }

  useEffect(() => {
    if (!activeResizeSession) {
      return
    }

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (activeResizeSession.type === 'column') {
        const rowElement = dockRowRefs.current[activeResizeSession.rowIndex]
        if (!rowElement) {
          return
        }

        const rowRect = rowElement.getBoundingClientRect()
        if (rowRect.width <= 0) {
          return
        }

        const columns = DOCK_ROW_SIZES[activeResizeSession.rowIndex]
        if (!columns || columns < 2) {
          return
        }

        const delta = (event.clientX - activeResizeSession.startClient) / rowRect.width
        const maxSize = 1 - MIN_COLUMN_SIZE * (columns - 1)
        const nextSize = clamp(activeResizeSession.startSize + delta, MIN_COLUMN_SIZE, maxSize)
        const remaining = (1 - nextSize) / (columns - 1)

        setRowWidths((current) => {
          const next = current.map((row) => [...row])
          next[activeResizeSession.rowIndex] = next[activeResizeSession.rowIndex].map((_, columnIndex) =>
            columnIndex === activeResizeSession.paneIndex ? nextSize : remaining,
          )
          return next
        })
      }

      if (activeResizeSession.type === 'row') {
        const layoutElement = dockLayoutRef.current
        if (!layoutElement) {
          return
        }

        const layoutRect = layoutElement.getBoundingClientRect()
        if (layoutRect.height <= 0) {
          return
        }

        const rowsCount = DOCK_ROW_SIZES.length
        if (rowsCount < 2) {
          return
        }

        const delta = (event.clientY - activeResizeSession.startClient) / layoutRect.height
        const maxSize = 1 - MIN_ROW_SIZE * (rowsCount - 1)
        const nextSize = clamp(activeResizeSession.startSize + delta, MIN_ROW_SIZE, maxSize)
        const remaining = (1 - nextSize) / (rowsCount - 1)

        setRowHeights((current) =>
          current.map((_, index) => (index === activeResizeSession.rowIndex ? nextSize : remaining)),
        )
      }
    }

    const handleMouseUp = () => {
      setActiveResizeSession(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [activeResizeSession])

  if (loading) {
    return <div className="app-shell">Loading exercises and taxonomy...</div>
  }

  if (error) {
    return <div className="app-shell">Failed to load data: {error}</div>
  }

  const difficultyMid = Math.round((difficultyMin + difficultyMax) / 2)

  const paneTitles: Record<PaneId, string> = {
    'exercise-library': 'Exercise Preview',
    'exercise-list': 'Exercise List',
    'batch-paste': 'Batch Paste',
    'session-controls': 'Session Controls',
    'muscle-map': 'Muscle Area Map',
    'muscles-involved': 'Muscles Involved',
    equipment: 'Equipment',
    'body-position': 'Body Position',
    difficulty: 'Difficulty',
    level: 'Level',
    'limbs-used': 'Limbs Used',
    joints: 'Joints',
    'planes-matrix': 'Planes Matrix',
  }

  const renderPaneContent = (paneId: PaneId) => {
    switch (paneId) {
      case 'exercise-library':
        return (
          <>
            {activeExercise ? (
              <div className="preview-card">
                <div className="preview-title">Preview: {activeExercise.name}</div>
                <div className="preview-media">
                  {activeExercise.link && !previewLoadError && isLikelyVideoLink(activeExercise.link) ? (
                    <video controls preload="metadata" src={activeExercise.link} onError={() => setPreviewLoadError(true)} />
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
            ) : (
              <p>Select an exercise to preview.</p>
            )}
          </>
        )

      case 'exercise-list':
        return (
          <>
            <input
              className="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search exercise name..."
            />
            {filteredExercises.length === 0 ? (
              <p className="empty-selection">Paste exercise name and link into Batch Paste to get started.</p>
            ) : (
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
            )}
          </>
        )

      case 'batch-paste': {
        const matchedCount = batchRows.filter((row) => row.issue === null).length

        return (
          <div className="batch-pane">
            <p className="helper-text">Paste Excel rows with two columns: Exercise Name and Link (tab-delimited).</p>

            <textarea
              className="batch-input"
              value={batchInputText}
              onChange={(event) => setBatchInputText(event.target.value)}
              placeholder={['Exercise Name\tLink', 'Split Squat\thttps://.../video.mp4'].join('\n')}
            />

            <div className="toolbar">
              <button type="button" onClick={parseBatchRows}>
                Parse Rows
              </button>
              <button type="button" onClick={selectParsedExercises} disabled={matchedCount === 0}>
                Select Matched Exercises
              </button>
              <button
                type="button"
                onClick={() => {
                  setBatchRows([])
                  setBatchInputText('')
                  setBatchFilteredExerciseIds(new Set())
                }}
                disabled={batchRows.length === 0 && batchFilteredExerciseIds.size === 0}
              >
                Clear Batch Filter
              </button>
              <span className="copied-source">
                Pasted rows: {batchRows.length} • Matched exercises: {matchedCount} • Unmatched: {Math.max(batchRows.length - matchedCount, 0)}
              </span>
            </div>

            {batchRows.length > 0 && (
              <div className="batch-results-table-wrap">
                <table className="batch-results-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Exercise</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((row) => (
                      <tr key={`batch-row-${row.rowNumber}-${row.name}`}>
                        <td>{row.rowNumber}</td>
                        <td>{row.name}</td>
                        <td>{row.issue ?? 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="batch-output-header">
              <h4>Output for Excel (tab-delimited)</h4>
              <button type="button" onClick={copyBatchOutput} disabled={!batchOutputText}>
                Copy Output
              </button>
            </div>
            <textarea className="batch-output" readOnly value={batchOutputText} />
          </div>
        )
      }

      case 'session-controls':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
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
                  Equipment mode
                  <select value={equipmentMode} onChange={(event) => setEquipmentMode(event.target.value as FieldMode)}>
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
                  <input type="checkbox" checked={includeEquipment} onChange={(event) => setIncludeEquipment(event.target.checked)} />
                  Include equipment
                </label>
                <label>
                  <input type="checkbox" checked={includePlanes} onChange={(event) => setIncludePlanes(event.target.checked)} />
                  Include planes matrix
                </label>
              </div>
            </div>
          </>
        )

      case 'muscle-map':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
          <>
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
                    <div className="muscle-tooltip" style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }} role="tooltip">
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

            <p className="helper-text">Click a muscle shape to toggle exactly one matching muscle area tag from the workbook mapping.</p>

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
          </>
        )

      case 'muscles-involved':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
          <div className="muscles-involved-panel" aria-label="Muscles involved grouped by workbook sections">
            <p className="helper-text">Grouping follows the workbook sheets: upper body, trunk & core, and lower body.</p>
            <div className="muscle-groups-grid">
              {groupedMusclePaneSections.map((group) => (
                <section key={group.groupKey} className="muscle-group-card">
                  <div className="muscle-group-title-row">
                    <h5>{group.title}</h5>
                  </div>
                  <div className="area-groups-stack">
                    {group.entries.map((entry) => {
                      const areaSelected = activeTags.muscleAreas.includes(entry.area)
                      return (
                        <div key={`${group.groupKey}-${entry.area}`} className="muscle-area-card">
                          <div className="muscle-group-title-row">
                            <h6>{entry.area}</h6>
                            <button
                              type="button"
                              className={`muscle-group-toggle ${areaSelected ? 'active' : ''}`}
                              onClick={() => toggleMuscleArea(entry.area)}
                            >
                              {areaSelected ? 'Selected' : 'Select'}
                            </button>
                          </div>
                          <div className="muscle-tags-wrap">
                            {entry.muscles.map((muscleName) => (
                              <button
                                key={`${entry.area}-${muscleName}`}
                                type="button"
                                className={`muscle-tag-btn ${areaSelected ? 'active' : ''}`}
                                onClick={() => toggleMuscleArea(entry.area)}
                                title={`Toggle area: ${entry.area}`}
                              >
                                <span>{muscleName}</span>
                              </button>
                            ))}
                          </div>
                          {entry.joints.length > 0 && <p className="area-joints">Joints: {entry.joints.join(', ')}</p>}
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )

      case 'equipment':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
          <div className="equipment-pane" aria-label="Equipment tags grouped by category">
            <p className="helper-text">Categories and equipment options come from EquipmentTags.xlsx.</p>

            {activeTags.equipment.length > 0 && (
              <div className="equipment-selected">
                <h5>Selected equipment</h5>
                <div className="muscle-tags-wrap">
                  {activeTags.equipment.map((item) => (
                    <button key={`selected-${item}`} className="muscle-tag-btn active" onClick={() => toggleEquipmentTag(item)}>
                      {item}
                      <span className="remove-mark" aria-hidden="true">
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="equipment-groups-grid">
              {groupedEquipmentPaneSections.map((section) => (
                <section key={`equipment-${section.category}`} className="muscle-group-card">
                  <div className="muscle-group-title-row">
                    <h5>{section.category}</h5>
                  </div>
                  <div className="muscle-tags-wrap">
                    {section.equipment.map((item) => {
                      const selected = activeTags.equipment.includes(item)
                      return (
                        <button
                          key={`${section.category}-${item}`}
                          type="button"
                          className={`muscle-tag-btn ${selected ? 'active' : ''}`}
                          onClick={() => toggleEquipmentTag(item)}
                        >
                          {item}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )

      case 'body-position':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
          <div className="simple-tag-pane">
            <p className="helper-text">Choose one or more body position tags.</p>
            <div className="muscle-tags-wrap">
              {bodyPositionOptions.map((position) => {
                const selected = activeTags.bodyPositions.includes(position)
                return (
                  <button
                    key={`body-position-${position}`}
                    type="button"
                    className={`muscle-tag-btn ${selected ? 'active' : ''}`}
                    onClick={() => setBodyPositionTag(position)}
                  >
                    {position}
                  </button>
                )
              })}
            </div>
          </div>
        )

      case 'difficulty':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
          <div className="simple-tag-pane">
            <p className="helper-text">Set difficulty using the slider.</p>
            <div className="difficulty-pane">
              <input
                type="range"
                min={difficultyMin}
                max={difficultyMax}
                step={1}
                value={activeTags.difficulty ?? difficultyMin}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => setDifficultyTag(Number(event.target.value))}
              />
              <div className="difficulty-anchors">
                <span>Beginner ({difficultyMin})</span>
                <span>Intermediate ({difficultyMid})</span>
                <span>Advanced ({difficultyMax})</span>
              </div>
              <div className="difficulty-value-row">
                <span>Selected value: {activeTags.difficulty ?? 'Not set'}</span>
                <button type="button" onClick={() => setDifficultyTag(null)}>
                  Clear
                </button>
              </div>
            </div>
          </div>
        )

      case 'level':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
          <div className="simple-tag-pane">
            <p className="helper-text">Choose one or more level tags.</p>
            {levelOptions.length === 0 ? (
              <p className="empty-selection">No Level values found in TaggingCategories.csv column U.</p>
            ) : (
              <div className="muscle-tags-wrap">
                {levelOptions.map((levelLabel) => {
                  const selected = activeTags.levels.includes(levelLabel)
                  return (
                    <button
                      key={`level-${levelLabel}`}
                      type="button"
                      className={`muscle-tag-btn ${selected ? 'active' : ''}`}
                      onClick={() => setLevelTag(levelLabel)}
                    >
                      {levelLabel}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )

      case 'limbs-used':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
          <div className="simple-tag-pane">
            <p className="helper-text">Choose one or more limbs used tags.</p>
            {limbsUsedOptions.length === 0 ? (
              <p className="empty-selection">No Limbs used values found in TaggingCategories.csv column W.</p>
            ) : (
              <div className="muscle-tags-wrap">
                {limbsUsedOptions.map((limbLabel) => {
                  const selected = activeTags.limbsUsed.includes(limbLabel)
                  return (
                    <button
                      key={`limbs-${limbLabel}`}
                      type="button"
                      className={`muscle-tag-btn ${selected ? 'active' : ''}`}
                      onClick={() => setLimbsUsedTag(limbLabel)}
                    >
                      {limbLabel}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )

      case 'joints':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
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
                <div className="joint-tooltip" style={{ left: `${jointTooltip.x}px`, top: `${jointTooltip.y}px` }} role="tooltip">
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

              <div className="workbook-joints-panel">
                <h5>Workbook joint groups</h5>
                {groupedJointPaneSections.map((section) => (
                  <section key={`joint-${section.groupKey}`} className="workbook-joint-section">
                    <h6>{section.title}</h6>
                    <div className="workbook-joint-chip-row">
                      {section.joints.map((joint) => {
                        const isActive = selectedJointRow ? joint.rows.includes(selectedJointRow) : false
                        return (
                          <button
                            key={`${section.groupKey}-${joint.label}`}
                            className={`workbook-joint-chip ${isActive ? 'active' : ''}`}
                            onClick={() => setSelectedJointRow(joint.rows[0])}
                            title={`Maps to: ${joint.rows.join(', ')}`}
                          >
                            {joint.label}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </aside>
          </div>
        )

      case 'planes-matrix':
        return !activeExercise ? (
          <p>Select an exercise to start tagging.</p>
        ) : (
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
        )

      default:
        return null
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Exercise Tagging App (MVP)</h1>
        <p>
          {exercises.length} exercises loaded • {selectedIds.size} selected
        </p>
        <div className="layout-controls" role="group" aria-label="Pane layout controls">
          <button type="button" onClick={resetPaneLayout}>
            Reset pane layout
          </button>
          {LAYOUT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`layout-preset-btn ${activePreset === preset.id ? 'active' : ''}`}
              onClick={() => applyLayoutPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </header>

      <div ref={dockLayoutRef} className="dock-layout">
        {DOCK_ROW_SIZES.map((columns, rowIndex) => {
          const rowStart = DOCK_ROW_SIZES.slice(0, rowIndex).reduce((sum, value) => sum + value, 0)
          const rowSlots = dockAssignments.slice(rowStart, rowStart + columns)

          return (
            <div
              key={`dock-row-shell-${rowIndex}`}
              className="dock-row-shell"
              style={{ flex: `${rowHeights[rowIndex]} 1 0` }}
            >
              <div
                className="dock-row"
                ref={(node) => {
                  dockRowRefs.current[rowIndex] = node
                }}
                style={{
                  gridTemplateColumns: rowWidths[rowIndex].map((ratio) => `${ratio}fr`).join(' '),
                }}
              >
                {rowSlots.map((paneId, localIndex) => {
                  const index = rowStart + localIndex
                  return (
                    <div
                      key={`dock-${index}`}
                      className="dock-slot"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleDockDrop(index)}
                    >
                      {paneId ? (
                        <section
                          className={`panel dock-pane ${draggedPaneId === paneId ? 'drag-active' : ''}`}
                        >
                          <div
                            className="dock-pane-header"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData('text/plain', paneId)
                              handlePaneDragStart(paneId)
                            }}
                            onDragEnd={handlePaneDragEnd}
                          >
                            <h2>{paneTitles[paneId]}</h2>
                            <span className="pane-drag-handle" aria-label="Drag pane" title="Drag pane">
                              ⋮⋮
                            </span>
                          </div>
                          <div className="dock-pane-body">{renderPaneContent(paneId)}</div>
                        </section>
                      ) : (
                        <div className="dock-empty">Drop pane here</div>
                      )}

                      {localIndex < columns - 1 && (
                        <button
                          type="button"
                          className="dock-resizer dock-resizer-column"
                          onMouseDown={(event) => startColumnResize(rowIndex, localIndex, event)}
                          aria-label="Resize pane width"
                          title="Drag to resize pane widths"
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {rowIndex < DOCK_ROW_SIZES.length - 1 && (
                <button
                  type="button"
                  className="dock-resizer dock-resizer-row"
                  onMouseDown={(event) => startRowResize(rowIndex, event)}
                  aria-label="Resize row height"
                  title="Drag to resize row heights"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default App
