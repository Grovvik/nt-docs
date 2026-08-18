<script setup lang="ts">
import { ref } from 'vue'

interface BootNode {
  id: string
  title: string
  binary: string
  ring: string
  color: string
  link: string
  summary: string
}

const nodes: BootNode[] = [
  {
    id: 'uefi',
    title: 'UEFI / Firmware',
    binary: 'Firmware / MBR',
    ring: 'Ring -2 / SEC-PEI',
    color: '#eab308',
    link: '/stages/01-firmware-uefi-mbr',
    summary: 'Инициализация железа, TPM, Secure Boot, запуск bootmgfw.efi'
  },
  {
    id: 'bootmgr',
    title: 'Windows Boot Manager',
    binary: 'bootmgr.efi',
    ring: 'UEFI Application',
    color: '#a855f7',
    link: '/stages/02-bootmgr',
    summary: 'Парсинг BCD, разблокировка BitLocker, выбор ОС, запуск winload.efi'
  },
  {
    id: 'winload',
    title: 'Windows OS Loader',
    binary: 'winload.efi',
    ring: 'UEFI Application -> Ring 0',
    color: '#06b6d4',
    link: '/stages/03-winload',
    summary: 'Загрузка ntoskrnl, hal, SYSTEM hive, BOOT_START драйверов, ExitBootServices'
  },
  {
    id: 'phase0',
    title: 'Kernel Phase 0',
    binary: 'ntoskrnl.exe',
    ring: 'Ring 0 (Kernel Mode)',
    color: '#ef4444',
    link: '/stages/04-kernel-phase0',
    summary: 'Настройка KPCR, IDT, GDT, CR3, базовая инициализация Mm, Ob, Ps, Se'
  },
  {
    id: 'phase1',
    title: 'Kernel Phase 1',
    binary: 'ntoskrnl.exe',
    ring: 'Ring 0 (Multi-core)',
    color: '#f97316',
    link: '/stages/05-kernel-phase1',
    summary: 'PnP менеджер, запуск драйверов, логотип Inbv, запуск smss.exe'
  },
  {
    id: 'smss',
    title: 'Session Manager',
    binary: 'smss.exe',
    ring: 'Ring 3 (System Native)',
    color: '#3b82f6',
    link: '/stages/06-smss',
    summary: 'autochk, Paging Files, разделение на Session 0 и Session 1'
  },
  {
    id: 'session0',
    title: 'Session 0 Services',
    binary: 'wininit / services / lsass',
    ring: 'Ring 3 (Isolated S0)',
    color: '#10b981',
    link: '/stages/07-wininit-services',
    summary: 'WinSta0, диспетчер служб SCM (Auto-start), подсистема LSA'
  },
  {
    id: 'session1',
    title: 'Session 1 & Shell',
    binary: 'winlogon / userinit / explorer',
    ring: 'Ring 3 (Interactive User)',
    color: '#8b5cf6',
    link: '/stages/08-winlogon-explorer',
    summary: 'Вход LogonUI, загрузка NTUSER.DAT, запуск оболочки explorer.exe'
  }
]

const selectedNode = ref<BootNode>(nodes[3])
</script>

<template>
  <div class="flow-graph-container">
    <div class="flow-title-bar">
      <span class="flow-title">Интерактивная карта перехода компонентов</span>
      <span class="flow-hint">Нажмите на любой узел для перехода к разделу</span>
    </div>

    <!-- Node chain visualizer -->
    <div class="nodes-chain">
      <div 
        v-for="(node, idx) in nodes" 
        :key="node.id"
        class="node-card-wrapper"
      >
        <div 
          class="node-card"
          :class="{ 'is-selected': selectedNode.id === node.id }"
          :style="{ '--accent-color': node.color }"
          @click="selectedNode = node"
        >
          <div class="node-ring-pill">{{ node.ring }}</div>
          <div class="node-title">{{ node.title }}</div>
          <div class="node-binary">{{ node.binary }}</div>
        </div>

        <div v-if="idx < nodes.length - 1" class="node-connector">
          <div class="connector-line"></div>
          <div class="connector-arrow">▶</div>
        </div>
      </div>
    </div>

    <!-- Active node summary popup -->
    <div class="active-node-panel" :style="{ borderColor: selectedNode.color }">
      <div class="panel-header">
        <div>
          <span class="panel-binary">{{ selectedNode.binary }}</span>
          <h3 class="panel-title">{{ selectedNode.title }}</h3>
        </div>
        <a :href="selectedNode.link" class="panel-jump-btn">Перейти к документации →</a>
      </div>
      <p class="panel-summary">{{ selectedNode.summary }}</p>
    </div>
  </div>
</template>

<style scoped>
.flow-graph-container {
  margin: 30px 0;
  padding: 24px;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.flow-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.flow-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.flow-hint {
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.nodes-chain {
  display: flex;
  align-items: center;
  overflow-x: auto;
  padding: 10px 4px 20px 4px;
  gap: 8px;
}

.node-card-wrapper {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.node-card {
  width: 170px;
  padding: 12px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.node-card.is-selected {
  border-color: var(--accent-color);
  background: var(--vp-c-bg-elv);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.node-ring-pill {
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--accent-color);
}

.node-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.node-binary {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--vp-c-text-2);
}

.node-connector {
  display: flex;
  align-items: center;
  padding: 0 6px;
}

.connector-line {
  width: 14px;
  height: 2px;
  background: var(--vp-c-divider);
}

.connector-arrow {
  font-size: 10px;
  color: var(--vp-c-text-3);
  margin-left: -2px;
}

.active-node-panel {
  margin-top: 10px;
  padding: 16px 20px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  border-left: 4px solid;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}

.panel-binary {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--vp-c-brand-1);
}

.panel-title {
  margin: 2px 0 0 0 !important;
  font-size: 17px !important;
  font-weight: 500 !important;
  color: var(--vp-c-text-1);
}

.panel-jump-btn {
  background: var(--vp-c-brand-1);
  color: #ffffff !important;
  border: 1px solid var(--vp-c-brand-1);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  text-decoration: none !important;
  transition: all 0.2s ease;
}

.panel-jump-btn:hover {
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
}

.panel-summary {
  margin: 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}
</style>
