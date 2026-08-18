# 6. Session Manager Subsystem (`smss.exe`)

Диспетчер сессий (<Term term="SMSS">smss.exe</Term>) — первый процесс пользовательского режима (Ring 3), запускаемый ядром. Он работает в качестве Native-приложения NT (только `ntdll.dll` без подсистемы Win32), настраивает виртуальную память и создаёт изолированные сессии.

---

## 6.1 Архитектура Master & Child SMSS

```
[ ntoskrnl: StartFirstUserProcess ]
                │
                ▼
[ smss.exe: NtProcessStartupW -> wmain ]
    │
    ├── [ Master SMSS Mode ]
    │      ├── SmpInit()
    │      │     ├── SmpCreateSecurityDescriptors()
    │      │     ├── SmpInitializeKnownSubSystems()
    │      │     ├── SmpInitializePendingRename()
    │      │     ├── SmpLoadDataFromRegistry()
    │      │     │     ├── SmpInvokeAutoChk() -> "autocheck autochk *"
    │      │     │     ├── SmpInitializeDosDevices()
    │      │     │     ├── SmpInitializeKnownDlls()
    │      │     │     ├── SmpCreateDynamicEnvironmentVariables()
    │      │     │     └── SmpProcessFileRenames() -> PendingFileRenameOperations
    │      │     └── InitializeWow64OnBoot()
    │      │
    │      ├── SmpAsyncMemoryConfiguration()
    │      │     └── SmpCreatePagingFiles() -> pagefile.sys & swapfile.sys
    │      │
    │      ├── SmpStartCsr() / SmpCreateInitialSession()
    │      │     ├── Запуск csrss.exe (ServerDll=basesrv, winsrv)
    │      │     ├── Запуск wininit.exe (Session 0)
    │      │     └── Запуск winlogon.exe (Session 1)
    │      └── SmpReadyBootSync()
    │
    └── [ Child SMSS Mode: smss.exe -s <SessionId> ]
           └── SmscMain()
                 ├── SmscpParseArgs()
                 └── SmscpLoadSubSystemsForMuSession()
                       ├── Загрузка win32k.sys в пространство сессии
                       └── SmpExecuteImage() для подсистем
```

---

## 6.2 Декомпилированный C-код функций smss.exe

### 1. Точка входа: `SmpInit`

<FunctionCard 
  name="SmpInit"
  module="smss.exe"
  :exported="false"
  prototype="NTSTATUS SmpInit(VOID)"
  irql="Ring 3 (Native)"
  caller="wmain"
  phase="Session Manager Init"
>
Главная функция инициализации Master SMSS. Создает глобальный <Term term="ALPC">ALPC-порт \SmApiPort</Term>, читает системный реестр, конфигурирует переменные окружения, Known DLLs и запускает дочерние экземпляры SMSS для создания сессий.
</FunctionCard>

<DecompiledCode 
  name="SmpInit"
  module="smss.exe"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Главная функция Master SMSS: создание порта ALPC, файлов подкачки и запуск Session 0 / Session 1"
>

