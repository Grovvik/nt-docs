<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { GLOSSARY_DATA, type GlossaryEntry } from '../data/glossary'

const props = defineProps<{
  term: string
  label?: string
}>()

const isHovered = ref(false)
const showDetails = ref(false)
const isPlacedBelow = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const popoverStyle = ref<Record<string, string>>({})

const item = computed<GlossaryEntry | null>(() => {
  const key = props.term.toUpperCase().trim()
  return GLOSSARY_DATA[key] || null
})

const getLeftBoundary = (): number => {
  const padding = 12
  const sidebar = document.querySelector('.VPSidebar')
  if (sidebar) {
    const rect = sidebar.getBoundingClientRect()
    // If sidebar is visible on the left side of the screen
    if (rect.width > 0 && rect.right > 0 && rect.left >= -10 && rect.right < window.innerWidth / 2) {
      return rect.right + padding
    }
  }
  return padding
}

const getRightBoundary = (viewportWidth: number): number => {
  const padding = 12
  const aside = document.querySelector('.VPDocAside') || document.querySelector('.aside')
  if (aside) {
    const rect = aside.getBoundingClientRect()
    if (rect.width > 0 && rect.left > 0 && rect.left < viewportWidth && rect.left > viewportWidth / 2) {
      return rect.left - padding
    }
  }
  return viewportWidth - padding
}

const getHeaderBottom = (): number => {
  const nav = document.querySelector('.VPNav') || document.querySelector('.VPNavBar') || document.querySelector('header')
  if (nav) {
    const rect = nav.getBoundingClientRect()
    if (rect.bottom > 0) return rect.bottom
  }
  const rootHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--vp-nav-height')) || 64
  return rootHeight
}

const updatePopoverPosition = () => {
  if (typeof window === 'undefined' || !wrapperRef.value) return
  const rect = wrapperRef.value.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const viewportHeight = window.innerHeight

  const padding = 12
  const safeLeft = getLeftBoundary()
  const safeRight = getRightBoundary(viewportWidth)
  const availableWidth = Math.max(260, safeRight - safeLeft)
  const popoverWidth = Math.min(340, availableWidth)

  // Horizontal position calculation: clamp strictly between safeLeft and safeRight
  let targetScreenLeft = rect.left + rect.width / 2 - popoverWidth / 2
  targetScreenLeft = Math.max(safeLeft, Math.min(targetScreenLeft, safeRight - popoverWidth))
  const relativeLeft = targetScreenLeft - rect.left

  // Arrow position pointing to trigger center
  const triggerCenterScreen = rect.left + rect.width / 2
  const arrowOffset = Math.max(16, Math.min(triggerCenterScreen - targetScreenLeft, popoverWidth - 16))

  // Exact header bottom boundary calculation
  const headerBottom = getHeaderBottom()
  const safeHeaderGap = 12
  const safeTopLimit = headerBottom + safeHeaderGap // Top screen boundary cannot go above this

  const spaceAbove = rect.top - safeTopLimit
  const spaceBelow = viewportHeight - rect.bottom - padding

  const popoverHeight = popoverRef.value?.scrollHeight || popoverRef.value?.offsetHeight || 280

  // Decision: flip below if space above is insufficient to clear the Header
  let placeBelow = false
  if (spaceAbove < popoverHeight) {
    placeBelow = true
  }
  // If space below is even more cramped, fall back to whichever side has more room
  if (placeBelow && spaceBelow < 160 && spaceAbove > spaceBelow) {
    placeBelow = false
  }

  isPlacedBelow.value = placeBelow

  // Strictly clamp max-height so popover NEVER reaches Header or Screen Bottom
  const maxAvailableHeight = placeBelow
    ? Math.max(120, Math.floor(viewportHeight - rect.bottom - padding - 8))
    : Math.max(120, Math.floor(rect.top - safeTopLimit - 8))

  popoverStyle.value = {
    left: `${relativeLeft}px`,
    width: `${popoverWidth}px`,
    maxHeight: `${maxAvailableHeight}px`,
    overflowY: 'auto',
    '--arrow-left': `${arrowOffset}px`,
    ...(placeBelow
      ? { top: 'calc(100% + 8px)', bottom: 'auto' }
      : { bottom: 'calc(100% + 8px)', top: 'auto' })
  }
}

const handleMouseEnter = () => {
  isHovered.value = true
  nextTick(() => {
    updatePopoverPosition()
    requestAnimationFrame(() => updatePopoverPosition())
  })
}

const handleMouseLeave = () => {
  isHovered.value = false
}

const handleClick = () => {
  showDetails.value = !showDetails.value
  if (showDetails.value) {
    nextTick(() => {
      updatePopoverPosition()
      requestAnimationFrame(() => updatePopoverPosition())
    })
  }
}

const handleClickOutside = (e: MouseEvent) => {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    showDetails.value = false
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    document.addEventListener('click', handleClickOutside)
    window.addEventListener('scroll', updatePopoverPosition, { passive: true })
    window.addEventListener('resize', updatePopoverPosition, { passive: true })
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    document.removeEventListener('click', handleClickOutside)
    window.removeEventListener('scroll', updatePopoverPosition)
    window.removeEventListener('resize', updatePopoverPosition)
  }
})

const getLayerBadgeColor = (layer: string) => {
  if (layer.includes('Hypervisor')) return 'badge-hypervisor'
  if (layer.includes('Ring 0')) return 'badge-kernel'
  if (layer.includes('Ring 3')) return 'badge-usermode'
  return 'badge-hardware'
}
</script>

