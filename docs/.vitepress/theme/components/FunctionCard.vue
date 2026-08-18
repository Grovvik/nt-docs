<script setup lang="ts">
defineProps<{
  name: string
  module: string
  exported?: boolean
  prototype?: string
  irql?: string
  caller?: string
  phase?: string
}>()
</script>

<template>
  <div class="function-card">
    <div class="card-top">
      <div class="card-name-group">
        <span class="card-name">{{ name }}</span>
        <span class="card-module-tag">{{ module }}</span>
      </div>
      <div class="card-badges">
        <span v-if="irql" class="badge-irql">IRQL: {{ irql }}</span>
        <span v-if="phase" class="badge-phase">{{ phase }}</span>
        <span :class="exported ? 'badge-exp' : 'badge-priv'">
          {{ exported ? 'Exported' : 'Internal' }}
        </span>
      </div>
    </div>

    <div v-if="prototype" class="prototype-box">
      <code>{{ prototype }}</code>
    </div>

    <div v-if="caller" class="card-meta-grid">
      <div class="meta-item">
        <span class="meta-title">Кем вызывается:</span>
        <span class="meta-val font-mono">{{ caller }}</span>
      </div>
    </div>

    <div v-if="$slots.default" class="card-body">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.function-card {
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  padding: 16px;
  margin: 16px 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.card-name-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}

.card-module-tag {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  padding: 2px 6px;
  border-radius: 4px;
}

.card-badges {
  display: flex;
  gap: 6px;
}

.badge-irql {
  font-size: 11px;
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
  border: 1px solid rgba(234, 179, 8, 0.3);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 400;
}

.badge-phase {
  font-size: 11px;
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
  border: 1px solid rgba(168, 85, 247, 0.3);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 400;
}

.badge-exp {
  font-size: 11px;
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 400;
}

.badge-priv {
  font-size: 11px;
  background: rgba(244, 63, 94, 0.15);
  color: #f43f5e;
  border: 1px solid rgba(244, 63, 94, 0.3);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 400;
}

.prototype-box {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-left: 3px solid var(--vp-c-brand-1);
  padding: 8px 12px;
  border-radius: 0 6px 6px 0;
  margin-bottom: 12px;
  overflow-x: auto;
}

.prototype-box code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--vp-c-text-1);
  background: transparent !important;
  padding: 0 !important;
}

.card-meta-grid {
  display: flex;
  gap: 16px;
  font-size: 12px;
  margin-bottom: 8px;
  color: var(--vp-c-text-2);
}

.meta-title {
  margin-right: 4px;
  color: var(--vp-c-text-3);
}

.meta-val {
  color: var(--vp-c-text-1);
}

.card-body {
  margin-top: 10px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
</style>
