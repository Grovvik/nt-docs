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

### 1. Главный исполнитель Phase 1: `Phase1InitializationDiscard`

<FunctionCard 
  name="Phase1InitializationDiscard"
  module="ntoskrnl.exe"
  :exported="false"
  prototype="char Phase1InitializationDiscard(ULONG_PTR LoaderBlock)"
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
char __fastcall Phase1InitializationDiscard(ULONG_PTR LoaderBlock)
{
  NTSTATUS status;
  HANDLE SectionHandle;
  LARGE_INTEGER MaximumSize;
  PVOID Object, MappedBase;
  ULONG_PTR ViewSize;

  // 1. Создание символической ссылки \SystemRoot на загрузочный раздел диска
  if ( CreateSystemRootLink(LoaderBlock) < 0 )
    KeBugCheck(0x64u); // SYMBOLIC_INITIALIZATION_FAILED

  // 2. Инициализация Менеджера Памяти Mm (Phase 1)
  // Создание рабочих наборов (Working Sets), кэша адресов, поддержка файлов подкачки
  if ( !(unsigned __int8)MmInitSystem(1, LoaderBlock) )
    KeBugCheck(0x65u); // MEMORY1_INITIALIZATION_FAILED

  // 3. Создание разделяемой секции NLS-таблиц для всех процессов юзермода
  if ( InitNlsTableSize )
  {
    MaximumSize.QuadPart = InitNlsTableSize;
    ZwCreateSection(&SectionHandle, 0xF001Fu, nullptr, &MaximumSize, 4u, 0x8000000u, nullptr);
    ObReferenceObjectByHandle(SectionHandle, 0xF001Fu, MmSectionObjectType, 0, &Object, nullptr);
    InitNlsSectionPointer = Object;
    ZwClose(SectionHandle);

    MappedBase = nullptr;
    ViewSize = 0;
    MmMapViewInSystemSpace(InitNlsSectionPointer, &MappedBase, &ViewSize);
    memmove(MappedBase, InitNlsTableBase, InitNlsTableSize);
    InitNlsTableBase = MappedBase;
  }

  // 4. Инициализация Диспетчера Кэша (Cache Manager - Cc)
  if ( !(unsigned __int8)CcInitializeCacheManager() )
    KeBugCheck(0x66u); // CACHE_INITIALIZATION_FAILED

  // 5. Инициализация Менеджера Конфигурации (Реестр - Cm Phase 1)
  if ( !(unsigned __int8)CmInitSystem1(LoaderBlock) )
    KeBugCheck(0x67u); // CONFIG_INITIALIZATION_FAILED

  // 6. Инициализация Superfetch / SysMain (PfInitializeSuperfetch)
  PfInitializeSuperfetch();

  // 7. Инициализация файловых систем (FsRtlInitSystem)
  if ( !(unsigned __int8)FsRtlInitSystem() )
    KeBugCheck(0x68u); // FILE_SYSTEM_INITIALIZATION_FAILED

  // 8. Инициализация Plug and Play (PnP) и I/O Manager
  // Диспетчер PnP находит устройства шин PCIe/USB/NVMe и вызывает DriverEntry драйверов
  if ( !(unsigned __int8)PpInitSystem() )
    KeBugCheck(0x90u); // PNP_INITIALIZATION_FAILED

  // 9. Инициализация LPC / ALPC подсистемы IPC
  if ( !(unsigned __int8)LpcInitSystem() )
    KeBugCheck(0x6Au); // LPC_INITIALIZATION_FAILED

  // 10. Инициализация подсистемы управления питанием (Power Manager Phase 1)
  if ( !(unsigned __int8)PoInitSystem(1, LoaderBlock) )
    KeBugCheck(0x32u);

  // 11. Запуск первого пользовательского процесса (smss.exe)
  StartFirstUserProcess();

  return 1;
}
```

</DecompiledCode>

---

### 2. Запуск первого процесса пользователя: `StartFirstUserProcess`

<FunctionCard 
  name="StartFirstUserProcess"
  module="ntoskrnl.exe"
  :exported="false"
  prototype="void StartFirstUserProcess(VOID)"
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
void StartFirstUserProcess()
{
  __int64 MaximumLength;
  __int64 v1;
  SIZE_T v2;
  char *PoolWithTag;
  char *v4;
  ULONG_PTR UserProcess;
  UNICODE_STRING DestinationString;
  HANDLE Handles[18];
  LARGE_INTEGER Interval;

  memset(Handles, 0, sizeof(Handles));

  // Выделение памяти под параметры процесса (ProcessParameters, аргументы, переменные окружения)
  MaximumLength = stru_140D24938.MaximumLength;
  v1 = stru_140D24928.MaximumLength + 1148LL;
  v2 = v1 + stru_140D24938.MaximumLength;
  PoolWithTag = (char *)ExAllocatePoolWithTag(NonPagedPoolNx, v2, 0x62537350u); // Tag "PsSb" (Process Subsystem Boot)
  v4 = PoolWithTag;
  if ( !PoolWithTag )
    KeBugCheckEx(0x6Du, 0xFFFFFFFFC000009AuLL, 0, 0, 0);

  memset(PoolWithTag, 0, v2);

  // Копирование пути первого процесса: "\SystemRoot\System32\smss.exe" (NtInitialUserProcess)
  RtlCopyUnicodeString((PUNICODE_STRING)(v4 + 56), &stru_140D24928);
  RtlCopyUnicodeString((PUNICODE_STRING)v4 + 6, &NtInitialUserProcess);

  // 1. Создание процесса smss.exe в пространстве Ring 3
  UserProcess = (int)RtlCreateUserProcessEx((int)v4 + 96, (_DWORD)v4, 0, 0, (__int64)Handles);

  // 2. Отключение анимации загрузочного логотипа Inbv
  if ( InbvIsBootDriverInstalled() )
    FinalizeBootLogo();

  if ( (UserProcess & 0x80000000) != 0LL )
    KeBugCheckEx(0x6Du, UserProcess, 0, 1u, 0); // PROCESS1_INITIALIZATION_FAILED

  // 3. Запуск первого потока процесса smss.exe
  ZwResumeThread(Handles[1], NULL);

  // 4. Очистка временных ресурсов и переход системного потока в сон
  Interval.QuadPart = -50000000; // 5 секунд
  KeDelayExecutionThread(0, 0, &Interval);

  ZwClose(Handles[2]); // Закрытие Process Handle
  ZwClose(Handles[1]); // Закрытие Thread Handle
  ExFreePoolWithTag(v4, 0);
}
```

</DecompiledCode>