<template>
  <span 
    ref="wrapperRef"
    class="glossary-term-wrapper"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <span 
      class="glossary-term-trigger"
      :class="{ 'has-data': !!item }"
      @click="handleClick"
    >
      <slot>{{ label || term }}</slot>
    </span>

    <!-- Popover Card on Hover/Click -->
    <transition name="popover-fade">
      <div 
        v-if="(isHovered || showDetails) && item" 
        ref="popoverRef"
        class="glossary-popover"
        :class="isPlacedBelow ? 'place-below' : 'place-above'"
        :style="popoverStyle"
        @mouseenter="isHovered = true"
        @mouseleave="handleMouseLeave"
      >
        <div class="popover-header">
          <div class="popover-title-row">
            <span class="popover-term">{{ item.shortName }}</span>
            <span class="popover-layer-badge" :class="getLayerBadgeColor(item.layer)">
              {{ item.layer }}
            </span>
          </div>
          <div class="popover-fullname">{{ item.fullName }}</div>
        </div>

        <div class="popover-body">
          <p class="popover-summary">{{ item.summary }}</p>
          
          <div v-if="item.structureOrRegister" class="popover-meta-row">
            <span class="meta-label">Структура/Регистр:</span>
            <code class="meta-code">{{ item.structureOrRegister }}</code>
          </div>

          <div v-if="item.physicalLocation" class="popover-meta-row location-row">
            <span class="meta-label">Физическое размещение:</span>
            <span class="meta-location-text">{{ item.physicalLocation }}</span>
          </div>

          <p class="popover-details">{{ item.details }}</p>

          <div v-if="item.relatedTerms && item.relatedTerms.length" class="popover-related">
            <span class="meta-label">Связанные:</span>
            <span class="related-tags">
              <span v-for="rel in item.relatedTerms" :key="rel" class="related-tag">{{ rel }}</span>
            </span>
          </div>
        </div>

        <div class="popover-footer">
          <span class="footer-hint">Архитектура Windows NT Internals</span>
          <a href="/glossary/" class="footer-link">Все термины →</a>
        </div>
      </div>
    </transition>
  </span>
</template>

<style scoped>
.glossary-term-wrapper {
  position: relative;
  display: inline-block;
  vertical-align: baseline;
}

.glossary-term-trigger {
  position: relative;
  cursor: help;
  color: inherit;
  font-weight: inherit;
  padding: 0;
  background: transparent;
  text-decoration: underline dotted var(--vp-c-text-3);
  text-underline-offset: 3px;
  text-decoration-thickness: 1.2px;
  transition: text-decoration-color 0.15s ease;
}

.glossary-term-trigger:hover {
  background: transparent;
  color: inherit;
  text-decoration-color: var(--vp-c-text-1);
}

.glossary-popover {
  position: absolute;
  width: 340px;
  max-width: calc(100vw - 24px);
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  z-index: 50;
  padding: 16px;
  color: var(--vp-c-text-1);
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  backdrop-filter: blur(12px);
  pointer-events: auto;
  box-sizing: border-box;
  word-break: break-word;
  overflow-wrap: break-word;
  scrollbar-width: thin;
  scrollbar-color: var(--vp-c-divider) transparent;
}

.glossary-popover::-webkit-scrollbar {
  width: 4px;
}

.glossary-popover::-webkit-scrollbar-thumb {
  background: var(--vp-c-divider);
  border-radius: 4px;
}

.glossary-popover.place-above::after {
  content: '';
  position: absolute;
  top: 100%;
  left: var(--arrow-left, 50%);
  transform: translateX(-50%);
  border-width: 6px;
  border-style: solid;
  border-color: var(--vp-c-bg-elv) transparent transparent transparent;
}

.glossary-popover.place-below::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: var(--arrow-left, 50%);
  transform: translateX(-50%);
  border-width: 6px;
  border-style: solid;
  border-color: transparent transparent var(--vp-c-bg-elv) transparent;
}

.popover-header {
  border-bottom: 1px solid var(--vp-c-divider);
  padding-bottom: 10px;
  margin-bottom: 10px;
}

.popover-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  flex-wrap: wrap;
  gap: 6px;
}

.popover-term {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  word-break: break-word;
}

.popover-fullname {
  font-size: 12px;
  color: var(--vp-c-text-2);
  font-weight: 400;
  word-break: break-word;
}

.popover-layer-badge {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 9999px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.badge-hypervisor {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.badge-kernel {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.badge-usermode {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.badge-hardware {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
  border: 1px solid rgba(234, 179, 8, 0.3);
}

.popover-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.popover-summary {
  margin: 0;
  color: var(--vp-c-text-1);
  font-weight: 400;
  word-break: break-word;
  overflow-wrap: break-word;
}

.popover-details {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 12px;
  word-break: break-word;
  overflow-wrap: break-word;
}

.popover-meta-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  background: var(--vp-c-bg-soft);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-border);
  box-sizing: border-box;
  max-width: 100%;
}

.popover-meta-row.location-row {
  background: rgba(2, 132, 199, 0.08);
  border-color: rgba(2, 132, 199, 0.2);
}

.dark .popover-meta-row.location-row {
  background: rgba(56, 189, 248, 0.08);
  border-color: rgba(56, 189, 248, 0.2);
}

.meta-location-text {
  color: var(--vp-c-text-1);
  font-weight: 500;
  font-size: 11px;
  word-break: break-word;
}

.meta-label {
  color: var(--vp-c-text-3);
  font-weight: 400;
  flex-shrink: 0;
}

.meta-code {
  color: var(--vp-c-text-1);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  background: transparent;
  padding: 0;
  word-break: break-all;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  min-width: 0;
}

.popover-related {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.related-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.related-tag {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-border);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 400;
  word-break: break-word;
}

.popover-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--vp-c-divider);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: var(--vp-c-text-3);
  flex-wrap: wrap;
  gap: 6px;
}

.footer-link {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 400;
}

.footer-link:hover {
  text-decoration: underline;
}

.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
