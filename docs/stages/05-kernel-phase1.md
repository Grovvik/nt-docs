# 5. Kernel Phase 1 & Subsystems (`ntoskrnl.exe`)

Фаза 1 инициализации ядра выполняется в контексте первого системного потока на уровне <Term term="IRQL">IRQL PASSIVE_LEVEL</Term>. Разрешены прерывания, включена многоядерность, доступны файловые системы и диспетчер <Term term="PNP">PnP</Term>.

---

## 5.1 Архитектурный pipeline Phase 1

```
[ PsInitSystem(0) создает поток Phase1Initialization ]
                         │
                         ▼
[ Phase1Initialization (0x140786170) -> Phase1InitializationDiscard (0x140A37B24) ]
   ├── HalInitSystem(1, LoaderBlock) -> Запуск ядер CPU (<Term term="AP">AP</Term>), <Term term="IOMMU">IOMMU</Term>, <Term term="ACPI">ACPI</Term>
   ├── InbvEnableBootDriver() -> Инициализация графического видеодрайвера <Term term="INBV">INBV</Term>
   ├── CcInitializeCacheManager() -> Поднятие диспетчера кэша (Cc)
   ├── MmInitSystem(1) -> Рабочие наборы (Working Sets), кэш системного пространства
   ├── CmInitSystem1() -> Монтирование веток реестра HKLM\<Term term="SAM">SAM</Term>, HKLM\SECURITY, HKLM\SOFTWARE
   ├── PoInitSystem(1) -> Подсистема управления электропитанием (<Term term="ACPI">ACPI</Term> Power Schemes)
   ├── IopInitializeBootDrivers() -> <Term term="PNP">PnP</Term>-диспетчер вызывает DriverEntry для загрузочных драйверов
   └── StartFirstUserProcess (0x140A44218)
           │
           ├── Подготовка блока RTL_USER_PROCESS_INFORMATION
           ├── Создание процесса \SystemRoot\System32\<Term term="SMSS">smss.exe</Term> (NtInitialUserProcess)
           ├── FinalizeBootLogo() -> Отключение анимации загрузки
           └── ZwResumeThread() -> Передача управления в <Term term="SMSS">smss.exe</Term>
```

---

## 5.2 Декомпилированный C-код функций ядра (Phase 1)

> **Целевая сборка**: Windows 10 22H2 x64 (Build `10.0.19045.2965`). Имена внутренних функций и RVA-адреса зависят от версии сборки.  
> **Конвенция вызовов (x64 ABI)**: Аннотации конвенций вызовов (`__fastcall`, `__stdcall`) воспроизводят декораторы типов декомпилятора Hex-Rays / IDA Pro. В архитектуре Windows x64 действует единый системный Microsoft x64 ABI (передача параметров через RCX, RDX, R8, R9, выделение Shadow Space).

---

### 1. Главный исполнитель Phase 1: `Phase1InitializationDiscard`

<FunctionCard 
  name="Phase1InitializationDiscard"
  module="ntoskrnl.exe"
  :exported="false"
  prototype="BOOLEAN __fastcall Phase1InitializationDiscard(PLOADER_PARAMETER_BLOCK LoaderBlock)"
  irql="PASSIVE_LEVEL (0)"
  caller="Phase1Initialization"
  phase="Phase 1 Core Engine"
>
Главная функция фазы 1 ядра. Находится в секции <code>.INIT</code> (которая после завершения загрузки полностью выгружается и освобождается из оперативной памяти для экономии ресурсов). Запускает многоядерность, графику, диспетчер ввода-вывода и вызывает <code>StartFirstUserProcess</code>.
</FunctionCard>

<DecompiledCode 
  name="Phase1InitializationDiscard"
  module="ntoskrnl.exe"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Инициализация многоядерности HAL(1), кэш-менеджера Cc, реестра Cm(1), диспетчера ввода-вывода и запуск smss.exe"
>

