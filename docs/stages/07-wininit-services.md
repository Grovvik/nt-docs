# 7. System Initialization & Services (`wininit.exe`, `services.exe`)

Процесс инициализации (<Term term="WININIT">wininit.exe</Term>) запускается дочерним экземпляром `smss.exe` в изолированной **Сессии 0**. Он подготавливает оконную среду для фоновых процессов и запускает три демона: <Term term="SCM">SCM</Term> (`services.exe`), <Term term="LSASS">LSASS</Term> (`lsass.exe`) и `lsm.exe`.

---

## 7.1 Архитектура Сессии 0 (Session 0 Isolation)

Начиная с Windows Vista, все системные службы изолированы в **Сессии 0** без прямого доступа к экрану пользователя:

```
[ smss.exe (Session 0) ]
           │
           ▼
   [ wininit.exe ]
           │
           ├── CreateWindowStationW("WinSta0") -> Создание базовой оконной станции
           ├── CreateDesktopW("Winlogon") -> Защищенный десктоп
           │
           ├── [ 1. services.exe ] -> Service Control Manager (SCM)
           │       ├── Инициализация RPC-сервера диспетчера служб
           │       ├── Загрузка драйверов типа SERVICE_SYSTEM_START
           │       └── Запуск фоновых служб типа SERVICE_AUTO_START (RPCSS, DcomLaunch, EventLog)
           │
           ├── [ 2. lsass.exe ] -> Local Security Authority Subsystem (LSASS)
           │       ├── Инициализация базы SAM
           │       ├── Загрузка пакетов безопасности SSP/AP (Kerberos, NTLM, Schannel)
           │       └── Создание защищенных токенов доступа (Tokens / SIDs)
           │
           └── [ 3. lsm.exe ] -> Local Session Manager
                   └── Управление жизненным циклом сессий RDP и локальных терминалов
```

---

## 7.2 Декомпилированный C-код функций wininit и services

> **Целевая сборка**: Windows 10 22H2 x64 (Build `10.0.19045.2965`). Имена внутренних функций и RVA-адреса зависят от версии сборки.  
> **Конвенция вызовов (x64 ABI)**: Аннотации конвенций вызовов (`__fastcall`, `__stdcall`, `__cdecl`) воспроизводят декораторы типов декомпилятора Hex-Rays / IDA Pro. В архитектуре Windows x64 действует единый системный Microsoft x64 ABI (передача параметров через RCX, RDX, R8, R9, выделение Shadow Space).

---

### 1. Точка входа wininit.exe: `WinMain`

<FunctionCard 
  name="WinMain"
  module="wininit.exe"
  :exported="false"
  prototype="int WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)"
  irql="Ring 3 (Win32)"
  phase="Session 0 Orchestrator"
>
Главная функция `wininit.exe`. Создает оконную станцию `WinSta0`, защищенный рабочий стол `Winlogon`, регистрирует статус критического системного процесса через `RtlSetProcessIsCritical` и последовательно запускает `services.exe`, `lsass.exe` и `lsm.exe`.
</FunctionCard>

<DecompiledCode 
  name="WinMain"
  module="wininit.exe"
  callingConvention="__stdcall"
  :isExported="true"
  summary="Инициализация оконной станции WinSta0, вызов RtlSetProcessIsCritical и запуск services.exe, lsass.exe"
>