```c
NTSTATUS SmpInit()
{
  NTSTATUS status;
  NTSTATUS writeConstraintStatus;
  int constraintFlag;
  NTSTATUS (__stdcall *pfnFailedRoutine)(SYSTEM_INFORMATION_CLASS, PVOID, ULONG, PULONG);
  _BYTE *pHeapBlock;
  _BYTE *pSummaryMemBuffer;
  NTSTATUS queryStatus;
  void *pProcessHeap;
  ULONG activeNodeCount;
  ULONG nodeIndex;
  NTSTATUS openEventStatus;
  void *hVolumeSafeEvent;
  int openEventResult;
  int registryStatus;
  int pagingFileStatus;
  ULONG summaryMemReturnLength[2];
  void *hSyncEvent;
  int hardErrorMode;
  struct _OBJECT_ATTRIBUTES objAttributes;
  _QWORD portNameBuffer[2];
  int volumeEventNameLen;
  const wchar_t *pszVolumeEventName;
  _DWORD numaProcessorsMap[260];
  _DWORD alpcPortAttributes[4];
  __int64 alpcMaxMessageLen;
  __int64 alpcMaxSectionSize;

  LODWORD(portNameBuffer[0]) = 1441812;
  portNameBuffer[1] = L"\\SmApiPort";
  volumeEventNameLen = 4456514;
  pszVolumeEventName = L"\\Device\\VolumesSafeForWriteAccess";
  summaryMemReturnLength[0] = 0;
  SmpInitSaveGlobals = (__int64)&SmpInitLastCall;

  // [1] Инициализация собственного дескриптора кучи SMSS (RtlCreateTagHeap)
  SmBaseTag = RtlCreateTagHeap(
                *(HANDLE *)(*(_QWORD *)&KeGetPcr()->MajorVersion + 48LL),
                0,
                (PWSTR)L"SMSS!",
                (PWSTR)L"INIT");

  // [2] Запрос базовой информации о процессорах и памяти ядра (SystemBasicInformation)
  status = NtQuerySystemInformation(SystemBasicInformation, &SmpSystemInfo, 0x40u, nullptr);
  if ( status < 0 )
    return status;

  writeConstraintStatus = NtQuerySystemInformation(SystemSessionPoolTagInformation|0x80, &SmpSystemWriteConstraintInfo, 8u, nullptr);
  constraintFlag = SmpSystemWriteConstraintInfo;
  hardErrorMode = 1;
  if ( writeConstraintStatus < 0 )
    constraintFlag = 0;
  SmpSystemWriteConstraintInfo = constraintFlag;
  NtSetInformationProcess((HANDLE)0xFFFFFFFFFFFFFFFFLL, ProcessDefaultHardErrorMode, &hardErrorMode, 4u);

  // [3] Регистрация известных подсистем (Win32 / POSIX) в SmpKnownSubSystems
  status = SmpInitializeKnownSubSystems();
  if ( status < 0 )
  {
    SmpInitProgressByLine = 1716;
    pfnFailedRoutine = (NTSTATUS (__stdcall *)(SYSTEM_INFORMATION_CLASS, PVOID, ULONG, PULONG))SmpInitializeKnownSubSystems;
LABEL_ERROR_SAVE:
    SmpInitReturnStatus = status;
    SmpInitLastCall = (__int64)pfnFailedRoutine;
    return status;
  }

  // [4] Проверка режима производства (Manufacturing Mode)
  SmpManufacturingMode = 0;
  status = NtQuerySystemInformation(SystemSummaryMemoryInformation|0x80, nullptr, 0, summaryMemReturnLength);
  if ( status >= 0 )
    return -1073741823;

  if ( status == -1073741820 )
  {
    pHeapBlock = (_BYTE *)RtlAllocateHeap(*(PVOID *)(*(_QWORD *)&KeGetPcr()->MajorVersion + 48LL), SmBaseTag, summaryMemReturnLength[0]);
    pSummaryMemBuffer = pHeapBlock;
    if ( pHeapBlock )
    {
      queryStatus = NtQuerySystemInformation(SystemSummaryMemoryInformation|0x80, pHeapBlock, summaryMemReturnLength[0], summaryMemReturnLength);
      pProcessHeap = *(void **)(*(_QWORD *)&KeGetPcr()->MajorVersion + 48LL);
      if ( queryStatus >= 0 )
      {
        SmpManufacturingMode = *pSummaryMemBuffer & 1;
        RtlFreeHeap(pProcessHeap, 0, pSummaryMemBuffer);

        // [5] Создание дескрипторов безопасности для объектов SMSS
        status = SmpCreateSecurityDescriptors(1);
        if ( status < 0 )
        {
          SmpInitProgressByLine = 1780;
          pfnFailedRoutine = (NTSTATUS (__stdcall *)(SYSTEM_INFORMATION_CLASS, PVOID, ULONG, PULONG))SmpCreateSecurityDescriptors;
          goto LABEL_ERROR_SAVE;
        }

        // [6] Создание коммуникационного порта ALPC \SmApiPort для приема запросов от процессов
        objAttributes.Length = 48;
        objAttributes.RootDirectory = nullptr;
        objAttributes.ObjectName = (PUNICODE_STRING)portNameBuffer;
        objAttributes.Attributes = 0;
        objAttributes.SecurityDescriptor = SmpApiPortSecurityDescriptor;
        objAttributes.SecurityQualityOfService = nullptr;
        memset_0(alpcPortAttributes, 0, 0x48u);
        alpcPortAttributes[0] = 0x20000;
        alpcMaxMessageLen = 328;
        alpcMaxSectionSize = 1000000;
        status = NtAlpcCreatePort(&SmpApiConnectionPort, &objAttributes, alpcPortAttributes);
        if ( status < 0 )
        {
          pfnFailedRoutine = (NTSTATUS (__stdcall *)(SYSTEM_INFORMATION_CLASS, PVOID, ULONG, PULONG))NtAlpcCreatePort;
          SmpInitProgressByLine = 1803;
          goto LABEL_ERROR_SAVE;
        }

        // [7] Построение битовой карты NUMA-узлов системы
        SmpUniqueProcessId = LODWORD(KeGetPcr()->NtTib.Self[1].StackBase);
        SmpActiveProcessorCount = MEMORY[0x7FFE03C0];
        status = NtQuerySystemInformation(SystemNumaProcessorMap, numaProcessorsMap, 0x408u, nullptr);
        if ( status < 0 )
        {
          pfnFailedRoutine = NtQuerySystemInformation;
          SmpInitProgressByLine = 1821;
          goto LABEL_ERROR_SAVE;
        }

        SmpMaximumNodeCount = numaProcessorsMap[0] + 1;
        RtlInitializeBitMap(&SmpNodeBitmap, &SmpNodeBitmapBuffer, numaProcessorsMap[0] + 1);
        RtlClearAllBits(&SmpNodeBitmap);
        activeNodeCount = SmpMaximumNodeCount;
        for ( nodeIndex = 0; nodeIndex < activeNodeCount; ++nodeIndex )
        {
          if ( *(_QWORD *)&numaProcessorsMap[4 * nodeIndex + 2] )
          {
            RtlSetBits(&SmpNodeBitmap, nodeIndex, 1u);
            activeNodeCount = SmpMaximumNodeCount;
          }
        }

        // [8] Инициализация событий безопасного доступа к томам
        objAttributes.Length = 48;
        objAttributes.ObjectName = (PUNICODE_STRING)&volumeEventNameLen;
        objAttributes.RootDirectory = nullptr;
        objAttributes.Attributes = 64;
        objAttributes.SecurityDescriptor = nullptr;
        openEventStatus = NtOpenEvent(&hSyncEvent, 0x1F0003u, &objAttributes);
        hVolumeSafeEvent = hSyncEvent;
        openEventResult = openEventStatus;

        // [9] Инициализация блокировок известных подсистем
        RtlInitializeCriticalSection(&SmpKnownSubSysLock);

        // [10] Загрузка системных параметров из реестра Session Manager
        registryStatus = SmpGetDataFromRegistry(1);
        if ( registryStatus < 0 )
          openEventResult = 0;

        SmpPagingFileLog = RtlAllocateHeap(*(PVOID *)(*(_QWORD *)&KeGetPcr()->MajorVersion + 48LL), SmBaseTag | 8, 0x200u);
        if ( !SmpPagingFileLog )
          return -1073741801;

        // [11] Создание файлов подкачки (pagefile.sys / swapfile.sys)
        pagingFileStatus = SmpCreatePagingFiles();
        if ( pagingFileStatus < 0 )
          registryStatus = pagingFileStatus;
        if ( registryStatus < 0 )
          openEventResult = 0;

        // [12] Переход к Фазе 2: создание сессий Session 0 и Session 1
        status = SmpInitPhase2(openEventResult);
        if ( status >= 0 )
        {
          hardErrorMode = 1;
          NtSetInformationProcess((HANDLE)0xFFFFFFFFFFFFFFFFLL, ProcessDefaultHardErrorMode, &hardErrorMode, 4u);
          return 0;
        }
      }
    }
  }
  return status;
}
```

