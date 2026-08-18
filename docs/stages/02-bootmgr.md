# 2. Windows Boot Manager (`bootmgfw.efi`)

Диспетчер загрузки Windows (<Term term="BCD">Boot Manager</Term> - `bootmgfw.efi`) это независимое 64-битное приложение <Term term="UEFI">UEFI</Term>, отвечающее за разбор базы конфигурации <Term term="BCD">BCD</Term>, аппаратную безопасность (<Term term="FVE">BitLocker</Term>, <Term term="TPM">TPM</Term>, <Term term="VBS">Secure Boot</Term>), выбор операционной системы и запуск загрузчика ядра `winload.efi`.

---

## 2.1 Архитектура Boot Manager

Boot Manager собран на базе библиотеки <Term term="BOOTLIB">Boot Environment Library</Term> (`bootlib.lib`) и выполняет строго последовательные шаги:

```
[ EfiMain / BmMain ]
         │
         ▼
[ BlInitializeLibrary ] -> Инициализация консоли, памяти (BlMm), графики (BlDisplay, BlXmi)
         │
         ▼
[ BmSecureBootInitializeMachinePolicy ] -> Проверка политик Secure Boot и SI (System Integrity)
         │
         ▼
[ BmOpenDataStore ] -> Открытие куста BCD (\EFI\Microsoft\Boot\BCD) через BcdOpenStoreFromFile
         │
         ▼
[ BmResumeFromHibernate ] -> Проверка снимка гибернации (winresume.efi / hiberfil.sys)
         │
         ▼
[ BmGetBootSequence / BmpGetSelectedBootEntry ] -> Построение списка загрузки и выбор GUID ОС
         │
         ▼
[ BmpLaunchBootEntry / BmTransferExecution ] -> Загрузка winload.efi через BlImgLoadBootApplication
         │
         ▼
[ BlImgStartBootApplication ] -> Переход в точку входа OslMain (winload.efi)
```

---

## 2.2 Декомпилированный C-код ключевых функций Boot Manager

Все функции получены в результате декомпиляции официального бинарного файла `bootmgfw.efi` (Windows 10/11 x64). Имена переменных нормализованы, код структурирован и снабжен комментариями.

---

### 1. Точка входа: `BmMain`

<FunctionCard 
  name="BmMain"
  module="bootmgr.efi"
  :exported="true"
  prototype="NTSTATUS __fastcall BmMain(PBOOT_APPLICATION_PARAMETER_BLOCK BootAppParameters)"
  irql="UEFI Context"
>
Главная точка входа Boot Manager. Инициализирует среду <Term term="BOOTLIB">BootLib</Term>, монтирует куст <Term term="BCD">BCD</Term>, проверяет политики <Term term="SECUREBOOT">Secure Boot</Term>, проверяет наличие сессии выхода из гибернации (<Term term="WINRESUME">winresume.efi</Term>), формирует меню выбора операционных систем и запускает целевой загрузчик `winload.efi`.
</FunctionCard>

<DecompiledCode 
  name="BmMain"
  module="bootmgr.efi"
  callingConvention="__fastcall"
  :isExported="true"
  summary="Главная функция Boot Manager: инициализация BootLib, чтение BCD, проверка TPM/BitLocker и диспетчеризация запуска"
>

