# 2. Windows Boot Manager (`bootmgr.efi`)

Диспетчер загрузки Windows (<Term term="BCD">Boot Manager</Term> — `bootmgr.efi` / `bootmgfw.efi`) — это независимое 64-битное приложение <Term term="UEFI">UEFI</Term>, отвечающее за разбор базы конфигурации <Term term="BCD">BCD</Term>, аппаратную безопасность (<Term term="FVE">BitLocker</Term>, <Term term="TPM">TPM</Term>, <Term term="VBS">Secure Boot</Term>), выбор операционной системы и запуск загрузчика ядра `winload.efi`.

---

## 2.1 Архитектура Boot Manager

Boot Manager собран на базе библиотеки <Term term="BOOTLIB">Boot Environment Library</Term> (`bootlib.lib`) и выполняет строго последовательные шаги:

```
[ EfiMain / BmMain ]
         │
         ▼
[ BlInitializeLibrary ] -> Инициализация консоли, памяти (BlMm), графики (BlDisplay)
         │
         ▼
[ BlSecureBootCheck ] -> Проверка состояния Secure Boot и политик целостности
         │
         ▼
[ BmOpenBootConfigurationDataStore ] -> Открытие куста BCD (\EFI\Microsoft\Boot\BCD)
         │
         ▼
[ BmFveOpenVolume ] -> Разблокировка томов BitLocker через TPM / PCR-регистры
         │
         ▼
[ BmGetBootSequence / BmDisplayBootMenu ] -> Выбор GUID ОС (по умолчанию {default})
         │
         ▼
[ BmLaunchBootApplication ] -> Загрузка winload.efi через BlImgLoadPEImageEx
         │
         ▼
[ ArchTransferToLoader ] -> Прыжок в OslMain (winload.efi)
```

---

## 2.2 Декомпилированный C-код ключевых функций Boot Manager

### 1. Точка входа: `BmMain`

<FunctionCard 
  name="BmMain"
  module="bootmgr.efi"
  :exported="true"
  prototype="EFI_STATUS BmMain(EFI_HANDLE ImageHandle, EFI_SYSTEM_TABLE *SystemTable)"
  irql="UEFI Context"
>
Главная точка входа Boot Manager. Инициализирует библиотеку <Term term="BOOTLIB">BootLib</Term>, считывает куст <Term term="BCD">BCD</Term>, проверяет наличие сохраненной сессии гибернации (<Term term="WINRESUME">winresume.efi</Term>) или стандартной загрузки (winload.efi).
</FunctionCard>

<DecompiledCode 
  name="BmMain"
  module="bootmgr.efi"
  callingConvention="__fastcall"
  :isExported="true"
  summary="Главная функция Boot Manager: инициализация BootLib, чтение BCD и выбор сценария запуска"
>

```c
NTSTATUS __fastcall BmMain(PBOOT_APPLICATION_PARAMETER_BLOCK BootParams)
{
  NTSTATUS status;
  HANDLE BcdHandle;
  GUID SelectedOsGuid;
  PBOOT_APPLICATION_ENTRY BootEntry;

  // 1. Инициализация внутренней среды Boot Environment Library
  status = BlInitializeLibrary(BootParams, &BootLibContext);
  if ( !NT_SUCCESS(status) )
    return status;

  // 2. Проверка состояния Secure Boot и регистрация PCR-измерений в TPM
  BlSecureBootCheck(&g_SecureBootPolicy);
  BlTpmLogEvent(TPM_BOOT_MANAGER_START, sizeof(BOOT_LIB_CONTEXT), &BootLibContext);

  // 3. Открытие системного хранилища данных конфигурации загрузки (BCD)
  status = BmOpenBootConfigurationDataStore(&BcdHandle);
  if ( !NT_SUCCESS(status) )
  {
    // Ошибка BCD: 0xc000000f - файл конфигурации поврежден или отсутствует
    BlDisplayError(status, L"\\EFI\\Microsoft\\Boot\\BCD");
    return status;
  }

  // 4. Попытка разблокировки зашифрованных томов BitLocker (FVE)
  BmFveOpenVolume(BcdHandle);

  // 5. Проверка наличия сессии гибернации (Resume from Hibernate - winresume.efi)
  if ( BmIsResumeContextPresent(BcdHandle) )
  {
    status = BmLaunchResumeApplication(BcdHandle);
    if ( NT_SUCCESS(status) )
      return status; // Если успешно проснулись, дальше не идем
  }

  // 6. Получение последовательности загрузки или отображение меню выбора ОС
  status = BmGetBootSequence(BcdHandle, &SelectedOsGuid);
  if ( BmShouldDisplayMenu(BcdHandle) )
  {
    BmDisplayBootMenu(BcdHandle, &SelectedOsGuid);
  }

  // 7. Загрузка параметров выбранной ОС (winload.efi)
  status = BmGetBootEntry(BcdHandle, &SelectedOsGuid, &BootEntry);
  if ( NT_SUCCESS(status) )
  {
    // 8. Запуск загрузчика Windows OS Loader (winload.efi)
    status = BmLaunchBootApplication(BootEntry);
  }

  BlDestroyLibrary();
  return status;
}
```

