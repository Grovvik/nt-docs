# 3. Windows OS Loader (`winload.efi`)

Загрузчик операционной системы (`winload.efi`) подготавливает низкоуровневую среду для старта ядра. Он загружает ядро <Term term="ntoskrnl">ntoskrnl.exe</Term>, слой <Term term="HAL">HAL</Term>, <Term term="ELAM">ELAM</Term>-драйверы, строит таблицы страниц виртуальной памяти (<Term term="CR3">CR3</Term> / <Term term="PTE">PTE</Term>), формирует структуру `LOADER_PARAMETER_BLOCK` и выполняет вызов `ExitBootServices`, отключая сервисы прошивки <Term term="UEFI">UEFI</Term>.

---

## 3.1 Архитектурный pipeline winload.efi

```
[ OslMain / OslpMain ]
         │
         ▼
[ OslLoadAndInitializeKernel ]
   ├── Загрузка PE-образов: ntoskrnl.exe, hal.dll, kdcom.dll, mcupdate_*.dll
   └── Проверка подписей Microsoft Authenticode & Hyper-V (VBS / HVCI)
         │
         ▼
[ OslLoadSystemHive ] -> Загрузка куста \Windows\System32\config\SYSTEM в память
         │
         ▼
[ OslpLoadBootDrivers ]
   ├── Загрузка драйверов ELAM
   └── Загрузка драйверов типа SERVICE_BOOT_START (диски, файловые системы, шины)
         │
         ▼
[ OslpSetVirtualAddressMap ] -> Подготовка 4-уровневых таблиц страниц (PML4, PDPTE, PDE, PTE)
         │
         ▼
[ OslBuildKernelLoaderBlock ] -> Формирование структуры LOADER_PARAMETER_BLOCK
         │
         ▼
[ BlMmExitBootServices ] -> Вызов UEFI ExitBootServices() (Конец фазы Boot Services)
         │
         ▼
[ OslArchTransferToKernel ] -> Прыжок в точку входа ядра KiSystemStartup
```

---

## 3.2 Декомпилированный C-код функций winload.efi

### 1. Главная точка входа: `OslMain`

<FunctionCard 
  name="OslMain"
  module="winload.efi"
  :exported="true"
  prototype="NTSTATUS OslMain(PBOOT_APPLICATION_PARAMETER_BLOCK BootParams)"
  irql="UEFI Context"
>
Инициализирует окружение загрузчика, запускает конвейер загрузки ядра, системного куста реестра и драйверов, настраивает виртуальную память и осуществляет переход в ядро.
</FunctionCard>

<DecompiledCode 
  name="OslMain"
  module="winload.efi"
  callingConvention="__fastcall"
  :isExported="true"
  summary="Главная функция OS Loader: загрузка модулей ядра, драйверов и передача управления в KiSystemStartup"
>

```c
NTSTATUS __fastcall OslMain(PBOOT_APPLICATION_PARAMETER_BLOCK BootParams)
{
  NTSTATUS status;
  PLOADER_PARAMETER_BLOCK LoaderBlock;
  OSL_EXECUTION_CONTEXT Context;

  // 1. Инициализация библиотеки загрузочной среды
  status = BlInitializeLibrary(BootParams, &Context.BootLibContext);
  if ( !NT_SUCCESS(status) )
    return status;

  // 2. Инициализация графического буфера (Boot Video / BGFX)
  OslInitializeDisplay();

  // 3. Загрузка ядра (ntoskrnl.exe), HAL (hal.dll) и зависимостей (kdcom, mcupdate)
  status = OslLoadAndInitializeKernel(&Context);
  if ( !NT_SUCCESS(status) )
    goto Cleanup;

  // 4. Загрузка системного куста реестра SYSTEM
  status = OslLoadSystemHive(&Context);
  if ( !NT_SUCCESS(status) )
    goto Cleanup;

  // 5. Загрузка загрузочных драйверов (BOOT_START) и ELAM
  status = OslpLoadBootDrivers(&Context);
  if ( !NT_SUCCESS(status) )
    goto Cleanup;

  // 6. Формирование главной структуры передачи параметров в ядро
  status = OslBuildKernelLoaderBlock(&Context, &LoaderBlock);
  if ( !NT_SUCCESS(status) )
    goto Cleanup;

  // 7. Построение виртуального адресного пространства ядра и таблиц страниц CR3
  status = OslpSetVirtualAddressMap(&Context, LoaderBlock);
  if ( !NT_SUCCESS(status) )
    goto Cleanup;

  // 8. Отключение UEFI Boot Services (ExitBootServices)
  status = BlMmExitBootServices();
  if ( !NT_SUCCESS(status) )
    goto Cleanup;

  // 9. Переход в ядро: загрузка CR3, настройка GDTR/IDTR и jump в KiSystemStartup
  OslArchTransferToKernel(LoaderBlock, (PVOID)LoaderBlock->KernelStack);

Cleanup:
  BlDestroyLibrary();
  return status;
}
```