```c
NTSTATUS __fastcall BmMain(PBOOT_APPLICATION_PARAMETER_BLOCK BootAppParameters)
{
  NTSTATUS Status = STATUS_SUCCESS;
  HANDLE BcdStoreHandle = NULL;
  PBOOT_ENTRY_LIST BootSequenceList = NULL;
  PBOOT_APPLICATION_ENTRY SelectedEntry = NULL;
  PBOOT_OPTIONS BootOptions = NULL;
  PBOOT_OPTIONS GlobalOptions = NULL;
  PBOOT_ENVIRONMENT_DEVICE BootDevice = NULL;
  GUID *TargetBootGuid = NULL;
  UINT32 SequenceCount = 0;
  UINT32 SequenceIndex = 0;
  UINT32 BsdStatusFlags = 0;
  UINT32 ReturnAction = 0;
  BOOLEAN IsRecoveryBcd = FALSE;
  BOOLEAN HasCustomAction = FALSE;
  BOOLEAN RestartRequested = FALSE;
  UINT64 ApplicationStartTime = 0;
  UINT64 PostTime = 0;
  BOOT_LIBRARY_PARAMETERS LibraryParams;
  
  // [1] Фиксация начального значения счетчика тактов процессора (RDTSC)
  ApplicationStartTime = __rdtsc();
  PostTime = ApplicationStartTime;

  // [2] Первичная инициализация библиотеки Boot Environment Library (BootLib)
  memset(&LibraryParams, 0, sizeof(LibraryParams));
  LibraryParams.Flags = BOOT_LIBRARY_FLAG_MINIMAL;
  LibraryParams.ApplicationPath = L"\\EFI\\Microsoft\\Boot";
  LibraryParams.ApplicationGuid = &GUID_WINDOWS_BOOTMGR;

  Status = BlInitializeLibrary(BootAppParameters, &LibraryParams);
  if ( !NT_SUCCESS(Status) )
  {
    if ( Status != STATUS_ENTRYPOINT_NOT_FOUND )
      EfiPrintf(L"BlInitializeLibrary failed 0x%x\r\n", Status);
    goto CleanupAndExit;
  }

  // [3] Регистрация диагностических событий и обработчиков ошибок BCD
  McTemplateK0qq_McGenEventWriteBoot(BOOT_ENVIRONMENT_DIAG_INFO, 0x200000);
  BlEnRegisterEventHandler(EVENT_INVALID_BCD_ENTRY, BmpHandleInvalidBcdEntryEvent, 0, 0);
  BlEnRegisterEventHandler(EVENT_LOG_ETW, BmpLogEtwEvents, 0, 0);
  BmFwInitializeBootDirectoryPath();

  // [4] Проверка доступности резервной копии BCD (Recovery BCD)
  IsRecoveryBcd = BmFwIsRecoveryBcdAvailable();
  TargetBootGuid = &GUID_WINDOWS_BOOTMGR;

  // [5] Проверка флагов перезапуска из структуры данных состояния загрузки (BSD)
  if ( NT_SUCCESS(BlBsdGetFixedData(&BsdStatusFlags)) && (BsdStatusFlags & BSD_FLAG_RECOVERY) )
  {
    BsdStatusFlags &= ~BSD_FLAG_RECOVERY;
    BlBsdSetFixedData(&BsdStatusFlags, sizeof(BsdStatusFlags));
    HasCustomAction = TRUE;
  }

  // [6] Открытие системного хранилища конфигурации загрузки BCD и обновление параметров
  Status = BmpOpenStoreAndUpdateOptions(&BcdStoreHandle, TargetBootGuid, !IsRecoveryBcd);
  if ( !NT_SUCCESS(Status) && IsRecoveryBcd )
  {
    // Fallback: переключение на Recovery BCD при повреждении основного
    BmFwSetDataStoreToRecoveryBcd();
    TargetBootGuid = &GUID_WINDOWS_BOOTMGR;
    Status = BmpOpenStoreAndUpdateOptions(&BcdStoreHandle, TargetBootGuid, TRUE);
  }

  // [7] Инициализация политик Secure Boot платформы и проверка подлинности
  Status = BmSecureBootInitializeMachinePolicy();
  if ( !NT_SUCCESS(Status) )
  {
    BmFatalErrorEx(BOOTMGR_FATAL_SECURE_BOOT_ERROR, Status, 0);
    goto CleanupAndExit;
  }

  BlSecureBootCheckForFactoryReset();
  Status = BlSIPolicyPackagePolicyFiles();
  if ( NT_SUCCESS(Status) && SbIsEnabled() )
  {
    Status = BlSIPolicyCheckPolicyOnDevice();
  }
  if ( !NT_SUCCESS(Status) )
  {
    BmFatalErrorEx(BOOTMGR_FATAL_SI_POLICY_ERROR, Status, 0);
    goto CleanupAndExit;
  }

  // [8] Полнофункциональная реинициализация BootLib с поддержкой графики (BlDisplay, BlXmi)
  LibraryParams.Flags |= BOOT_LIBRARY_FLAG_FULL_GRAPHICS;
  Status = BlInitializeLibrary(BootAppParameters, &LibraryParams);

  // Выделение защищенной страницы памяти ниже 1 МБ (Real Mode / Legacy буфер)
  BlMmAllocatePhysicalPagesInRange(&PhysicalPageBuffer, 1, ALLOC_ANY_PAGE, 0x80000, 0, &MemRange, 1);
  BmpLogBootResolutions();
  BlXmiInitialize(BlResourceFindHtml());
  BlXmiWrite(L"<bootmgr/>");

  // [9] Проверка наличия снимка гибернации (winresume.efi / hiberfil.sys)
  Status = BmResumeFromHibernate(&BcdStoreHandle);
  if ( NT_SUCCESS(Status) )
  {
    // Если система успешно восстановилась из hiberfil.sys, управление возвращено не будет
  }

  // 10. Главный цикл диспетчера: выбор и запуск операционной системы
  while ( TRUE )
  {
    // Получение списка последовательности загрузки (BootSequence / Default)
    if ( !BootSequenceList )
    {
      if ( NT_SUCCESS(BlGetBootOptionGuidList(GlobalOptions, BCD_OS_BOOT_SEQUENCE, &SequenceGuidList, &SequenceCount)) )
      {
        BmGetBootSequence(BcdStoreHandle, SequenceGuidList, SequenceCount, BCD_FLAG_DEFAULT, &BootSequenceList, &SequenceCount);
      }
    }

    // Если последовательность не задана, то происходит опрос или показ меню выбора ОС
    if ( !BootSequenceList || SequenceIndex >= SequenceCount )
    {
      Status = BmpGetSelectedBootEntry(BcdStoreHandle, &SelectedEntry, &TargetBootGuid, &DisplayMenu);
      if ( !NT_SUCCESS(Status) )
        break;
    }
    else
    {
      SelectedEntry = BootSequenceList[SequenceIndex++];
    }

    // Закрываем хранилище BCD перед запуском целевого образа
    if ( BcdStoreHandle )
    {
      BmCloseDataStore(BcdStoreHandle);
      BcdStoreHandle = NULL;
    }

    // 11. Запуск загрузочной записи (winload.efi / memtest / vhd)
    Status = BmpLaunchBootEntry(SelectedEntry, &ReturnAction, 0, TRUE, 0);
    if ( NT_SUCCESS(Status) )
    {
      BmpProcessBadMemory();
      break;
    }

    // Если запуск не удался, повторно открываем хранилище BCD и переходим к следующей записи
    Status = BmOpenDataStore(&BcdStoreHandle);
    if ( !NT_SUCCESS(Status) )
      break;

    if ( SelectedEntry )
    {
      BlDestroyBootEntry(SelectedEntry);
      SelectedEntry = NULL;
    }
  }

  // 12. Обработка ошибок, очистка ресурсов и завершение
CleanupAndExit:
  if ( BcdStoreHandle )
    BmCloseDataStore(BcdStoreHandle);

  FvebpDeleteAllSecrets();
  if ( g_FveKeyring )
    FveKeyringErase(g_FveKeyring);

  if ( RestartRequested )
  {
    BlFwReboot();
    return STATUS_SUCCESS;
  }

  BlDestroyLibrary();
  return Status;
}
```

