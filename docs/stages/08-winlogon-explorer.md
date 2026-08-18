# 8. User Session & Shell (`winlogon.exe`, `userinit.exe`, `explorer.exe`)

Финальный этап загрузки Windows это создание интерактивной сессии пользователя (Сессия 1+), аутентификация через <Term term="LSASS">LSASS</Term>, загрузка профиля и запуск графической оболочки <Term term="EXPLORER">explorer.exe</Term>.

---

## 8.1 Архитектурный pipeline входа в систему

```
[ smss.exe (Session 1) ]
           │
           ▼
   [ winlogon.exe ]
           ├── Инициализация десктопов Winlogon (экран входа) и Default (рабочий стол)
           ├── Запуск LogonUI.exe -> Credential Providers (Пароль, PIN, Windows Hello)
           │      │
           │      ▼ (Аутентификация через LSASS / LsaLogonUser)
           │
           ├── Загрузка профиля пользователя (NTUSER.DAT -> HKEY_CURRENT_USER)
           │
           └── Запуск процесса Userinit (из реестра: Userinit = "userinit.exe,")
                     │
                     ▼
             [ userinit.exe ]
                      ├── Выполнение логон-скриптов и групповых политик (<Term term="GPO">GPO</Term>)
                      ├── Восстановление сетевых дисков
                      │
                      └── Запуск оболочки Shell (реестр: Shell = "explorer.exe")
                                │
                                ▼
                        [ explorer.exe ]
                                ├── Создание класса окна "Shell_TrayWnd" (Панель задач)
                                ├── Создание окна "Progman" (Рабочий стол)
                                ├── Регистрация системного трея и меню Пуск
                                └── Запуск приложений автозагрузки (Run / Startup)
```

---

## 8.2 Декомпилированный C-код функций Winlogon, Userinit и Explorer

### 1. Диспетчер входа: `WinMain` (`winlogon.exe`)

<FunctionCard 
  name="WinMain"
  module="winlogon.exe"
  :exported="true"
  prototype="int WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)"
  irql="Ring 3 (Win32)"
  phase="Logon Session Orchestrator"
>
Главная функция `winlogon.exe`. Создает оконные станции, защищенный десктоп входа, перехватывает комбинацию <Term term="SAS">SAS (Ctrl+Alt+Del)</Term>, стартует `LogonUI.exe` и после успешного входа передает управление `userinit.exe`.
</FunctionCard>

<DecompiledCode 
  name="WinMain"
  module="winlogon.exe"
  callingConvention="__stdcall"
  :isExported="true"
  summary="Инициализация оконной среды Сессии 1, запуск LogonUI.exe и старт userinit.exe после аутентификации"
>