```c
int __stdcall WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)
{
  HANDLE v4; // rsi
  HANDLE EventW; // r15
  unsigned int v6; // r14d
  unsigned int v7; // edi
  __int64 v8; // rdx
  __int64 v9; // rcx
  __int64 v10; // r8
  __int64 v11; // r9
  __int64 v12; // rcx
  __int64 v13; // rdx
  DWORD LastError; // eax
  DWORD v15; // eax
  __int64 v16; // rdx
  DWORD v17; // eax
  int v18; // ecx
  int v19; // r8d
  int v20; // r9d
  __int64 v21; // rcx
  DWORD inited; // eax
  __int64 v24; // rcx
  unsigned int v25; // eax
  __int64 v26; // rcx
  __int64 v27; // rcx
  __int64 v28; // rcx
  __int64 v29; // rcx
  DWORD v30; // eax
  __int64 v31; // rdx
  __int64 v32; // rcx
  __int64 v33; // rdx
  __int64 v34; // rcx
  __int64 v35; // r8
  __int64 v36; // r9
  DWORD v37; // eax
  __int64 v38; // rdx
  __int64 v39; // rdx
  __int64 v40; // rcx
  NTSTATUS v41; // ebx
  __int64 v42; // r8
  __int64 v43; // r9
  ULONG v44; // eax
  DWORD started; // eax
  __int64 v46; // rcx
  DWORD v47; // eax
  DWORD v48; // eax
  int SystemBootStatus; // eax
  __int64 v50; // rcx
  __int64 v51; // rdx
  DWORD v52; // eax
  __int64 v53; // rdx
  __int64 v54; // r8
  __int64 v55; // r9
  __int64 v56; // rcx
  unsigned int v57; // eax
  __int64 v58; // rdx
  __int64 v59; // rcx
  DWORD SessionProcess; // [rsp+B8h] [rbp-19h] BYREF
  unsigned int v61; // [rsp+BCh] [rbp-15h] BYREF
  SHUTDOWN_ACTION Action; // [rsp+C0h] [rbp-11h] BYREF
  __int16 v63; // [rsp+C4h] [rbp-Dh] BYREF
  int v64; // [rsp+C8h] [rbp-9h] BYREF
  int v65; // [rsp+CCh] [rbp-5h] BYREF
  __int64 v66; // [rsp+D0h] [rbp-1h] BYREF
  int ProcessInformation; // [rsp+D8h] [rbp+7h] BYREF
  int SystemInformation; // [rsp+DCh] [rbp+Bh] BYREF
  int v69; // [rsp+E0h] [rbp+Fh] BYREF
  int v70; // [rsp+E4h] [rbp+13h] BYREF
  _DWORD v71[2]; // [rsp+E8h] [rbp+17h] BYREF
  _BYTE v72[8]; // [rsp+F0h] [rbp+1Fh] BYREF
  void *phNewTimer; // [rsp+F8h] [rbp+27h] BYREF
  void *v74; // [rsp+100h] [rbp+2Fh] BYREF

  phNewTimer = nullptr;
  v4 = nullptr;
  v74 = nullptr;
  EventW = nullptr;
  v66 = 0;
  v6 = 1002;
  Action = ShutdownPowerOff;
  v64 = 1;
  v61 = 8;
  v7 = 8;
  dword_140064908 = 1;
  RtlSetProcessIsCritical(1u, nullptr, 0);
  RtlSetThreadIsCritical(1u, nullptr, 0);
  ProcessInformation = 1;
  if ( NtSetInformationProcess(
         (HANDLE)0xFFFFFFFFFFFFFFFFLL,
         ProcessCycleTime|ProcessUserModeIOPL,
         &ProcessInformation,
         4u) < 0 )
    ((void (*)(void))MicrosoftTelemetryAssertTriggeredNoArgs)();
  HeapSetInformation(nullptr, HeapEnableTerminationOnCorruption, nullptr, 0);
  TraceLoggingRegisterEx_EtwEventRegister_EtwEventSetInformation(&dword_140063178);
  qword_140064290 = 0;
  WPP_REGISTRATION_GUIDS = (__int64)&WPP_ThisDir_CTLGUID_WinInit;
  *(_QWORD *)&WPP_GLOBAL_Control = &WPP_MAIN_CB;
  WPP_MAIN_CB = 0;
  qword_140064298 = 1;
  WppInitUm();
  InitializeCriticalSection(&stru_140064358);
  if ( NtQuerySystemInformation(SystemFlagsInformation, &SystemInformation, 4u, nullptr) >= 0 )
    WppStart(1u, SystemInformation & 4);
  if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
    && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
    && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
  {
    WPP_SF_(*(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL), 10, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
  }
  EtwEventRegister(&MS_Wininit_Provider, 0, 0, &g_TraceRegHandle);
  if ( (unsigned __int8)IsInitializeVAILContainerPhase1Present() )
  {
    SessionProcess = InitializeVAILContainerPhase1();
    v11 = SessionProcess;
    if ( SessionProcess )
    {
      v12 = *(_QWORD *)&WPP_GLOBAL_Control;
      if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
        && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
        && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
      {
        v13 = 11;
LABEL_15:
        WPP_SF_d(*(_QWORD *)(v12 + 16), v13, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids, v11);
LABEL_16:
        v11 = SessionProcess;
        v12 = *(_QWORD *)&WPP_GLOBAL_Control;
        goto LABEL_299;
      }
      goto LABEL_299;
    }
  }
  if ( !(unsigned __int8)IsInitializeStateSeparationPresent(v9, v8, v10, v11)
    || (SessionProcess = InitializeStateSeparation(), (v11 = SessionProcess) == 0) )
  {
    if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
    {
      WPP_SF_(*(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL), 13, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
    }
    EventW = CreateEventW(nullptr, 1, 0, L"Global\\FirstWinlogonCheck");
    if ( !EventW )
    {
      LastError = GetLastError();
      v11 = LastError;
      SessionProcess = LastError;
      v12 = *(_QWORD *)&WPP_GLOBAL_Control;
      if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
        && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0 )
      {
        v8 = 2;
        if ( *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 2u )
        {
          v13 = 14;
          goto LABEL_15;
        }
      }
      goto LABEL_299;
    }
    g_hWinlogonLogOffEvent = CreateEventW(nullptr, 1, 0, L"Global\\WinlogonLogoff");
    if ( !g_hWinlogonLogOffEvent )
    {
      v15 = GetLastError();
      v11 = v15;
      SessionProcess = v15;
      v12 = *(_QWORD *)&WPP_GLOBAL_Control;
      if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
        && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0 )
      {
        v8 = 2;
        if ( *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 2u )
        {
          v13 = 15;
          goto LABEL_15;
        }
      }
      goto LABEL_299;
    }
    if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
    {
      WPP_SF_(*(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL), 16, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
    }
    SessionProcess = UmsHlprInit();
    v11 = SessionProcess;
    if ( SessionProcess )
    {
      v12 = *(_QWORD *)&WPP_GLOBAL_Control;
      if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
        || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
        || !*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
      {
        goto LABEL_299;
      }
      v16 = 17;
      goto LABEL_46;
    }
    g_usState = 1;
    if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
    {
      WPP_SF_(*(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL), 18, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
    }
    if ( !(unsigned int)SetProcessPriority() )
    {
      if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
        && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
        && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
      {
        v17 = GetLastError();
        WPP_SF_d(
          *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
          19,
          &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
          v17);
      }
      LODWORD(v11) = 1024;
      SessionProcess = 1024;
      goto LABEL_57;
    }
    g_usState = 2;
    if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
    {
      WPP_SF_(*(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL), 20, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
    }
    inited = InitDebugHelpers();
    SessionProcess = inited;
    if ( inited )
    {
      v24 = *(_QWORD *)&WPP_GLOBAL_Control;
      if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
        || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
        || *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) < 3u )
      {
LABEL_80:
        g_usState = 3;
        if ( (bool *)v24 != &WPP_GLOBAL_Control && (*(_BYTE *)(v24 + 28) & 1) != 0 && *(_BYTE *)(v24 + 25) >= 4u )
          WPP_SF_(*(_QWORD *)(v24 + 16), 22, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
        v25 = SetMachineName();
        SessionProcess = v25;
        if ( v25 )
        {
          v26 = *(_QWORD *)&WPP_GLOBAL_Control;
          if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control )
            goto LABEL_94;
          if ( (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
            || *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) < 3u )
          {
LABEL_90:
            if ( (bool *)v26 != &WPP_GLOBAL_Control && (*(_BYTE *)(v26 + 28) & 1) != 0 && *(_BYTE *)(v26 + 25) >= 4u )
              WPP_SF_(*(_QWORD *)(v26 + 16), 24, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
LABEL_94:
            SessionProcess = WinInitBoot();
            v11 = SessionProcess;
            if ( SessionProcess )
            {
              v12 = *(_QWORD *)&WPP_GLOBAL_Control;
              if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                || !*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
              {
                goto LABEL_299;
              }
              v16 = 25;
              goto LABEL_46;
            }
            v27 = *(_QWORD *)&WPP_GLOBAL_Control;
            if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
              && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
              && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
            {
              WPP_SF_(
                *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                26,
                &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
            }
            SetProfilesLocation(v27, v8, v10, v11);
            if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
              && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
              && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
            {
              WPP_SF_(
                *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                27,
                &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
            }
            CreateWindirTemp();
            if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
              && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
              && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
            {
              WPP_SF_(
                *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                28,
                &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
            }
            SessionProcess = WMsgClntInitialize((struct WI_GLOBAL_CONTEXT *)&v66, 1);
            v11 = SessionProcess;
            if ( SessionProcess )
            {
              v12 = *(_QWORD *)&WPP_GLOBAL_Control;
              if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                || *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) < 5u )
              {
                goto LABEL_299;
              }
              v16 = 29;
              goto LABEL_46;
            }
            g_usState = 5;
            if ( (unsigned __int8)IsStartLoadingFontsWorkerPresent(v28, v8, v10, 0) )
            {
              if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
              {
                WPP_SF_(
                  *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                  30,
                  &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
              }
              SessionProcess = PrimaryTerminalAndHookWorker(
                                 &s_hWinsta,
                                 &s_hdeskWinlogon,
                                 &s_hdeskApplication,
                                 &v66,
                                 &g_usState,
                                 6,
                                 &v63,
                                 g_pSidSystem,
                                 g_pSidLocalService,
                                 g_pSidLocal,
                                 g_pSidWorld,
                                 g_pSidAdmin,
                                 g_pSidPowerUser,
                                 g_pSidCreator,
                                 g_pSidRestricted,
                                 g_pSidInteractive,
                                 g_pSidService,
                                 g_pSidWindowManager,
                                 g_pSidFontDriverHost,
                                 g_pSidAnyPackage,
                                 g_pSidAnyRestrictedPackage);
              v11 = SessionProcess;
              if ( SessionProcess )
              {
                if ( v63 == 1 )
                {
                  v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                  if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                    || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                    || !*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
                  {
                    goto LABEL_299;
                  }
                  v16 = 31;
                }
                else
                {
                  MicrosoftTelemetryAssertTriggeredNoArgs(v29, v8, v10, SessionProcess);
                  v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                  if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                    || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                    || !*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
                  {
                    v11 = SessionProcess;
                    goto LABEL_299;
                  }
                  v11 = SessionProcess;
                  v16 = 32;
                }
                goto LABEL_46;
              }
LABEL_148:
              if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
              {
                WPP_SF_(
                  *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                  35,
                  &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
              }
              SessionProcess = WinInitStartUp();
              v11 = SessionProcess;
              if ( SessionProcess )
              {
                v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                  || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                  || !*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
                {
                  goto LABEL_299;
                }
                v16 = 36;
                goto LABEL_46;
              }
              if ( g_fRunSetup )
              {
                if ( (unsigned __int8)IsSwitchDesktopPresent(v32, v8, v10, SessionProcess) )
                  ResilientSwitchDesktopWithFade(s_hdeskApplication);
                if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                  && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                  && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                {
                  WPP_SF_(
                    *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                    37,
                    &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                }
                SessionProcess = WinInitSetup(&v64, &Action);
                if ( (unsigned __int8)IsSwitchDesktopPresent(v34, v33, v35, v36) )
                  ResilientSwitchDesktopWithFade(s_hdeskWinlogon);
                v11 = SessionProcess;
                if ( SessionProcess )
                {
                  v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                  if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                    || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                    || !*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
                  {
                    goto LABEL_299;
                  }
                  v16 = 38;
                  goto LABEL_46;
                }
                g_usState = 11;
                if ( v64 == 1 )
                {
                  v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                  if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control )
                  {
LABEL_304:
                    if ( (unsigned __int8)IsStartLoadingFontsWorkerPresent(v12, v8, v10, v11)
                      && !(unsigned int)IsHeadlessConfig() )
                    {
                      WluiStartup(v59, v58, v72);
                    }
                    UIDisplayStatusMessage(v6, v58, 16);
                    if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                    {
                      WPP_SF_(
                        *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                        62,
                        &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                    }
                    WLEventWrite(&WIEvt_PreShutdownNotification_Start);
                    WinInitNotifyShutdown(v7);
                    WLEventWrite(&WIEvt_PreShutdownNotification_Stop);
                    CommitSoftReboot();
                    WMsgClntTerminate();
                    UnregisterPanicShutdownCallbacks();
                    WsdpStopShutdownServerInterfaces();
                    if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                    {
                      WPP_SF_(
                        *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                        63,
                        &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                    }
                    WinInitShutdown(Action, v7);
                    goto LABEL_62;
                  }
                  if ( (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                    || *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) < 4u )
                  {
LABEL_300:
                    if ( (bool *)v12 != &WPP_GLOBAL_Control
                      && (*(_BYTE *)(v12 + 28) & 1) != 0
                      && *(_BYTE *)(v12 + 25) >= 5u )
                    {
                      WPP_SF_(*(_QWORD *)(v12 + 16), 61, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                    }
                    goto LABEL_304;
                  }
                  WPP_SF_(
                    *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                    39,
                    &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                  goto LABEL_16;
                }
              }
              else
              {
                if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                  && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                  && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                {
                  WPP_SF_(
                    *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                    40,
                    &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                }
                v4 = CreateEventW(nullptr, 1, 0, L"Global\\UMSServicesStarted");
                SessionProcess = GetLastError();
                v11 = SessionProcess;
                if ( !v4 )
                {
                  v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                  if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                    || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                    || !*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
                  {
                    goto LABEL_299;
                  }
                  v16 = 41;
LABEL_46:
                  WPP_SF_d(*(_QWORD *)(v12 + 16), v16, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids, v11);
                  goto LABEL_16;
                }
                if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                  && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                  && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                {
                  WPP_SF_d(
                    *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                    42,
                    &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
                    SessionProcess);
                }
                if ( !SetEvent(v4) )
                {
                  v37 = GetLastError();
                  v11 = v37;
                  SessionProcess = v37;
                  v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                  if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                    && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                    && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
                  {
                    v38 = 43;
LABEL_194:
                    WPP_SF_d(*(_QWORD *)(v12 + 16), v38, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids, v11);
                    v12 = *(_QWORD *)&WPP_GLOBAL_Control;
LABEL_296:
                    v11 = SessionProcess;
                  }
LABEL_297:
                  if ( v4 )
                  {
                    CloseHandle(v4);
                    v11 = SessionProcess;
                    v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                  }
                  goto LABEL_299;
                }
              }
              if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
              {
                WPP_SF_(
                  *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                  44,
                  &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
              }
              v41 = RemoveTokenPrivileges();
              if ( v41 < 0 )
              {
                if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                  && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                  && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
                {
                  WPP_SF_d(
                    *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                    45,
                    &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
                    (unsigned int)v41);
                }
                v44 = RtlNtStatusToDosError(v41);
                v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                v11 = v44;
                SessionProcess = v44;
                goto LABEL_297;
              }
              g_usState = 12;
              if ( (unsigned __int8)IsStartLoadingFontsWorkerPresent(v40, v39, v42, v43) )
              {
                if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                  && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                  && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                {
                  WPP_SF_(
                    *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                    46,
                    &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                }
                started = StartLoadingFontsWorker();
                SessionProcess = started;
                if ( started )
                {
                  v46 = *(_QWORD *)&WPP_GLOBAL_Control;
                  if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control )
                    goto LABEL_220;
                  if ( (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                    || *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) < 2u )
                  {
LABEL_216:
                    if ( (bool *)v46 != &WPP_GLOBAL_Control
                      && (*(_BYTE *)(v46 + 28) & 1) != 0
                      && *(_BYTE *)(v46 + 25) >= 4u )
                    {
                      WPP_SF_(*(_QWORD *)(v46 + 16), 48, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                    }
LABEL_220:
                    SessionProcess = WMsgClntInitialize((struct WI_GLOBAL_CONTEXT *)&v66, 0);
                    v11 = SessionProcess;
                    if ( SessionProcess )
                    {
                      v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                      if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                        && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                        && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 5u )
                      {
                        v38 = 49;
                        goto LABEL_194;
                      }
                      goto LABEL_297;
                    }
                    g_usState = 13;
                    if ( (unsigned int)IsHeadlessConfig() )
                    {
                      if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                        && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                        && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                      {
                        WPP_SF_(
                          *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                          50,
                          &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                      }
                      UHReportBootGood();
                    }
                    if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                    {
                      WPP_SF_(
                        *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                        51,
                        &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                    }
                    SessionProcess = WsdpStartRemoteShutdown();
                    if ( SessionProcess )
                    {
                      ReportWininitEvent(2u, 0x80000BBB, 4u, &SessionProcess, 0);
                      SessionProcess = 0;
                    }
                    if ( !CreateTimerQueueTimer(&phNewTimer, nullptr, AutoCheckLogsCallback, nullptr, 0x7530u, 0, 0)
                      && *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 2) != 0
                      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 2u )
                    {
                      v47 = GetLastError();
                      WPP_SF_d(
                        *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                        52,
                        &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
                        v47);
                    }
                    if ( !CreateTimerQueueTimer(&v74, nullptr, LogAppInitDllsCallback, nullptr, 0x2710u, 0, 0)
                      && *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 2) != 0
                      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 2u )
                    {
                      v48 = GetLastError();
                      WPP_SF_d(
                        *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                        53,
                        &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
                        v48);
                    }
                    SystemBootStatus = RtlGetSystemBootStatus(17, &v65, 4);
                    if ( SystemBootStatus >= 0 )
                    {
                      if ( (v65 & 0xFFFFFFFC) != 0 )
                        goto LABEL_260;
                      if ( v65 == 1 )
                        goto LABEL_260;
                      SystemBootStatus = RtlPublishWnfStateData(WNF_FCON_PROCESS_LKG, 0, 0, 0, 0);
                      if ( SystemBootStatus >= 0 )
                        goto LABEL_260;
                      v50 = *(_QWORD *)&WPP_GLOBAL_Control;
                      if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                        || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 2) == 0
                        || *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) < 2u )
                      {
                        goto LABEL_260;
                      }
                      v51 = 55;
                    }
                    else
                    {
                      v50 = *(_QWORD *)&WPP_GLOBAL_Control;
                      if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                        || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 2) == 0
                        || *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) < 2u )
                      {
                        goto LABEL_260;
                      }
                      v51 = 54;
                    }
                    WPP_SF_d(
                      *(_QWORD *)(v50 + 16),
                      v51,
                      &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
                      (unsigned int)SystemBootStatus);
LABEL_260:
                    TraceFullShutdownInfo();
                    g_usState = 14;
                    while ( 1 )
                    {
                      if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                        && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                        && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                      {
                        WPP_SF_(
                          *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                          56,
                          &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                      }
                      v52 = WaitForSingleObject(hHandle, 0xFFFFFFFF);
                      SessionProcess = v52;
                      if ( !v52 )
                        break;
                      if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                        && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                        && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 3u )
                      {
                        WPP_SF_d(
                          *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                          57,
                          &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
                          v52);
                      }
                      Sleep(0x3E8u);
                    }
                    g_usState = 15;
                    v56 = *(_QWORD *)&WPP_GLOBAL_Control;
                    if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                      && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                      && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                    {
                      WPP_SF_(
                        *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                        58,
                        &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                    }
                    if ( (unsigned int)dword_140063178 > 4
                      && (unsigned __int8)tlgKeywordOn(&dword_140063178, 0x400000000000LL) )
                    {
                      v69 = 8;
                      _tlgWriteTemplate<long (_tlgProvider_t const *,void const *,_GUID const *,_GUID const *,unsigned int,_EVENT_DATA_DESCRIPTOR *),&long _tlgWriteTransfer_EtwEventWriteTransfer(_tlgProvider_t const *,void const *,_GUID const *,_GUID const *,unsigned int,_EVENT_DATA_DESCRIPTOR *),_GUID const *,_GUID const *>::Write<_tlgWrapperByVal<4>>(
                        v56,
                        (unsigned int)&unk_140052354,
                        v54,
                        v55,
                        (__int64)&v69);
                    }
                    if ( (unsigned __int8)IsStartLoadingFontsWorkerPresent(v56, v53, v54, v55) )
                    {
                      WLEventWrite(&WIEvt_WaitForWinstationShutdown_Start);
                      if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                        && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
                        && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 4u )
                      {
                        WPP_SF_(
                          *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                          59,
                          &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                      }
                      v57 = IsHeadlessConfig();
                      WaitForWinstationShutdown(v57, (unsigned int)g_bProceedAfterSetup);
                      WLEventWrite(&WIEvt_WaitForWinstationShutdown_Stop);
                    }
                    if ( !(unsigned int)HasShutdownBegun(&v61) )
                    {
                      v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                      if ( *(bool **)&WPP_GLOBAL_Control == &WPP_GLOBAL_Control
                        || (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) == 0
                        || *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) < 3u )
                      {
LABEL_290:
                        v7 = v61;
                        v8 = 16;
                        if ( (v61 & 0x10) != 0 )
                        {
                          Action = ShutdownNoReboot;
                        }
                        else if ( (v61 & 4) != 0 )
                        {
                          Action = ShutdownReboot;
                          v6 = (v61 & 0x400 | 0x7D800) >> 9;
                        }
                        else
                        {
                          Action = ShutdownPowerOff;
                        }
                        g_usState = 16;
                        goto LABEL_296;
                      }
                      WPP_SF_(
                        *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                        60,
                        &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids);
                    }
                    v12 = *(_QWORD *)&WPP_GLOBAL_Control;
                    goto LABEL_290;
                  }
                  WPP_SF_d(
                    *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
                    47,
                    &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
                    started);
                }
              }
              v46 = *(_QWORD *)&WPP_GLOBAL_Control;
              goto LABEL_216;
            }
            if ( (unsigned int)IsHeadlessConfig()
              || !(unsigned __int8)IsDwmpTerminateSessionProcessPresent()
              || !(unsigned int)DwmpIsInitialSessionInteractive() )
            {
              goto LABEL_148;
            }
            WLEventWrite(&WLEvt_CreatePrimaryTerminal_Start);
            if ( (unsigned int)RegisterLogonProcess(LODWORD(NtCurrentTeb()->ClientId.UniqueProcess), &v66) )
            {
              WLEventWrite(&WLEvt_CreatePrimaryTerminal_Stop);
              WLEventWrite(&WLEvt_DwmpCreateSessionProcess_Start);
              SessionProcess = DwmpCreateSessionProcess(0);
              v11 = SessionProcess;
              if ( (SessionProcess & 0x80000000) == 0 )
              {
                WLEventWrite(&WLEvt_DwmpCreateSessionProcess_Stop);
                v7 = v61;
                goto LABEL_148;
              }
              v12 = *(_QWORD *)&WPP_GLOBAL_Control;
              if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 2) != 0
                && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 2u )
              {
                v31 = 34;
                goto LABEL_140;
              }
            }
            else
            {
              v30 = GetLastError();
              v11 = v30;
              SessionProcess = v30;
              v12 = *(_QWORD *)&WPP_GLOBAL_Control;
              if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
                && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 2) != 0
                && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) >= 2u )
              {
                v31 = 33;
LABEL_140:
                WPP_SF_d(*(_QWORD *)(v12 + 16), v31, &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids, v11);
                v7 = v61;
                goto LABEL_16;
              }
            }
            v7 = v61;
            goto LABEL_299;
          }
          WPP_SF_d(
            *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
            23,
            &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
            v25);
        }
        v26 = *(_QWORD *)&WPP_GLOBAL_Control;
        goto LABEL_90;
      }
      WPP_SF_d(
        *(_QWORD *)(*(_QWORD *)&WPP_GLOBAL_Control + 16LL),
        21,
        &WPP_95ac6641d1503d3880fcbd317d357686_Traceguids,
        inited);
    }
    v24 = *(_QWORD *)&WPP_GLOBAL_Control;
    goto LABEL_80;
  }
  v12 = *(_QWORD *)&WPP_GLOBAL_Control;
  if ( *(bool **)&WPP_GLOBAL_Control != &WPP_GLOBAL_Control
    && (*(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 28LL) & 1) != 0
    && *(_BYTE *)(*(_QWORD *)&WPP_GLOBAL_Control + 25LL) )
  {
    v13 = 12;
    goto LABEL_15;
  }
LABEL_299:
  if ( !(_DWORD)v11 )
    goto LABEL_300;
LABEL_57:
  if ( g_usState >= 8u )
  {
    v71[0] = v11;
    v71[1] = g_usState;
    ReportWininitEvent(1u, 0xC0000BBA, 8u, v71, 0);
  }
  if ( (unsigned int)dword_140063178 > 4 && (unsigned __int8)tlgKeywordOn(&dword_140063178, 0x400000000000LL) )
  {
    v70 = v20;
    _tlgWriteTemplate<long (_tlgProvider_t const *,void const *,_GUID const *,_GUID const *,unsigned int,_EVENT_DATA_DESCRIPTOR *),&long _tlgWriteTransfer_EtwEventWriteTransfer(_tlgProvider_t const *,void const *,_GUID const *,_GUID const *,unsigned int,_EVENT_DATA_DESCRIPTOR *),_GUID const *,_GUID const *>::Write<_tlgWrapperByVal<4>>(
      v18,
      (unsigned int)&unk_14005232B,
      v19,
      v20,
      (__int64)&v70);
  }
LABEL_62:
  if ( EventW )
    CloseHandle(EventW);
  DeleteCriticalSection(&stru_140064358);
  if ( (unsigned __int8)IsDwmpTerminateSessionProcessPresent() && (unsigned int)DwmpIsInitialSessionInteractive() )
  {
    WLEventWrite(&WLEvt_DwmpTerminateSessionProcess_Start);
    DwmpTerminateSessionProcess(0);
    WLEventWrite(&WLEvt_DwmpTerminateSessionProcess_Stop);
  }
  if ( g_TraceRegHandle )
  {
    ((void (*)(void))EtwEventUnregister)();
    g_TraceRegHandle = 0;
  }
  WppCleanupUm();
  v21 = qword_140063198;
  qword_140063198 = 0;
  dword_140063178 = 0;
  EtwEventUnregister(v21);
  return SessionProcess;
}
```