</DecompiledCode>

---

### 2. Открытие хранилища BCD: `BmOpenDataStore`

<FunctionCard 
  name="BmOpenDataStore"
  module="bootmgr.efi"
  :exported="false"
  prototype="NTSTATUS __fastcall BmOpenDataStore(PHANDLE DataStoreHandle)"
  irql="UEFI Context"
>
Определяет путь к базе конфигурации <Term term="BCD">BCD</Term> на системном разделе <Term term="ESP">ESP</Term> (через `BmGetDataStorePath`), формирует дескриптор полного файлового пути и монтирует файл `\EFI\Microsoft\Boot\BCD` как куст реестра с помощью функции `BcdOpenStoreFromFile`.
</FunctionCard>

<DecompiledCode 
  name="BmOpenDataStore"
  module="bootmgr.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Сборка полного пути к файлу BCD на ESP-разделе и открытие хранилища через BcdOpenStoreFromFile"
>

```c
NTSTATUS __fastcall BmOpenDataStore(PHANDLE DataStoreHandle)
{
  NTSTATUS Status;
  PBOOT_ENVIRONMENT_DEVICE DeviceDescriptor = NULL;
  PWSTR FilePath = NULL;
  BOOLEAN FreeFilePath = FALSE;
  ULONG FilePathLength = 0;
  ULONG FilePathSizeBytes = 0;
  ULONG DeviceSize = 0;
  ULONG TotalPathBufferSize = 0;
  PCHAR FullDevicePathBuffer = NULL;
  UNICODE_STRING_EX BcdFilePathDescriptor;

  *DataStoreHandle = NULL;

  // [1] Получение дескриптора загрузочного устройства (ESP) и относительного пути к BCD
  // Например: Device = "\Device\HarddiskVolume1", FilePath = "\EFI\Microsoft\Boot\BCD"
  Status = BmGetDataStorePath(&DeviceDescriptor, &FilePath, &FreeFilePath);
  if ( !NT_SUCCESS(Status) )
    return Status;

  // [2] Вычисление длины строки пути в символах и байтах
  while ( FilePath[FilePathLength] != L'\0' )
    FilePathLength++;

  FilePathSizeBytes = (FilePathLength + 1) * sizeof(WCHAR);
  DeviceSize = DeviceDescriptor->Size;
  TotalPathBufferSize = DeviceSize + FilePathSizeBytes;

  // Проверка переполнения целочисленного размера буфера
  if ( TotalPathBufferSize < DeviceSize || TotalPathBufferSize < FilePathSizeBytes )
  {
    Status = STATUS_INTEGER_OVERFLOW;
    goto Cleanup;
  }

  // [3] Выделение непрерывного буфера памяти в куче BootLib (BlMm)
  FullDevicePathBuffer = (PCHAR)BlMmAllocateHeap(TotalPathBufferSize);
  if ( !FullDevicePathBuffer )
  {
    Status = STATUS_INSUFFICIENT_RESOURCES;
    goto Cleanup;
  }

  // [4] Склеивание дескриптора устройства и строки пути к файлу BCD
  memmove(FullDevicePathBuffer, DeviceDescriptor, DeviceSize);
  memmove(&FullDevicePathBuffer[DeviceSize], FilePath, FilePathSizeBytes);

  // [5] Формирование дескриптора пути для парсера кустов реестра BootLib
  BcdFilePathDescriptor.Length = (USHORT)TotalPathBufferSize;
  BcdFilePathDescriptor.MaximumLength = (USHORT)TotalPathBufferSize;
  BcdFilePathDescriptor.Buffer = FullDevicePathBuffer;

  // [6] Монтирование файла BCD как куста реестра (Hive) в памяти BootLib
  Status = BcdOpenStoreFromFile(&BcdFilePathDescriptor, DataStoreHandle);

  // [7] Освобождение временного буфера пути
  BlMmFreeHeap(FullDevicePathBuffer);

Cleanup:
  if ( DeviceDescriptor )
    BlMmFreeHeap(DeviceDescriptor);

  if ( FilePath && FreeFilePath )
    BlMmFreeHeap(FilePath);

  return Status;
}
```

