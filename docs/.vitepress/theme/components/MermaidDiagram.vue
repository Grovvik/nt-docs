<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useData } from 'vitepress'
import mermaid from 'mermaid'

const props = defineProps<{
  code?: string
}>()

const { isDark } = useData()
const viewportRef = ref<HTMLElement | null>(null)
const svgContainerRef = ref<HTMLElement | null>(null)
const svgContent = ref<string>('')
const error = ref<string | null>(null)
const isLoading = ref<boolean>(true)

const scale = ref<number>(1)
const panX = ref<number>(0)
const panY = ref<number>(0)
const isDragging = ref<boolean>(false)
const startDragX = ref<number>(0)
const startDragY = ref<number>(0)

let idCounter = 0

const getCleanCode = (): string => {
  if (props.code) {
    return decodeURIComponent(props.code).trim()
  }
  return ''
}

const updateSvgTransform = () => {
  if (!svgContainerRef.value) return
  const svg = svgContainerRef.value.querySelector('svg')
  if (!svg) return

  // Remove viewBox so internal coordinates are 1:1 with screen CSS pixels
  if (svg.hasAttribute('viewBox')) {
    svg.removeAttribute('viewBox')
  }
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.style.maxWidth = 'none'
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.overflow = 'visible'

  let rootG = svg.querySelector('g.mermaid-canvas-root') as SVGGElement | null
  if (!rootG) {
    rootG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    rootG.setAttribute('class', 'mermaid-canvas-root')
    while (svg.firstChild) {
      rootG.appendChild(svg.firstChild)
    }
    svg.appendChild(rootG)
  }

  rootG.setAttribute('transform', `matrix(${scale.value} 0 0 ${scale.value} ${panX.value} ${panY.value})`)
}

const centerDiagram = () => {
  if (!viewportRef.value || !svgContainerRef.value) return
  const viewport = viewportRef.value.getBoundingClientRect()
  const svg = svgContainerRef.value.querySelector('svg')
  if (!svg) return

  updateSvgTransform()

  const rootG = svg.querySelector('g.mermaid-canvas-root') || svg.querySelector('g')
  if (!rootG) return

  try {
    const bbox = (rootG as SVGGraphicsElement).getBBox()
    if (!bbox || bbox.width === 0) return

    const padding = 60
    const availableWidth = Math.max(100, viewport.width - padding)
    const availableHeight = Math.max(100, viewport.height - padding)

    const initialScale = Math.min(
      1.05,
      Math.max(0.2, Math.min(availableWidth / bbox.width, availableHeight / bbox.height))
    )

    scale.value = initialScale
    panX.value = (viewport.width - bbox.width * initialScale) / 2 - bbox.x * initialScale
    panY.value = (viewport.height - bbox.height * initialScale) / 2 - bbox.y * initialScale

    updateSvgTransform()
  } catch (e) {
    panX.value = 40
    panY.value = 30
    scale.value = 0.85
    updateSvgTransform()
  }
}

const renderDiagram = async () => {
  if (typeof window === 'undefined') return
  const rawCode = getCleanCode()
  if (!rawCode) return

  error.value = null
  isLoading.value = true

  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark.value ? 'dark' : 'default',
      themeVariables: isDark.value ? {
        darkMode: true,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '13px',
        background: 'transparent',
        mainBkg: '#18181b',
        nodeBorder: 'rgba(56, 189, 248, 0.5)',
        primaryColor: '#18181b',
        primaryTextColor: '#f4f4f5',
        primaryBorderColor: 'rgba(56, 189, 248, 0.5)',
        lineColor: '#38bdf8',
        secondaryColor: '#202023',
        tertiaryColor: '#27272a',
        clusterBkg: 'rgba(24, 24, 27, 0.6)',
        clusterBorder: 'rgba(255, 255, 255, 0.15)',
        titleColor: '#38bdf8',
        edgeLabelBackground: '#18181b'
      } : {
        darkMode: false,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '13px',
        background: 'transparent',
        mainBkg: '#f8fafc',
        nodeBorder: 'rgba(2, 132, 199, 0.4)',
        primaryColor: '#f8fafc',
        primaryTextColor: '#0f172a',
        primaryBorderColor: 'rgba(2, 132, 199, 0.4)',
        lineColor: '#0284c7',
        secondaryColor: '#f1f5f9',
        tertiaryColor: '#ffffff',
        clusterBkg: 'rgba(248, 250, 252, 0.7)',
        clusterBorder: 'rgba(0, 0, 0, 0.12)',
        titleColor: '#0284c7',
        edgeLabelBackground: '#ffffff'
      },
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        curve: 'basis',
        nodeSpacing: 35,
        rankSpacing: 45,
        padding: 16
      }
    })

    const uniqueId = `mermaid-svg-${Date.now()}-${++idCounter}`
    const { svg } = await mermaid.render(uniqueId, rawCode)
    svgContent.value = svg
    isLoading.value = false

    nextTick(() => {
      centerDiagram()
    })
  } catch (err: any) {
    console.error('Mermaid render error:', err)
    error.value = err.message || 'Ошибка рендеринга Mermaid диаграммы'
    isLoading.value = false
  }
}