</DecompiledCode>

---

### 2. Создание файлов подкачки: `SmpCreatePagingFiles`

<FunctionCard 
  name="SmpCreatePagingFiles"
  module="smss.exe"
  :exported="false"
  prototype="char SmpCreatePagingFiles(VOID)"
  irql="Ring 3 (Native)"
  caller="SmpInit"
  phase="Virtual Memory Configuration"
>
Считывает ветку реестра `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management`, настраивает список дескрипторов файлов подкачки (`pagefile.sys`, `swapfile.sys`) и вызывает ядро для выделения виртуальной памяти.
</FunctionCard>

<DecompiledCode 
  name="SmpCreatePagingFiles"
  module="smss.exe"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Инициализация pagefile.sys, проверка краш-дампов, защита очередей через __fastfail и настройка swapfile"
>

```c
char SmpCreatePagingFiles()
{
  int buildStatus;
  __int64 saveStatus;
  int logStatus;
  signed __int32 logIndex;
  __int64 logOffset;
  PVOID *pPageEntry;
  PVOID *pCurrentDesc;
  PVOID *pTempDesc;
  PVOID *pNextDesc;
  PVOID **ppPrevDesc;
  int volDescStatus;
  __int64 adjustStatus;
  signed __int32 lowStorageIndex;
  PVOID *pDescEntry;
  char bPagefileCreated;
  int processStatus;
  int swapfileStatus;
  _OWORD existingFileList[2];
  int crashDumpState;
  __int64 swapfileDescriptor;

  crashDumpState = 0;
  existingFileList[0] = 0;

  // [1] Получение списка уже существующих файлов подкачки на доступных томах
  buildStatus = SmpBuildFilesStringFromList(&SmpExistingPageFilesList, existingFileList);
  logStatus = buildStatus;
  if ( buildStatus < 0 )
  {
    // Логирование ошибки инициализации в циклический буфер SMSS через атомарный инкремент
    logIndex = _InterlockedIncrement(&SmpPagefileLogIndex) % 32;
    logOffset = 2LL * logIndex;
    *((_DWORD *)&SmpPagefileLog + 4 * logIndex) = 2885;
LABEL_RECORD_LOG:
    *((_DWORD *)&SmpPagefileLog + 2 * logOffset + 1) = logStatus;
    *((_QWORD *)&SmpPagefileLog + logOffset + 1) = 0;
    goto LABEL_CLEANUP;
  }
  SmpSaveOldPageFiles(saveStatus, (unsigned int)buildStatus);

  // [2] Проверка файлов подкачки на наличие сохраненного аварийного дампа памяти (Crash Dump)
  for ( pPageEntry = (PVOID *)SmpExistingPageFilesList; pPageEntry != &SmpExistingPageFilesList; pPageEntry = (PVOID *)*pPageEntry )
    SmpCheckForCrashDump(pPageEntry + 2);

  crashDumpState = 2;
  NtSetSystemInformation(SystemCrashDumpStateInformation, &crashDumpState, 4u);

  // [3] Безопасная итерация по двусвязному списку дескрипторов PagingFile с проверкой целостности
  pCurrentDesc = (PVOID *)SmpPagingFileList;
  while ( pCurrentDesc != &SmpPagingFileList )
  {
    pTempDesc = pCurrentDesc;
    SmpCreatePagingFileDescriptor(pCurrentDesc + 2);
    pNextDesc = (PVOID *)*pCurrentDesc;
    pCurrentDesc = pNextDesc;

    // Аппаратная защита списка LIST_ENTRY: при повреждении указателей — немедленный fastfail
    if ( pNextDesc[1] != pTempDesc || (ppPrevDesc = (PVOID **)pTempDesc[1], *ppPrevDesc != pTempDesc) )
      __fastfail(FAST_FAIL_CORRUPT_LIST_ENTRY);

    *ppPrevDesc = pNextDesc;
    pNextDesc[1] = ppPrevDesc;
    SmpDeallocSavedRegistryEntry(pTempDesc);
  }

  // [4] Если в реестре нет дескрипторов — очистка устаревших файлов
  if ( !SmpNumberOfPagefileDescriptors && !SmpRegistrySpecifierPresent )
  {
    SmpCleanupStalePageFiles();
    goto LABEL_CLEANUP;
  }

  // [5] Считывание информации о доступном свободном месте на дисках и автоподбор размера pagefile
  volDescStatus = SmpCreateVolumeDescriptors();
  logStatus = volDescStatus;
  if ( volDescStatus < 0 )
  {
    lowStorageIndex = _InterlockedIncrement(&SmpPagefileLogIndex) % 32;
    logOffset = 2LL * lowStorageIndex;
    *((_DWORD *)&SmpPagefileLog + 4 * lowStorageIndex) = 2967;
    goto LABEL_RECORD_LOG;
  }
  SmpAdjustPagefileSizeforLowStorage(adjustStatus, (unsigned int)volDescStatus);

  // [6] Непосредственное создание файлов подкачки через системный вызов ядра NtCreatePagingFile
  pDescEntry = (PVOID *)SmpPagingFileDescriptorList;
  bPagefileCreated = 0;
  if ( SmpPagingFileDescriptorList != &SmpPagingFileDescriptorList )
  {
    do
    {
      processStatus = SmpProcessPagefileDescriptor(pDescEntry);
      pDescEntry = (PVOID *)*pDescEntry;
      if ( processStatus >= 0 )
        bPagefileCreated = 1;
    }
    while ( pDescEntry != &SmpPagingFileDescriptorList );
    if ( bPagefileCreated )
      goto LABEL_CREATE_SWAPFILE;
  }

  // [7] Если основной pagefile не создался — выделение аварийного файла подкачки (Emergency Paging File)
  if ( (int)SmpCreateEmergencyPagingFile() >= 0 )
  {
LABEL_CREATE_SWAPFILE:
    // [8] Создание специализированного файла подкачки рабочих наборов UWP-приложений (swapfile.sys)
    swapfileStatus = SmpCreateWorkingSetSwapPagingFile(&swapfileDescriptor);
    if ( swapfileStatus >= 0 || (swapfileStatus == -1073741710 && SmpNumberOfPagefilesCreated == 1) )
      SmpEnableSwapOnPagingFiles(&SmpPagingFileDescriptorList, 63);
  }

  // [9] Финализация и освобождение временных буферов из кучи процесса
  SmpCleanupStalePageFiles();
  SmpRecordCreatedPageFiles(bPagefileCreated == 0, existingFileList);

LABEL_CLEANUP:
  if ( *((_QWORD *)&existingFileList[0] + 1) )
    RtlFreeHeap(*(PVOID *)(*(_QWORD *)&KeGetPcr()->MajorVersion + 48LL), 0, *((PVOID *)&existingFileList[0] + 1));
  return bPagefileCreated;
}
```

