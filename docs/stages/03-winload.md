# 3. Windows OS Loader (`winload.efi`)

Загрузчик операционной системы (`winload.efi`) подготавливает низкоуровневую среду для старта ядра. Он загружает ядро <Term term="ntoskrnl">ntoskrnl.exe</Term>, слой <Term term="HAL">HAL</Term>, <Term term="ELAM">ELAM</Term>-драйверы, строит таблицы страниц виртуальной памяти (<Term term="CR3">CR3</Term> / <Term term="PTE">PTE</Term>), формирует структуру `LOADER_PARAMETER_BLOCK` и выполняет вызов `ExitBootServices`, отключая сервисы прошивки <Term term="UEFI">UEFI</Term>.

---

## 3.1 Архитектурный pipeline winload.efi

```
[ OslMain ] (0x180001090)
    │
    ├── Валидация сигнатуры "BTAPENT" в BOOT_APPLICATION_PARAMETER_BLOCK
    ├── Настройка шрифтов \Windows\Boot\Fonts и параметров BlInitializeLibrary
    └── Вызов OslpMain
         │
         ▼
[ OslPrepareTarget ] (0x180007BFC)
    ├── Инициализация групп расширений OslCoreExtensionSubGroups
    ├── Загрузка модулей ядра: OslpLoadAllModules (ntoskrnl.exe, hal.dll, kdcom.dll, mcupdate)
    ├── Загрузка системного куста реестра: OslpLoadSystemHive (\System32\config\SYSTEM)
    └── Поиск и загрузка загрузочных драйверов: OslGetBootDrivers / OslLoadDrivers / ELAM
         │
         ▼
[ OslInitializeLoaderBlock ] (0x180011CCC)
    ├── Инициализация списков LOADER_PARAMETER_BLOCK (LoadOrderListHead, MemoryDescriptorListHead)
    ├── Настройка NLS-таблиц, опций командной строки ядра (LoadOptions) и расширений VBS/HVCI
    └── Построение физической и виртуальной карты памяти OslBuildKernelMemoryMap
         │
         ▼
[ OslExecuteTransition ] (0x180016584)
    ├── Подготовка страничных таблиц фазы 1 OslFwpKernelSetupPhase1 (CR3 / PML4)
    ├── Остановка протокола отладки BlBdStop() и сохранение меток производительности RDTSC
    └── Вызов низкоуровневого переключателя OslArchTransferToKernel
         │
         ▼
[ OslArchTransferToKernel ] (0x180167E80)
    ├── Сброс процессорных кэшей wbinvd
    ├── Загрузка дескрипторных таблиц: lgdt (&OslArchKernelGdt) и lidt (&OslArchKernelIdt)
    ├── Настройка управляющих регистров: CR4 |= 0x680, CR0 |= 0x50020, CR8 = 0
    ├── Активация Long Mode в MSR 0xC0000080 (IA32_EFER |= LME | NXE | SCE)
    ├── Загрузка селектора сегмента задачи TSS: ltr ax
    └── Вызов инструкции дальнего возврата retfq в точку входа ядра KiSystemStartup
```

---

## 3.2 Декомпилированный C-код функций winload.efi

Все функции получены в результате декомпиляции бинарного файла `winload.efi` (Windows 10/11 x64). Имена переменных нормализованы, код структурирован и снабжен комментариями.

---

### 1. Главная точка входа: `OslMain`

<FunctionCard 
  name="OslMain"
  module="winload.efi"
  :exported="true"
  prototype="NTSTATUS __fastcall OslMain(PBOOT_APPLICATION_PARAMETER_BLOCK BootAppParameters)"
  irql="UEFI Context"
>
Главная точка входа загрузчика `winload.efi`. Валидирует сигнатуру `BTAPENT`, инициализирует базовые подсистемы <Term term="BOOTLIB">BootLib</Term> с путями к системным шрифтам `\Windows\Boot\Fonts`, выделяет память для кучи и передает управление в `OslpMain` / `OslPrepareTarget`.
</FunctionCard>