// Vector-sharp wheel zoom directly into cursor position
const onWheel = (e: WheelEvent) => {
  e.preventDefault()
  if (!viewportRef.value) return

  const rect = viewportRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  const zoomFactor = e.deltaY < 0 ? 1.14 : 0.88
  const newScale = Math.min(4.0, Math.max(0.15, scale.value * zoomFactor))

  panX.value = mouseX - (mouseX - panX.value) * (newScale / scale.value)
  panY.value = mouseY - (mouseY - panY.value) * (newScale / scale.value)
  scale.value = newScale

  updateSvgTransform()
}

// Direct 1:1 Pixel Pointer Dragging with PointerCapture
const onPointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('.canvas-hud') || target.closest('button')) return

  isDragging.value = true
  startDragX.value = e.clientX - panX.value
  startDragY.value = e.clientY - panY.value
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {}
}

const onPointerMove = (e: PointerEvent) => {
  if (!isDragging.value) return
  panX.value = e.clientX - startDragX.value
  panY.value = e.clientY - startDragY.value
  updateSvgTransform()
}

const onPointerUp = (e: PointerEvent) => {
  if (isDragging.value) {
    isDragging.value = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
  }
}

// Touch controls for pinch-to-zoom
let touchStartDist = 0
let touchStartScale = 1

const onTouchStart = (e: TouchEvent) => {
  if (e.touches.length === 2) {
    isDragging.value = false
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    touchStartDist = Math.hypot(dx, dy)
    touchStartScale = scale.value
  }
}

const onTouchMove = (e: TouchEvent) => {
  if (e.touches.length === 2 && touchStartDist > 0) {
    e.preventDefault()
    if (!viewportRef.value) return
    const rect = viewportRef.value.getBoundingClientRect()
    const touchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
    const touchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const dist = Math.hypot(dx, dy)
    const newScale = Math.min(4.0, Math.max(0.15, touchStartScale * (dist / touchStartDist)))
    panX.value = touchMidX - (touchMidX - panX.value) * (newScale / scale.value)
    panY.value = touchMidY - (touchMidY - panY.value) * (newScale / scale.value)
    scale.value = newScale
    updateSvgTransform()
  }
}

const onTouchEnd = () => {
  touchStartDist = 0
}

const zoomIn = () => {
  const newScale = Math.min(4.0, scale.value * 1.25)
  if (viewportRef.value) {
    const rect = viewportRef.value.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    panX.value = cx - (cx - panX.value) * (newScale / scale.value)
    panY.value = cy - (cy - panY.value) * (newScale / scale.value)
  }
  scale.value = newScale
  updateSvgTransform()
}

const zoomOut = () => {
  const newScale = Math.max(0.15, scale.value * 0.8)
  if (viewportRef.value) {
    const rect = viewportRef.value.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    panX.value = cx - (cx - panX.value) * (newScale / scale.value)
    panY.value = cy - (cy - panY.value) * (newScale / scale.value)
  }
  scale.value = newScale
  updateSvgTransform()
}