</DecompiledCode>

---

### 2. Диспетчер служб: `SvcctrlMain` / `wmain` (`services.exe`)

<FunctionCard 
  name="SvcctrlMain"
  module="services.exe"
  :exported="false"
  prototype="void __fastcall SvcctrlMain(void)"
  irql="Ring 3 (Win32)"
  caller="wmain"
  phase="Service Control Manager"
>
Главная функция Service Control Manager (<Term term="SCM">SCM</Term>), вызываемая из `wmain`. Инициализирует базу данных служб `ScInitDatabase`, создает глобальный объект SCM `ScCreateScManagerObject`, поднимает RPC-интерфейс `ScEnableRpcInterface` (`\RPC Control\ntsvcs`), запускает UMDF-драйверы `InitWudfDriverManager`, настраивает события автозапуска `ScCreateAutoStartEvents` и инициирует запуск служб через `ScAutoStartServices`.
</FunctionCard>

<DecompiledCode 
  name="SvcctrlMain"
  module="services.exe"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Инициализация базы данных служб SCM, создание объектов синхронизации, включение RPC-сервера и старт автозапуска"
>

```c
void __fastcall SvcctrlMain()
{
  const unsigned __int16 *pszSessionName;
  const unsigned __int16 *pszLogPath;
  const unsigned __int16 *pszTraceGuid;
  const unsigned __int16 *pszTraceFile;
  struct _RTL_SRWLOCK *pSrwLock;
  unsigned __int16 uiLangId;
  DWORD dwPathLen;
  DWORD dwAllocLen;
  wchar_t *pszServicesExePath;
  PRPC_ASYNC_STATE pAsyncState;
  __int64 traceId;
  struct _RTL_SRWLOCK *pLockCleanup;
  DWORD dwLsassPathLen;
  DWORD dwLsassAllocLen;
  wchar_t *pszLsassExePath;
  int sidStatus;
  void **ppEventOut;
  void **ppEventIn;
  PRPC_ASYNC_STATE pErrAsync;
  __int64 errTraceId;
  unsigned int regReserved;
  unsigned int regStatus;
  DWORD dwLastError;
  NTSTATUS ntStatus;
  bool bModeValid;
  unsigned int regOpt;
  int bMfgMode;
  unsigned int mfgKeyStatus;
  unsigned int regKeyDisp;
  unsigned int regKeyDisp2;
  NTSTATUS ntCloseStatus;
  NTSTATUS ntCloseStatus2;
  NTSTATUS ntCloseStatus3;
  unsigned int domainInfoStatus;
  LSTATUS regQueryStatus;
  int safeBootMode;
  __int64 safeBootKeyOffset;
  int safeBootSubkeyLen;
  unsigned __int16 *pSafeBootDst;
  __int64 safeBootLimit;
  unsigned __int16 safeBootChar;
  unsigned __int16 *pSafeBootEnd;
  unsigned __int16 *pSafeBootSubDst;
  __int64 safeBootSubLimit;
  unsigned __int16 safeBootSubChar;
  unsigned __int16 safeBootSubChar2;
  unsigned __int16 *pSafeBootSubEnd;
  unsigned __int64 safeBootRemaining;
  unsigned __int16 *pSafeBootAppend;
  unsigned __int64 safeBootMaxRemaining;
  char *pSafeBootSlash;
  unsigned __int16 safeBootSlashChar;
  unsigned __int16 *pSafeBootFinal;
  struct _RTL_SRWLOCK *pExtLock;
  void **ppExtFunctions;
  DWORD dwCurrentPid;
  DWORD dwCtrlHandlerErr;
  struct _RTL_SRWLOCK *pExtLock2;
  PRPC_ASYNC_STATE pWppFinal;
  DWORD dwShutdownParamErr;
  unsigned int extInitStatus;
  ULONGLONG dwWudfStartTick;
  unsigned int wudfStatus;
  unsigned int dwWudfResult;
  ULONGLONG dwWudfEndTick;
  int tlgEventFlags;
  DWORD dwEventErr;
  WCHAR szPathBuffer[2];
  BYTE regBuffer[4];
  int mfgModeValue;
  int bSetupInProgress;
  void *pDatabaseLockContext;
  int processInfoFlag;
  int bProcessMitigationActive;
  DWORD dwRegDataSize;
  unsigned int dwWudfErrorCode;
  int processPriorityClass;
  int wnfStateData;
  DWORD dwTracingDataSize;
  PVOID pStoppedDriversString;
  HKEY hTracingKey;
  HKEY hSafeBootKey;
  void *hKnownDllsEvent;
  DWORD regDataType;
  ULONGLONG dwWudfDuration;
  HANDLE hStartEvent;
  int knownDllsNameLen;
  const wchar_t *pszKnownDllsEventName;
  _BYTE lockStorage1[16];
  _BYTE lockStorage2[16];
  _BYTE lockStorage3[16];
  _BYTE lockStorage4[16];
  struct _OBJECT_ATTRIBUTES objAttr;
  struct _EVENT_DATA_DESCRIPTOR eventDescriptors;
  int *pMitigationFlag;
  __int64 mitigationDataSize;

  processPriorityClass = 9;
  pDatabaseLockContext = nullptr;
  bSetupInProgress = 0;
  mfgModeValue = 0;
  knownDllsNameLen = 4456514;
  pszKnownDllsEventName = L"\\KnownDlls\\SmKnownDllsInitialized";
  processInfoFlag = 1;

  // [1] Настройка приоритетов, политик выполнения и защиты от повреждения кучи
  if ( NtSetInformationProcess(
         (HANDLE)0xFFFFFFFFFFFFFFFFLL,
         ProcessCycleTime|ProcessUserModeIOPL,
         &processInfoFlag,
         4u) < 0
    || ScSetProcessMitigationOptions() )
  {
    goto LABEL_ERROR_EXIT;
  }
  g_ScRunState = 0;
  SetUnhandledExceptionFilter(ScUnhandledExceptionFilter);
  SetErrorMode(1u);

  // [2] Защита критического системного процесса: падение services.exe вызывает BSOD CRITICAL_PROCESS_DIED
  RtlSetProcessIsCritical(1u, nullptr, 1u);
  HeapSetInformation(nullptr, HeapEnableTerminationOnCorruption, nullptr, 0);

  // [3] Инициализация трейсинга ETW, журнала событий SCM и расширений безопасности
  ScStartTracingSession(pszSessionName, pszLogPath, pszTraceGuid, pszTraceFile);
  ScWriteLogHeader();
  ScInitEventLogging();
  CSRWLock::CSRWLock((CSRWLock *)lockStorage2, pSrwLock, 0);
  g_pScExtFunctionPointers = (void **)ScExtInitialize();
  CSRWLock::~CSRWLock((CSRWLock *)lockStorage2);

  // [4] Определение системного языка интерфейса
  uiLangId = ScGetThreadUILanguage();
  g_SystemLanguageId = uiLangId;
  if ( WPP_GLOBAL_Control != (PRPC_ASYNC_STATE)&WPP_GLOBAL_Control && (BYTE4(WPP_GLOBAL_Control->UserInfo) & 4) != 0 )
    WPP_SF_D(WPP_GLOBAL_Control->StubInfo, 15, &WPP_d0f2ebdd636530c29e8eaa8986e5d9c4_Traceguids, uiLangId);

  // [5] Открытие токена процесса и сброс неиспользуемых привилегий (Token Sandboxing)
  if ( NtOpenProcessToken((HANDLE)0xFFFFFFFFFFFFFFFFLL, 0x2Au, &g_hProcessToken) < 0 || ScRemoveProcessPrivileges() )
    goto LABEL_ERROR_EXIT;

  ScReadSCMConfiguration();
  if ( g_GlobalProcessAffinityMask
    && NtSetInformationProcess((HANDLE)0xFFFFFFFFFFFFFFFFLL, ProcessAffinityMask, &g_GlobalProcessAffinityMask, 8u) < 0
    && WPP_GLOBAL_Control != (PRPC_ASYNC_STATE)&WPP_GLOBAL_Control
    && (BYTE4(WPP_GLOBAL_Control->UserInfo) & 1) != 0 )
  {
    WPP_SF_iD(WPP_GLOBAL_Control->StubInfo);
  }

  // [6] Настройка сетевых протоколов и LRPC интерфейса SCM
  ScInitTcpKeepAlive();
  ScInitLRPCSenderProcessOpenAPI();

  // [7] Получение и аллокация путей к services.exe и lsass.exe в системной куче
  dwPathLen = ExpandEnvironmentStringsW(L"%SystemRoot%\\system32\\services.exe", szPathBuffer, 1u);
  dwAllocLen = dwPathLen;
  if ( dwPathLen > 1 )
  {
    pszServicesExePath = (wchar_t *)RtlAllocateHeap(NtCurrentPeb()->ProcessHeap, 8u, 2LL * dwPathLen);
    ScGlobalThisExePath = pszServicesExePath;
    if ( !pszServicesExePath )
      goto LABEL_ERROR_EXIT;
    ExpandEnvironmentStringsW(L"%SystemRoot%\\system32\\services.exe", pszServicesExePath, dwAllocLen);
  }

  dwLsassPathLen = ExpandEnvironmentStringsW(L"%SystemRoot%\\system32\\lsass.exe", szPathBuffer, 1u);
  dwLsassAllocLen = dwLsassPathLen;
  if ( dwLsassPathLen > 1 )
  {
    pszLsassExePath = (wchar_t *)RtlAllocateHeap(NtCurrentPeb()->ProcessHeap, 8u, 2LL * dwLsassPathLen);
    ScGlobalSecurityExePath = pszLsassExePath;
    if ( !pszLsassExePath )
      goto LABEL_ERROR_EXIT;
    ExpandEnvironmentStringsW(L"%SystemRoot%\\system32\\lsass.exe", pszLsassExePath, dwLsassAllocLen);
  }

  // [8] Создание общеизвестных SID (LocalSystem, NetworkService, LocalService)
  sidStatus = ScCreateWellKnownSids();
  if ( sidStatus < 0 )
    goto LABEL_ERROR_EXIT;

  g_ScRunState |= 2u;
  if ( g_StateSeparationEnabled && ScOpenCachedHandlesToPersistentRoots() )
    goto LABEL_ERROR_EXIT;

  // [9] Создание событий готовности пула автозапуска (AutoStart Events)
  sidStatus = ScCreateAutoStartEvents(ppEventIn, ppEventOut);
  if ( sidStatus )
    goto LABEL_ERROR_EXIT;

  // [10] Инициализация событий NetworkProvider
  regStatus = ScRegOpenKeyExW(
          HKEY_LOCAL_MACHINE,
          L"System\\CurrentControlSet\\Control\\NetworkProvider\\Order",
          regReserved,
          0xF003Fu,
          (HKEY *)&g_hProviderKey);
  if ( !regStatus )
  {
    g_hProviderEvent = CreateEventW(nullptr, 1, 0, nullptr);
    if ( !g_hProviderEvent )
    {
      ntStatus = NtClose(g_hProviderKey);
      RtlNtStatusToDosError(ntStatus);
      g_hProviderKey = nullptr;
    }
  }

  // [11] Получение глобального сигнального события старта SCM
  if ( !(unsigned int)ScGetStartEvent(&hStartEvent) )
    goto LABEL_ERROR_EXIT;

  g_ScRunState |= 1u;

  // [12] Создание именованного объекта Service Control Manager (\RPC Control\ntsvcs)
  if ( ScCreateScManagerObject() )
    goto LABEL_ERROR_EXIT;

  g_ScRunState |= 4u;
  RtlGetNtProductType(&ScGlobalProductType);
  ScCheckLastKnownGood();
  ScGetComputerName();

  // [13] Инициализация пула потоков диспетчера служб (Custom Thread Pool)
  if ( !(unsigned int)ScInitThreadPool() )
    goto LABEL_ERROR_EXIT;

  // [14] Построение внутренней базы данных служб из реестра (CurrentControlSet\Services)
  if ( !(unsigned int)ScInitDatabase() )
    goto LABEL_ERROR_EXIT;

  g_ScRunState |= 0x40u;
  ScAccountDomain.Buffer = nullptr;
  domainInfoStatus = ScGetAccountDomainInfo();
  if ( domainInfoStatus )
    goto LABEL_ERROR_EXIT;

  ScInitServiceProcessChannel();
  g_ScRunState |= 8u;
  CWorkItemContext::s_hNeverSignaled = CreateEventW(nullptr, 0, 0, nullptr);

  // [15] Проверка режима SafeBoot (минимальный, сетевой или восстановление каталога)
  if ( !RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"system\\currentcontrolset\\control\\safeboot\\option", 0, 0x20019u, &hSafeBootKey) )
  {
    dwRegDataSize = 4;
    regQueryStatus = RegQueryValueExW(hSafeBootKey, L"OptionValue", nullptr, nullptr, &g_SafeBootEnabled, &dwRegDataSize);
    safeBootMode = *(_DWORD *)&g_SafeBootEnabled;
    if ( regQueryStatus )
      safeBootMode = 0;
    *(_DWORD *)&g_SafeBootEnabled = safeBootMode;
    RegCloseKey(hSafeBootKey);
  }

  ScServiceChangeStateEvent = CreateEventW(nullptr, 1, 0, nullptr);
  g_ScRunState |= 0x10u;

  // [16] Блокировка базы данных на время инициализации и подъем RPC сервера
  sidStatus = ScLockDatabase(1, L"ServicesActive", &pDatabaseLockContext);
  if ( sidStatus )
    goto LABEL_ERROR_EXIT;

  sidStatus = ScEnableRpcInterface();
  if ( sidStatus )
    goto LABEL_ERROR_EXIT;

  g_ScRunState |= 0x20u;
  SetConsoleCtrlHandler(ScShutdownNotificationRoutine, 1);
  SetProcessShutdownParameters(0x1E0u, 1u);

  // [17] Запуск менеджера драйверов пользовательского режима (UMDF Driver Manager)
  ScUpdateServiceSidCache(nullptr, 1);
  ScCheckAutostartEventsEnabled();
  dwWudfStartTick = GetTickCount64();
  wudfStatus = InitWudfDriverManager();
  dwWudfResult = wudfStatus;
  dwWudfEndTick = GetTickCount64();

  g_ScRunState |= 0x200u;

  // [18] Ожидание инициализации KnownDlls подсистемы ядра
  objAttr.ObjectName = (PUNICODE_STRING)&knownDllsNameLen;
  objAttr.RootDirectory = nullptr;
  objAttr.Length = 48;
  objAttr.Attributes = 64;
  *(_OWORD *)&objAttr.SecurityDescriptor = 0;
  if ( NtOpenEvent(&hKnownDllsEvent, 0x1F0003u, &objAttr) >= 0 )
  {
    NtWaitForSingleObject(hKnownDllsEvent, 0, nullptr);
    NtClose(hKnownDllsEvent);
  }

  ScCryptoSpecializeIfRequired();

  // [19] Сигнализация о создании SCM (hStartEvent) для wininit.exe и ядра
  SetEvent(hStartEvent);
  g_ScRunState |= 0x80u;

  // [20] Запуск пула всех системных служб автозапуска (AUTO_START)
  sidStatus = ScAutoStartServices(&bSetupInProgress);
  if ( !sidStatus )
  {
    g_ScRunState |= 0x100u;
    ScInitDelayStart(0);
    ScRegisterUnregisterTCPEndpoint(1u, 1u);

    // Очистка и протоколирование остановленных драйверов
    if ( ScStoppedDrivers )
    {
      pStoppedDriversString = nullptr;
      ScMakeStoppedDriversOneString((unsigned __int16 **)&pStoppedDriversString);
      if ( pStoppedDriversString )
        ScLogEvent(0x1Au);
      RtlFreeHeap(NtCurrentPeb()->ProcessHeap, 0, pStoppedDriversString);
      ScDestroyStoppedDriverList();
    }

    ScInitializeServiceHealthTelemetryTimers();
    ScInitializeMemoryTelemetryTimer();

    // [21] Разблокировка базы данных служб и переход в штатный режим работы
    ScUnlockDatabase(&pDatabaseLockContext);
    NtSetInformationProcess((HANDLE)0xFFFFFFFFFFFFFFFFLL, ProcessBasePriority, &processPriorityClass, 4u);

    // [22] Публикация состояния автозапуска WNF_SCM_AUTOSTART_STATE (3 = Полностью завершено)
    wnfStateData = 3;
    RtlPublishWnfStateData(WNF_SCM_AUTOSTART_STATE, 0, &wnfStateData, 4, 0);
    NtSetEvent(g_hAutoStartEvent, nullptr);
    ScStillInitializing = 0;
    ScRunAcceptBootPgm();

    // Главный поток SCM завершается, оставляя активными рабочие RPC-потоки
    ExitThread(0);
  }

LABEL_ERROR_EXIT:
  ScStillInitializing = 0;
  ScEndServiceAccount();
  TearDownWudfDriverManager();
  if ( pDatabaseLockContext )
    ScUnlockDatabase(&pDatabaseLockContext);
  CSRWLock::CSRWLock((CSRWLock *)lockStorage4, pLockCleanup, 1u);
  if ( g_pScExtFunctionPointers )
    ((void (__fastcall *)(_QWORD))g_pScExtFunctionPointers[13])(0);
  CSRWLock::~CSRWLock((CSRWLock *)lockStorage4);
  TerminateProcess((HANDLE)0xFFFFFFFFFFFFFFFFLL, 0);
}
```