```c
BOOLEAN __fastcall Phase1InitializationDiscard(PLOADER_PARAMETER_BLOCK LoaderBlock)
{
  NTSTATUS Status;
  HANDLE NlsSectionHandle;
  LARGE_INTEGER NlsSectionSize;
  PVOID NlsSectionObject;
  PVOID MappedNlsBase;
  ULONG_PTR ViewSize;

  // [1] Создание символической ссылки \SystemRoot на загрузочный раздел диска
  if ( CreateSystemRootLink(LoaderBlock) < 0 )
    KeBugCheck(SYMBOLIC_INITIALIZATION_FAILED); // 0x64

  // [2] Инициализация Менеджера Памяти Mm фазы 1 (рабочие наборы Working Sets, файлы подкачки)
  if ( !MmInitSystem(1, LoaderBlock) )
    KeBugCheck(MEMORY1_INITIALIZATION_FAILED); // 0x65

  // [3] Создание разделяемой секции NLS-таблиц (кодовых страниц) для всех процессов Ring 3
  if ( InitNlsTableSize )
  {
    NlsSectionSize.QuadPart = InitNlsTableSize;
    ZwCreateSection(
      &NlsSectionHandle,
      SECTION_ALL_ACCESS,
      NULL,
      &NlsSectionSize,
      PAGE_READWRITE,
      SEC_COMMIT,
      NULL
    );

    ObReferenceObjectByHandle(
      NlsSectionHandle,
      SECTION_ALL_ACCESS,
      MmSectionObjectType,
      KernelMode,
      &NlsSectionObject,
      NULL
    );

    InitNlsSectionPointer = NlsSectionObject;
    ZwClose(NlsSectionHandle);

    MappedNlsBase = NULL;
    ViewSize = 0;
    MmMapViewInSystemSpace(InitNlsSectionPointer, &MappedNlsBase, &ViewSize);
    memmove(MappedNlsBase, InitNlsTableBase, InitNlsTableSize);
    InitNlsTableBase = MappedNlsBase;
  }

  // [4] Инициализация Диспетчера Кэша (Cache Manager - Cc)
  if ( !CcInitializeCacheManager() )
    KeBugCheck(CACHE_INITIALIZATION_FAILED); // 0x66

  // [5] Инициализация Менеджера Конфигурации (Реестр - Cm Phase 1: HKLM\SAM, HKLM\SECURITY, HKLM\SOFTWARE)
  if ( !CmInitSystem1(LoaderBlock) )
    KeBugCheck(CONFIG_INITIALIZATION_FAILED); // 0x67

  // [6] Инициализация подсистемы упреждающего чтения Superfetch / SysMain (PfInitializeSuperfetch)
  PfInitializeSuperfetch();

  // [7] Инициализация библиотеки поддержки файловых систем (FsRtlInitSystem)
  if ( !FsRtlInitSystem() )
    KeBugCheck(FILE_SYSTEM_INITIALIZATION_FAILED); // 0x68

  // [8] Инициализация Plug and Play (PnP) и подсистемы ввода-вывода I/O Manager
  // Диспетчер PnP опрашивает шины PCIe/USB/NVMe и вызывает DriverEntry загрузочных драйверов
  if ( !PpInitSystem() )
    KeBugCheck(PNP_INITIALIZATION_FAILED); // 0x90

  // [9] Инициализация подсистемы межпроцессного взаимодействия LPC / ALPC
  if ( !LpcInitSystem() )
    KeBugCheck(LPC_INITIALIZATION_FAILED); // 0x6A

  // [10] Инициализация подсистемы управления питанием (Power Manager Phase 1)
  if ( !PoInitSystem(1, LoaderBlock) )
    KeBugCheck(PHASE1_INITIALIZATION_FAILED); // 0x32

  // [11] Запуск первого пользовательского процесса (smss.exe)
  StartFirstUserProcess();

  return TRUE;
}
```

</DecompiledCode>

---

### 2. Запуск первого процесса пользователя: `StartFirstUserProcess`

<FunctionCard 
  name="StartFirstUserProcess"
  module="ntoskrnl.exe"
  :exported="false"
  prototype="VOID StartFirstUserProcess(VOID)"
  irql="PASSIVE_LEVEL (0)"
  caller="Phase1InitializationDiscard"
  phase="Transition to User-Mode"
>
Создает процесс `\SystemRoot\System32\smss.exe` (строка `NtInitialUserProcess`), настраивает структуры <Term term="PEB">PEB</Term>, аргументы командной строки и переменные окружения, отключает логотип загрузки через `FinalizeBootLogo()`, возобновляет основной поток процесса через `ZwResumeThread` и переводит ядро в режим ожидания.
</FunctionCard>