</DecompiledCode>

---

### 3. Запуск сервера подсистемы Win32: `SmpStartCsr`

<FunctionCard 
  name="SmpStartCsr"
  module="smss.exe"
  :exported="false"
  prototype="__int64 __fastcall SmpStartCsr(__int64 a1)"
  irql="Ring 3 (Native)"
  caller="SmpCreateInitialSession"
  phase="Subsystem Spawning"
>
Выполняет непосредственное создание и запуск процесса сервера клиент-серверной подсистемы `csrss.exe`. Выделяет управляющий блок `SmpAllocateControlBlock`, форматирует командную строку (`ObjectDirectory=\Windows SharedSection=...`), создает процесс в приостановленном состоянии через `SmpExecuteCommand`, возобновляет поток (`NtResumeThread`) и ожидает сигнальное событие готовности подсистемы.
</FunctionCard>

<DecompiledCode 
  name="SmpStartCsr"
  module="smss.exe"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Аллокация Control Block, запуск csrss.exe, сохранение ProcessSessionInformation и ожидание хэндшейка готовности"
>

```c
__int64 __fastcall SmpStartCsr(struct _SMP_SUBSYSTEM_INIT_INFO *pSubSysInitInfo)
{
  unsigned int sessionId;
  __int64 pCtrlBlockRaw;
  HANDLE *pControlBlock;
  NTSTATUS ntStatus;
  int queryStatus;
  _QWORD *pSubsystemLink;
  unsigned int activeSessionCount;
  NTSTATUS waitStatus;
  PVOID pKnownSubSys;
  int processSessionId;
  struct _UNICODE_STRING usCommandLine;
  _BYTE eventInfoBuffer[4];
  int bEventSignaled;
  PVOID processAddressArray[2];
  HANDLE hWaitObjects[2];
  ULONG processCreationParams;
  HANDLE hProcess;
  HANDLE hThread;
  void *pSectionHandle;
  _BYTE stopContext[40];
  int stopReason;
  int stopSessionId;

  memset_0(&processCreationParams, 0, 0x68u);
  sessionId = *(unsigned int *)((char *)pSubSysInitInfo + 48);
  *(_OWORD *)processAddressArray = 0;

  // [1] Проверка, не был ли уже запущен CSRSS для данной начальной сессии
  if ( sessionId < SmpNumberInitialSessions )
  {
    ntStatus = SmpGetCoreProcessIds(sessionId, processAddressArray);
    *(unsigned int *)((char *)pSubSysInitInfo + 48) = *(_DWORD *)(SmpCoreProcessIds + 40LL * *(unsigned int *)((char *)pSubSysInitInfo + 48));
    if ( ntStatus >= 0 )
    {
      pKnownSubSys = processAddressArray[0];
      if ( processAddressArray[0] && *((_DWORD *)processAddressArray[0] + 6) == 2 )
        *(_QWORD *)((char *)pSubSysInitInfo + 320) = *((_QWORD *)processAddressArray[0] + 6);
      else
        ntStatus = -1073741823;
      if ( pKnownSubSys )
        SmpDereferenceKnownSubSys(pKnownSubSys);
      if ( ntStatus >= 0 )
      {
        *(PVOID *)((char *)pSubSysInitInfo + 312) = processAddressArray[1];
        return 0;
      }
      stopSessionId = *(unsigned int *)((char *)pSubSysInitInfo + 48);
      stopReason = 6;
      SmpStopCsr(stopContext, 0, 0);
      return (unsigned int)ntStatus;
    }
  }

  // [2] Синхронизация создания сессий через глобальный объект SmpSessionCreateBlockEvent
  NtWaitForSingleObject(SmpSessionCreateBlockEvent, 0, nullptr);

  // [3] Выделение структуры Control Block для регистрации нового экземпляра подсистемы в SMSS
  usCommandLine.Length = *(_WORD *)((char *)pSubSysInitInfo + 52);
  usCommandLine.MaximumLength = usCommandLine.Length;
  usCommandLine.Buffer = (PWSTR)((char *)pSubSysInitInfo + 56);
  pCtrlBlockRaw = SmpAllocateControlBlock();
  pControlBlock = (HANDLE *)pCtrlBlockRaw;
  if ( !pCtrlBlockRaw )
    return 3221225626LL;

  // [4] Формирование буфера аргументов командной строки запуска csrss.exe
  ntStatus = SmpAllocateInitialCommandBuffer(*(_QWORD *)(pCtrlBlockRaw + 24), &usCommandLine);
  if ( ntStatus >= 0 )
  {
    // [5] Создание Native-процесса csrss.exe (RtlCreateUserProcess) в приостановленном состоянии
    ntStatus = SmpExecuteCommand((int)&usCommandLine, (PRTL_USER_PROCESS_PARAMETERS)&processCreationParams);
    RtlFreeUnicodeString(&usCommandLine);
    if ( ntStatus >= 0 )
    {
      // [6] Получение SessionId созданного процесса (ProcessSessionInformation)
      queryStatus = NtQueryInformationProcess(hProcess, ProcessSessionInformation, &processSessionId, 4u, nullptr);
      ntStatus = queryStatus;
      if ( queryStatus >= 0 )
      {
        pSubsystemLink = pControlBlock[2];
        *pSubsystemLink = pControlBlock[4];
        pSubsystemLink[1] = pControlBlock[5];
        pControlBlock[6] = hProcess;
        pControlBlock[7] = pSectionHandle;
        *((_DWORD *)pControlBlock + 2) = processSessionId;

        // [7] Атомарная регистрация PID процесса в глобальном массиве SmpCoreProcessIds
        activeSessionCount = _InterlockedIncrement(&dword_140024B10);
        if ( activeSessionCount > SmpNumberInitialSessions )
          _InterlockedDecrement(&dword_140024B10);
        else
          *(_DWORD *)(SmpCoreProcessIds + 40LL * (activeSessionCount - 1)) = processSessionId;

        *((_OWORD *)pControlBlock + 4) = *(_OWORD *)pSubSysInitInfo;
        *((_OWORD *)pControlBlock + 5) = *(_OWORD *)((char *)pSubSysInitInfo + 16);
        pControlBlock[12] = *(HANDLE *)((char *)pSubSysInitInfo + 32);
        SmpRecordControlBlock(pControlBlock);

        // [8] Запуск основного потока CSRSS
        ntStatus = NtResumeThread(hThread, nullptr);
        NtClose(hThread);
        if ( ntStatus >= 0 )
        {
          // [9] Ожидание инициализации: SMSS ждет либо события готовности CSRSS, либо падения процесса
          hWaitObjects[0] = pControlBlock[6]; // hProcess
          hWaitObjects[1] = pControlBlock[4]; // hCsrReadyEvent
          waitStatus = NtWaitForMultipleObjects(2u, hWaitObjects, WaitAny, 0, nullptr);
          ntStatus = waitStatus;
          if ( waitStatus < 0 )
          {
            if ( (*(_BYTE *)pControlBlock & 1) != 0
              || (_m_prefetchw(pControlBlock), (_InterlockedOr((volatile signed __int32 *)pControlBlock, 1u) & 1) != 0) )
            {
              ntStatus = 0;
            }
          }
          else
          {
            if ( waitStatus )
              goto LABEL_HANDLE_READY;
            NtQueryEvent(pControlBlock[4], EventBasicInformation, eventInfoBuffer, 8u, nullptr);
            if ( !bEventSignaled )
            {
              if ( (*(_BYTE *)pControlBlock & 1) == 0 )
                _InterlockedOr((volatile signed __int32 *)pControlBlock, 1u);
              ntStatus = -1073741823;
LABEL_DESTROY_AND_EXIT:
              SmpDestroyControlBlock(pControlBlock);
              goto LABEL_CLEANUP_EXIT;
            }
            ntStatus = NtClearEvent(pControlBlock[4]);
          }
LABEL_HANDLE_READY:
          if ( ntStatus >= 0 )
          {
            SmpReleaseControlBlock(pControlBlock);
            return 259;
          }
          goto LABEL_DESTROY_AND_EXIT;
        }
        if ( (*(_BYTE *)pControlBlock & 1) == 0 )
          _InterlockedOr((volatile signed __int32 *)pControlBlock, 1u);
        goto LABEL_DESTROY_AND_EXIT;
      }
      // Ошибка создания процесса — аварийное завершение и закрытие дескрипторов
      NtTerminateProcess(hProcess, queryStatus);
      NtClose(hProcess);
      NtClose(hThread);
    }
  }
LABEL_CLEANUP_EXIT:
  SmpReleaseControlBlock(pControlBlock);
  return (unsigned int)ntStatus;
}
```