```c
int __stdcall WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)
{
  int bSetupModeResult;
  int bCanShowUi;
  int bSetupErrorOccurred;
  int bMultipleSessionsSupported;
  unsigned int dwFatalErrorCode;
  void (*pfnWilFailureCallback)(bool, const struct wil::FailureInfo *);
  wil *pWilContext;
  DWORD dwInitStatus;
  CSession *pWppSession;
  __int64 wppTraceId;
  DWORD dwLastError;
  unsigned int dwJobMgrStatus;
  int bRunSetupMode;
  int bMiniNtMode;
  const char *szExecuteSetupStr;
  const char *szWinPEModeStr;
  const char *szRunSetupStr;
  unsigned int dwDebugStatus;
  CMachine *pMachineContext;
  CSession *pSessionContext;
  LSTATUS lRegStatus;
  int bAllowPrimaryTerminal;
  CSession *pTargetSession;
  unsigned int dwBootShellStatus;
  __int64 privAdjustFlag;
  NTSTATUS ntShutdownStatus;
  CSession *pDwmSession;
  int dwDwmProcessStatus;
  __int64 wppErrorTraceId;
  HANDLE hUmsStartedEvent;
  __int64 wppUmsTraceId;
  int bUILangStatus;
  int bPrivilegeStatus;
  NTSTATUS ntPrivStatus;
  unsigned int dwAccessStatus;
  unsigned int dwLogonUiStatus;
  CMachine *pMachineReg1;
  CMachine *pMachineReg2;
  CMachine *pMachineReg3;
  unsigned int dwInformStatus;
  unsigned int dwBootTimerElapsed;
  CSession *pConsoleSession;
  const WCHAR *pszErrorTitle;
  const WCHAR *pszErrorMessage;
  const WCHAR *pszAllocatedMsg;
  unsigned int dwStageCleanup;
  unsigned int dwAccessShutdownStatus;
  void *pJobWaitHandle;
  unsigned __int16 *pszShutdownReason;
  __int64 hEtwReg1;
  __int64 hEtwReg2;
  unsigned __int8 hiberbootFlag;
  int dwDwmTerminateStatus;
  __int64 hEtwUnreg1;
  __int64 hEtwUnreg2;
  unsigned int dwTerminalInitResult;
  _BYTE privilegeBuffer[4];
  int bSetupShouldShutdown;
  _BYTE dwmResultBuffer[4];
  unsigned int dwShutdownFlags;
  enum _SHUTDOWN_ACTION shutdownAction;
  unsigned int dwInitiateShutdownFlags;
  int bSetupFailedFlag;
  int shutdownReasonCode;
  int dwDwmTerminateErrorCode;
  DWORD dwRegDataSize;
  BYTE regAnimationBuffer[4];
  unsigned int dwSkipAnimation;
  unsigned int dwEnableAnimation;
  unsigned int dwPolicyAnimation;
  int dwFinalStatus;
  int bShowUiFlag;
  HKEY hWinlogonRegKey;
  unsigned int sysFlagsInfo;
  DWORD regDataType;
  BYTE regSessionCountData[4];
  int traceEventParam1;
  int traceEventParam2;
  int dwDwmCreateErrorCode;
  int dwLanguageVerifyResult;
  DWORD dwPrivilegeError;
  DWORD dwRegQuerySize;
  unsigned int dwMessageResult;
  int processCycleInfo;
  HKEY hSessionManagerKey;
  HKEY hAnimationKey;
  const WCHAR *pszTitleCleanup;
  const WCHAR *pszMessageCleanup;
  struct _FILETIME ftBootStartTime;
  struct _FILETIME ftCurrentBootTime;
  int bOOBEState;
  int dwSessionIdLocal;
  int dwSessionIndex;
  int dwSessionIdCopy;
  __int128 namedEscapeArg;
  _QWORD powerCallbackEntry[3];
  HDESK hSplashScreenDesktop;
  __int128 etwGuid1;
  __int128 etwGuid2;
  _QWORD traceDescriptor1[2];
  _QWORD traceDescriptor2[2];

  dwTerminalInitResult = 0;
  g_WinlogonStage = 1;
  dwShutdownFlags = 1;
  bSetupModeResult = 0;
  bSetupShouldShutdown = 0;
  bCanShowUi = 1;
  bShowUiFlag = 1;
  shutdownAction = ShutdownReboot;
  shutdownReasonCode = 3;
  bSetupErrorOccurred = 0;
  bSetupFailedFlag = 0;
  bMultipleSessionsSupported = 1;
  dwFatalErrorCode = -1073737819;
  memset_0(&xGlobalContext, 0, 0x458u);
  ftBootStartTime = 0;
  ftCurrentBootTime = 0;

  // [1] Фиксация времени запуска и установка параметров процесса winlogon.exe
  GetSystemTimeAsFileTime(&ftBootStartTime);
  processCycleInfo = 1;
  NtSetInformationProcess((HANDLE)0xFFFFFFFFFFFFFFFFLL, ProcessCycleTime|ProcessUserModeIOPL, &processCycleInfo, 4u);
  InitializeCriticalSection(&stru_1400C8C98);
  HeapSetInformation(nullptr, HeapEnableTerminationOnCorruption, nullptr, 0);
  SetErrorMode(1u);

  // [2] Инициализация трейсинга WPP и регистрация провайдеров событий ETW
  WPP_GLOBAL_Control = (CSession *)&WPP_MAIN_CB;
  WppInitUm();
  g_WinlogonStage = 2;
  etwGuid1 = *((_OWORD *)off_1400C3760 - 1);
  if ( !(unsigned int)EtwEventRegister(&etwGuid1, tlgEnableCallback, &dword_1400C3758, &qword_1400C3778) )
    EtwEventSetInformation(qword_1400C3778, 2, off_1400C3760, *(unsigned __int16 *)off_1400C3760);
  etwGuid2 = *((_OWORD *)off_1400C36D0 - 1);
  if ( !(unsigned int)EtwEventRegister(&etwGuid2, tlgEnableCallback, &dword_1400C36C8, &qword_1400C36E8) )
    EtwEventSetInformation(qword_1400C36E8, 2, off_1400C36D0, *(unsigned __int16 *)off_1400C36D0);

  EtwEventRegister(&MS_Winlogon_Provider, 0, 0, &g_TraceRegHandle);
  McGenEventRegister_EtwEventRegister();

  // [3] Инициализация подсистем UMS Helper, WlNotificationClient и установка приоритета
  dwInitStatus = UmsHlprInit();
  if ( dwInitStatus )
    goto LABEL_ERROR_HANDLER;

  g_WinlogonStage = 3;
  dwInitStatus = WlNotificationClientInit();
  if ( dwInitStatus )
    goto LABEL_ERROR_HANDLER;

  g_WinlogonStage = 4;
  if ( !(unsigned int)SetProcessPriority() )
  {
    dwInitStatus = 1024;
    goto LABEL_ERROR_HANDLER;
  }

  g_WinlogonStage = 5;
  dwJobMgrStatus = JobManagerInitialize();
  if ( dwJobMgrStatus )
  {
    dwInitStatus = 1034;
    goto LABEL_ERROR_HANDLER;
  }

  g_WinlogonStage = 6;
  FixAdvapiHKEYCache();

  // [4] Инициализация глобального контекста сессии Winlogon
  g_WinlogonStage = 7;
  dwInitStatus = InitializeData((struct _WLSM_GLOBAL_CONTEXT *)&xGlobalContext);
  if ( dwInitStatus )
    goto LABEL_ERROR_HANDLER;

  g_WinlogonStage = 8;
  // Проверка запуска в режиме установки Windows (Windows Setup / WinPE / OOBE)
  if ( *((_DWORD *)qword_1400C8FE0 + 43) )
  {
    g_fExecuteSetup = ShouldSetupExecute();
    bMiniNtMode = IsMiniNTMode();
    g_fWinPEMode = bMiniNtMode;
  }

  // [5] Конфигурация имени машины, каталогов профилей и базовых переменных среды
  pMachineContext = qword_1400C8FD8;
  CMachine::FetchMachineName(pMachineContext);
  SetProfilesLocation();
  SetupBasicEnvironment(nullptr);
  AsyncLogoffSupportInit();

  dwInitStatus = WMsgClntInitialize((struct _WLSM_GLOBAL_CONTEXT *)&xGlobalContext, 1);
  if ( dwInitStatus )
    goto LABEL_ERROR_HANDLER;

  // [6] Создание интерактивной оконной станции WinSta0 и десктопов Winlogon / Default
  g_WinlogonStage = 12;
  if ( (unsigned __int8)IsCreateWindowStationWPresent() )
  {
    WLEventWrite(&WLEvt_CreatePrimaryTerminal_Start);
    pSessionContext = qword_1400C8FE0;
    bAllowPrimaryTerminal = 1;
    dwTerminalInitResult = CSession::CreatePrimaryTerminal(pSessionContext, (struct _LUID *)(xGlobalContext + 196LL), bAllowPrimaryTerminal);
    WLEventWrite(&WLEvt_CreatePrimaryTerminal_Stop);
    dwInitStatus = dwTerminalInitResult;
    if ( dwTerminalInitResult )
      goto LABEL_ERROR_HANDLER;
  }

  // [7] Загрузка пользовательских системных параметров и шрифтов
  g_WinlogonStage = 13;
  if ( (unsigned __int8)IsLoadLocalFontsPresent() )
    UpdatePerUserSystemParameters(0);

  // [8] Инициализация DWM (Desktop Window Manager) в пространстве сессии
  if ( (unsigned __int8)IsDwmpNotifyUserLogoffPresent() && (unsigned int)CSession::IsDwmRequiredInSession(pDwmSession) )
  {
    WLEventWrite(&WLEvt_DwmpCreateSessionProcess_Start);
    dwDwmProcessStatus = DwmpCreateSessionProcess(0);
    dwDwmCreateErrorCode = dwDwmProcessStatus;
    WLEventWrite(&WLEvt_DwmpCreateSessionProcess_Stop);
  }

  // [9] Сброс лишних привилегий процесса winlogon для изоляции Ring 3
  g_WinlogonStage = 18;
  bPrivilegeStatus = RemoveTokenPrivileges();
  if ( bPrivilegeStatus >= 0 )
  {
    g_WinlogonStage = 19;
    ntPrivStatus = RemoveCriticalPrivileges(xGlobalContext + 72LL);

    // [10] Инициализация специальных возможностей (Accessibility) на экране входа
    g_WinlogonStage = 20;
    WlAccessibilityOnBoot((struct _WLSM_GLOBAL_CONTEXT *)&xGlobalContext);

    // [11] Запуск интерфейса учетных данных LogonUI.exe
    g_WinlogonStage = 21;
    WLEventWrite(&WLEvt_StartLogonUI_Start);
    dwTerminalInitResult = StartLogonUI((struct _WLSM_GLOBAL_CONTEXT *)&xGlobalContext);
    WLEventWrite(&WLEvt_StartLogonUI_Stop);
    dwInitStatus = dwTerminalInitResult;
    if ( !dwTerminalInitResult )
    {
      // [12] Инициализация конечного автомата сеанса пользователя Winlogon State Machine
      g_WinlogonStage = 22;
      dwInitStatus = WlStateMachineInitialize();
      if ( !dwInitStatus )
      {
        g_WinlogonStage = 23;
        WMsgClntInitialize((struct _WLSM_GLOBAL_CONTEXT *)&xGlobalContext, 0);

        g_WinlogonStage = 24;
        if ( (unsigned __int8)IsLoadLocalFontsPresent() )
          StartLoadingFonts();

        g_WinlogonStage = 25;
        ToInitialize();

        // Регистрация на события пробуждения экрана и блокировки
        g_WinlogonStage = 26;
        powerCallbackEntry[0] = PowerSettingLockConsoleOnWakeCallback;
        powerCallbackEntry[1] = 0;
        PowerSettingRegisterNotification(&GUID_LOCK_CONSOLE_ON_WAKE, 2u, powerCallbackEntry, &g_hPowerNotification);

        // [13] Запуск главного цикла конечного автомата (StateMachineRun):
        // Ожидание ввода пароля/PIN через LogonUI -> Аутентификация LSASS -> Запуск userinit.exe
        g_WinlogonStage = 27;
        WLEventWrite(&WLEvt_RunStateMachine_Start);
        dwBootTimerElapsed = Timer::ElapsedULONG((Timer *)&ftBootStartTime);
        WinSqmSetDWORD(0, 6405, dwBootTimerElapsed);

        dwTerminalInitResult = StateMachineRun(qword_1400C8CC0, &xGlobalContext, &dwShutdownFlags);
        WLEventWrite(&WLEvt_RunStateMachine_Stop);
        dwInitStatus = dwTerminalInitResult;
        if ( !dwTerminalInitResult )
          g_WinlogonStage = 28;
      }
    }
  }

LABEL_ERROR_HANDLER:
  // [14] Очистка ресурсов, десктопов и завершение работы Winlogon при выходе/выключении
  RecordLastLogoffEndTime();
  if ( g_hPowerNotification )
    PowerSettingUnregisterNotification(g_hPowerNotification);

  if ( g_WinlogonStage >= 0x17 && qword_1400C8CC0 )
    StateMachineDestroy(&qword_1400C8CC0);

  if ( g_WinlogonStage >= 8 )
    CleanupData((struct _WLSM_GLOBAL_CONTEXT *)&xGlobalContext);

  if ( (unsigned __int8)IsDwmpNotifyUserLogoffPresent() )
  {
    WLEventWrite(&WLEvt_DwmpTerminateSessionProcess_Start);
    dwDwmTerminateStatus = DwmpTerminateSessionProcess(0);
    WLEventWrite(&WLEvt_DwmpTerminateSessionProcess_Stop);
  }

  DeleteCriticalSection(&stru_1400C8C98);
  if ( g_TraceRegHandle )
  {
    EtwEventUnregister(g_TraceRegHandle);
    g_TraceRegHandle = 0;
  }
  McGenEventUnregister_EtwEventUnregister();
  WppCleanupUm();

  return dwTerminalInitResult;
}
```

