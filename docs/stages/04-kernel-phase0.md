# 4. Kernel Phase 0 Initialization (`ntoskrnl.exe`)

Фаза 0 инициализации ядра это фундаментальный этап старта ОС, выполняемый на загрузочном процессоре (BSP) при заблокированных прерываниях (<Term term="IRQL">IRQL HIGH_LEVEL</Term>).

---

## 4.1 Архитектура Phase 0

На этапе Phase 0 ядро переходит из примитивного окружения загрузчика в защищённый режим NT:

```
[ winload.efi: OslArchTransferToKernel ]
                    │
                    ▼
[ KiSystemStartup (0x14098C010) ]
   ├── Сохранение CR0, CR2, CR3, CR4 в контекст процессора
   ├── Загрузка GDTR, IDTR, TR (Task Register), LDTR
   ├── Настройка MSR 0xC0000101 (GS_BASE) -> Указатель на KPCR
   └── Вызов KiInitializeBootStructures & KdInitSystem(0)
                    │
                    ▼
[ KiInitializeKernel (0x1409999E0) ]
   ├── Инициализация <Term term="KPRCB">KPRCB</Term> (очереди <Term term="DPC">DPC</Term>, таймеры, списки потоков)
   ├── Настройка поддержки XSave, <Term term="NX">NX</Term>, Speculation Control (Spectre/Meltdown)
   ├── Создание начального контекста процесса System (Idle Process / Idle Thread)
   └── Вызов InitBootProcessor
                    │
                    ▼
[ InitBootProcessor (0x140A36F64) ]
   ├── HalInitSystem(0, LoaderBlock) -> Базовая настройка контроллера прерываний <Term term="HAL">HAL</Term>
   ├── KeInitSystem(0) & CmInitSystem0(LoaderBlock) -> Ранний куст реестра SYSTEM
   ├── ExInitSystem() -> Инициализация Executive (ExpInitSystemPhase0)
   ├── MmInitSystem(0, LoaderBlock) -> <Term term="PFN">PFN</Term>-база, NonPagedPool, PagedPool, <Term term="VAD">VAD</Term>
   ├── ObInitSystem(0) -> Корневой каталог объектов \ и типы объектов (Directory, Type)
   ├── SeInitSystem(0) -> Подсистема безопасности, дескрипторы и токены
   └── PsInitSystem(0, LoaderBlock) -> Создание первого системного процесса (System)
```

---

## 4.2 Декомпилированный C-код ядра (Phase 0)

### 1. Точка входа ядра: `KiSystemStartup`

<FunctionCard 
  name="KiSystemStartup"
  module="ntoskrnl.exe"
  :exported="true"
  prototype="NTSTATUS __stdcall __noreturn KiSystemStartup(PLOADER_PARAMETER_BLOCK LoaderBlock)"
  irql="HIGH_LEVEL (15/31)"
  caller="winload.efi: OslArchTransferToKernel"
  phase="Phase 0 Core Entry"
>
Абсолютная точка входа ядра Windows NT. Получает указатель на `LOADER_PARAMETER_BLOCK`, сохраняет регистры управления ЦП (<Term term="CR3">CR3</Term>, CR0, CR2, CR4), считывает <Term term="GDT">GDT</Term> и <Term term="IDT">IDT</Term>, программирует MSR 0xC0000101 (GS Base) для адресации <Term term="KPCR">KPCR</Term> и запускает `KiInitializeKernel`.
</FunctionCard>

<DecompiledCode 
  name="KiSystemStartup"
  module="ntoskrnl.exe"
  callingConvention="__stdcall __noreturn"
  :isExported="true"
  summary="Точка входа ядра: чтение регистров ЦП, настройка сегмента GS/KPCR и вызов KiInitializeKernel"
>