</DecompiledCode>

---

### 2. Загрузка модулей ядра: `OslLoadAndInitializeKernel`

<FunctionCard 
  name="OslLoadAndInitializeKernel"
  module="winload.efi"
  :exported="false"
  prototype="NTSTATUS OslLoadAndInitializeKernel(POSL_EXECUTION_CONTEXT Context)"
  irql="UEFI Context"
>
Загружает в оперативную память ключевые <Term term="PE">PE</Term>-образы операционной системы: `ntoskrnl.exe`, `hal.dll`, `kdcom.dll` (отладочный транспорт), `bootvid.dll` (<Term term="INBV">видеодрайвер загрузки</Term>), проверяет подписи через <Term term="HVCI">CI.dll / Code Integrity</Term>.
</FunctionCard>

<DecompiledCode 
  name="OslLoadAndInitializeKernel"
  module="winload.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Загрузка PE-файлов ntoskrnl.exe, hal.dll и библиотек ядра с проверкой цифровой подписи"
>

```c
NTSTATUS __fastcall OslLoadAndInitializeKernel(POSL_EXECUTION_CONTEXT Context)
{
  NTSTATUS status;
  PVOID KernelBase, HalBase, KdComBase;

  // 1. Считывание ntoskrnl.exe
  status = OslpLoadModule(
              Context->SystemDeviceId,
              L"\\Windows\\system32\\ntoskrnl.exe",
              &KernelBase,
              &Context->KernelImageSize,
              &Context->KernelEntryPoint,
              OSL_MODULE_FLAG_KERNEL
           );
  if ( !NT_SUCCESS(status) )
    return status;

  // 2. Считывание hal.dll (Hardware Abstraction Layer)
  status = OslpLoadModule(
              Context->SystemDeviceId,
              L"\\Windows\\system32\\hal.dll",
              &HalBase,
              &Context->HalImageSize,
              &Context->HalEntryPoint,
              OSL_MODULE_FLAG_HAL
           );
  if ( !NT_SUCCESS(status) )
    return status;

  // 3. Загрузка транспортной DLL отладчика ядра (kdcom.dll / kdnet.dll)
  OslpLoadModule(Context->SystemDeviceId, L"\\Windows\\system32\\kdcom.dll", &KdComBase, NULL, NULL, 0);

  // 4. Загрузка микрокода процессора (mcupdate_AuthenticAMD.dll / mcupdate_GenuineIntel.dll)
  OslpLoadMicrocodeUpdate(Context);

  // 5. Разрешение импортов: связывание ntoskrnl.exe <-> hal.dll
  status = BlImgResolveImports(KernelBase, HalBase);
  return status;
}
```

</DecompiledCode>

---

### 3. Загрузка Boot-Start драйверов и ELAM: `OslpLoadBootDrivers`

<FunctionCard 
  name="OslpLoadBootDrivers"
  module="winload.efi"
  :exported="false"
  prototype="NTSTATUS OslpLoadBootDrivers(POSL_EXECUTION_CONTEXT Context)"
  irql="UEFI Context"