</DecompiledCode>

---

### 3. Формирование списка загрузки: `BmGetBootSequence` и `BmpPopulateBootEntryList`

<FunctionCard 
  name="BmGetBootSequence"
  module="bootmgr.efi"
  :exported="false"
  prototype="NTSTATUS __fastcall BmGetBootSequence(HANDLE BcdStoreHandle, PGUID SequenceGuidList, ULONG SequenceCount, ULONG Flags, PBOOT_APPLICATION_ENTRY **BootEntryList, PULONG ReturnedCount)"
  irql="UEFI Context"
>
Выделяет массив указателей в куче <Term term="BOOTLIB">BootLib</Term> и считывает параметры каждой загрузочной записи из базы <Term term="BCD">BCD</Term> по ее <Term term="GUID">GUID</Term>-идентификатору через внутреннюю функцию `BmpPopulateBootEntryList`.
</FunctionCard>

<DecompiledCode 
  name="BmGetBootSequence"
  module="bootmgr.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Выделение массива и наполнение дескрипторов загрузочных записей BCD"
>

```c
NTSTATUS __fastcall BmGetBootSequence(
    HANDLE BcdStoreHandle,
    PGUID SequenceGuidList,
    ULONG SequenceCount,
    ULONG Flags,
    PBOOT_APPLICATION_ENTRY **BootEntryList,
    PULONG ReturnedCount)
{
  NTSTATUS Status;
  PBOOT_APPLICATION_ENTRY *EntryArray = NULL;
  ULONG EntryListSize = 0;
  ULONG ActualLoadedCount = SequenceCount;

  *BootEntryList = NULL;
  *ReturnedCount = 0;

  // [1] Выделение массива указателей на записи в куче BootLib (BlMmAllocateHeap)
  EntryListSize = sizeof(PBOOT_APPLICATION_ENTRY) * SequenceCount;
  EntryArray = (PBOOT_APPLICATION_ENTRY *)BlMmAllocateHeap(EntryListSize);
  if ( !EntryArray )
    return STATUS_INSUFFICIENT_RESOURCES;

  // [2] Инициализация и считывание каждой записи из BCD по ее GUID
  Status = BmpPopulateBootEntryList(
              BcdStoreHandle,
              SequenceGuidList,
              Flags,
              EntryArray,
              &ActualLoadedCount
           );

  if ( !NT_SUCCESS(Status) )
  {
    // Освобождение массива при ошибке загрузки записей
    BlMmFreeHeap(EntryArray);
    return Status;
  }

  // [3] Возврат заполненного массива дескрипторов загрузочных записей
  *BootEntryList = EntryArray;
  *ReturnedCount = ActualLoadedCount;
  return STATUS_SUCCESS;
}
```