</DecompiledCode>

---

### 2. Открытие хранилища BCD: `BmOpenBootConfigurationDataStore`

<FunctionCard 
  name="BmOpenBootConfigurationDataStore"
  module="bootmgr.efi"
  :exported="false"
  prototype="NTSTATUS BmOpenBootConfigurationDataStore(PHANDLE BcdHandle)"
  irql="UEFI Context"
>
Открывает файл `\EFI\Microsoft\Boot\BCD` (в формате куста реестра NT REG_HIVE) на системном разделе <Term term="ESP">ESP</Term> с помощью драйвера файловой системы <Term term="BOOTLIB">BootLib</Term> и парсит <Term term="GUID">GUID</Term>-записи.
</FunctionCard>

<DecompiledCode 
  name="BmOpenBootConfigurationDataStore"
  module="bootmgr.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Монтирование системного куста реестра BCD и валидация корневого дескриптора"
>

```c
NTSTATUS __fastcall BmOpenBootConfigurationDataStore(PHANDLE pBcdHandle)
{
  NTSTATUS status;
  UNICODE_STRING BcdFilePath;
  DEVICE_ID SystemDeviceId;

  *pBcdHandle = NULL;

  // Получение дескриптора загрузочного ESP раздела
  status = BlGetBootDevice(&SystemDeviceId);
  if ( !NT_SUCCESS(status) )
    return status;

  // Путь к файлу базы данных BCD
  RtlInitUnicodeString(&BcdFilePath, L"\\EFI\\Microsoft\\Boot\\BCD");

  // Монтирование файла BCD как куста реестра в памяти BootLib
  status = BgHiveOpen(SystemDeviceId, &BcdFilePath, pBcdHandle);
  if ( !NT_SUCCESS(status) )
  {
    // Fallback: попытка найти BCD на резервном пути
    RtlInitUnicodeString(&BcdFilePath, L"\\Boot\\BCD");
    status = BgHiveOpen(SystemDeviceId, &BcdFilePath, pBcdHandle);
  }

  if ( NT_SUCCESS(status) )
  {
    // Кэширование глобальных параметров (тест памяти, safeboot, hypervisorlaunchtype)
    BmCacheGlobalBcdElements(*pBcdHandle);
  }

  return status;
}
```

</DecompiledCode>

---

### 3. Запуск целевого загрузчика: `BmLaunchBootApplication`

<FunctionCard 
  name="BmLaunchBootApplication"
  module="bootmgr.efi"
  :exported="false"
  prototype="NTSTATUS BmLaunchBootApplication(PBOOT_APPLICATION_ENTRY BootEntry)"
  irql="UEFI Context"
>
Выполняет считывание <Term term="PE">PE</Term>-образа `\Windows\system32\winload.efi`, проверку сигнатуры <Term term="AUTHENTICODE">Authenticode</Term>, выделение страниц памяти через `BlMmAllocatePages`, маппинг секций PE, релокации и передачу управления в `OslMain`.
</FunctionCard>

<DecompiledCode 
  name="BmLaunchBootApplication"
  module="bootmgr.efi"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Загрузка PE-файла winload.efi, релокация секций и переход в OS Loader"
>

```c
NTSTATUS __fastcall BmLaunchBootApplication(PBOOT_APPLICATION_ENTRY BootEntry)
{
  NTSTATUS status;
  PVOID ImageBase;
  ULONG ImageSize;
  PVOID EntryPoint;
  BOOT_APPLICATION_PARAMETER_BLOCK LoaderParams;

  // 1. Считывание PE-образа winload.efi с системного диска
  status = BlImgLoadPEImageEx(
              BootEntry->DeviceId,
              BootEntry->ApplicationPath, // L"\\Windows\\system32\\winload.efi"
              &ImageBase,
              &ImageSize,
              &EntryPoint,
              BL_IMAGE_FLAGS_VALIDATE_SIGNATURE
           );

  if ( !NT_SUCCESS(status) )
    return status;

  // 2. Формирование блока параметров для winload.efi
  memset(&LoaderParams, 0, sizeof(LoaderParams));
  LoaderParams.Signature = BOOT_APPLICATION_SIGNATURE;
  LoaderParams.Version = BOOT_APPLICATION_VERSION;
  LoaderParams.Size = sizeof(LoaderParams);
  LoaderParams.ImageBase = (ULONG_PTR)ImageBase;
  LoaderParams.ImageSize = ImageSize;
  LoaderParams.BcdData = BootEntry->BcdElements;

  // 3. Замер хэша winload.efi в регистр PCR 4 TPM
  BlTpmLogImageMeasurement(4, ImageBase, ImageSize, BootEntry->ApplicationPath);

  // 4. Передача управления в OslMain (точка входа winload.efi)
  typedef NTSTATUS (*POSL_ENTRY)(PBOOT_APPLICATION_PARAMETER_BLOCK);
  POSL_ENTRY OslMainFunc = (POSL_ENTRY)EntryPoint;

  status = OslMainFunc(&LoaderParams);

  // Если winload.efi завершился ошибкой, освобождаем память
  BlImgUnloadPEImage(ImageBase);
  return status;
}
```

</DecompiledCode>