<DecompiledCode 
  name="StartFirstUserProcess"
  module="ntoskrnl.exe"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Создание процесса smss.exe через RtlCreateUserProcessEx, финализация логотипа и запуск потока"
>

```c
VOID StartFirstUserProcess(VOID)
{
  NTSTATUS Status;
  SIZE_T AllocationSize;
  SIZE_T TotalParamSize;
  PRTL_USER_PROCESS_PARAMETERS ProcessParams;
  RTL_USER_PROCESS_INFORMATION ProcessInfo;
  UNICODE_STRING DllPath;
  UNICODE_STRING ImagePath;
  UNICODE_STRING CommandLine;
  LARGE_INTEGER DelayInterval;

  memset(&ProcessInfo, 0, sizeof(ProcessInfo));

  // [1] Вычисление размера и выделение памяти под параметры процесса (ProcessParameters)
  TotalParamSize = g_InitialProcessDllPath.MaximumLength + sizeof(RTL_USER_PROCESS_PARAMETERS);
  AllocationSize = TotalParamSize + g_InitialProcessCmdLine.MaximumLength;

  ProcessParams = (PRTL_USER_PROCESS_PARAMETERS)ExAllocatePoolWithTag(
                    NonPagedPoolNx,
                    AllocationSize,
                    'bSsP' // Tag "PsSb" (Process Subsystem Boot)
                  );
  if ( !ProcessParams )
  {
    KeBugCheckEx(PROCESS1_INITIALIZATION_FAILED, STATUS_INSUFFICIENT_RESOURCES, 0, 0, 0); // 0x6D
  }

  memset(ProcessParams, 0, AllocationSize);
  ProcessParams->MaximumLength = (ULONG)TotalParamSize;
  ProcessParams->Length = (ULONG)TotalParamSize;
  ProcessParams->Flags = RTL_USER_PROC_PARAMS_NORMALIZED;

  // [2] Настройка путей первого процесса: "\SystemRoot\System32\smss.exe" (NtInitialUserProcess)
  RtlInitUnicodeString(&DllPath, L"\\SystemRoot\\System32");
  RtlCopyUnicodeString(&ProcessParams->DllPath, &DllPath);
  RtlCopyUnicodeString(&ProcessParams->ImagePathName, &NtInitialUserProcess);

  // Настройка строки команды запуска процесса
  CommandLine.Buffer = (PWSTR)((ULONG_PTR)ProcessParams + TotalParamSize);
  CommandLine.Length = 0;
  CommandLine.MaximumLength = g_InitialProcessCmdLine.MaximumLength;
  RtlCopyUnicodeString(&CommandLine, &g_InitialProcessCmdLine);
  ProcessParams->CommandLine = CommandLine;

  // [3] Создание процесса smss.exe в пространстве Ring 3 (EPROCESS / ETHREAD / VAD)
  Status = RtlCreateUserProcessEx(
              &ProcessParams->ImagePathName,
              OBJ_CASE_INSENSITIVE,
              ProcessParams,
              NULL,
              &ProcessInfo
           );

  // [4] Отключение анимации загрузочного логотипа Inbv
  if ( InbvIsBootDriverInstalled() )
    FinalizeBootLogo();

  if ( !NT_SUCCESS(Status) )
  {
    KeBugCheckEx(PROCESS1_INITIALIZATION_FAILED, Status, 0, 1, 0);
  }

  // [5] Запуск первого потока процесса smss.exe
  Status = ZwResumeThread(ProcessInfo.ThreadHandle, NULL);
  if ( !NT_SUCCESS(Status) )
  {
    KeBugCheckEx(PROCESS1_INITIALIZATION_FAILED, Status, 0, 3, 0);
  }

  // [6] Перевод потока Phase 1 инициализации ядра в режим ожидания
  DelayInterval.QuadPart = -50000000; // Ожидание 5 секунд
  KeDelayExecutionThread(KernelMode, FALSE, &DelayInterval);

  // [7] Очистка дескрипторов процесса smss.exe и освобождение пула параметров
  ZwClose(ProcessInfo.ProcessHandle);
  ZwClose(ProcessInfo.ThreadHandle);
  ExFreePoolWithTag(ProcessParams, 0);
}
```

</DecompiledCode>