```c
// Источник: source/ntoskrnl.exe/Ki/KiSystemStartup_14098C010.c
NTSTATUS __stdcall __noreturn KiSystemStartup(PLOADER_PARAMETER_BLOCK LoaderBlock)
{
  PKPRCB Prcb;
  PKPCR Pcr;
  ULONG64 Cr0Val, Cr2Val, Cr3Val, Cr4Val;
  DESCRIPTOR_TABLE_ENTRY Gdtr, Idtr;
  ULONG64 GdtBaseAddress;
  ULONG64 PcrGsBaseAddress;
  ULONG64 KernelStackLimit;
  PKTHREAD CurrentIdleThread;
  ULONG64 TscValue, RotatedTsc, GeneratedCookie;

  // [1] Сохранение глобального указателя на LOADER_PARAMETER_BLOCK и ранний опрос отладчика
  KeLoaderBlock = LoaderBlock;
  if ( !LoaderBlock->Extension->DebuggerDisabled )
    KdInitSystem(0xFFFFFFFF, KeLoaderBlock);

  // [2] Захват состояния управляющих регистров процессора (CR0, CR2, CR3, CR4)
  Prcb = (PKPRCB)LoaderBlock->Prcb;
  Pcr = (PKPCR)((ULONG_PTR)Prcb - FIELD_OFFSET(KPCR, Prcb));
  Pcr->Self = Pcr;
  Pcr->CurrentPrcb = Prcb;

  Cr0Val = __readcr0();
  Prcb->ProcessorState.SpecialRegisters.Cr0 = Cr0Val;
  Cr2Val = __readcr2();
  Prcb->ProcessorState.SpecialRegisters.Cr2 = Cr2Val;
  Cr3Val = __readcr3();
  Prcb->ProcessorState.SpecialRegisters.Cr3 = Cr3Val;
  Cr4Val = __readcr4();
  Prcb->ProcessorState.SpecialRegisters.Cr4 = Cr4Val;

  // [3] Сохранение базовых адресов GDTR и IDTR через инструкции SGDT / SIDT
  __sgdt(&Gdtr);
  GdtBaseAddress = Gdtr.Base;
  Pcr->GdtBase = (PKGDTENTRY64)GdtBaseAddress;
  __sidt(&Idtr);
  Pcr->IdtBase = (PKIDTENTRY64)Idtr.Base;

  // [4] Считывание Task Register (STR) и LDTR (SLDT)
  __asm
  {
    str     word ptr [Pcr->TssBase]
    sldt    word ptr [Pcr->Ldtr]
  }

  // [5] Настройка режима работы SSE/AVX через управляющий регистр MXCSR (_mm_setcsr)
  Prcb->MxCsr = 0x1F80; // 8064: сброс масок всех FPU исключений
  _mm_setcsr(Prcb->MxCsr);

  if ( !Prcb->Number )
    *(PUSHORT)(GdtBaseAddress + 0x50) = 0x3C00;

  if ( !VslVsmEnabled )
  {
    __asm { lldt ax }
  }

  // [6] Программирование MSR 0xC0000101 (GS_BASE) и 0xC0000102 (KERNEL_GS_BASE) для привязки KPCR к сегменту gs:
  PcrGsBaseAddress = (ULONG64)Pcr;
  __writemsr(MSR_GS_BASE, PcrGsBaseAddress);
  __writemsr(MSR_KERNEL_GS_BASE, PcrGsBaseAddress);

  if ( !Prcb->Number )
  {
    _guard_dispatch_icall_fptr = guard_dispatch_icall;
    _guard_check_icall_fptr[0] = guard_check_icall;
  }

  // [7] Инициализация базовых структур ядра (KiInitializeBootStructures) и подсистемы расширенных контекстов XSAVE
  KiInitializeBootStructures(KeLoaderBlock, (ULONG)(PcrGsBaseAddress >> 32));
  if ( !Prcb->Number )
    KdInitSystem(0, KeLoaderBlock);

  KiInitializeXSave(KeLoaderBlock, Prcb->Number);

  // [8] Повышение уровня прерываний до IRQL = HIGH_LEVEL (CR8 = 0xF) и настройка изоляции страниц KVA Shadow
  __writecr8(HIGH_LEVEL); // 0xF

  alloca(KiXSaveAreaLength);

  if ( KiKvaShadow & 1 )
  {
    KernelStackLimit = *(PULONG64)((ULONG_PTR)Pcr->IdtBase + 4216);
    __writegsqword(KPCR_KVA_STACK_OFFSET, KernelStackLimit);
  }
  else
  {
    KernelStackLimit = *(PULONG64)((ULONG_PTR)Pcr->TssBase + 4);
  }
  __writegsqword(KPCR_RSP0_OFFSET, KernelStackLimit);

  // [9] Вызов функции инициализации ядра KiInitializeKernel (планировщик, DPC, таймеры, InitBootProcessor)
  KiInitializeKernel(LoaderBlock->KernelProcess, LoaderBlock->KernelThread);

  // [10] Генерация случайного значения Security Cookie (_security_cookie) для защиты стека
  if ( !Prcb->Number )
  {
    TscValue = __rdtsc();
    RotatedTsc = _rotr64(TscValue, 49);
    GeneratedCookie = _rotl64(ExpSecurityCookieRandomData ^ RotatedTsc ^ TscValue, 16);
    LOWORD(GeneratedCookie) = 0;
    _security_cookie = _rotr64(GeneratedCookie, 16);
    _security_cookie_complement = ~_security_cookie;
  }

  CurrentIdleThread = KeGetCurrentThread();
  CurrentIdleThread->State = Running;

  // Ожидание разблокировки барьера другими процессорами (KiBarrierWait)
  while ( KiBarrierWait != 0 )
  {
    _mm_pause();
  }

  // [11] Переход в бесконечный цикл планировщика / диспетчера потоков KiIdleLoop
  KiIdleLoop();
}
```

