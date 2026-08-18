<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  module?: string
  callingConvention?: string
  isExported?: boolean
  defaultOpen?: boolean
  summary?: string
}>(), {
  module: 'ntoskrnl.exe',
  callingConvention: '__fastcall',
  isExported: false,
  defaultOpen: false,
  summary: ''
})

const isOpen = ref(props.defaultOpen)
</script>

<template>
  <div class="decompiled-box" :class="{ 'is-collapsed': !isOpen }">
    <!-- Header -->
    <div class="box-header" @click="isOpen = !isOpen">
      <div class="header-left">
        <span class="toggle-arrow" :class="{ 'open': isOpen }">▶</span>
        <span class="func-name">{{ name }}</span>
        <span class="badge badge-module">{{ module }}</span>
        <span v-if="callingConvention" class="badge badge-conv">{{ callingConvention }}</span>
        <span class="badge" :class="isExported ? 'badge-exported' : 'badge-internal'">
          {{ isExported ? 'EXPORTED' : 'INTERNAL' }}
        </span>
      </div>

      <div class="header-right">
        <span class="header-action-hint">{{ isOpen ? 'Свернуть' : 'Развернуть псевдокод' }}</span>
      </div>
    </div>

    <!-- Summary strip if provided -->
    <div v-if="summary" class="box-summary">
      <span class="summary-text">{{ summary }}</span>
    </div>

    <!-- Code Block Slot (VitePress native syntax highlighter) -->
    <div v-show="isOpen" class="code-slot-container">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.decompiled-box {
  margin: 20px 0;
  border-radius: 10px;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: all 0.2s ease;
}

.decompiled-box:hover {
  border-color: var(--vp-c-brand-1);
}

.box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--vp-c-bg-elv);
  border-bottom: 1px solid var(--vp-c-divider);
  cursor: pointer;
  user-select: none;
}

.header-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.toggle-arrow {
  display: inline-block;
  font-size: 10px;
  color: var(--vp-c-text-3);
  transition: transform 0.2s ease;
}

.toggle-arrow.open {
  transform: rotate(90deg);
}

.func-name {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}

.badge {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 400;
}

.badge-module {
  background: rgba(86, 156, 214, 0.15);
  color: #0284c7;
  border: 1px solid rgba(86, 156, 214, 0.3);
}

.badge-address {
  background: rgba(206, 145, 120, 0.15);
  color: #ea580c;
  border: 1px solid rgba(206, 145, 120, 0.3);
}

.badge-conv {
  background: rgba(197, 134, 192, 0.15);
  color: #a855f7;
  border: 1px solid rgba(197, 134, 192, 0.3);
}

.badge-internal {
  background: rgba(244, 63, 94, 0.15);
  color: #f43f5e;
  border: 1px solid rgba(244, 63, 94, 0.3);
}

.badge-exported {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.header-action-hint {
  font-size: 11px;
  color: var(--vp-c-text-3);
}

.box-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.code-slot-container :deep(div[class*='language-']) {
  margin: 0 !important;
  border-radius: 0 !important;
  border: none !important;
}

.code-slot-container :deep(pre) {
  margin: 0 !important;
  border: none !important;
  border-radius: 0 !important;
}
</style>
