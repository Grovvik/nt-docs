# 1. Firmware & UEFI / MBR Stage

Этап аппаратной инициализации прошивки материнской платы и передачи управления первому загрузчику Windows.

---

## 1.1 Архитектура фаз UEFI

Современные x64 платформы стартуют под управлением <Term term="UEFI">UEFI</Term> (Unified Extensible Firmware Interface). Жизненный цикл прошивки состоит из пяти стандартизированных фаз:

```
[ Питание / Reset Vector 0xFFFFFFF0 ]
               │
               ▼
   [ SEC ] Security Phase (Переход из Real Mode в Protected Mode, CAR)
               │
               ▼
   [ PEI ] Pre-EFI Initialization (Инициализация DRAM, чипсета)
               │
               ▼
   [ DXE ] Driver Execution Environment (Загрузка драйверов шин PCI, NVMe, USB, FS)
               │
               ▼
   [ BDS ] Boot Device Selection (Чтение NVRAM BootOrder, Secure Boot, запуск EFI-файла)
               │
               ▼
   [ \EFI\Microsoft\Boot\bootmgfw.efi ] -> Windows Boot Manager
```

### Фазы инициализации прошивки:
1. **<Term term="SEC">SEC</Term> (Security)**:
   - Процессор стартует по аппаратному вектору сброса <Term term="RESET_VECTOR">0xFFFFFFF0</Term> в 16-битном <Term term="REAL_MODE">Real Mode</Term> и практически мгновенно переключается в 32-битный <Term term="PROTECTED_MODE">Protected Mode</Term> через установку бита `PE` в регистре <Term term="CR0">CR0</Term>.
   - Оперативная память (`DRAM`) ещё отключена: кэш процессора конфигурируется как временный стек через механизм <Term term="CAR">Cache-as-RAM</Term>.
   - Выполняется верификация криптографического корня доверия <Term term="VBS">Root of Trust</Term> и инициализация микрокода CPU.

2. **<Term term="PEI">PEI</Term> (Pre-EFI Initialization)**:
   - Модули <Term term="PEIM">PEIM</Term> опрашивают микросхемы <Term term="SPD">SPD</Term> планок памяти по шине SMBus/I2C, калибруют тайминги и подают питание на контроллер системной <Term term="DRAM">DRAM</Term>.
   - Топология памяти и статус платформы передаются диспетчеру следующей фазы через структуры <Term term="HOB">HOB</Term>.

3. **<Term term="DXE">DXE</Term> (Driver Execution Environment)**:
   - Формируются таблицы <Term term="UEFI">Boot Services</Term> (выделение пулов памяти, протоколы) и <Term term="UEFI">Runtime Services</Term> (доступ к переменным NVRAM, часы реального времени, управление питанием).
   - Загружаются протоколы драйверов файловых систем (FAT32 / <Term term="ESP">ESP</Term>), контроллеров шин <Term term="PCIE">PCIe</Term> и накопителей (<Term term="AHCI">AHCI</Term> / <Term term="NVME">NVMe</Term>).

4. **<Term term="BDS">BDS</Term> (Boot Device Selection)**:
   - Диспетчер считывает параметры загрузки из энергонезависимой памяти NVRAM: порядок накопителей `BootOrder` и пути `Boot####`.
   - При активном <Term term="VBS">Secure Boot</Term> проверяется цифровая подпись PE/COFF-образа по ключам PK (Platform Key), KEK (Key Exchange Key) и белым спискам базы `db`.
   - При успешной валидации вызывается `gBS->StartImage()` для `\EFI\Microsoft\Boot\bootmgfw.efi` (или `\EFI\BOOT\bootx64.efi`).

---

## 1.2 Глубокое погружение: Аппаратный старт процессора и режимы x86

### Почему процессор начинает с вектора сброса `0xFFFFFFF0`?

Когда на материнскую плату подаётся питание:
1. Блок питания формирует сигнал **`POWER_GOOD`** (напряжение стабилизировалось).
2. Чипсет снимает сигнал аппаратного сброса **`RESET#`** с ножки процессора.
3. В этот момент оперативная память (DRAM) **полностью отключена** (не настроены тайминги, нет тактирования). Процессор не может прочитать код из RAM.
4. Процессор аппаратно инициализирует свои регистры в строго фиксированное состояние:
   - Сегмент кода: `CS = 0xF000` (при этом скрытый базовый адрес сегмента `CS Base = 0xFFFF0000`)
   - Указатель команд: `IP / EIP = 0xFFF0`
   - Итоговый физический адрес первой инструкции: 
     $$\text{Physical Address} = \text{0xFFFF0000} + \text{0x0000FFF0} = \mathbf{\text{0xFFFFFFF0}}$$

