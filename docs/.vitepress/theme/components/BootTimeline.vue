<script setup lang="ts">
import { ref } from 'vue'

interface Stage {
  id: string
  title: string
  subtitle: string
  timeEstimate: string
  layer: 'Firmware' | 'Loader' | 'Ring 0' | 'Ring 3'
  link: string
  keyFunctions: string[]
  description: string
}

const stages: Stage[] = [
  {
    id: 'firmware',
    title: '1. Firmware & UEFI / MBR',
    subtitle: 'SEC -> PEI -> DXE -> BDS',
    timeEstimate: '0 - 1200 ms',
    layer: 'Firmware',
    link: '/stages/01-firmware-uefi-mbr',
    keyFunctions: ['SecStartup', 'PeiMain', 'DxeMain', 'BdsEntry', 'bootx64.efi'],
    description: 'Инициализация чипсета, памяти, проверка Secure Boot, выбор загрузочного диска (GPT/MBR) и запуск bootmgfw.efi.'
  },
  {
    id: 'bootmgr',
    title: '2. Windows Boot Manager',
    subtitle: 'bootmgr.efi / bootmgr',
    timeEstimate: '1200 - 1800 ms',
    layer: 'Loader',
    link: '/stages/02-bootmgr',
    keyFunctions: ['BmMain', 'BmOpenBootConfigurationDataStore', 'BmFveOpenVolume', 'BmLaunchBootApplication'],
    description: 'Чтение базы BCD, разблокировка BitLocker TPM, отображение меню загрузки и запуск winload.efi.'
  },
  {
    id: 'winload',
    title: '3. Windows OS Loader',
    subtitle: 'winload.efi',
    timeEstimate: '1800 - 2400 ms',
    layer: 'Loader',
    link: '/stages/03-winload',
    keyFunctions: ['OslMain', 'OslLoadAndInitializeKernel', 'OslpLoadBootDrivers', 'BlMmExitBootServices'],
    description: 'Загрузка ntoskrnl.exe, hal.dll, SYSTEM hive, BOOT_START драйверов, маппинг страниц памяти, LOADER_PARAMETER_BLOCK, вызов ExitBootServices.'
  },
  {
    id: 'kernel-p0',
    title: '4. Kernel Phase 0 Initialization',
    subtitle: 'ntoskrnl.exe (Single CPU, IRQL HIGH)',
    timeEstimate: '2400 - 2900 ms',
    layer: 'Ring 0',
    link: '/stages/04-kernel-phase0',
    keyFunctions: ['KiSystemStartup', 'KiInitializeKernel', 'InitBootProcessor', 'HalInitSystem(0)', 'MmInitSystem(0)'],
    description: 'Настройка KPCR, IDT, GDT, TSS, CR3, базовая инициализация памяти Mm, объектов Ob, процессов Ps, безопасности Se.'
  },
  {
    id: 'kernel-p1',
    title: '5. Kernel Phase 1 & Subsystems',
    subtitle: 'ntoskrnl.exe (Multi-CPU, IRQL PASSIVE)',
    timeEstimate: '2900 - 3600 ms',
    layer: 'Ring 0',
    link: '/stages/05-kernel-phase1',
    keyFunctions: ['Phase1InitializationDiscard', 'HalInitSystem(1)', 'IopInitializeBootDrivers', 'StartFirstUserProcess'],
    description: 'Запуск остальных процессоров (AP), PnP-менеджер инициализирует загрузочные драйверы, анимация Inbv, запуск первого пользовательского процесса smss.exe.'
  },
  {
    id: 'smss',
    title: '6. Session Manager Subsystem',
    subtitle: 'smss.exe (Master & Child Instances)',
    timeEstimate: '3600 - 4100 ms',
    layer: 'Ring 3',
    link: '/stages/06-smss',
    keyFunctions: ['SmpInit', 'SmpCreatePagingFiles', 'SmpExecuteInitialCommand', 'SmpCreateSession'],
    description: 'Запуск autochk, создание файлов подкачки (pagefile.sys), создание Сессии 0 (wininit.exe, csrss.exe) и Сессии 1 (winlogon.exe, csrss.exe).'
  },
  {
    id: 'wininit',
    title: '7. System Init & Services (Session 0)',
    subtitle: 'wininit.exe, services.exe, lsass.exe',
    timeEstimate: '4100 - 4600 ms',
    layer: 'Ring 3',
    link: '/stages/07-wininit-services',
    keyFunctions: ['WinMain', 'ScMain', 'ScStartService', 'LsaInitSystem'],
    description: 'Создание WinSta0, SCM запускает службы SYSTEM_START и AUTO_START, инициализация подсистемы безопасности LSA и диспетчера сессий LSM.'
  },
  {
    id: 'explorer',
    title: '8. Logon, User Session & Shell',
    subtitle: 'winlogon.exe -> userinit.exe -> explorer.exe',
    timeEstimate: '4600 - 5200 ms',
    layer: 'Ring 3',
    link: '/stages/08-winlogon-explorer',
    keyFunctions: ['WlInitialize', 'LogonUI.exe', 'Userinit', 'ExplorerWinMain'],
    description: 'Аутентификация пользователя через LogonUI/LSASS, загрузка реестра NTUSER.DAT, userinit запускает Shell (explorer.exe), создание панели задач и рабочего стола.'
  }
]

const activeStage = ref<string>('kernel-p0')