>
Считывает ветку реестра `HKLM\SYSTEM\CurrentControlSet\Services`, фильтрует службы с типом старта `Start = 0` (`SERVICE_BOOT_START`), первым загружает драйвер <Term term="ELAM">ELAM</Term>, который классифицирует остальные драйверы контроллеров дисков и файловых систем (storvsc, <Term term="NVME">nvme</Term>, <Term term="NTFS">ntfs</Term>).
</FunctionCard>

<DecompiledCode 
  name="OslpLoadBootDrivers"
  module="winload.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Парсинг реестра SYSTEM, загрузка ELAM и цепочки BOOT_START драйверов"
>

```c
NTSTATUS __fastcall OslpLoadBootDrivers(POSL_EXECUTION_CONTEXT Context)
{
  NTSTATUS status;
  PLIST_ENTRY DriverListHead = &Context->BootDriverList;
  PBOOT_DRIVER_NODE ElamDriver = NULL;

  InitializeListHead(DriverListHead);

  // 1. Поиск в реестре драйверов с Group = "Early-Launch" (ELAM)
  status = OslpScanSystemHiveForElam(Context->SystemHiveHandle, &ElamDriver);
  if ( NT_SUCCESS(status) && ElamDriver )
  {
    // Загрузка и верификация сертификата ELAM-драйвера
    OslpLoadImage(ElamDriver->DriverPath, &ElamDriver->ImageBase);
    InsertTailList(DriverListHead, &ElamDriver->ListEntry);

    // Инициализация коллбэков ранней оценки безопасности
    OslpInitializeElamRegistryData(Context->SystemHiveHandle, ElamDriver);
  }

  // 2. Сканирование остальных драйверов SERVICE_BOOT_START (AHCI, NVMe, StorAHCI, Wdf01000, NTFS)
  status = OslpScanSystemHiveForBootDrivers(Context->SystemHiveHandle, DriverListHead);
  if ( !NT_SUCCESS(status) )
    return status;

  // 3. Загрузка PE-образов всех найденных BOOT_START драйверов в память
  PLIST_ENTRY Entry = DriverListHead->Flink;
  while ( Entry != DriverListHead )
  {
    PBOOT_DRIVER_NODE Node = CONTAINING_RECORD(Entry, BOOT_DRIVER_NODE, ListEntry);
    
    // Проверка драйвера антируткитом ELAM
    if ( OslpElamClassifyDriver(Node) == ELAM_CLASSIFICATION_MALICIOUS )
    {
      // Блокировка загрузки опасного драйвера
      OslpLogSecurityEvent(SECURITY_EVENT_BLOCKED_DRIVER, Node->DriverPath);
      RemoveEntryList(&Node->ListEntry);
    }
    else
    {
      OslpLoadImage(Node->DriverPath, &Node->ImageBase);
    }
    
    Entry = Entry->Flink;
  }

  return STATUS_SUCCESS;
}
```

</DecompiledCode>

---

### 4. Формирование `LOADER_PARAMETER_BLOCK`: `OslBuildKernelLoaderBlock`

<FunctionCard 
  name="OslBuildKernelLoaderBlock"
  module="winload.efi"
  :exported="false"
  prototype="NTSTATUS OslBuildKernelLoaderBlock(POSL_EXECUTION_CONTEXT Context, PLOADER_PARAMETER_BLOCK *OutBlock)"
  irql="UEFI Context"
>
Формирует структуру `_LOADER_PARAMETER_BLOCK`, являющуюся единственным аргументом, передаваемым ядру `ntoskrnl.exe` в точке входа `KiSystemStartup`.
</FunctionCard>

<DecompiledCode 
  name="OslBuildKernelLoaderBlock"
  module="winload.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Создание структуры LOADER_PARAMETER_BLOCK со списками модулей, памяти и параметров загрузки"
>