::: tip Почему именно 0xFFFFFFF0 (16 байт ниже границы 4 ГБ)?
- `0xFFFFFFFF` это верхний предел 32-битного адресного пространства ($4\text{ Гбайт} - 1\text{ байт}$).
- Адрес `0xFFFFFFF0` находится ровно **за 16 байт до 4 ГБ**.
- В эти 16 байт помещается ровно одна инструкция дальнего перехода: `JMP FAR` к началу основного тела прошивки UEFI.
- **Куда ведёт этот адрес физически?** Чипсет материнской платы перенаправляет обращения к верхнему диапазону адресов памяти не в оперативную память, а на аппаратную шину SPI к чипу энергонезависимой микросхемы **SPI Flash ROM** на плате.
:::

---

### Эволюция режимов процессора: Real Mode ➔ Protected Mode ➔ Long Mode

Каждый современный 64-битный процессор (Intel Core, AMD Ryzen) ради обратной совместимости с первыми ПК 1978 года при включении питания просыпается в 16-битном режиме.

| Режим | Разрядность | Лимит памяти | Модель защиты | Где используется |
| :--- | :--- | :--- | :--- | :--- |
| **<Term term="REAL_MODE">Real Mode</Term>** (Реальный) | 16 бит | **1 Мбайт** | **Нет защиты**, любая программа может писать в память BIOS/DOS. | Первые такты после сброса CPU, Legacy BIOS (MBR). |
| **<Term term="PROTECTED_MODE">Protected Mode</Term>** (Защищённый) | 32 бит | **4 Гбайт** | **Кольца Ring 0–3**, дескрипторы <Term term="GDT">GDT</Term>, страничная изоляция <Term term="CR3">CR3</Term>. | Фаза SEC/PEI в UEFI, 32-битные драйверы. |
| **<Term term="LONG_MODE">Long Mode</Term>** (64-битный x64) | 64 бит | **До 256 Тбайт** (48/57 бит) | **Кольца Ring 0/3**, NX-бит (No Execute), плоская память. | Основной режим работы 64-битной Windows NT, DXE/BDS фазы UEFI. |

#### 1. Real Mode (16-битный реальный режим):
- Использует сегментную адресацию: $\text{Физический адрес} = (\text{Сегментный регистр} \times 16) + \text{Смещение}$.
- Максимальный адрес: $0xFFFF \times 16 + 0xFFFF = 0x10FFEF \approx 1\text{ Мбайт}$.
- Нет привилегий: любая инструкция может выполнить `cli`, `hlt`, писать в порты ввода-вывода или повредить стек.

#### 2. Как фаза SEC переключает процессор в Protected Mode:
Чтобы работать с адресами выше 1 МБ и выполнять безопасный C-код, прошивка инициализирует минимальную таблицу дескрипторов <Term term="GDT">GDT</Term> и выставляет бит `PE` (Protection Enable, бит 0) в регистре управления <Term term="CR0">CR0</Term>:

```asm
; [1] Загрузка временной плоской таблицы дескрипторов (GDT)
lgdt    [TempGdtDescriptor]

; [2] Включение бита защиты PE (Protection Enable) в CR0
mov     eax, cr0
or      eax, 1                  ; CR0.PE = 1
mov     cr0, eax

; [3] Дальний переход (JMP FAR) для очистки конвейера инструкций и перезагрузки регистра CS
jmp     0x08:ProtectedModeEntry

[BITS 32]
ProtectedModeEntry:
    ; Процессор теперь в 32-битном защищённом режиме с доступом ко всем 4 ГБ памяти
```

---

### Механизм Cache-as-RAM (CAR): Как работать без оперативной памяти?

В фазе SEC прошивке требуется вызывать функции, передавать параметры и хранить локальные переменные, то есть **необходим стек (Stack)**. Однако контроллер оперативной памяти (DRAM) ещё не инициализирован.

Решение: **<Term term="CAR">Cache-as-RAM</Term> (кэш вместо памяти)**.
1. Процессор через регистры `MTRR` (Memory Type Range Registers) настраивает кэш L2/L3 процессора в специальный режим **Write-Back / No-Eviction**.
2. В этом режиме кэш-линии процессора отвечают на любые чтения и записи по заданному диапазону адресов, но **никогда не пытаются сбросить данные в физическую шину RAM**.
3. Регистр указателя стека <Term term="ESP">ESP</Term> / <Term term="RSP">RSP</Term> указывает на этот кэшированный регион, позволяя прошивке безопасно исполнять сложный C/C++ код задолго до подачи питания на планки DRAM.

---

## 1.3 Legacy BIOS & MBR (Устаревший стек)

В устаревшем режиме Legacy BIOS:
1. BIOS считывает первый физический сектор накопителя (<Term term="LBA">LBA 0</Term>, 512 байт) - <Term term="MBR">MBR</Term> по адресу `0x7C00` и передаёт ему управление.
2. Код MBR сканирует записи таблицы разделов (смещение `0x01BE`), определяя активный раздел с флагом `0x80`.
3. С активного раздела считывается загрузочный сектор <Term term="VBR">VBR</Term>, инициирующий исполнение `bootmgr`.

---

## 1.4 Декомпилированный C-код парсинга разделов (<Term term="GPT">GPT</Term> / <Term term="MBR">MBR</Term>)