const getLayerClass = (layer: string) => {
  switch (layer) {
    case 'Firmware': return 'layer-firmware'
    case 'Loader': return 'layer-loader'
    case 'Ring 0': return 'layer-kernel'
    case 'Ring 3': return 'layer-usermode'
    default: return ''
  }
}
</script>

<template>
  <div class="timeline-container">
    <div class="timeline-header">
      <h3 class="timeline-title">Хронологический pipeline загрузки Windows</h3>
    </div>

    <div class="timeline-grid">
      <!-- Steps column -->
      <div class="steps-column">
        <div 
          v-for="stage in stages" 
          :key="stage.id"
          class="stage-card"
          :class="[getLayerClass(stage.layer), { 'is-active': activeStage === stage.id }]"
          @click="activeStage = stage.id"
        >
          <div class="stage-top">
            <span class="stage-time">{{ stage.timeEstimate }}</span>
            <span class="stage-layer">{{ stage.layer }}</span>
          </div>

          <div class="stage-name">{{ stage.title }}</div>
          <div class="stage-sub">{{ stage.subtitle }}</div>

          <div class="stage-funcs-preview">
            <span v-for="fn in stage.keyFunctions.slice(0, 3)" :key="fn" class="fn-tag">{{ fn }}</span>
            <span v-if="stage.keyFunctions.length > 3" class="fn-more">+{{ stage.keyFunctions.length - 3 }}</span>
          </div>
        </div>
      </div>

      <!-- Detail panel -->
      <div class="detail-column">
        <div v-for="stage in stages" :key="'detail-' + stage.id" v-show="activeStage === stage.id" class="detail-card">
          <div class="detail-badge-row">
            <span class="detail-layer-pill" :class="getLayerClass(stage.layer)">{{ stage.layer }}</span>
            <span class="detail-time-pill">{{ stage.timeEstimate }}</span>
          </div>

          <h2 class="detail-heading">{{ stage.title }}</h2>
          <p class="detail-desc">{{ stage.description }}</p>

          <div class="detail-section-title">Ключевые функции этапа:</div>
          <div class="detail-fn-list">
            <div v-for="fn in stage.keyFunctions" :key="fn" class="detail-fn-item">
              <span class="fn-bullet">•</span>
              <code class="fn-name">{{ fn }}</code>
            </div>
          </div>

          <div class="detail-actions">
            <a :href="stage.link" class="jump-button">
              Открыть декомпилированный код этапа →
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  margin: 30px 0;
  padding: 24px;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.timeline-title {
  margin: 0 !important;
  font-size: 20px;
  font-weight: 500 !important;
  color: var(--vp-c-text-1);
}

.timeline-badge {
  font-size: 12px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  padding: 4px 10px;
  border-radius: 9999px;
  font-weight: 400;
}

.timeline-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 860px) {
  .timeline-grid {
    grid-template-columns: 1fr;
  }
}

.steps-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 520px;
  overflow-y: auto;
  padding-right: 6px;
}

.stage-card {
  padding: 12px 14px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.stage-card:hover {
  transform: translateX(4px);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}

.stage-card.is-active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-elv);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.stage-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 11px;
}

.stage-time {
  color: var(--vp-c-text-3);
  font-family: 'JetBrains Mono', monospace;
}

.stage-layer {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: 4px;
}

.layer-firmware .stage-layer, .layer-firmware.detail-layer-pill {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}

.layer-loader .stage-layer, .layer-loader.detail-layer-pill {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.layer-kernel .stage-layer, .layer-kernel.detail-layer-pill {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.layer-usermode .stage-layer, .layer-usermode.detail-layer-pill {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.stage-name {
  font-weight: 500;
  font-size: 13.5px;
  color: var(--vp-c-text-1);
}

.stage-sub {
  font-size: 11.5px;
  color: var(--vp-c-text-2);
  margin-bottom: 6px;
}

.stage-funcs-preview {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.fn-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-border);
  padding: 1px 5px;
  border-radius: 4px;
}

.fn-more {
  font-size: 10px;
  color: var(--vp-c-text-3);
}

.detail-column {
  display: flex;
}

.detail-card {
  width: 100%;
  padding: 20px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
}

.detail-badge-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.detail-layer-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 6px;
  text-transform: uppercase;
}

.detail-time-pill {
  font-size: 11px;
  color: var(--vp-c-text-2);
  font-family: 'JetBrains Mono', monospace;
  background: var(--vp-c-bg-soft);
  padding: 3px 8px;
  border-radius: 6px;
}

.detail-heading {
  font-size: 18px !important;
  margin: 0 0 10px 0 !important;
  font-weight: 500 !important;
  color: var(--vp-c-text-1);
}

.detail-desc {
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  margin-bottom: 16px;
}

.detail-section-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-fn-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 24px;
}

.detail-fn-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fn-bullet {
  font-size: 14px;
  color: var(--vp-c-text-3);
  line-height: 1;
}

.fn-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  padding: 2px 6px;
  border-radius: 4px;
}

.detail-actions {
  margin-top: auto;
}

.jump-button {
  display: block;
  text-align: center;
  background: var(--vp-c-brand-1);
  color: #ffffff !important;
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 13px;
  text-decoration: none !important;
  transition: all 0.2s ease;
}

.jump-button:hover {
  background: var(--vp-c-brand-2);
  transform: translateY(-1px);
}
</style>