</DecompiledCode>

<FunctionCard 
  name="BmpPopulateBootEntryList"
  module="bootmgr.efi"
  :exported="false"
  prototype="NTSTATUS __fastcall BmpPopulateBootEntryList(HANDLE BcdStoreHandle, PGUID GuidList, ULONG EntryFlags, PBOOT_APPLICATION_ENTRY *EntryArray, PULONG EntryCount)"
  irql="UEFI Context"
>
Выполняет разбор BCD-элементов каждого объекта (устройство, тип приложения, флаги winload, winresume, memtest), формирует структуры `BOOT_APPLICATION_ENTRY` и проставляет пути автозапуска исполняемых образов по умолчанию.
</FunctionCard>

<DecompiledCode 
  name="BmpPopulateBootEntryList"
  module="bootmgr.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Считывание BCD опций объекта, выделение дескриптора записи и установка параметров winload/winresume"
>

```c
NTSTATUS __fastcall BmpPopulateBootEntryList(
    HANDLE BcdStoreHandle,
    PGUID GuidList,
    ULONG EntryFlags,
    PBOOT_APPLICATION_ENTRY *EntryArray,
    PULONG EntryCount)
{
  NTSTATUS Status = STATUS_NOT_FOUND;
  NTSTATUS ObjectStatus = STATUS_SUCCESS;
  PBOOT_OPTIONS RawOptions = NULL;
  PBOOT_APPLICATION_ENTRY BootEntry = NULL;
  HANDLE BcdObjectHandle = NULL;
  ULONG OptionListSize = 0;
  ULONG LoadedCount = 0;
  ULONG GuidIndex = 0;
  ULONG TotalGuids = *EntryCount;
  ULONG ObjectType = 0;
  GUID CurrentGuid;
  BOOLEAN HasAppPath = FALSE;
  BOOLEAN WinloadFallback = FALSE;
  BOOLEAN EmsEnabled = FALSE;
  PCWSTR DefaultWinloadPath = NULL;
  OBJECT_DESCRIPTION ObjDescription;

  if ( !TotalGuids )
    return STATUS_NOT_FOUND;

  // [1] Итеративный обход всех переданных GUID-идентификаторов загрузочных записей
  while ( GuidIndex < TotalGuids )
  {
    CurrentGuid = GuidList[GuidIndex];
    BootEntry = NULL;

    // [2] Запрос полного списка BCD-элементов объекта из куста реестра
    ObjectStatus = BmGetOptionList(BcdStoreHandle, &CurrentGuid, &RawOptions);
    if ( !NT_SUCCESS(ObjectStatus) )
      goto ProcessNextEntry;

    // [3] Валидация обязательных BCD-элементов: устройство (BCD_OS_DEVICE) и тип приложения (BCD_OS_APPLICATION_TYPE)
    if ( !BcdUtilGetBootOption(RawOptions, BCD_OS_DEVICE) ||
         !BcdUtilGetBootOption(RawOptions, BCD_OS_APPLICATION_TYPE) )
    {
      ObjectStatus = STATUS_INVALID_PARAMETER;
      goto ProcessNextEntry;
    }

    // [4] Выделение памяти под дескриптор BOOT_APPLICATION_ENTRY вместе со списком опций
    OptionListSize = BlGetBootOptionListSize(RawOptions);
    BootEntry = (PBOOT_APPLICATION_ENTRY)BlMmAllocateHeap(OptionListSize + sizeof(BOOT_APPLICATION_ENTRY));
    if ( !BootEntry )
    {
      ObjectStatus = STATUS_INSUFFICIENT_RESOURCES;
      goto Cleanup;
    }

    // [5] Инициализация структуры загрузочной записи в памяти BootLib
    memset(BootEntry, 0, sizeof(BOOT_APPLICATION_ENTRY));
    BootEntry->Guid = CurrentGuid;
    BootEntry->Flags = EntryFlags;
    BootEntry->Options = (PBOOT_OPTIONS)((ULONG_PTR)BootEntry + sizeof(BOOT_APPLICATION_ENTRY));
    memmove(BootEntry->Options, RawOptions, OptionListSize);
    EntryArray[LoadedCount] = BootEntry;

    // [6] Открытие объекта BCD для определения типа целевого приложения
    ObjectStatus = BcdOpenObject(BcdStoreHandle, &CurrentGuid, &BcdObjectHandle);
    if ( NT_SUCCESS(ObjectStatus) )
    {
      ObjectStatus = BiGetObjectDescription(BcdObjectHandle, &ObjDescription);
      BiCloseKey(BcdObjectHandle);
      ObjectType = ObjDescription.Type;
    }

    if ( NT_SUCCESS(ObjectStatus) )
    {
      // [7] Проверка наличия пути к исполняемому файлу (BCD_OS_APPLICATION_PATH)
      HasAppPath = (BcdUtilGetBootOption(RawOptions, BCD_OS_APPLICATION_PATH) != NULL);

      // Классификация типа приложения по BCD Object Type
      if ( (ObjectType >> 28) == BCD_OBJECT_TYPE_APPLICATION )
      {
        switch ( ObjectType & 0xFFFFF )
        {
          case BCD_APP_TYPE_RESUME:      // winresume.efi
            BootEntry->Flags |= BOOT_ENTRY_FLAG_RESUME;
            break;

          case BCD_APP_TYPE_OS_LOADER:   // winload.efi
            BootEntry->Flags |= BOOT_ENTRY_FLAG_OS_LOADER;
            if ( !HasAppPath )
            {
              // Автоподстановка стандартного пути к winload.efi при его отсутствии в BCD
              WinloadFallback = FALSE;
              BlGetBootOptionBoolean(RawOptions, BCD_OS_BOOT_WINLOAD_BOOT_DIR, &WinloadFallback);
              DefaultWinloadPath = WinloadFallback ? L"\\Windows\\System32\\boot\\winload.efi"
                                                   : L"\\Windows\\System32\\winload.efi";

              ObjectStatus = BlAppendBootOptionString(BootEntry, BCD_OS_APPLICATION_PATH, DefaultWinloadPath);
              if ( !NT_SUCCESS(ObjectStatus) )
                goto Cleanup;
              HasAppPath = TRUE;
            }
            break;

          case BCD_APP_TYPE_MEMTEST:     // memtest.exe
            BootEntry->Flags |= BOOT_ENTRY_FLAG_MEMTEST;
            break;

          case BCD_APP_TYPE_NTLDR:       // Legacy NTLDR
            BootEntry->Flags |= BOOT_ENTRY_FLAG_NTLDR;
            break;

          case BCD_APP_TYPE_SETUP:       // Setup / WinPE
            BootEntry->Flags |= BOOT_ENTRY_FLAG_SETUP;
            break;

          case BCD_APP_TYPE_BOOT_SECTOR: // Boot sector chainloader
            BootEntry->Flags |= BOOT_ENTRY_FLAG_BOOTSECTOR;
            break;
        }
      }

      if ( !HasAppPath )
      {
        ObjectStatus = STATUS_INVALID_PARAMETER;
        goto ProcessNextEntry;
      }

      // [8] Проверка флага EMS (Emergency Management Services / Serial Console)
      if ( (ObjectType >> 28) == BCD_OBJECT_TYPE_APPLICATION &&
           (ObjectType & 0xF00000) == 0x400000 &&
           (ObjectType & 0xFFFFF) == BCD_APP_TYPE_OS_LOADER )
      {
        EmsEnabled = FALSE;
        if ( NT_SUCCESS(BlGetBootOptionBoolean(RawOptions, BCD_OS_EMS_ENABLED, &EmsEnabled)) && EmsEnabled )
        {
          BootEntry->Flags |= BOOT_ENTRY_FLAG_EMS;
        }
      }
    }

ProcessNextEntry:
    if ( RawOptions )
    {
      BlMmFreeHeap(RawOptions);
      RawOptions = NULL;
    }

    if ( !NT_SUCCESS(ObjectStatus) )
    {
      Status = ObjectStatus;
      if ( BootEntry )
      {
        BlDestroyBootEntry(BootEntry);
        EntryArray[LoadedCount] = NULL;
      }
    }
    else
    {
      LoadedCount++;
    }

    GuidIndex++;
  }

  // [9] Проверка наличия хотя бы одной успешно загруженной записи
  if ( LoadedCount > 0 )
  {
    *EntryCount = LoadedCount;
    return STATUS_SUCCESS;
  }

Cleanup:
  if ( RawOptions )
    BlMmFreeHeap(RawOptions);

  return Status;
}
```

