<script setup lang="ts">
import { hierarchy, tree } from 'd3-hierarchy'
import type { ResolvedNode } from '~/types/tree'

const props = defineProps<{ forest: ResolvedNode[]; selectedId?: string | null }>()
const emit = defineEmits<{ (e: 'select', node: ResolvedNode | null): void }>()

interface Placed {
  id: string
  label: string
  hardness: number
  protected: boolean
  core: boolean
  depth: number
  a: number
  r: number
  radius: number
  x: number
  y: number
  parentId: string | null
}

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let ro: ResizeObserver | null = null
let start = 0

let W = 0
let H = 0
const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)

let placed: Placed[] = []
let byId = new Map<string, Placed>()
let nodeById = new Map<string, ResolvedNode>()
let maxR = 0
const view = { k: 1, tx: 0, ty: 0 }
let hover: Placed | null = null
let dragging = false
let last: [number, number] = [0, 0]

const TWO_PI = Math.PI * 2
const woodStops: [number, string][] = [
  [0, '#e7d8b5'],
  [30, '#d8b27a'],
  [45, '#b98a4e'],
  [65, '#8a4f1c'],
  [85, '#5a3717'],
  [100, '#3f2410'],
]
const hx = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
]
const woodRGB = (h: number): [number, number, number] => {
  for (let i = 1; i < woodStops.length; i++) {
    if (h <= woodStops[i]![0]) {
      const [a, ca] = woodStops[i - 1]!
      const [b, cb] = woodStops[i]!
      const t = (h - a) / (b - a)
      const x = hx(ca)
      const y = hx(cb)
      return [
        Math.round(x[0] + (y[0] - x[0]) * t),
        Math.round(x[1] + (y[1] - x[1]) * t),
        Math.round(x[2] + (y[2] - x[2]) * t),
      ]
    }
  }
  return hx(woodStops[woodStops.length - 1]![1])
}
const rgba = (c: [number, number, number], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`

interface Datum {
  id: string
  label: string
  hardness: number
  protected: boolean
  core: boolean
  children: Datum[]
}

const toDatum = (n: ResolvedNode): Datum => {
  nodeById.set(n.id, n)
  return {
    id: n.id,
    label: n.label,
    hardness: n.effectiveHardness,
    protected: n.protected,
    core: false,
    children: n.children.map(toDatum),
  }
}

const build = (): void => {
  nodeById = new Map()
  const rootDatum: Datum = {
    id: '__core__',
    label: 'core',
    hardness: 100,
    protected: true,
    core: true,
    children: props.forest.map(toDatum),
  }
  const root = hierarchy<Datum>(rootDatum)
  tree<Datum>()
    .size([TWO_PI, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.7) / Math.max(a.depth, 1))(root)

  const usable = Math.min(W, H) / 2 - 90
  const gap = usable / Math.max(root.height, 1)

  placed = []
  byId = new Map()
  for (const d of root.descendants()) {
    const weight = d.descendants().length - 1
    const radius = d.data.core ? 15 : 5 + Math.sqrt(weight) * 3.4 + (d.data.hardness / 100) * 4
    const p: Placed = {
      id: d.data.id,
      label: d.data.label,
      hardness: d.data.hardness,
      protected: d.data.protected,
      core: d.data.core,
      depth: d.depth,
      a: d.x ?? 0,
      r: d.depth * gap,
      radius,
      x: 0,
      y: 0,
      parentId: d.parent ? d.parent.data.id : null,
    }
    placed.push(p)
    byId.set(p.id, p)
  }
  maxR = Math.max(...placed.map((p) => p.r), 1)
}

const ancestors = (p: Placed | null): Set<string> => {
  const s = new Set<string>()
  let n: Placed | null | undefined = p
  while (n) {
    s.add(n.id)
    n = n.parentId ? byId.get(n.parentId) : null
  }
  return s
}

const toWorld = (mx: number, my: number): [number, number] => [
  (mx - view.tx) / view.k,
  (my - view.ty) / view.k,
]
const pick = (mx: number, my: number): Placed | null => {
  const [wx, wy] = toWorld(mx, my)
  let best: Placed | null = null
  let bd = Infinity
  for (const p of placed) {
    const dist = Math.hypot(p.x - wx, p.y - wy)
    if (dist < p.radius + 9 && dist < bd) {
      bd = dist
      best = p
    }
  }
  return best
}

const resize = (): void => {
  const el = canvas.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  W = rect.width
  H = rect.height
  el.width = W * DPR
  el.height = H * DPR
  build()
  view.tx = W / 2
  view.ty = H / 2
}

const radialLink = (
  c: CanvasRenderingContext2D,
  s: Placed,
  t: Placed,
  p: number,
): void => {
  const a1 = s.a - Math.PI / 2
  const a2 = t.a - Math.PI / 2
  const r1 = s.r * p
  const r2 = t.r * p
  const mr = ((s.r + t.r) / 2) * p
  c.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1)
  c.bezierCurveTo(
    Math.cos(a1) * mr,
    Math.sin(a1) * mr,
    Math.cos(a2) * mr,
    Math.sin(a2) * mr,
    Math.cos(a2) * r2,
    Math.sin(a2) * r2,
  )
}

const draw = (t: number, p: number): void => {
  const c = ctx
  if (!c) return
  c.setTransform(DPR, 0, 0, DPR, 0, 0)
  c.clearRect(0, 0, W, H)
  c.save()
  c.translate(view.tx, view.ty)
  c.scale(view.k, view.k)

  // background cross-section: warm wash + growth rings
  const wash = c.createRadialGradient(0, 0, 0, 0, 0, maxR * 1.15)
  wash.addColorStop(0, 'rgba(120,79,36,0.20)')
  wash.addColorStop(0.55, 'rgba(176,127,68,0.08)')
  wash.addColorStop(1, 'rgba(239,230,214,0)')
  c.fillStyle = wash
  c.beginPath()
  c.arc(0, 0, maxR * 1.15, 0, TWO_PI)
  c.fill()
  c.strokeStyle = 'rgba(90,55,23,0.09)'
  const span = Math.hypot(W, H) / view.k
  const ringCount = 22
  const rg = span / 2 / ringCount
  for (let i = 1; i <= ringCount; i++) {
    const rr = rg * i
    c.lineWidth = 0.5 + Math.max(0, 8 - i) * 0.05
    c.beginPath()
    for (let a = 0; a <= 6.3; a += 0.12) {
      const wob = 1 + Math.sin(a * 5 + i * 0.7) * 0.005
      const x = Math.cos(a) * rr * wob
      const y = Math.sin(a) * rr * wob
      a === 0 ? c.moveTo(x, y) : c.lineTo(x, y)
    }
    c.closePath()
    c.stroke()
  }

  const focus = hover ?? (props.selectedId ? byId.get(props.selectedId) ?? null : null)
  const hi = focus ? ancestors(focus) : null

  // links
  for (const child of placed) {
    if (!child.parentId) continue
    const parent = byId.get(child.parentId)
    if (!parent) continue
    const on = hi && hi.has(parent.id) && hi.has(child.id)
    c.strokeStyle = on
      ? 'rgba(192,123,44,0.95)'
      : hi
        ? 'rgba(90,55,23,0.10)'
        : 'rgba(90,55,23,0.26)'
    c.lineWidth = on ? 2.6 : 1 + (1 - child.depth / 6)
    if (on) {
      c.shadowColor = 'rgba(192,123,44,0.5)'
      c.shadowBlur = 8
    }
    c.beginPath()
    radialLink(c, parent, child, p)
    c.stroke()
    c.shadowBlur = 0
  }

  // nodes
  for (const d of placed) {
    const x = Math.cos(d.a - Math.PI / 2) * d.r * p
    const y = Math.sin(d.a - Math.PI / 2) * d.r * p
    d.x = x
    d.y = y
    const dim = hi !== null && !hi.has(d.id)
    const rad = d.radius

    if (d.core) {
      const pulse = 1 + Math.sin(t * 1.6) * 0.06
      const g = c.createRadialGradient(x, y, 0, x, y, rad * 3 * pulse)
      g.addColorStop(0, 'rgba(90,55,23,0.55)')
      g.addColorStop(1, 'rgba(90,55,23,0)')
      c.fillStyle = g
      c.beginPath()
      c.arc(x, y, rad * 3 * pulse, 0, TWO_PI)
      c.fill()
      c.fillStyle = '#2f1d0c'
      c.beginPath()
      c.arc(x, y, rad, 0, TWO_PI)
      c.fill()
      c.strokeStyle = 'rgba(239,230,214,0.5)'
      c.lineWidth = 1
      c.beginPath()
      c.arc(x, y, rad * 0.5, 0, TWO_PI)
      c.stroke()
      continue
    }

    const col = woodRGB(d.hardness)
    const glow = c.createRadialGradient(x, y, 0, x, y, rad * 2.8)
    glow.addColorStop(0, rgba(col, dim ? 0.05 : 0.24))
    glow.addColorStop(1, rgba(col, 0))
    c.fillStyle = glow
    c.beginPath()
    c.arc(x, y, rad * 2.8, 0, TWO_PI)
    c.fill()

    c.save()
    c.globalAlpha = dim ? 0.35 : 1
    c.shadowColor = 'rgba(60,36,16,0.35)'
    c.shadowBlur = 6
    c.shadowOffsetY = 2
    c.fillStyle = rgba(col, 1)
    c.beginPath()
    c.arc(x, y, rad, 0, TWO_PI)
    c.fill()
    c.restore()

    if (d.protected && !dim) {
      c.lineWidth = 2
      c.strokeStyle = '#efe6d6'
      c.beginPath()
      c.arc(x, y, rad + 2.6, 0, TWO_PI)
      c.stroke()
      c.lineWidth = 1.3
      c.strokeStyle = 'rgba(192,123,44,0.95)'
      c.beginPath()
      c.arc(x, y, rad + 2.6, 0, TWO_PI)
      c.stroke()
    }
    if (d.id === focus?.id) {
      c.lineWidth = 2.2
      c.strokeStyle = '#2a2018'
      c.beginPath()
      c.arc(x, y, rad + 5, 0, TWO_PI)
      c.stroke()
    }
  }

  // labels with paper halo
  c.textAlign = 'left'
  c.textBaseline = 'middle'
  for (const d of placed) {
    if (d.core) continue
    const show = d.depth <= 1 || d.id === focus?.id || (hi !== null && hi.has(d.id))
    if (!show) continue
    const tx = d.x + d.radius + 7
    c.font = `${d.depth <= 1 ? 13 : 11}px 'JetBrains Mono', monospace`
    c.lineWidth = 3.5
    c.lineJoin = 'round'
    c.strokeStyle = 'rgba(239,230,214,0.92)'
    c.strokeText(d.label, tx, d.y + 0.5)
    c.fillStyle = d.id === focus?.id ? '#9a5418' : '#2a2018'
    c.fillText(d.label, tx, d.y + 0.5)
    if (d.id === focus?.id) {
      c.font = "10px 'JetBrains Mono', monospace"
      c.lineWidth = 3.5
      c.strokeStyle = 'rgba(239,230,214,0.92)'
      c.strokeText('hardness ' + d.hardness, tx, d.y + 16)
      c.fillStyle = '#7a6346'
      c.fillText('hardness ' + d.hardness, tx, d.y + 16)
    }
  }
  c.restore()
}

const onMove = (e: MouseEvent): void => {
  if (dragging) {
    view.tx += e.offsetX - last[0]
    view.ty += e.offsetY - last[1]
    last = [e.offsetX, e.offsetY]
    return
  }
  hover = pick(e.offsetX, e.offsetY)
  if (canvas.value) canvas.value.style.cursor = hover ? 'pointer' : 'grab'
}
const onDown = (e: MouseEvent): void => {
  dragging = true
  last = [e.offsetX, e.offsetY]
}
const onUp = (): void => {
  dragging = false
}
const onClick = (e: MouseEvent): void => {
  const hit = pick(e.offsetX, e.offsetY)
  if (hit && !hit.core) emit('select', nodeById.get(hit.id) ?? null)
  else emit('select', null)
}
const onWheel = (e: WheelEvent): void => {
  e.preventDefault()
  const [wx, wy] = toWorld(e.offsetX, e.offsetY)
  const f = Math.exp(-e.deltaY * 0.0015)
  view.k = Math.max(0.4, Math.min(4, view.k * f))
  view.tx = e.offsetX - wx * view.k
  view.ty = e.offsetY - wy * view.k
}

const loop = (ts: number): void => {
  if (!start) start = ts
  const t = (ts - start) / 1000
  const p = 1 - Math.pow(1 - Math.min(t / 1.1, 1), 3)
  draw(t, p)
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  const el = canvas.value
  if (!el) return
  ctx = el.getContext('2d')
  resize()
  ro = new ResizeObserver(() => resize())
  ro.observe(el)
  el.addEventListener('mousemove', onMove)
  el.addEventListener('mousedown', onDown)
  window.addEventListener('mouseup', onUp)
  el.addEventListener('click', onClick)
  el.addEventListener('wheel', onWheel, { passive: false })
  raf = requestAnimationFrame(loop)
})

watch(
  () => props.forest,
  () => {
    start = 0
    resize()
  },
)

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  const el = canvas.value
  if (el) {
    el.removeEventListener('mousemove', onMove)
    el.removeEventListener('mousedown', onDown)
    el.removeEventListener('click', onClick)
    el.removeEventListener('wheel', onWheel)
  }
  window.removeEventListener('mouseup', onUp)
})
</script>

<template>
  <canvas ref="canvas" class="h-full w-full touch-none select-none" />
</template>