<DecompiledCode 
  name="OslMain"
  module="winload.efi"
  callingConvention="__fastcall"
  :isExported="true"
  summary="Валидация блока параметров Boot Manager, инициализация BootLib и передача управления в OslpMain"
>

```c
// Источник: source/winload.efi/OslMain_180001090.c
NTSTATUS __fastcall OslMain(PBOOT_APPLICATION_PARAMETER_BLOCK BootAppParameters)
{
  NTSTATUS Status;
  PBOOT_APPLICATION_ENTRY_STATUS ReturnStatus;
  PCSTR SignatureString;
  BOOT_LIBRARY_PARAMETERS LibraryParams;
  ULONG ReturnCode = 0;

  // [1] Инициализация структуры статуса возврата в заголовке параметров приложения
  ReturnStatus = (PBOOT_APPLICATION_ENTRY_STATUS)((ULONG_PTR)BootAppParameters + BootAppParameters->ReturnStatusOffset);
  ReturnStatus->Status = STATUS_SUCCESS;
  ReturnStatus->Flags = 0;
  ReturnStatus->Data = 0;
  ReturnStatus->Version = 1;

  // [2] Проверка сигнатуры входного блока параметров ("BTAPENT" - Boot Application Entry)
  SignatureString = (PCSTR)((ULONG_PTR)BootAppParameters + BootAppParameters->SignatureOffset);
  if ( strcmp(SignatureString, "BTAPENT") != 0 )
  {
    Status = STATUS_INVALID_PARAMETER; // 0xC000000D
    ReturnStatus->Status = Status;
    return Status;
  }

  // [3] Настройка параметров инициализации библиотеки Boot Environment Library (BootLib)
  memset(&LibraryParams, 0, sizeof(LibraryParams));
  LibraryParams.Flags = BOOT_LIBRARY_FLAG_FULL_INITIALIZATION;
  LibraryParams.FontDirectoryPath = L"\\Windows\\Boot\\Fonts";
  LibraryParams.InitializationCallback = OslBuildInitializationEvent;
  LibraryParams.HeapAllocationSize = 0x20000;
  LibraryParams.LibraryVersion = 0x10001A014;

  // [4] Первичная инициализация подсистем BootLib (память, видеорежимы, файловая система)
  Status = BlInitializeLibrary(BootAppParameters, &LibraryParams);
  if ( NT_SUCCESS(Status) )
  {
    // [5] Переход к подготовке целевой системы (загрузка ядра, реестра, драйверов)
    OslpMain(&ReturnCode);
  }

  ReturnStatus->Status = Status;
  return Status;
}
```

</DecompiledCode>

---

### 2. Загрузка модулей ядра: `OslpLoadAllModules`

<FunctionCard 
  name="OslpLoadAllModules"
  module="winload.efi"
  :exported="false"
  prototype="NTSTATUS __fastcall OslpLoadAllModules(POSL_LOADER_BLOCK LoaderBlock, PBOOT_ENVIRONMENT_DEVICE SystemDevice)"
  irql="UEFI Context"
>
Загружает в физическую память исполняемые <Term term="PE">PE</Term>-образы ядра <Term term="ntoskrnl">ntoskrnl.exe</Term>, аппаратно-зависимого слоя <Term term="HAL">hal.dll</Term>, библиотеки отладки `kdcom.dll` / `kdnet.dll`, модуля микрокода ЦП `mcupdate_*.dll` и шрифтов интерфейса BGFX.
</FunctionCard>

<DecompiledCode 
  name="OslpLoadAllModules"
  module="winload.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Последовательная загрузка и валидация цифровых подписей ntoskrnl.exe, hal.dll, kdcom.dll и mcupdate"
>

