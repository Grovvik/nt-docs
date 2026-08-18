import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Windows NT Internals',
  description: 'Интерактивная низкоуровневая документация и разбор архитектуры ядра Windows NT: от аппаратного старта и фаз ядра до IPC, драйверов, структур памяти и подсистем Ring 3',
  lang: 'ru-RU',
  base: '/nt-docs/',
  cleanUrls: true,
  themeConfig: {
    siteTitle: 'Windows NT Internals',
    nav: [
      { text: 'Главная', link: '/' },
      {
        text: 'Старт ОС',
        items: [
          { text: '1. Firmware & UEFI / MBR', link: '/stages/01-firmware-uefi-mbr' },
          { text: '2. Windows Boot Manager (bootmgr.efi)', link: '/stages/02-bootmgr' },
          { text: '3. Windows OS Loader (winload.efi)', link: '/stages/03-winload' },
          { text: '4. Kernel Phase 0 (ntoskrnl.exe)', link: '/stages/04-kernel-phase0' },
          { text: '5. Kernel Phase 1 (Subsystems & PnP)', link: '/stages/05-kernel-phase1' },
          { text: '6. Session Manager (smss.exe)', link: '/stages/06-smss' },
          { text: '7. System Init & Services (wininit.exe)', link: '/stages/07-wininit-services' },
          { text: '8. User Session & Shell (explorer.exe)', link: '/stages/08-winlogon-explorer' },
        ]
      },
      { text: 'Термины', link: '/glossary/' },
      { text: 'Карта', link: '/reference/flowchart' },
      { text: 'Структуры', link: '/reference/structures' }
    ],
    sidebar: [
      {
        text: 'Архитектурный конвейер ядра',
        items: [
          { text: 'Обзор архитектуры NT', link: '/' },
          { text: '1. Firmware (UEFI / MBR / BDS)', link: '/stages/01-firmware-uefi-mbr' },
          { text: '2. Boot Manager (bootmgr.efi)', link: '/stages/02-bootmgr' },
          { text: '3. OS Loader (winload.efi)', link: '/stages/03-winload' },
          { text: '4. Kernel Phase 0 (Executive Init)', link: '/stages/04-kernel-phase0' },
          { text: '5. Kernel Phase 1 (Drivers & PnP)', link: '/stages/05-kernel-phase1' },
          { text: '6. Session Manager (smss.exe)', link: '/stages/06-smss' },
          { text: '7. WinInit & Services (Session 0)', link: '/stages/07-wininit-services' },
          { text: '8. WinLogon & Shell (explorer.exe)', link: '/stages/08-winlogon-explorer' }
        ]
      },
      {
        text: 'Справочники и внутренние структуры',
        items: [
          { text: 'Интерактивный глоссарий', link: '/glossary/' },
          { text: 'Низкоуровневые структуры ядра', link: '/reference/structures' },
          { text: 'Полная архитектурная карта вызовов', link: '/reference/flowchart' }
        ]
      }
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: 'Поиск по функциям и структурам',
            buttonAriaLabel: 'Поиск'
          },
          modal: {
            noResultsText: 'Ничего не найдено по запросу',
            resetButtonTitle: 'Сбросить поиск',
            footer: {
              selectText: 'Выбрать',
              navigateText: 'Навигация',
              closeText: 'Закрыть'
            }
          }
        }
      }
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Grovvik/nt-docs' }
    ],
    footer: {
      message: 'Interactive documentation of Windows NT (Build 10.0.19045.2965 x64) • <a href="https://github.com/Grovvik/nt-docs" target="_blank" rel="noopener noreferrer">Source Code</a>',
      copyright: 'Windows NT Architecture & Internals Deep-Dive'
    }
  },
  markdown: {
    math: true,
    config: (md) => {
      const defaultFence = md.renderer.rules.fence!
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        if (token.info.trim() === 'mermaid') {
          const encoded = encodeURIComponent(token.content)
          return `<MermaidDiagram code="${encoded}" />`
        }
        return defaultFence(tokens, idx, options, env, self)
      }
    }
  }
})