</DecompiledCode>

---

### 2. Инициализатор пользователя: `WinMain` / `ExecProcesses` (`userinit.exe`)

<FunctionCard 
  name="WinMain"
  module="userinit.exe"
  :exported="true"
  prototype="int __stdcall WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)"
  irql="Ring 3 (Win32)"
  caller="winlogon.exe"
  phase="User Environment Setup"
>
Главная функция `userinit.exe`. Выполняет логон-скрипты через `RunLogonScript`, настраивает переменные окружения, считывает значение `Shell` из `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon` и через `ExecProcesses` / `ExecApplication` запускает графическую оболочку `explorer.exe`, после чего процесс `userinit.exe` завершается.
</FunctionCard>

<DecompiledCode 
  name="WinMain"
  module="userinit.exe"
  callingConvention="__stdcall"
  :isExported="true"
  summary="Выполнение логон-скриптов (RunLogonScript), чтение реестра Shell и запуск explorer.exe (ExecProcesses)"
>

```c
int __stdcall WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)
{
  HMODULE hImmModule;
  ULONG64 *pWppControlBlock;
  const GUID **ppGuidIterator;
  const GUID *pCurrentGuid;
  void *pszLogonServer;
  void *pszLogonScript;
  __int16 *pMprScriptRaw;
  __int16 *pszMprLogonScript;
  __int16 *pScanHead;
  __int16 *pScanTail;
  __int16 charCode;
  __int16 *pDelimiter;
  unsigned int bSyncLogon;
  HANDLE hCurrentThread;
  int dwActiveConsoleId;
  struct _PEB *pCurrentPeb;
  HANDLE hAliasThread;
  void *hThreadWait;
  _QWORD *pWppCleanup;
  TRACEHANDLE hTraceSession;
  int shellExecStatus;
  BYTE quotaPolicyData[4];
  DWORD dwQuotaDataSize;
  DWORD dwQuotaType;
  HKEY hPolicyKey;
  DWORD dwAliasThreadId;
  struct _TRACE_GUID_REGISTRATION traceRegistration;
  wchar_t szProquotaPath[56];

  hPolicyKey = nullptr;
  hImmModule = nullptr;

  // [1] Инициализация трейсинга WPP и защита кучи от повреждения
  pWppControlBlock = (ULONG64 *)&WPP_MAIN_CB;
  WPP_REGISTRATION_GUIDS = (__int64)&WPP_ThisDir_CTLGUID_Userinit;
  WPP_GLOBAL_Control = &WPP_MAIN_CB;
  ppGuidIterator = (const GUID **)&WPP_REGISTRATION_GUIDS;
  WPP_MAIN_CB = 0;
  do
  {
    pCurrentGuid = *ppGuidIterator;
    traceRegistration.Guid = pCurrentGuid;
    ++ppGuidIterator;
    traceRegistration.RegHandle = nullptr;
    pWppControlBlock[4] = (ULONG64)pCurrentGuid;
    RegisterTraceGuidsW(WppControlCallback, pWppControlBlock, pCurrentGuid, 1u, &traceRegistration, nullptr, nullptr, pWppControlBlock + 1);
    pWppControlBlock = (ULONG64 *)*pWppControlBlock;
  }
  while ( pWppControlBlock );

  HeapSetInformation(nullptr, HeapEnableTerminationOnCorruption, nullptr, 0);

  // [2] Чтение параметров сценариев входа из переменных среды
  pszLogonServer = (void *)AllocAndGetEnvironmentVariable(L"UserInitLogonServer");
  pszLogonScript = (void *)AllocAndGetEnvironmentVariable(L"UserInitLogonScript");
  pMprScriptRaw = (__int16 *)AllocAndGetEnvironmentVariable(L"UserInitMprLogonScript");
  pszMprLogonScript = pMprScriptRaw;

  // Очистка и нормализация разделителей скриптов входа
  if ( pMprScriptRaw )
  {
    pScanHead = pMprScriptRaw;
    pScanTail = pMprScriptRaw;
    charCode = *pMprScriptRaw;
    if ( charCode )
    {
      do
      {
        pDelimiter = pScanHead;
        if ( charCode == 44 && *++pScanHead != 44 )
        {
          pScanHead = pDelimiter;
          *pDelimiter = 0;
        }
        if ( pScanHead != pScanTail )
          *pScanTail = *pScanHead;
        ++pScanHead;
        ++pScanTail;
        charCode = *pScanHead;
      }
      while ( *pScanHead );
      if ( pScanTail != pScanHead )
        *pScanTail = 0;
    }
  }

  // [3] Удаление временных переменных окружения входа
  SetEnvironmentVariableW(L"UserInitLogonServer", nullptr);
  SetEnvironmentVariableW(L"UserInitLogonScript", nullptr);
  SetEnvironmentVariableW(L"UserInitMprLogonScript", nullptr);

  // [4] Синхронизация раскладки клавиатуры и создание ключа сеанса оболочки
  bSyncLogon = RunLogonScriptSync();
  if ( (unsigned __int8)IsImmWorkerPresent() )
    SetupHotKeyForKeyboardLayout();
  if ( (unsigned __int8)IsImmWorkerPresent() && (unsigned int)ProcessTermSrvIniFiles(pszMprLogonScript) == 1 )
    bSyncLogon = 1;
  if ( (unsigned __int8)IsImmWorkerPresent() )
    CreateExplorerSessionKey();

  // [5] Выполнение пользовательских логон-скриптов и старт графической оболочки (explorer.exe)
  if ( bSyncLogon )
  {
    // Синхронный режим: сначала скрипты, затем оболочка
    SetEnvironmentVariableW(L"SEE_MASK_NOZONECHECKS", L"1");
    RunLogonScript(pszLogonServer, pszLogonScript, bSyncLogon, 1);
    RunMprLogonScripts((__int64)pszMprLogonScript);
    shellExecStatus = StartTheShell();
  }
  else
  {
    // Асинхронный режим: параллельный запуск оболочки и скриптов
    shellExecStatus = StartTheShell();
    SetEnvironmentVariableW(L"SEE_MASK_NOZONECHECKS", L"1");
    RunLogonScript(pszLogonServer, pszLogonScript, 0, 1);
    RunMprLogonScripts((__int64)pszMprLogonScript);
  }

  LocalFree(pszLogonServer);
  LocalFree(pszLogonScript);
  LocalFree(pszMprLogonScript);

  // [6] Понижение приоритета фонового завершения userinit.exe
  hCurrentThread = GetCurrentThread();
  SetThreadPriority(hCurrentThread, -2);

  // [7] Фоновая регистрация почтовых псевдонимов и загрузка удаленных шрифтов
  if ( (unsigned __int8)IsImmWorkerPresent() )
  {
    dwActiveConsoleId = RtlGetActiveConsoleId();
    pCurrentPeb = NtCurrentPeb();
    LOBYTE(pCurrentPeb) = dwActiveConsoleId == pCurrentPeb->SessionId;
    LoadRemoteFontsAndInitMiscWorker(hInstance, pCurrentPeb);
  }

  hAliasThread = CreateThread(nullptr, 0, AddToMessageAlias, &shellExecStatus, 0, &dwAliasThreadId);
  hThreadWait = hAliasThread;
  if ( hAliasThread )
  {
    WaitForSingleObject(hAliasThread, 0x493E0u);
    CloseHandle(hThreadWait);
  }

  // [8] Проверка квот дискового пространства профиля (proquota.exe)
  if ( !RegOpenKeyExW(
          HKEY_CURRENT_USER,
          L"Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
          0,
          0x20019u,
          &hPolicyKey) )
  {
    *(_DWORD *)quotaPolicyData = 0;
    dwQuotaDataSize = 4;
    if ( !RegQueryValueExW(hPolicyKey, L"EnableProfileQuota", nullptr, &dwQuotaType, quotaPolicyData, &dwQuotaDataSize)
      && dwQuotaType == 4
      && *(_DWORD *)quotaPolicyData )
    {
      StringCchCopyW(szProquotaPath, 0x32u, L"proquota.exe");
      ExecApplication(szProquotaPath, 1, 0);
    }
    RegCloseKey(hPolicyKey);
  }

  if ( hImmModule )
    FreeLibrary(hImmModule);

  // [9] Очистка провайдеров трейсинга и завершение процесса userinit.exe
  pWppCleanup = WPP_GLOBAL_Control;
  if ( WPP_GLOBAL_Control != (_UNKNOWN *)&WPP_GLOBAL_Control )
  {
    while ( pWppCleanup )
    {
      hTraceSession = pWppCleanup[1];
      if ( hTraceSession )
      {
        UnregisterTraceGuids(hTraceSession);
        pWppCleanup[1] = 0;
      }
      pWppCleanup = (_QWORD *)*pWppCleanup;
    }
    WPP_GLOBAL_Control = &WPP_GLOBAL_Control;
  }

  return 0;
}
```