```c
// Источник: source/winload.efi/OslpLoadAllModules_1800096B8.c
NTSTATUS __fastcall OslpLoadAllModules(
    POSL_LOADER_BLOCK LoaderBlock,
    PBOOT_ENVIRONMENT_DEVICE SystemDevice)
{
  NTSTATUS Status;
  PVOID KernelBase = NULL;
  PVOID HalBase = NULL;
  PVOID KdComBase = NULL;
  PVOID McUpdateBase = NULL;
  UNICODE_STRING KernelPath;
  UNICODE_STRING HalPath;

  // [1] Загрузка исполняемого образа ядра NT (ntoskrnl.exe)
  RtlInitUnicodeString(&KernelPath, L"\\Windows\\system32\\ntoskrnl.exe");
  Status = OslLoadImage(
              SystemDevice,
              &KernelPath,
              IMAGE_TYPE_KERNEL,
              &KernelBase,
              &LoaderBlock->KernelDataTableEntry
           );
  if ( !NT_SUCCESS(Status) )
  {
    OslFatalErrorEx(OSL_FATAL_KERNEL_LOAD_FAILED, Status, 0, 0, KernelPath.Buffer);
    return Status;
  }

  // [2] Загрузка Hardware Abstraction Layer (hal.dll)
  RtlInitUnicodeString(&HalPath, L"\\Windows\\system32\\hal.dll");
  Status = OslLoadImage(
              SystemDevice,
              &HalPath,
              IMAGE_TYPE_HAL,
              &HalBase,
              &LoaderBlock->HalDataTableEntry
           );
  if ( !NT_SUCCESS(Status) )
  {
    OslFatalErrorEx(OSL_FATAL_HAL_LOAD_FAILED, Status, 0, 0, HalPath.Buffer);
    return Status;
  }

  // [3] Загрузка отладочного транспорта ядра (kdcom.dll / kdnet.dll)
  OslpLoadTransports(LoaderBlock, SystemDevice, &KdComBase);

  // [4] Загрузка микрокода процессора (mcupdate_AuthenticAMD.dll / mcupdate_GenuineIntel.dll)
  OslLoadMicrocodeUpdate(LoaderBlock, SystemDevice, &McUpdateBase);

  // [5] Разрешение взаимных таблиц импортов и перекрестных ссылок (ntoskrnl <-> hal.dll)
  Status = BlLdrBindImportReferences(LoaderBlock->LoadedModuleListHead);
  if ( !NT_SUCCESS(Status) )
  {
    OslpLogImportFailure(Status);
    return Status;
  }

  // [6] Загрузка национальных таблиц кодировок NLS (nls_*.nls) и схемы ApiSet (apisetschema.dll)
  OslpLoadNlsData(LoaderBlock, SystemDevice);
  OslLoadApiSetSchema(LoaderBlock, SystemDevice);

  return STATUS_SUCCESS;
}
```

</DecompiledCode>

---

### 3. Инициализация блока параметров: `OslInitializeLoaderBlock`

<FunctionCard 
  name="OslInitializeLoaderBlock"
  module="winload.efi"
  :exported="false"
  prototype="NTSTATUS __fastcall OslInitializeLoaderBlock(ULONG Flags, HANDLE SystemHiveHandle, PLOADER_PARAMETER_BLOCK LoaderBlock)"
  irql="UEFI Context"
>
Инициализирует главную структуру `LOADER_PARAMETER_BLOCK`, настраивает списки загруженных модулей, дескрипторы карты физической памяти, параметры реестра и структуру расширений `_LOADER_PARAMETER_EXTENSION` для <Term term="VBS">VBS</Term> / <Term term="HVCI">HVCI</Term>.
</FunctionCard>

<DecompiledCode 
  name="OslInitializeLoaderBlock"
  module="winload.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Связывание списков памяти, драйверов, куста SYSTEM и расширений гипервизора в единый блок параметров"
>