</DecompiledCode>

---

### 2. Главный координатор Phase 0: `InitBootProcessor`

<FunctionCard 
  name="InitBootProcessor"
  module="ntoskrnl.exe"
  :exported="false"
  prototype="NTSTATUS __fastcall InitBootProcessor(PLOADER_PARAMETER_BLOCK LoaderBlock)"
  irql="HIGH_LEVEL -> DISPATCH_LEVEL"
  caller="KiInitializeKernel"
  phase="Phase 0 Subsystem Init"
>
Главная координирующая функция фазы 0 ядра. Последовательно инициализирует HAL (`HalInitSystem(0)`), реестр (`CmInitSystem0`), планировщик (`KeInitSystem(0)`), исполнительную подсистему (`ExInitSystem`), память (`MmInitSystem(0)`), диспетчер объектов (`ObInitSystem(0)`), безопасность (`SeInitSystem(0)`) и процессы (`PsInitSystem(0)`).
</FunctionCard>

<DecompiledCode 
  name="InitBootProcessor"
  module="ntoskrnl.exe"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Координация фазы 0 ядра: вызов HalInitSystem, KeInitSystem, MmInitSystem, ObInitSystem, PsInitSystem"
>

```c
// Источник: source/ntoskrnl.exe/Init/InitBootProcessor_140A36F64.c
NTSTATUS __fastcall InitBootProcessor(PLOADER_PARAMETER_BLOCK LoaderBlock)
{
  NTSTATUS Status;
  PCSTR LoadOptions;
  ULONG InitializationPhase = 0;
  UNICODE_STRING *HostNtSystemRoot;
  STRING AnsiSystemRoot;
  CHAR SystemRootPathBuffer[256];

  // Валидация дескрипторов загрузчика и инициализация подсистемы лицензирования
  ExpValidateLoader();
  ExpInitLicensing(&PspHostSiloGlobals);

  if ( (VslGetNestedPageProtectionFlags() & 6) == 6 )
    ExpRevokeBootLoaderPagePrivileges(LoaderBlock);

  VslGetSecureSpeculationControlInformation();

  // Разбор параметров командной строки загрузки (PERFMEM, DEBUG, SAFEBOOT)
  LoadOptions = LoaderBlock->LoadOptions;
  if ( LoadOptions )
  {
    _strupr((PSTR)LoadOptions);
    if ( strstr(LoadOptions, "PERFMEM") )
    {
      // Выделение пула буфера производительности телеметрии
    }
  }

  // [1] Инициализация национальных таблиц кодировок NLS (UTF-16, ANSI, OEM)
  RtlInitNlsTables(
    LoaderBlock->NlsData->AnsiCodePageData,
    LoaderBlock->NlsData->OemCodePageData,
    LoaderBlock->NlsData->UnicodeCodePageData
  );
  RtlResetRtlTranslations();

  // [2] Инициализация архитектуры аппаратных ошибок WHEA (Windows Hardware Error Architecture)
  WheaInitializeServices();

  // [3] Инициализация аппаратно-зависимого слоя HAL фазы 0 (контроллеры прерываний, APIC, таймеры)
  if ( !HalInitSystem(InitializationPhase, LoaderBlock) )
    KeBugCheck(HAL_INITIALIZATION_FAILED); // 0x5C

  // [4] Инициализация системных таймеров и калибровка счетчиков тактов
  KeInitializeClock(InitializationPhase);

  // [5] Первичная инициализация куста реестра SYSTEM (монтирование ключей ControlSet)
  CmInitSystem0(LoaderBlock);

  // [6] Инициализация структур планировщика ядра (DPC очереди, приоритеты, кванты)
  if ( !KeInitSystem(InitializationPhase) )
    KeBugCheckEx(PHASE0_INITIALIZATION_FAILED, STATUS_UNSUCCESSFUL, 0xB, 0, 0);

  // [7] Построение системного корня (C:\Windows -> \SystemRoot)
  RtlStringCbPrintfA(SystemRootPathBuffer, sizeof(SystemRootPathBuffer), "C:%s", LoaderBlock->NtBootPathName);
  RtlInitAnsiString(&AnsiSystemRoot, SystemRootPathBuffer);
  HostNtSystemRoot = (PUNICODE_STRING)RtlGetHostNtSystemRoot();
  RtlAnsiStringToUnicodeString(HostNtSystemRoot, &AnsiSystemRoot, FALSE);

  // [8] Инициализация исполнительной подсистемы Executive (ExpInitSystemPhase0: пулы памяти, ресурсы)
  if ( !ExInitSystem() )
    KeBugCheckEx(PHASE0_INITIALIZATION_FAILED, 0, 0, 0, 0);

  // [9] Инициализация Диспетчера Памяти Mm фазы 0 (создание PFN Database, NonPagedPool, PagedPool)
  if ( !MmInitSystem(InitializationPhase, LoaderBlock) )
    KeBugCheck(PHASE0_INITIALIZATION_FAILED);

  // [10] Инициализация Диспетчера Объектов Ob фазы 0 (создание корневой папки "\", типов ObjectType, Directory)
  if ( !ObInitSystem(InitializationPhase) )
    KeBugCheck(PHASE0_INITIALIZATION_FAILED);

  // [11] Инициализация Подсистемы Безопасности Se фазы 0 (создание токенов и дескрипторов безопасности)
  if ( !SeInitSystem(InitializationPhase) )
    KeBugCheck(PHASE0_INITIALIZATION_FAILED);

  // [12] Инициализация Диспетчера Процессов Ps фазы 0 (создание процесса "System" и первого системного потока)
  if ( !PsInitSystem(InitializationPhase, LoaderBlock) )
    KeBugCheck(PHASE0_INITIALIZATION_FAILED);

  // [13] Успешное завершение фазы 0
  return STATUS_SUCCESS;
}
```

</DecompiledCode>

---

## 4.3 Ключевые структуры данных Phase 0

| Структура | Описание | Расположение в памяти |
|---|---|---|
| <Term term="KPCR">`_KPCR`</Term> | Kernel Processor Control Region | `gs:[0x0]` (через MSR 0xC0000101) |
| <Term term="KPRCB">`_KPRCB`</Term> | Processor Control Block (планировщик, DPC, прерывания) | `gs:[0x180]` / `KPCR.Prcb` |
| <Term term="IDT">`KIDTENTRY64[256]`</Term> | Таблица дескрипторов прерываний | Загружается через `__sidt` / `LIDT` |
| <Term term="GDT">`KGDTENTRY64`</Term> | Таблица дескрипторов сегментов | Загружается через `__sgdt` / `LGDT` |
| <Term term="TSS">`KTSS64`</Term> | Task State Segment (стек ядра RSP0, IST-стеки) | Загружается через `LTR` |
| `_LOADER_PARAMETER_BLOCK` | Блок параметров от winload.efi | Передается через регистр `RCX` в `KiSystemStartup` |