</DecompiledCode>

---

### 4. Передача управления загрузчику: `BmTransferExecution`

<FunctionCard 
  name="BmTransferExecution"
  module="bootmgr.efi"
  :exported="false"
  prototype="NTSTATUS __fastcall BmTransferExecution(PBOOT_APPLICATION_ENTRY BootEntry, PULONG ReturnAction, PBOOLEAN ExecutionCompleted)"
  irql="UEFI Context"
>
Загружает <Term term="PE">PE</Term>-образ `winload.efi` через `BlImgLoadBootApplication`, выполняет проверку цифровой подписи <Term term="AUTHENTICODE">Authenticode</Term> и политик Secure Boot, замеряет хэш в <Term term="PCR">PCR</Term>-регистры <Term term="TPM">TPM</Term> и передает управление в точку входа `OslMain` через `BlImgStartBootApplication`.
</FunctionCard>

<DecompiledCode 
  name="BmTransferExecution"
  module="bootmgr.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Загрузка PE-образа winload.efi, замеры TPM, вызов точки входа и обработка статуса возврата"
>

```c
NTSTATUS __fastcall BmTransferExecution(
    PBOOT_APPLICATION_ENTRY BootEntry,
    PULONG ReturnAction,
    PBOOLEAN ExecutionCompleted)
{
  NTSTATUS Status;
  PWSTR ApplicationPath = NULL;
  ULONG_PTR ImageHandle = 0;
  UINT64 StartTimeTsc = 0;
  BOOT_APPLICATION_RETURN_STATUS ReturnStatus;
  PFVE_DEVICE_DATA FveData = NULL;
  PBOOT_ENVIRONMENT_DEVICE OsDevice = NULL;

  *ExecutionCompleted = FALSE;
  *ReturnAction = BOOT_ACTION_NONE;

  // [1] Извлечение пути к исполняемому EFI файлу (например, \Windows\system32\winload.efi)
  Status = BlGetBootOptionString(BootEntry->Options, BCD_OS_APPLICATION_PATH, &ApplicationPath);
  if ( !NT_SUCCESS(Status) )
    ApplicationPath = NULL;

  // [2] Загрузка PE-образа приложения в память с валидацией сигнатуры Authenticode / Secure Boot
  StartTimeTsc = __rdtsc();
  Status = BlImgLoadBootApplication(BootEntry, 0, 0, &ImageHandle);

  // Запись времени загрузки PE-образа в системную телеметрию ETW
  BmpLogEtwApplicationScenarioTime(BOOT_APPLICATION_LOAD_TIME, &BootEntry->Guid, StartTimeTsc);

  if ( !NT_SUCCESS(Status) )
  {
    // Ошибка загрузки (0xc000000f - файл не найден, 0xc0000428 - подпись недействительна)
    return Status;
  }

  // [3] Логирование запуска приложения в структуру BSD (Boot Status Data)
  if ( BsdpLogObjectInitialized )
  {
    BlBsdLogEntry(BSD_EVENT_BOOT_APP_LAUNCH, sizeof(BootEntry->Guid), &BootEntry->Guid);
  }

  // [4] Передача управления в точку входа PE-приложения (OslMain в winload.efi / winresume.efi)
  StartTimeTsc = __rdtsc();
  memset(&ReturnStatus, 0, sizeof(ReturnStatus));

  Status = BlImgStartBootApplication(ImageHandle, 0, &ReturnStatus);

  // Фиксация длительности выполнения загрузчика
  BmpLogEtwApplicationScenarioTime(BOOT_APPLICATION_EXECUTION_TIME, &BootEntry->Guid, StartTimeTsc);

  // [5] Обработка флагов BitLocker (FVE) после возврата из загрузчика
  if ( NT_SUCCESS(BlGetBootOptionDevice(BootEntry->Options, BCD_OS_DEVICE, &OsDevice, 0)) )
  {
    FveData = FvebpGetDeviceData(OsDevice);
    if ( FveData )
    {
      // Сброс временных кэшей криптографических ключей BitLocker
      FveData->Flags &= ~FVE_DEVICE_FLAG_UNLOCKED;
    }
    BlMmFreeHeap(OsDevice);
  }

  // [6] Выгрузка PE-образа из памяти при возврате управления в Boot Manager
  BlImgUnloadBootApplication(ImageHandle);

  // [7] Интерпретация кода возврата (перезагрузка, выбор другой ОС, восстановление)
  if ( ReturnStatus.Flags & BOOT_RETURN_FLAG_REBOOT )
    *ReturnAction = BOOT_ACTION_REBOOT;
  else if ( ReturnStatus.Flags & BOOT_RETURN_FLAG_DISPLAY_MENU )
    *ReturnAction = BOOT_ACTION_DISPLAY_MENU;
  else if ( ReturnStatus.Flags & BOOT_RETURN_FLAG_RECOVERY )
    *ReturnAction = BOOT_ACTION_RECOVERY;

  *ExecutionCompleted = TRUE;
  return Status;
}
```

</DecompiledCode>
