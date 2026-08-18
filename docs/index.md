---
layout: home
hero:
  name: "Windows NT Internals"
  text: "Полное руководство по архитектуре ядра"
  tagline: "Низкоуровневый интерактивный разбор устройства Windows NT"
  actions:
    - theme: brand
      text: "Изучить запуск ОС"
      link: "/stages/01-firmware-uefi-mbr"
    - theme: alt
      text: "Термины"
      link: "/glossary/"
    - theme: alt
      text: "Карта"
      link: "/reference/flowchart"

features:
  - title: "Декомпилированный C-код ядра"
    details: "Ключевые функции микроядра (Ke), исполнительной системы (Ex), диспетчера памяти (Mm), I/O и подсистем Ring 3 с  реверс-инжинирингом."
  - title: "Интерактивная энциклопедия структур"
    details: "Наведите курсор на неизвестный термин для получения контекстной справки, схемы и связанных регистров."
  - title: "Реальный билд Windows 10/11 x64"
    details: "Основано на детальном анализе структур, смещений и функций ядра Windows NT (10.0.19045.2965 22H2)."
---

<BootTimeline />

<BootFlowGraph />

## Архитектурные уровни операционной системы

Архитектурный конвейер становления и работы подсистем Windows NT:

1. **<Term term="Firmware">Firmware / UEFI</Term> & MBR**:
   - Аппаратная инициализация чипсета, памяти и процессора (фазы SEC -> PEI -> DXE).
   - Выбор устройства загрузки (BDS), валидация ключей <Term term="Secure Boot">Secure Boot</Term> и запуск `\EFI\Microsoft\Boot\bootmgfw.efi`.

2. **Windows Boot Manager (`bootmgr.efi`)**:
   - Чтение и разбор базы конфигурации <Term term="BCD">BCD</Term>.
   - Проверка TPM и расшифровка разделов BitLocker (<Term term="FVE">Full Volume Encryption</Term>).
   - Запуск целевого загрузчика ОС `winload.efi`.

3. **Windows OS Loader (`winload.efi`)**:
   - Загрузка `ntoskrnl.exe`, `hal.dll`, куста `SYSTEM` и драйверов типа `SERVICE_BOOT_START` (включая <Term term="ELAM">ELAM</Term>).
   - Подготовка таблиц страниц памяти (<Term term="CR3">CR3</Term> / <Term term="PTE">PTE</Term>) и структуры `LOADER_PARAMETER_BLOCK`.
   - Вызов UEFI сервиса `ExitBootServices` и переход в ядро на `KiSystemStartup`.

4. **Kernel Phase 0 (<Term term="ntoskrnl">ntoskrnl.exe</Term>)**:
   - Выполняется на главном процессоре (BSP) при отключенных прерываниях (<Term term="IRQL">IRQL HIGH_LEVEL</Term>).
   - Настройка структур <Term term="KPCR">KPCR</Term>, <Term term="KPRCB">KPRCB</Term>, <Term term="IDT">IDT</Term>, <Term term="GDT">GDT</Term>, <Term term="TSS">TSS</Term>.
   - Вызов `InitBootProcessor`: инициализация <Term term="HAL">HAL</Term>, менеджера памяти `MmInitSystem(0)`, объектов `ObInitSystem(0)`, процессов `PsInitSystem(0)`.

5. **Kernel Phase 1 (Многоядерность, Диспетчер I/O и Драйверы)**:
   - Переход на <Term term="IRQL">IRQL PASSIVE_LEVEL</Term> в контексте системного потока `Phase1Initialization`.
   - Запуск дополнительных ядер CPU (<Term term="AP">Application Processors</Term>).
   - Диспетчер <Term term="PNP">PnP</Term> инициализирует драйверы устройств через `IopInitializeBootDrivers` и создает объекты <Term term="IRP">IRP</Term>.
   - Запуск первого пользовательского процесса `\SystemRoot\System32\smss.exe`.

6. **Session Manager Subsystem (`smss.exe`)**:
   - Запуск утилиты проверки дисков `autochk.exe` (`BootExecute`).
   - Создание файлов подкачки (<Term term="PAGEFILE">pagefile.sys</Term>) через `SmpCreatePagingFiles`.
   - Разделение окружения на изолированную **Сессию 0** (системные службы) и **Сессию 1** (интерактивный пользователь).

7. **System Initialization & Services (`wininit.exe`, `services.exe`)**:
   - Запуск в Сессии 0: создание оконной станции `WinSta0` и десктопа `Winlogon`.
   - Запуск диспетчера служб <Term term="SCM">SCM (services.exe)</Term>, подсистемы безопасности <Term term="LSASS">LSASS (lsass.exe)</Term> и менеджера сессий `lsm.exe`.
   - SCM поднимает службы автозапуска, RPC-эндпоинты и сетевой стек.

8. **User Session & Shell (`winlogon.exe` -> `userinit.exe` -> `explorer.exe`)**:
   - Запуск `LogonUI.exe`, сбор учетных данных и аутентификация через <Term term="LSASS">LSASS</Term>.
   - Загрузка пользовательского куста реестра `HKEY_CURRENT_USER` (`NTUSER.DAT`).
   - Запуск `userinit.exe`, который выполняет логон-скрипты, <Term term="GPO">GPO</Term> и стартует процесс оболочки <Term term="EXPLORER">explorer.exe</Term> (Панель задач, Рабочий стол, системный трей).

---

> [!TIP] Интерактивные подсказки
> Любое подчеркнутое слово (например, <Term term="SSDT">SSDT</Term>, <Term term="KPCR">KPCR</Term>, <Term term="APC">APC</Term>, <Term term="VBS">VBS</Term>) является интерактивной сноской. Наведите курсор мыши, чтобы просмотреть краткое резюме, структуру данных и кольцо привилегий.