const resetView = () => {
  centerDiagram()
}

watch(isDark, () => {
  nextTick(() => renderDiagram())
})

watch(() => props.code, () => {
  nextTick(() => renderDiagram())
})

onMounted(() => {
  nextTick(() => renderDiagram())
  window.addEventListener('resize', centerDiagram)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', centerDiagram)
  }
})
</script>

<template>
  <div class="canvas-wrapper">
    <div
      ref="viewportRef"
      class="canvas-viewport"
      :class="{ 'is-dragging': isDragging }"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @dblclick="resetView"
    >
      <!-- Background subtle dot matrix -->
      <div class="canvas-grid-bg"></div>

      <!-- Error State -->
      <div v-if="error" class="canvas-error">
        <span>{{ error }}</span>
      </div>

      <!-- Native Vector SVG Container -->
      <div
        v-else
        ref="svgContainerRef"
        class="svg-vector-host"
        v-html="svgContent"
      ></div>

      <!-- Floating Canvas HUD Controls -->
      <div class="canvas-hud">
        <div class="hud-hint">
          <span class="hud-dot"></span>
          <span>Колёсико: зум • Зажатие ЛКМ: перемещение • Двойной клик: центрировать</span>
        </div>
        <div class="hud-buttons">
          <button class="hud-btn" @click.stop="zoomOut" title="Уменьшить">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <span class="hud-scale">{{ Math.round(scale * 100) }}%</span>
          <button class="hud-btn" @click.stop="zoomIn" title="Увеличить">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button class="hud-btn hud-btn-fit" @click.stop="resetView" title="Сбросить и отцентрировать">
            Центр
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-wrapper {
  margin: 24px 0;
  width: 100%;
  box-sizing: border-box;
}

.canvas-viewport {
  position: relative;
  width: 100%;
  height: 650px;
  max-height: 80vh;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  border-radius: 14px;
  overflow: hidden;
  cursor: grab;
  user-select: none;
  touch-action: none;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
}

.canvas-viewport.is-dragging {
  cursor: grabbing;
}

/* Figma/Miro-style dot grid background */
.canvas-grid-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(var(--vp-c-border) 1px, transparent 1px);
  background-size: 20px 20px;
  opacity: 0.7;
}

.svg-vector-host {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.svg-vector-host :deep(svg) {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  overflow: visible !important;
  display: block;
  shape-rendering: geometricPrecision;
  text-rendering: geometricPrecision;
  image-rendering: -webkit-optimize-contrast;
}

/* Fix text wrapping and prevent line overflows */
.svg-vector-host :deep(.node foreignObject) {
  overflow: visible !important;
}

.svg-vector-host :deep(.node foreignObject div),
.svg-vector-host :deep(.node .label),
.svg-vector-host :deep(.node .label div),
.svg-vector-host :deep(.node .label span),
.svg-vector-host :deep(.node .label p),
.svg-vector-host :deep(.node text),
.svg-vector-host :deep(.node tspan) {
  line-height: 1.25 !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  word-break: normal !important;
  white-space: normal !important;
}

.svg-vector-host :deep(.node foreignObject div) {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  height: 100% !important;
}

.svg-vector-host :deep(.node rect),
.svg-vector-host :deep(.node circle),
.svg-vector-host :deep(.node polygon) {
  rx: 8px !important;
  ry: 8px !important;
}

/* Floating HUD Controls */
.canvas-hud {
  position: absolute;
  bottom: 14px;
  left: 14px;
  right: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
  gap: 12px;
}

.hud-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-elv);
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--vp-c-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(8px);
}

.hud-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
}

.hud-buttons {
  display: flex;
  align-items: center;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  padding: 4px;
  gap: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.hud-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: all 0.15s ease;
}

.hud-btn:hover {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-brand-1);
}

.hud-btn-fit {
  width: auto;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 500;
}

.hud-scale {
  font-size: 12px;
  font-weight: 600;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  min-width: 44px;
  text-align: center;
  user-select: none;
}

.canvas-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: #ef4444;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  background: rgba(239, 68, 68, 0.05);
}
</style>