```c
// Источник: source/winload.efi/OslInitializeLoaderBlock_180011CCC.c
NTSTATUS __fastcall OslInitializeLoaderBlock(
    ULONG Flags,
    HANDLE SystemHiveHandle,
    PLOADER_PARAMETER_BLOCK LoaderBlock)
{
  NTSTATUS Status;
  PLOADER_PARAMETER_EXTENSION Extension;

  // [1] Инициализация циклических двусвязных списков структуры LOADER_PARAMETER_BLOCK
  InitializeListHead(&LoaderBlock->LoadOrderListHead);
  InitializeListHead(&LoaderBlock->MemoryDescriptorListHead);
  InitializeListHead(&LoaderBlock->BootDriverListHead);
  InitializeListHead(&LoaderBlock->EarlyLaunchListHead);
  InitializeListHead(&LoaderBlock->CoreDriverListHead);

  // [2] Инициализация расширения параметров ядра (_LOADER_PARAMETER_EXTENSION)
  Extension = LoaderBlock->Extension;
  if ( Extension )
  {
    InitializeListHead(&Extension->FirmwareDescriptorListHead);
    InitializeListHead(&Extension->BootApplicationDataList);
  }

  // [3] Обновление параметров командной строки загрузки (LoadOptions)
  Status = OslUpdateLoadOptions(LoaderBlock, 0);
  if ( !NT_SUCCESS(Status) )
    return Status;

  // [4] Прошивочно-зависимая инициализация параметров UEFI (ACPI, SMBIOS, TPM-логи)
  Status = OslInitializeLoaderBlockFwDependent(Flags, SystemHiveHandle, LoaderBlock);
  if ( !NT_SUCCESS(Status) )
    return Status;

  // [5] Построение карты физической и виртуальной памяти ядра (OslBuildKernelMemoryMap)
  Status = OslBuildKernelMemoryMap(LoaderBlock);
  if ( !NT_SUCCESS(Status) )
    return Status;

  // [6] Конфигурация параметров безопасности VSM / Secure Kernel / DMA Protection
  if ( OslGetVsmEnabled() )
  {
    OslSetVsmPolicy(LoaderBlock);
  }

  return STATUS_SUCCESS;
}
```

</DecompiledCode>

---

### 4. Переход в ядро: `OslExecuteTransition` и `OslArchTransferToKernel`

<FunctionCard 
  name="OslExecuteTransition"
  module="winload.efi"
  :exported="false"
  prototype="NTSTATUS __fastcall OslExecuteTransition(VOID)"
  irql="UEFI Context"
>
Выполняет фазу 1 настройки памяти `OslFwpKernelSetupPhase1` (построение страничных таблиц <Term term="CR3">CR3</Term> / <Term term="PML4">PML4</Term>), останавливает отладочные протоколы `BlBdStop()`, фиксирует отметку времени RDTSC и вызывает ассемблерную подпрограмму `OslArchTransferToKernel`.
</FunctionCard>

<DecompiledCode 
  name="OslExecuteTransition"
  module="winload.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Финальная подготовка контекста ядра, остановка сервисов BootLib и прыжок в KiSystemStartup"
>

```c
// Источник: source/winload.efi/OslExecuteTransition_180016584.c
NTSTATUS OslExecuteTransition(VOID)
{
  NTSTATUS Status;
  PLOADER_PARAMETER_BLOCK LoaderBlock = (PLOADER_PARAMETER_BLOCK)OslLoaderBlock;
  UINT64 PerformanceCounter;
  PVOID KernelEntryPoint;

  PerformanceCounter = BlArchGetPerformanceCounter();
  LoaderBlock->Extension->LoaderPerformanceData.KernelSetupPhase0Time = PerformanceCounter;

  // [1] Настройка страничных таблиц ядра фазы 1 (PML4, PDPTE, PDE, PTE в CR3)
  Status = OslFwpKernelSetupPhase1(LoaderBlock);
  if ( !NT_SUCCESS(Status) )
  {
    OslFatalErrorEx(OSL_FATAL_KERNEL_PHASE1_SETUP_FAILED, Status, 1, 0, NULL);
    return Status;
  }

  // [2] Восстановление процессорных регистров и проверка окружения VSM
  ArchRestoreProcessorFeatures(0);
  Status = VlpSetupLaunchPhase(LoaderBlock);
  if ( !NT_SUCCESS(Status) )
  {
    OslFatalErrorEx(OSL_FATAL_VSM_LAUNCH_SETUP_FAILED, Status, 4, 0, NULL);
    return Status;
  }

  // [3] Остановка системного отладчика BootLib и патчинг IDT
  if ( BlBdDebugTransitionsEnabled() )
  {
    LoaderBlock->Extension->BootFlags |= BOOT_FLAG_DEBUGGER_ENABLED;
    BlBdPatchIdt(g_IdtBase, (USHORT)OslArchKernelIdt, 16);
  }
  BlBdStop();

  // [4] Фиксация времени передачи управления и вызов точки входа ядра KiSystemStartup
  PerformanceCounter = BlArchGetPerformanceCounter();
  LoaderBlock->Extension->LoaderPerformanceData.KernelTransferTime = PerformanceCounter;
  KernelEntryPoint = (PVOID)OslEntryPoint;

  // [5] Низкоуровневый переход в 64-битное адресное пространство ядра
  OslArchTransferToKernel(LoaderBlock, KernelEntryPoint);

  // Сюда управление не возвращается при успешной загрузке
  return STATUS_SUCCESS;
}
```

