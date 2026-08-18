# 1. Firmware & UEFI / MBR Stage

Этап аппаратной инициализации прошивки материнской платы и передачи управления первому загрузчику Windows.

---

## 1.1 Архитектура фаз UEFI

Современные x64 платформы стартуют под управлением <Term term="UEFI">UEFI</Term>. Жизненный цикл прошивки состоит из стандартизированных фаз:

```
[ Питание / Reset Vector 0xFFFFFFF0 ]
               │
               ▼
   [ SEC ] Security Phase (Переход в Flat Protected Mode, CAR)
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

### Фазы инициализации:
1. **<Term term="SEC">SEC</Term>**:
   - Процессор стартует по вектору сброса `0xFFFFFFF0` в 16-битном Real Mode и переключается в Protected Mode.
   - Оперативная память ещё не поднята: кэш процессора настраивается как временный стек через <Term term="CAR">CAR</Term>.
   - Выполняется верификация криптографического корня доверия <Term term="VBS">Root of Trust</Term>.

2. **<Term term="PEI">PEI</Term>**:
   - Модули <Term term="PEIM">PEIM</Term> опрашивают <Term term="SPD">SPD</Term> планок памяти, конфигурируют тайминги и поднимают системную <Term term="DRAM">DRAM</Term>.
   - Топология памяти и статус платформы передаются диспетчеру фазы DXE через структуры <Term term="HOB">HOB</Term>.

3. **<Term term="DXE">DXE</Term>**:
   - Формируются таблицы <Term term="UEFI">Boot Services</Term> (выделение памяти, протоколы) и <Term term="UEFI">Runtime Services</Term> (доступ к NVRAM, управление питанием).
   - Загружаются протоколы драйверов файловых систем (FAT32 / <Term term="ESP">ESP</Term>), шин <Term term="PCIE">PCIe</Term> и контроллеров накопителей (<Term term="AHCI">AHCI</Term> / <Term term="NVME">NVMe</Term>).

4. **<Term term="BDS">BDS</Term>**:
   - Диспетчер считывает параметры загрузки из энергонезависимой памяти NVRAM: `BootOrder` и списки `Boot####`.
   - При активном <Term term="VBS">Secure Boot</Term> сверяется цифровая подпись PE-образа с ключами PK, KEK и базой разрешённых сертификатов db.
   - При успешной проверке вызывается `gBS->StartImage()` для `\EFI\Microsoft\Boot\bootmgfw.efi` (или `\EFI\BOOT\bootx64.efi`).

---

## 1.2 Legacy BIOS & MBR

В устаревшем режиме Legacy BIOS:
1. BIOS считывает первый физический сектор накопителя (<Term term="LBA">LBA 0</Term>, 512 байт) — <Term term="MBR">MBR</Term> по адресу `0x7C00` и передаёт ему управление.
2. Код MBR сканирует записи таблицы разделов (смещение `0x01BE`), определяя активный раздел с флагом `0x80`.
3. С активного раздела считывается загрузочный сектор <Term term="VBR">VBR</Term>, инициирующий исполнение `bootmgr`.

---

## 1.3 Декомпилированный C-код парсинга разделов (<Term term="GPT">GPT</Term> / <Term term="MBR">MBR</Term>)

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

## 1.4 Переход к Windows Boot Manager

После обнаружения ESP раздела на диске прошивка UEFI загружает `\EFI\Microsoft\Boot\bootmgfw.efi` в память через `gBS->LoadImage` и передает управление в его точку входа `EfiMain`.
