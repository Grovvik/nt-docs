# 4. Kernel Phase 0 Initialization (`ntoskrnl.exe`)

Фаза 0 инициализации ядра — фундаментальный этап старта ОС, выполняемый на загрузочном процессоре (BSP) при заблокированных прерываниях (<Term term="IRQL">IRQL HIGH_LEVEL</Term>).

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
  prototype="NTSTATUS KiSystemStartup(PLOADER_PARAMETER_BLOCK LoaderBlock)"
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
NTSTATUS __stdcall __noreturn KiSystemStartup(PDRIVER_OBJECT DriverObject, PUNICODE_STRING RegistryPath)
{
  unsigned int *v2; // r10
  unsigned __int64 v4; // r8
  unsigned __int64 v5; // r8
  unsigned __int64 v6; // r8
  unsigned __int64 v7; // r8
  __int64 v8; // r8
  unsigned __int64 v10; // rdx
  void *v11; // rsp
  __int64 v12; // rcx
  __int64 v13; // rdx
  unsigned __int64 v14; // r8
  __int64 v15; // rdx
  __int64 v16; // r8
  __int64 v17; // r9
  unsigned __int64 v18; // rax
  __int64 v19; // rax
  struct _KTHREAD *CurrentThread; // rcx
  bool v21; // zf

  // Сохранение указателя на LOADER_PARAMETER_BLOCK
  KeLoaderBlock_0 = (__int64)DriverObject;
  if ( !*((_DWORD *)DriverObject->MajorFunction[3] + 9) )
    KdInitSystem(0xFFFFFFFFLL, KeLoaderBlock_0);

  // Считывание и сохранение управляющих регистров процессора
  v2 = *(unsigned int **)(KeLoaderBlock_0 + 136);
  _RDX = v2 - 96;
  *((_QWORD *)_RDX + 3) = _RDX;
  *((_QWORD *)_RDX + 4) = v2;
  v4 = __readcr0();
  *((_QWORD *)v2 + 32) = v4;
  v5 = __readcr2();
  *((_QWORD *)v2 + 33) = v5;
  v6 = __readcr3();
  *((_QWORD *)v2 + 34) = v6;
  v7 = __readcr4();
  *((_QWORD *)v2 + 35) = v7;

  // Сохранение базовых адресов GDTR и IDTR
  __sgdt((char *)v2 + 342);
  v8 = *((_QWORD *)v2 + 43);
  *(_QWORD *)_RDX = v8;
  __sidt((char *)v2 + 358);
  *((_QWORD *)_RDX + 7) = *((_QWORD *)v2 + 45);

  // Считывание Task Register (TR) и LDTR
  __asm
  {
    str     word ptr [rdx+2F0h]
    sldt    word ptr [rdx+2F2h]
  }
  *v2 = 8064;
  _mm_setcsr(*v2);
  if ( !v2[9] )
    *(_WORD *)(v8 + 80) = 15360;

  // Программирование MSR 0xC0000101 (GS_BASE) и 0xC0000102 (KERNEL_GS_BASE)
  // Это делает структуру KPCR доступной через сегментный регистр gs:
  v10 = (unsigned __int64)_RDX >> 32;
  __writemsr(0xC0000101, __PAIR64__(v10, (int)v2 - 384));
  __writemsr(0xC0000102, __PAIR64__(v10, (int)v2 - 384));

  // Инициализация структур ранней загрузки ядра
  KiInitializeBootStructures(KeLoaderBlock_0, v10);

  if ( !*MK_FP(43, *MK_FP(43, KeLoaderBlock_0 + 136) + 36LL) )
    KdInitSystem(0, KeLoaderBlock_0);

  // Настройка расширений XSAVE (AVX, SSE)
  KiInitializeXSave(KeLoaderBlock_0, (unsigned int)*MK_FP(43, *MK_FP(43, KeLoaderBlock_0 + 136) + 36LL));

  // Установка IRQL = HIGH_LEVEL (0xF)
  __writecr8(0xFu);

  v11 = alloca((unsigned int)KiXSaveAreaLength);
  v12 = *MK_FP(43, KeLoaderBlock_0 + 144);
  v13 = *MK_FP(43, KeLoaderBlock_0 + 152);

  // Проверка изоляции таблиц страниц KVA Shadow (Meltdown mitigation)
  if ( (KiKvaShadow & 1) != 0 )
  {
    v14 = *MK_FP(43, *MK_FP(43, &KeGetPcr()->IdtBase) + 4216LL);
    __writegsqword(0x9008u, v14);
  }
  else
  {
    v14 = *MK_FP(43, *MK_FP(43, &KeGetPcr()->TssBase) + 4LL);
  }
  __writegsqword(0x1A8u, v14);

  // Вызов инициализатора ядра KiInitializeKernel
  KiInitializeKernel(v12, v13);

  // Генерация начального Security Cookie для защиты стека от переполнения
  if ( !*MK_FP(43, &KeGetPcr()->Prcb.Number) )
  {
    v18 = __rdtsc();
    v15 = __ROR8__(v18, 49);
    v19 = __ROL8__(ExpSecurityCookieRandomData ^ v15 ^ v18, 16);
    LOWORD(v19) = 0;
    _security_cookie = __ROR8__(v19, 16);
    _security_cookie_complement = ~_security_cookie;
  }

  CurrentThread = KeGetCurrentThread();
  // Переход в цикл планировщика / диспетчера
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
  prototype="__int64 InitBootProcessor(PLOADER_PARAMETER_BLOCK LoaderBlock)"
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
__int64 __fastcall InitBootProcessor(__int64 a1)
{
  char *v2; // rdi
  ULONG_PTR v20, v21;
  NTSTATUS v22, v24;
  UNICODE_STRING *HostNtSystemRoot;
  char pszDest[256];

  ExpValidateLoader();
  ExpInitLicensing((__int64)&PspHostSiloGlobals);

  // 1. Инициализация таблиц NLS (кодировки символов UTF-16, ANSI, OEM)
  RtlInitNlsTables(v18, v17, v16);
  RtlResetRtlTranslations();

  // 2. Инициализация архитектуры WHEA (Windows Hardware Error Architecture)
  WheaInitializeServices();

  // 3. Инициализация слоя аппаратных абстракций HAL (Phase 0)
  LODWORD(InitializationPhase) = 0;
  v20 = (unsigned int)InitializationPhase;
  if ( !(unsigned __int8)HalInitSystem(v20, a1) )
    KeBugCheck(0x5Cu); // HAL_INITIALIZATION_FAILED

  // 4. Инициализация системного таймера и счетчиков тактов
  v21 = (unsigned int)InitializationPhase;
  KeInitializeClock(v21);

  // 5. Первичная инициализация куста реестра SYSTEM
  CmInitSystem0(a1);

  // 6. Инициализация планировщика ядра (DPC очереди, приоритеты, кванты)
  if ( !(unsigned __int8)KeInitSystem(0) )
    KeBugCheckEx(0x31u, 0xFFFFFFFFC0000001uLL, 0xBu, 0, 0);

  // 7. Построение системного корня (C:\Windows -> \SystemRoot)
  v22 = RtlStringCbPrintfA(pszDest, 0x100u, "C:%s", *(const char **)(a1 + 200));
  HostNtSystemRoot = (UNICODE_STRING *)RtlGetHostNtSystemRoot();
  RtlAnsiStringToUnicodeString(HostNtSystemRoot, &DestinationString_8, 0);

  // 8. Инициализация Executive (ExpInitSystemPhase0: пулы памяти, списки ресурсов)
  if ( !(unsigned __int8)ExInitSystem() )
    KeBugCheckEx(0x31u, 0, 0, 0, 0);

  // 9. Инициализация Менеджера Памяти Mm (Phase 0)
  // Создание PFN Database, NonPagedPool, PagedPool, системных PTE
  if ( !(unsigned __int8)MmInitSystem(0, a1) )
    KeBugCheck(0x31u);

  // 10. Инициализация Диспетчера Объектов Ob (Phase 0)
  // Создание корневой папки "\", типов ObjectType, Directory, SymbolicLink
  if ( !(unsigned __int8)ObInitSystem(0) )
    KeBugCheck(0x31u);

  // 11. Инициализация Подсистемы Безопасности Se (Phase 0)
  if ( !(unsigned __int8)SeInitSystem(0) )
    KeBugCheck(0x31u);

  // 12. Инициализация Диспетчера Процессов и Потоков Ps (Phase 0)
  // Создание процесса "System" (EPROCESS) и первого потока Phase1Initialization
  if ( !(unsigned __int8)PsInitSystem(0, a1) )
    KeBugCheck(0x31u);

  // 13. Запуск первого системного потока Phase1Initialization
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