```c
NTSTATUS __fastcall OslBuildKernelLoaderBlock(
    POSL_EXECUTION_CONTEXT Context, 
    PLOADER_PARAMETER_BLOCK *pLoaderBlock)
{
  PLOADER_PARAMETER_BLOCK Block;

  // Выделение постоянной страницы памяти под LOADER_PARAMETER_BLOCK
  Block = (PLOADER_PARAMETER_BLOCK)BlMmAllocatePages(
              sizeof(LOADER_PARAMETER_BLOCK),
              BL_MEMORY_TYPE_LOADER_BLOCK
          );
  memset(Block, 0, sizeof(LOADER_PARAMETER_BLOCK));

  // 1. Связывание списка загруженных модулей ядра (ntoskrnl, hal, kdcom, bootvid)
  Block->LoadOrderListHead = Context->LoadedModuleListHead;

  // 2. Список физической карты памяти (Memory Descriptor List)
  Block->MemoryDescriptorListHead = Context->MemoryMapListHead;

  // 3. Список BOOT_START драйверов
  Block->BootDriverListHead = Context->BootDriverList;

  // 4. Базовый адрес куста реестра SYSTEM в памяти
  Block->RegistryBase = Context->SystemHiveBase;
  Block->RegistryLength = Context->SystemHiveSize;

  // 5. Указатели на NLS таблицы (кодовые страницы ANSI, OEM, Unicode)
  Block->NlsData = &Context->NlsDataBlock;

  // 6. Опции командной строки загрузки (например, /DEBUG /TESTSIGNING /NOEXECUTE)
  Block->LoadOptions = Context->LoadOptionsString;

  // 7. Расширение блока параметров (_LOADER_PARAMETER_EXTENSION) для VBS/HVCI/Hyper-V
  Block->Extension = Context->LoaderExtensionBlock;

  *pLoaderBlock = Block;
  return STATUS_SUCCESS;
}
```

</DecompiledCode>

---

### 5. Вызов ExitBootServices: `BlMmExitBootServices`

<FunctionCard 
  name="BlMmExitBootServices"
  module="winload.efi"
  :exported="false"
  prototype="NTSTATUS BlMmExitBootServices(VOID)"
  irql="UEFI Context"
>
Вызывает стандартный сервис UEFI `gBS->ExitBootServices()`. После этого память Boot Services освобождается, прерывания UEFI отключаются, и загрузчик получает 100% монопольный контроль над аппаратной платформой ЦП.
</FunctionCard>

<DecompiledCode 
  name="BlMmExitBootServices"
  module="winload.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Вызов gBS->ExitBootServices и переход в автономный режим Ring 0"
>

```c
NTSTATUS __fastcall BlMmExitBootServices(VOID)
{
  EFI_STATUS efiStatus;
  UINTN MemoryMapSize = 0;
  EFI_MEMORY_DESCRIPTOR *MemoryMap = NULL;
  UINTN MapKey;
  UINTN DescriptorSize;
  UINT32 DescriptorVersion;

  // 1. Получение актуального ключа карты памяти (MapKey) прошивки
  gBS->GetMemoryMap(&MemoryMapSize, MemoryMap, &MapKey, &DescriptorSize, &DescriptorVersion);
  MemoryMap = (EFI_MEMORY_DESCRIPTOR *)BlMmAllocateTemporaryPages(MemoryMapSize);
  
  gBS->GetMemoryMap(&MemoryMapSize, MemoryMap, &MapKey, &DescriptorSize, &DescriptorVersion);

  // 2. Фатальный вызов ExitBootServices - уничтожение окружения UEFI
  efiStatus = gBS->ExitBootServices(g_ImageHandle, MapKey);
  if ( EFI_ERROR(efiStatus) )
  {
    // Если произошли изменения карты памяти во время вызова, пробуем повторить 1 раз
    gBS->GetMemoryMap(&MemoryMapSize, MemoryMap, &MapKey, &DescriptorSize, &DescriptorVersion);
    efiStatus = gBS->ExitBootServices(g_ImageHandle, MapKey);
  }

  if ( !EFI_ERROR(efiStatus) )
  {
    g_FirmwareBootServicesActive = FALSE;
    return STATUS_SUCCESS;
  }

  return STATUS_UNSUCCESSFUL;
}
```

</DecompiledCode>