</DecompiledCode>

---

### 3. Автозапуск системных служб: `ScAutoStartServices` (`services.exe`)

<FunctionCard 
  name="ScAutoStartServices"
  module="services.exe"
  :exported="false"
  prototype="unsigned int __fastcall ScAutoStartServices(int *pIsSetupInProgress)"
  irql="Ring 3 (Win32)"
  caller="SvcctrlMain"
  phase="Service Spawning"
>
Выполняет упорядоченный запуск всех служб с типом запуска `SERVICE_AUTO_START` с учетом групп порядка загрузки (Service Group Order) и зависимостей между службами.
</FunctionCard>

<DecompiledCode 
  name="ScAutoStartServices"
  module="services.exe"
  callingConvention="__fastcall"
  :isExported="false"
  summary="Построение списка автозапускаемых служб, сортировка по зависимостям и последовательный запуск"
>

```c
__int64 __fastcall ScAutoStartServices(int *pIsSetupInProgress)
{
  ULONGLONG dwStartTick;
  unsigned int startStatus;
  unsigned int resultStatus;
  __int64 pServiceDb;
  unsigned int regKeyIndex;
  HANDLE hAllowStartKey;
  ULONGLONG dwPhase1Duration;
  ULONGLONG dwTotalDuration;
  unsigned int regOpenStatus;
  NTSTATUS ntCloseStatus;
  DWORD dwLastError;
  unsigned int earlyServiceIndex;
  unsigned __int16 **ppEarlyServiceName;
  unsigned int earlyStartResult;
  unsigned int trustedInstallerResult;
  DWORD dwWaitResult;
  int wnfState;
  HANDLE hAllowStart;
  struct CServiceRecord *pServiceRec;
  HANDLE hServicingDoneEvent;
  HANDLE hTrustedInstallerProcess;
  _QWORD autoStartServiceList[3];
  ULONGLONG phase1Elapsed;
  ULONGLONG totalElapsed;
  _QWORD earlyServiceNames[2];
  struct _EVENT_DATA_DESCRIPTOR eventDescPhase1;
  ULONGLONG *pPhase1Duration;
  __int64 phase1DescSize;
  struct _EVENT_DATA_DESCRIPTOR eventDescTotal;
  ULONGLONG *pTotalDuration;
  __int64 totalDescSize;
  struct _EVENT_DATA_DESCRIPTOR eventDescStart;

  autoStartServiceList[0] = autoStartServiceList;
  hAllowStart = nullptr;
  autoStartServiceList[1] = autoStartServiceList;
  autoStartServiceList[2] = 0;

  // [1] Уведомление о старте фазы автозапуска служб через ETW и WNF
  ScAutoStartInProgress = 1;
  ScLogStatusChange(nullptr, &SCMEvt_Autostart_Start, nullptr);
  ScLogStatusChange(nullptr, &SCMEvt_PerfCriticalAutostart_Start, nullptr);
  wnfState = 1; // SCM_AUTOSTART_STATE = InProgress
  RtlPublishWnfStateData(WNF_SCM_AUTOSTART_STATE, 0, &wnfState, 4, 0);
  dwStartTick = GetTickCount64();

  // [2] Первоочередной запуск критических базовых служб PnP и Power
  ScStartServiceByName(L"PlugPlay", nullptr);
  ScStartServiceByName(L"Power", nullptr);
  if ( g_hProviderEvent )
    ScHandleProviderChange(g_hProviderEvent, 0);

  // [3] Синхронизация состояния загрузочных драйверов BOOT_START и SYSTEM_START
  ScGetBootAndSystemDriverState();
  pServiceRec = nullptr;
  *pIsSetupInProgress = SetupInProgress(nullptr);
  Microsoft::WRL::ComPtr<CServiceRecord>::InternalRelease(&pServiceRec);

  // [4] Запуск служб ранней стадии загрузки (Staged Boot Services)
  startStatus = ScStartStagedBootServices();
  resultStatus = startStatus;
  if ( !startStatus )
  {
    _InterlockedExchange((volatile __int32 *)&g_dwRunningAutostartLoop, 1);
    _InterlockedExchange((volatile __int32 *)&g_dwRunningAutostartPhase1Loop, 1);

    // [5] Проверка ключа Setup\\AllowStart в режиме установки Windows
    if ( (unsigned int)SetupInProgress(nullptr) )
    {
      regOpenStatus = ScRegOpenKeyExW(HKEY_LOCAL_MACHINE, L"System\\Setup\\AllowStart", regKeyIndex, 0x20019u, (HKEY *)&hAllowStart);
      hAllowStartKey = hAllowStart;
      resultStatus = regOpenStatus;
      if ( regOpenStatus )
        hAllowStartKey = nullptr;
      hAllowStart = hAllowStartKey;
    }
    else
    {
      hAllowStartKey = hAllowStart;
    }

    // [6] Построение упорядоченного списка автозапускаемых служб из базы данных SCM
    CServiceDatabase::GetAutoStartServices(pServiceDb, autoStartServiceList, hAllowStartKey);
    if ( hAllowStart )
    {
      ntCloseStatus = NtClose(hAllowStart);
      RtlNtStatusToDosError(ntCloseStatus);
    }

    // [7] Запуск пула ранних служб (FontCache, CoreMessagingRegistrar, TrustedInstaller)
    ScStartEarlySetOfServices(autoStartServiceList);
    if ( (unsigned int)ScIsPrimitiveServicingRunLevelRequested() )
    {
      hServicingDoneEvent = CreateEventW(nullptr, 1, 0, L"Global\\SC_BOOT_SERVICING_DONE");
      if ( hServicingDoneEvent )
      {
        earlyServiceIndex = 0;
        earlyServiceNames[0] = L"FontCache";
        ppEarlyServiceName = (unsigned __int16 **)earlyServiceNames;
        earlyServiceNames[1] = L"CoreMessagingRegistrar";
        do
        {
          ScStartServiceByName(*ppEarlyServiceName, nullptr);
          ++earlyServiceIndex;
          ++ppEarlyServiceName;
        }
        while ( earlyServiceIndex < 2 );

        trustedInstallerResult = ScStartServiceByName(L"TrustedInstaller", &hTrustedInstallerProcess);
        if ( !trustedInstallerResult && hTrustedInstallerProcess )
        {
          // Ожидание завершения обслуживания базового образа
          WaitForMultipleObjects(2u, &hServicingDoneEvent, 0, 0xFFFFFFFF);
          CloseHandle(hTrustedInstallerProcess);
        }
        resultStatus = 0;
        CloseHandle(hServicingDoneEvent);
      }
    }

    // [8] Инициализация Resource Manager (RM) и триггеров запуска служб (Service Triggers)
    ScmInitializeRMSupport();
    ScRegisterServicesForTriggerAction(4u); // Регистрация триггеров устройств/сетей

    // [9] Завершение Фазы 1 автозапуска: публикация WNF и установка события g_hAutoStartPhase1Event
    wnfState = 2; // Фаза 1 завершена
    RtlPublishWnfStateData(WNF_SCM_AUTOSTART_STATE, 0, &wnfState, 4, 0);
    dwPhase1Duration = GetTickCount64();

    NtSetEvent(g_hAutoStartPhase1Event, nullptr);
    _InterlockedExchange((volatile __int32 *)&g_dwRunningAutostartPhase1Loop, 0);

    // [10] Запуск Фазы 2 автозапуска (остальные службы, Medic, регистрация смены времени)
    ScRegisterServicesForTriggerAction(2u);
    ScRegisterSystemTimeChangedNotification();
    ScStartMedic();
    ScStartPhase2Services(autoStartServiceList);
    _InterlockedExchange((volatile __int32 *)&g_dwRunningAutostartLoop, 0);

    // [11] Фиксация завершения автозапуска служб
    ScLogStatusChange(nullptr, &SCMEvt_Autostart_Stop, nullptr);
    ScAutoStartInProgress = 0;
    dwTotalDuration = GetTickCount64();
  }

  // Очистка списка служб
  utl::list<Microsoft::WRL::ComPtr<CServiceRecord>,utl::allocator<Microsoft::WRL::ComPtr<CServiceRecord>>>::clear(autoStartServiceList);
  return resultStatus;
}
```

</DecompiledCode>