</DecompiledCode>

---

### 4. Точка входа дочернего SMSS: `SmscMain`

<FunctionCard 
  name="SmscMain"
  module="smss.exe"
  :exported="false"
  prototype="__int64 __fastcall SmscMain(int argc, wchar_t **argv)"
  irql="Ring 3 (Native)"
  caller="wmain"
  phase="Child Session Processing"
>
Точка входа дочернего экземпляра `smss.exe -s &lt;SessionId&gt;`. Парсит аргументы командной строки через `SmscpParseArgs`, инициализирует разделяемую память сессии, загружает графическую подсистему ядра `win32k.sys` через `SmscpLoadSubSystemsForMuSession` и запускает клиентские подсистемы сессии.
</FunctionCard>

<DecompiledCode 
  name="SmscMain"
  module="smss.exe"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Обработка аргументов сессии, настройка контекста и загрузка подсистем MultiUser Session"
>

```c
char __fastcall SmscMain(unsigned int argc, wchar_t **argv, int debugFlag)
{
  int targetDebugLevel;
  __int64 pcrMajorVersion;
  int parseStatus;
  void *hSharedWindowEvent;
  unsigned int childSessionId;
  struct _UNICODE_STRING usSessionCommand;
  char subSysInitBlock;
  LARGE_INTEGER retryInterval;

  targetDebugLevel = SmpDebug;
  if ( debugFlag )
    targetDebugLevel = debugFlag;
  SmpDefaultEnvironment = nullptr;
  pcrMajorVersion = *(_QWORD *)&KeGetPcr()->MajorVersion;
  SmpDebug = targetDebugLevel;

  // [1] Инициализация кучи дочернего экземпляра SMSS (RtlCreateTagHeap)
  RtlCreateTagHeap(*(HANDLE *)(pcrMajorVersion + 48), 0, (PWSTR)L"SMSC!", (PWSTR)L"PARS");
  RtlInitUnicodeString(&usSessionCommand, nullptr);

  // [2] Разбор аргументов командной строки (smss.exe -s <SessionId>)
  parseStatus = SmscpParseArgs(argc, (__int64)argv, &subSysInitBlock, &usSessionCommand);
  if ( parseStatus < 0 )
  {
    if ( usSessionCommand.Buffer )
      RtlFreeHeap(*(PVOID *)(*(_QWORD *)&KeGetPcr()->MajorVersion + 48LL), 0, usSessionCommand.Buffer);
  }
  else
  {
    // [3] Сигнализация родительскому процессу через Shared Window Event
    hSharedWindowEvent = *(void **)SmscpSharedWindow;
    *(_OWORD *)SmscpSharedWindow = 0;
    *(_DWORD *)SmscpSharedWindow = 0;
    NtSetEvent(hSharedWindowEvent, nullptr);

    // [4] Подключение к главному порту Master SMSS (RtlConnectToSm)
    while ( 1 )
    {
      retryInterval.QuadPart = -50000000;
      if ( (int)RtlConnectToSm(0, 0, 0, &SmpApiConnectionPort) >= 0 )
        break;
      NtDelayExecution(0, &retryInterval);
    }

    // [5] Загрузка графической подсистемы ядра win32k.sys в пространство сессии
    childSessionId = *(_DWORD *)(*(_QWORD *)&KeGetPcr()->MajorVersion + 704LL);
    SmpLoadPnPSerializeSettings();
    if ( (int)SmscpLoadSubSystemsForMuSession(childSessionId) < 0
      || (parseStatus = SmscpExecuteInitialCommand(childSessionId, &subSysInitBlock, &usSessionCommand), parseStatus < 0) )
    {
      // [6] В случае сбоя оповещение Master SMSS о критической ошибке сессии
      SmscpNotifySmOfFailure();
    }
  }
  return parseStatus;
}
```

</DecompiledCode>
