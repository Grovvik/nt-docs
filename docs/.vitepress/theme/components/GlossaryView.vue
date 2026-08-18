<script setup lang="ts">
import { ref, computed } from 'vue'
import { GLOSSARY_DATA, type GlossaryEntry } from '../data/glossary'

const searchQuery = ref('')
const selectedCategory = ref<string>('ALL')
const selectedLayer = ref<string>('ALL')

const categories = [
  'ALL',
  'CPU & Architecture',
  'Memory Management',
  'Executive & Objects',
  'Security & Protection',
  'I/O & Synchronization',
  'User Subsystem'
]

const layers = [
  'ALL',
  'Ring -1 (Hypervisor)',
  'Ring 0 (Kernel/HAL)',
  'Ring 3 (User-mode)',
  'Hardware / Firmware'
]

const allItems = computed(() => Object.values(GLOSSARY_DATA))

const filteredItems = computed(() => {
  return allItems.value.filter(item => {
    const matchesSearch = 
      item.term.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.fullName.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.details.toLowerCase().includes(searchQuery.value.toLowerCase())

    const matchesCategory = selectedCategory.value === 'ALL' || item.category === selectedCategory.value
    const matchesLayer = selectedLayer.value === 'ALL' || item.layer === selectedLayer.value

    return matchesSearch && matchesCategory && matchesLayer
  })
})

const getLayerBadgeColor = (layer: string) => {
  if (layer.includes('Hypervisor')) return 'badge-hypervisor'
  if (layer.includes('Ring 0')) return 'badge-kernel'
  if (layer.includes('Ring 3')) return 'badge-usermode'
  return 'badge-hardware'
}
</script>

<template>
  <div class="glossary-page-wrapper">
    <!-- Filter bar -->
    <div class="filter-card">
      <div class="search-input-wrapper">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Поиск по термину, структуре (SSDT, KPCR, IRP, VAD)..." 
          class="search-input"
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="clear-btn" aria-label="Clear">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="filter-selectors">
        <!-- Category tags -->
        <div class="filter-group">
          <span class="filter-label">Категория:</span>
          <div class="filter-pills">
            <button 
              v-for="cat in categories" 
              :key="cat"
              class="pill-btn"
              :class="{ active: selectedCategory === cat }"
              @click="selectedCategory = cat"
            >
              {{ cat }}
            </button>
          </div>
        </div>

        <!-- Layer tags -->
        <div class="filter-group">
          <span class="filter-label">Слой ОС:</span>
          <div class="filter-pills">
            <button 
              v-for="layer in layers" 
              :key="layer"
              class="pill-btn"
              :class="{ active: selectedLayer === layer }"
              @click="selectedLayer = layer"
            >
              {{ layer }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="results-stats">
      Найдено терминов: <strong>{{ filteredItems.length }}</strong> из {{ allItems.length }}
    </div>

    <!-- Term cards list -->
    <div class="terms-grid">
      <div 
        v-for="item in filteredItems" 
        :key="item.term" 
        :id="item.term.toLowerCase()"
        class="term-card"
      >
        <div class="term-card-header">
          <div class="term-title-row">
            <span class="term-name">{{ item.shortName }}</span>
            <span class="term-layer-badge" :class="getLayerBadgeColor(item.layer)">
              {{ item.layer }}
            </span>
          </div>
          <div class="term-fullname">{{ item.fullName }}</div>
        </div>

        <div class="term-card-body">
          <p class="term-summary">{{ item.summary }}</p>

          <div v-if="item.structureOrRegister" class="term-structure-box">
            <span class="meta-label">Структура / Регистр:</span>
            <code class="meta-code">{{ item.structureOrRegister }}</code>
          </div>

          <div v-if="item.physicalLocation" class="term-structure-box location-box">
            <span class="meta-label">Где находится:</span>
            <span class="meta-location-text">{{ item.physicalLocation }}</span>
          </div>

          <p class="term-details">{{ item.details }}</p>

          <div v-if="item.relatedTerms && item.relatedTerms.length" class="term-related-row">
            <span class="meta-label">Связанные термины:</span>
            <span class="related-chips">
              <span v-for="rel in item.relatedTerms" :key="rel" class="related-chip">{{ rel }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glossary-page-wrapper {
  margin: 20px 0;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.filter-card {
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  border-radius: 14px;
  padding: 18px 20px;
  margin-bottom: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  width: 100%;
  box-sizing: border-box;
}

.search-icon {
  position: absolute;
  left: 14px;
}

.search-input {
  width: 100%;
  padding: 12px 38px 12px 42px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  color: var(--vp-c-text-1);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  min-width: 0;
  transition: all 0.2s ease;
}

.search-input:focus {
  border-color: var(--vp-c-brand-1);
}

.clear-btn {
  position: absolute;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--vp-c-text-3);
  cursor: pointer;
  font-size: 14px;
}

.filter-selectors {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.filter-group {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  min-width: 75px;
  padding-top: 4px;
}

.filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.pill-btn {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  color: var(--vp-c-text-2);
  font-size: 11.5px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.pill-btn:hover {
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-brand-1);
}

.pill-btn.active {
  background: var(--vp-c-brand-1);
  color: #ffffff;
  font-weight: 500;
  border-color: var(--vp-c-brand-1);
}

.results-stats {
  font-size: 13px;
  color: var(--vp-c-text-2);
  margin-bottom: 16px;
}

.results-stats strong {
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.terms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}

.term-card {
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.term-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}

.term-card-header {
  border-bottom: 1px solid var(--vp-c-divider);
  padding-bottom: 10px;
  margin-bottom: 12px;
  min-width: 0;
}

.term-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.term-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  word-break: break-word;
  min-width: 0;
}

.term-fullname {
  font-size: 12.5px;
  color: var(--vp-c-text-2);
  font-weight: 400;
  word-break: break-word;
}

.term-layer-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 500;
  text-transform: uppercase;
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

.term-card-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  min-width: 0;
}

.term-summary {
  margin: 0;
  color: var(--vp-c-text-1);
  font-weight: 400;
  line-height: 1.5;
  word-break: break-word;
  overflow-wrap: break-word;
}

.term-structure-box {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  background: var(--vp-c-bg);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-border);
  font-size: 12px;
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
}

.term-structure-box.location-box {
  background: rgba(2, 132, 199, 0.06);
  border-color: rgba(2, 132, 199, 0.2);
}

.dark .term-structure-box.location-box {
  background: rgba(56, 189, 248, 0.06);
  border-color: rgba(56, 189, 248, 0.2);
}

.meta-location-text {
  color: var(--vp-c-text-1);
  font-weight: 500;
  font-size: 12px;
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
  background: transparent;
  padding: 0;
  word-break: break-all;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  min-width: 0;
  max-width: 100%;
}

.term-details {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 12.5px;
  line-height: 1.55;
  word-break: break-word;
  overflow-wrap: break-word;
}

.term-related-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin-top: 4px;
  flex-wrap: wrap;
  min-width: 0;
}

.related-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}

.related-chip {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-border);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 400;
  word-break: break-word;
}

@media (max-width: 640px) {
  .filter-card {
    padding: 14px;
  }

  .filter-group {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .filter-label {
    min-width: unset;
    padding-top: 0;
  }

  .term-card {
    padding: 14px;
  }

  .search-input {
    font-size: 13px;
    padding-left: 36px;
  }

  .search-icon {
    left: 10px;
  }
}
</style>
