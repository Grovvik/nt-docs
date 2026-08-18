# Низкоуровневые структуры ядра (Windows 10 22H2 x64)

Данные извлечены из базы PDB-символов Microsoft (`10.0.19045.2965-x64.yml`).

---

## 1. `_KPCR` (Kernel Processor Control Region)

Структура управления процессором ядра (x64). Адресуется через сегментный регистр `GS` (`gs:[0x0]`):

```c
struct _KPCR // sizeof = 0x180 (384 bytes)
{
    union {
        struct _NT_TIB NtTib;                      // 0x000
        struct {
            struct _EXCEPTION_REGISTRATION_RECORD *Used_ExceptionList;
            PVOID Used_StackBase;
            PVOID PerfGlobalGroupMask;
            PVOID TssCopy;
            PVOID Context;
            PVOID SetMemberCopy;
            PVOID Used_Self;
        };
    };
    struct _KPRCB *CurrentPrcb;                    // 0x038 (Указатель на KPRCB)
    struct _KSPIN_LOCK_QUEUE LockArray[33];        // 0x040
    PVOID Used_Self;                               // 0x108
    struct _KIDTENTRY64 *IdtBase;                  // 0x038 (Базовый адрес IDT)
    struct _KGDTENTRY64 *GdtBase;                  // 0x040 (Базовый адрес GDT)
    struct _KTSS64 *TssBase;                       // 0x048 (Базовый адрес TSS)
    USHORT MajorVersion;                           // 0x050
    USHORT MinorVersion;                           // 0x052
    ULONG StallScaleFactor;                        // 0x054
    UCHAR Spare02;                                 // 0x058
    UCHAR SecondLevelCacheAssociativity;           // 0x059
    UCHAR VmxEnabled;                              // 0x05A
    UCHAR Number;                                  // 0x05B (Номер логического ядра)
    struct _KPRCB Prcb;                            // 0x180 (Блок KPRCB)
};
```

---

## 2. `_KPRCB` (Kernel Processor Control Block)

Блок управления процессором, содержащий состояние планировщика и очередей DPC (`gs:[0x180]`):

```c
struct _KPRCB // sizeof = 0xB640
{
    ULONG MxCsr;                                   // 0x000
    UCHAR Number;                                  // 0x004 (Номер процессора)
    UCHAR NestingLevel;                            // 0x005
    UCHAR PrcbPad00[2];                            // 0x006
    struct _KTHREAD *CurrentThread;                // 0x008 (Текущий исполняемый поток)
    struct _KTHREAD *NextThread;                   // 0x010 (Следующий поток в очереди)
    struct _KTHREAD *IdleThread;                   // 0x018 (Поток простоя ядра)
    UCHAR Group;                                   // 0x020 (Группа процессоров)
    UCHAR ProcessorGroup;                          // 0x021
    struct _KNODE *ParentNode;                     // 0x040 (NUMA-узел)
    ULONG64 GroupSetMember;                        // 0x048
    UCHAR SmtIndex;                                // 0x050 (Индекс Hyper-Threading)
    struct _KSPIN_LOCK_QUEUE LockQueue[33];        // 0x080
    struct _KDPC_DATA DpcData[2];                  // 0x24C0 (Очереди DPC: Normal / Threaded)
    PVOID DpcStack;                                // 0x2500 (Выделенный стек под DPC)
    struct _LIST_ENTRY ReadyListHead[32];          // 0x2B40 (32 очереди приоритетов потоков)
    ULONG ReadySummary;                            // 0x2D40 (Битовая маска очередей с готовыми потоками)
    ULONG PrcbFlags;                               // 0x2D44
};
```

---

## 3. `_LOADER_PARAMETER_BLOCK`

Структура передачи параметров от загрузчика `winload.efi` ядру `ntoskrnl.exe`:

```c
struct _LOADER_PARAMETER_BLOCK // sizeof = 0x110
{
    struct _LIST_ENTRY LoadOrderListHead;          // 0x000 (Список загруженных PE-модулей)
    struct _LIST_ENTRY MemoryDescriptorListHead;   // 0x010 (Карта физической памяти)
    struct _LIST_ENTRY BootDriverListHead;         // 0x020 (Список загруженных BOOT_START драйверов)
    ULONG_PTR KernelStack;                         // 0x030 (Базовый адрес стека ядра)
    ULONG_PTR Prcb;                                // 0x038 (Адрес KPRCB процессора 0)
    ULONG_PTR Process;                             // 0x040 (Адрес EPROCESS процесса System)
    ULONG_PTR Thread;                              // 0x048 (Адрес ETHREAD потока Phase1)
    ULONG RegistryLength;                          // 0x050
    PVOID RegistryBase;                            // 0x058 (Адрес куста SYSTEM в памяти)
    struct _CONFIGURATION_COMPONENT_DATA *ConfigurationRoot; // 0x060
    PCHAR ArcBootDeviceName;                       // 0x068
    PCHAR ArcHalDeviceName;                        // 0x070
    PCHAR NtBootPathName;                          // 0x078
    PCHAR NtHalPathName;                           // 0x080
    PCHAR LoadOptions;                             // 0x088 (Командная строка загрузки BCD)
    struct _NLS_DATA_BLOCK *NlsData;               // 0x090 (Указатели на таблицы NLS)
    struct _ARC_DISK_INFORMATION *ArcDiskInformation; // 0x098
    PVOID Extension;                               // 0x0A0 (_LOADER_PARAMETER_EXTENSION)
};
```

---

## 4. `_EPROCESS` (Executive Process Block)

Главная управляющая структура процесса в ядре Windows:

```c
struct _EPROCESS // sizeof = 0xAD0
{
    struct _KPROCESS Pcb;                          // 0x000 (Низкоуровневая структура ядра KPROCESS)
    struct _EX_PUSH_LOCK ProcessLock;              // 0x438
    struct _LARGE_INTEGER CreateTime;              // 0x440 (Время создания процесса)
    struct _EX_RUNDOWN_REF RundownProtect;         // 0x448
    PVOID UniqueProcessId;                         // 0x450 (PID процесса)
    struct _LIST_ENTRY ActiveProcessLinks;         // 0x458 (Глобальный двусвязный список процессов)
    ULONG Flags2;                                  // 0x474
    struct _RTL_AVL_TREE VadRoot;                  // 0x7D8 (Корень AVL-дерева VAD - виртуальной памяти)
    struct _EX_FAST_REF Token;                     // 0x4B8 (Токен безопасности / Access Token)
    struct _HANDLE_TABLE *ObjectTable;             // 0x570 (Таблица дескрипторов Handles)
    struct _PEB *Peb;                              // 0x550 (Указатель на PEB в пользовательском пространстве)
    CHAR ImageFileName[15];                        // 0x5A8 (Имя исполняемого файла процесса)
    struct _SE_AUDIT_PROCESS_CREATION_INFO ImageFileNameInfo; // 0x5C0
};
```