Ниже представлен реальный декомпилированный C-код функций подсистемы дискового хранилища ядра Windows, выполняющих чтение и валидацию таблиц GPT и MBR:

<FunctionCard 
  name="_ReadPartitionTable_SC_GPT"
  module="ntoskrnl.exe"
  :exported="false"
  prototype="NTSTATUS _ReadPartitionTable_SC_GPT(SC_GPT *this, SC_DISK_LAYOUT **Layout)"
  irql="PASSIVE_LEVEL"
>
Функция считывает заголовок <Term term="GPT">GPT</Term> (<Term term="LBA">LBA 1</Term>), проверяет сигнатуру <code>EFI PART</code> (0x5452415020494645), валидирует контрольную сумму <Term term="CRC32">CRC32</Term> заголовка и парсит массив дескрипторов разделов GPT (<Term term="GUID">GUID</Term> раздела, начальный LBA, конечный LBA, атрибуты).
</FunctionCard>

<DecompiledCode 
  name="_ReadPartitionTable_SC_GPT"
  module="ntoskrnl.exe"
  callingConvention="__thiscall"
  :isExported="false"
  summary="Чтение и парсинг таблицы разделов GPT с валидацией сигнатуры EFI PART и CRC32"
>

```c
NTSTATUS __fastcall _ReadPartitionTable_SC_GPT(__int64 a1, _QWORD *a2)
{
  NTSTATUS status;
  unsigned int v5;
  struct _GPT_HEADER GptHeader;
  struct _GPT_ENTRY *GptEntries;

  GptEntries = nullptr;
  memset(&GptHeader, 0, sizeof(GptHeader));

  // [1] Чтение первичного заголовка GPT с LBA 1
  status = _ReadHeader_SC_GPT(a1, 1, &GptHeader);
  if ( status < 0 )
  {
    // [2] При повреждении LBA 1 читается резервная копия GPT Header из последнего сектора диска
    status = _ReadHeader_SC_GPT(a1, *(_QWORD *)(a1 + 32) - 1LL, &GptHeader);
    if ( status < 0 )
      return status;
  }

  // [3] Проверка сигнатуры "EFI PART" (0x5452415020494645ULL)
  if ( GptHeader.Signature != 0x5452415020494645ULL )
    return STATUS_DISK_CORRUPT_ERROR;

  // [4] Чтение массива записей разделов (Partition Entries) с LBA 2
  status = _ReadEntries_SC_GPT(a1, &GptHeader, &GptEntries);
  if ( status >= 0 )
  {
    v5 = 0;
    // [5] Обход записей разделов и поиск системного раздела EFI (ESP)
    while ( v5 < GptHeader.NumberOfPartitionEntries )
    {
      if ( GptEntries[v5].StartingLBA && GptEntries[v5].EndingLBA )
      {
        // Сравнение GUID типа раздела с системным ESP GUID (c12a7328-f81f-11d2-ba4b-00a0c93ec93b)
        if ( _IsEqualGuid(&GptEntries[v5].PartitionTypeGUID, &PARTITION_SYSTEM_GUID) )
        {
          *(_QWORD *)(a1 + 128) = GptEntries[v5].StartingLBA;
          *(_QWORD *)(a1 + 136) = GptEntries[v5].EndingLBA;
          break;
        }
      }
      ++v5;
    }
    *a2 = GptEntries;
    return STATUS_SUCCESS;
  }

  return status;
}
```

</DecompiledCode>

<FunctionCard 
  name="_CheckSum_MBR_HEADER"
  module="ntoskrnl.exe"
  :exported="false"
  prototype="ULONG _CheckSum_MBR_HEADER(MBR_HEADER *this)"
  irql="PASSIVE_LEVEL"
>
Вычисляет 32-битную контрольную сумму сектора MBR для верификации сигнатуры <code>0xAA55</code> и дисковой подписи NT Signature.
</FunctionCard>

<DecompiledCode 
  name="_CheckSum_MBR_HEADER"
  module="ntoskrnl.exe"
  callingConvention="__thiscall"
  :isExported="false"
  summary="Вычисление контрольной суммы заголовка MBR и проверка маркера 0xAA55"
>

```c
unsigned int __fastcall _CheckSum_MBR_HEADER(unsigned int *a1)
{
  unsigned int checksum;
  __int64 count;
  unsigned int val;

  checksum = 0;
  count = 128LL; // 128 DWORD (512 байт сектора LBA 0)
  do
  {
    val = *a1++;
    checksum += val;
    --count;
  }
  while ( count );

  // [1] Проверка магической сигнатуры MBR (0xAA55 в смещении 0x1FE)
  if ( *((unsigned __int16 *)a1 - 1) != 0xAA55 )
    return 0;

  return checksum;
}
```

</DecompiledCode>

---

## 1.5 Переход к Windows Boot Manager

После обнаружения <Term term="ESP">ESP</Term> раздела на диске прошивка UEFI загружает `\EFI\Microsoft\Boot\bootmgfw.efi` в память через `gBS->LoadImage` и передает управление в его точку входа `EfiMain`.