</DecompiledCode>

---

### 3. Оболочка Windows: `WinMain` (`explorer.exe`)

<FunctionCard 
  name="WinMain"
  module="explorer.exe"
  :exported="true"
  prototype="int WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPWSTR lpCmdLine, int nCmdShow)"
  irql="Ring 3 (Win32)"
  phase="Desktop & Shell Initialization"
>
Главная точка входа графической оболочки Windows. Регистрирует системные оконные классы `Shell_TrayWnd` (Панель задач) и `Progman` (Рабочий стол), поднимает трей, системные меню и запускает программы автозагрузки.
</FunctionCard>

<DecompiledCode 
  name="WinMain"
  module="explorer.exe"
  callingConvention="__stdcall"
  :isExported="true"
  summary="Создание окон Панели задач (Shell_TrayWnd), Рабочего стола (Progman) и запуск автозагрузки"
>

```c
int __stdcall WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPWSTR lpCmdLine, int nCmdShow)
{
  HANDLE hCurrentProcess;
  const WCHAR *pszCmdLine;
  LPWSTR pszArgs;
  unsigned int serverModeType;
  int setModeStatus;
  HANDLE hSingleInstanceMutex;
  HANDLE hProcessForPriority;
  int comInitStatus;
  const WCHAR *pszRawCmdLine;
  unsigned __int16 *pszParsedArgs;
  int *pGlobalOptionEntry;
  int startupIdListFlag;
  LPVOID pLauncherInstance;
  int isElevatedProcess;
  const struct _tlgProvider_t *pLoggingProvider;
  int oleInitResult;
  bool bRestartRegistered;
  char bSkipFullInit;
  int elevationCheckResult;
  int isElevationEnabled;
  int bShouldRunUnelevated;
  bool bOobeColorSelected;
  HWINEVENTHOOK hWinEventHook;
  HINSTANCE hDesktopAndTray;
  HANDLE hMutexToRelease;
  LPVOID pDesktopHostCreator;
  const WCHAR *pszCmdLineFree;
  unsigned __int16 *pszArgsFree;
  CTray *pTrayContext;
  int dwServerInitOptions;
  int startupTraceRecorded[2];
  LPVOID pAppResolver;
  PVOID pVectoredHandler;
  SHELLEXECUTEINFOW shellExecInfo;
  struct tagMSG winMsg;
  LPITEMIDLIST pidlList[2];
  __int128 hostGuid;
  _QWORD bootActivity[6];
  __int64 activityContext;
  ULONG_PTR watermarkData[40];
  LPVOID colorPreference[2];
  HANDLE hInitMutex[2];
  int globalOpt1;
  __int64 globalOpt2;
  int globalOpt3;
  __int64 globalOpt4;
  _QWORD globalOptionsEnd[2];

  // [1] Инициализация провайдеров ETW и WPP трейсинга проводника
  WPP_GLOBAL_Control = &WPP_MAIN_CB;
  WppInitUm();
  McGenEventRegister_EventRegister(
    &Microsoft_Windows_Shell_Core_Provider,
    0,
    &Microsoft_Windows_Shell_Core_Provider_Context,
    &Microsoft_Windows_Shell_Core_Provider_Context);
  McGenEventRegister_EventRegister(
    &MICROSOFT_TWINAPI_PUBLISHER,
    0,
    &MICROSOFT_TWINAPI_PUBLISHER_Context,
    &MICROSOFT_TWINAPI_PUBLISHER_Context);

  // [2] Настройка идентификатора AppUserModelID и параметров процесса оболочки
  SetCurrentProcessExplicitAppUserModelID(L"Microsoft.Windows.Explorer");
  SetErrorMode(0x4001u);
  _set_error_mode(1);
  hCurrentProcess = GetCurrentProcess();
  SetPriorityClass(hCurrentProcess, 0x80u); // HIGH_PRIORITY_CLASS
  EnableMouseInPointer(0);
  g_hinstCabinet = hInstance;
  Cabinet_InitGlobalMetrics(0, 0);

  RegCreateKeyExW(
    HKEY_CURRENT_USER,
    L"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer",
    0,
    nullptr,
    0,
    0x2000000u,
    nullptr,
    &g_hkeyExplorer,
    nullptr);

  // [3] Разбор параметров командной строки и определение режима запуска
  hInitMutex[0] = nullptr;
  pszCmdLine = GetCommandLineW();
  pszArgs = PathGetArgsW(pszCmdLine);
  ExplorerServerConfiguration::Create(colorPreference, pszArgs, hInitMutex);
  serverModeType = HIDWORD(colorPreference[0]);

  // [4] Проверка режима сервера оболочки (Первичный рабочий стол против вторичного окна)
  if ( serverModeType == 3 ) // Primary Shell Server Mode
  {
    startupTraceRecorded[0] = 0;
    // Проверка UAC elevation: при необходимости перезапуск проводника в режиме без прав админа
    if ( !ExplorerServerConfiguration::GetSkipUACCheck((ExplorerServerConfiguration *)colorPreference) )
    {
      SHIsCurrentAppElevated(startupTraceRecorded);
      if ( startupTraceRecorded[0] )
      {
        startupTraceRecorded[0] = 0;
        CheckElevationEnabled(startupTraceRecorded);
        if ( startupTraceRecorded[0]
          && !(unsigned int)SHIsCurrentAccountBuiltInAdmin()
          && (int)RunExplorerUnelevated((const struct ExplorerServerConfiguration *)colorPreference) >= 0 )
        {
          ExitProcess(2u);
        }
      }
    }

    // [5] Инициализация COM и OLE в главном потоке (STA)
    SHCoInitialize();
    oleInitResult = OleInitialize(nullptr);
    bRestartRegistered = 0;

    // [6] Настройка цветов, шрифтов интерфейса и метрик высокого разрешения (DPI)
    colorPreference[0] = nullptr;
    CImmersiveColorImpl::GetColorPreferenceImpl((struct IMMERSIVE_COLOR_PREFERENCE *)colorPreference, 0, 1);
    bOobeColorSelected = CheckOobeColorSelection();
    CheckDefaultUIFonts();
    ChangeUIfontsToNewDPI();
    CheckForServerAdminUI();
    CheckHighContrast();
    EnableDpiScaledPadding(1);
    hWinEventHook = SetWinEventHook(0x20u, 0x20u, nullptr, CheckHighContrastAfterDesktopSwitch, 0, 0, 0);

    // [7] Запуск фоновых задач входа и создание системных директорий
    RunAllLogonTasks();
    CreateShellDirectories();
    CreateLanguageProfileIfMissing();
    WriteCleanShutdown(0);

    // [8] Создание панели задач (Shell_TrayWnd) и рабочего стола (Progman)
    hDesktopAndTray = (HINSTANCE)CreateDesktopAndTray();
    CImmersiveWatermark::CImmersiveWatermark((CImmersiveWatermark *)watermarkData);
    CImmersiveWatermark::Initialize(watermarkData);

    if ( hInitMutex[0] )
    {
      ReleaseMutex(hInitMutex[0]);
      CloseHandle(hInitMutex[0]);
    }

    // [9] Вход в главный цикл сообщений рабочего стола
    if ( hDesktopAndTray )
    {
      PostMessageW(v_hwndTray, 0x590u, 1u, 0);
      EnsureTabletButtonThreadRunningIfNeeded();

      // [10] Запуск SHDesktopMessageLoop для обработки оконных сообщений, трея и горячих клавиш
      SHDesktopMessageLoop(hDesktopAndTray);
      SHCloseDesktopHandle(hDesktopAndTray, nullptr, nullptr, 0);
      WriteCleanShutdown(1);
    }

    // [11] Очистка при завершении работы оболочки
    CImmersiveWatermark::Finalize((ULONG_PTR)watermarkData);
    if ( oleInitResult >= 0 )
      OleUninitialize();
    CoUninitialize();
    ShellDDEInit(0);
    UnhookWinEvent(hWinEventHook);
  }
  else
  {
    // Запуск вторичного экземпляра проводника (открытие нового окна папки)
    if ( hInitMutex[0] )
    {
      ReleaseMutex(hInitMutex[0]);
      CloseHandle(hInitMutex[0]);
    }
    hProcessForPriority = GetCurrentProcess();
    SetPriorityClass(hProcessForPriority, 0x20u); // NORMAL_PRIORITY_CLASS

    pLauncherInstance = nullptr;
    if ( CoCreateInstance(&CLSID_ExplorerLauncher, nullptr, 1u, &GUID_9b25c299_03b6_4a14_827d_095485d0c022, &pLauncherInstance) >= 0 )
    {
      shellExecInfo.cbSize = 104;
      GetStartupInfoW((LPSTARTUPINFOW)&shellExecInfo);
      (*(void (__fastcall **)(LPVOID, GUID *, LPITEMIDLIST, _QWORD, _QWORD, int, _QWORD, _QWORD, _QWORD))(*(_QWORD *)pLauncherInstance + 24LL))(
        pLauncherInstance,
        &CLSID_SeparateMultipleProcessExplorerHost,
        pidlList[0],
        0,
        0,
        10,
        0,
        0,
        0);
      Microsoft::WRL::ComPtr<IAssociationElement>::InternalRelease((IUnknown **)&pLauncherInstance);
    }
  }

  pszCmdLineFree = GetCommandLineW();
  pszArgsFree = PathGetArgsW(pszCmdLineFree);
  FreeSharedMemInCmdLine(pszArgsFree);
  CTray::Cleanup(pTrayContext);
  McGenEventUnregister_EventUnregister(&Microsoft_Windows_Shell_Core_Provider_Context);
  McGenEventUnregister_EventUnregister(&MICROSOFT_TWINAPI_PUBLISHER_Context);
  WppCleanupUm();

  if ( g_fExitExplorer )
  {
    if ( GetModuleHandleW(L"dui70") )
      SkipDLLUnloadInitChecks();
    ExitProcess(1u);
  }
  return 1;
}
```

</DecompiledCode>

---

## 8.3 Итог: Система полностью загружена

С момента подачи питания до появления рабочего стола управление было последовательно передано по цепочке:

$$\text{UEFI Firmware} \longrightarrow \text{bootmgfw.efi} \longrightarrow \text{winload.efi} \longrightarrow \text{ntoskrnl.exe} \longrightarrow \text{smss.exe} \longrightarrow \text{wininit.exe} \longrightarrow \text{winlogon.exe} \longrightarrow \text{explorer.exe}$$

Вы можете изучить:
- **[Интерактивный глоссарий всех терминов ядра](/glossary/)**
- **[Низкоуровневые структуры данных (KPCR, KPRCB, IRP, VAD)](/reference/structures)**
- **[Сквозная архитектурная карта cold-boot загрузки](/stages/01-firmware-uefi-mbr#_1-1-сквозная-архитектурная-карта-cold-boot-загрузки-uefi-x64)**