</DecompiledCode>

<FunctionCard 
  name="OslArchTransferToKernel"
  module="winload.efi"
  :exported="false"
  prototype="VOID OslArchTransferToKernel(PLOADER_PARAMETER_BLOCK LoaderBlock, PVOID KernelEntryPoint)"
  irql="x64 Ring 0 Flat Mode"
>
Низкоуровневая ассемблерная точка переключения контекста: сбрасывает кэши процессора через `wbinvd`, загружает регистры <Term term="GDT">GDTR</Term> и <Term term="IDT">IDTR</Term>, выставляет флаги в регистрах <Term term="CR0">CR0</Term>, <Term term="CR4">CR4</Term>, <Term term="LONG_MODE">IA32_EFER MSR</Term>, загружает селектор задачи `ltr` и выполняет инструкцию `retfq`, передавая управление функции ядра `KiSystemStartup`.
</FunctionCard>

<DecompiledCode 
  name="OslArchTransferToKernel"
  module="winload.efi"
  callingConvention="__cdecl / asm"
  :isExported="false"
  summary="Ассемблерная инициализация управляющих регистров процессора (GDTR, IDTR, CR0, CR4, MSR) и прыжок через retfq"
>

```c
// Источник: source/winload.efi/OslArchTransferToKernel_180167E80.c
void OslArchTransferToKernel(PLOADER_PARAMETER_BLOCK LoaderBlock, PVOID KernelEntryPoint)
{
  unsigned __int64 cr4_val;
  unsigned __int64 cr0_val;

  // [1] Инвалидация и сброс всех уровней кэша процессора с обратной записью в память
  __wbinvd();

  // [2] Загрузка таблицы глобальных дескрипторов (GDT) ядра
  __lgdt(&OslArchKernelGdt);

  // [3] Загрузка таблицы векторов прерываний (IDT) ядра
  __lidt(&OslArchKernelIdt);

  // [4] Настройка расширенных возможностей процессора в регистре CR4:
  // 0x680 = CR4.OSFXSR (бит 9) | CR4.OSXMMEXCPT (бит 10) | CR4.FSGSBASE (бит 16)
  cr4_val = __readcr4();
  __writecr4(cr4_val | 0x680);

  // [5] Включение базовых механизмов защиты и виртуальной памяти в CR0:
  // 0x50020 = CR0.PE (бит 0) | CR0.NE (бит 5) | CR0.WP (бит 16) | CR0.PG (бит 31)
  cr0_val = __readcr0();
  __writecr0(cr0_val | 0x50020);

  // [6] Сброс приоритета прерываний Task Priority Register (CR8 / TPR)
  __writecr8(0);

  // [7] Активация Long Mode и защиты страниц No-Execute (NX) в IA32_EFER MSR (0xC0000080):
  // IA32_EFER.SCE (бит 0 - SYSCALL/SYSRET) | IA32_EFER.LME (бит 8) | IA32_EFER.NXE (бит 11)
  __writemsr(0xC0000080, __readmsr(0xC0000080) | (unsigned int)OslArchEferFlags);

  // [8] Загрузка селектора TSS ядра в Task Register процессора
  __asm { ltr     ax }

  // [9] Инструкция дальнего возврата retfq для переключения CS:RIP на KiSystemStartup
  __asm { retfq }
}
```

</DecompiledCode>
