import { formatCount, formatRate } from './format';
import type { CsvCellValue, CsvTable } from '../types/csv';
import type {
  CellShapeCode,
  CellTypeKind,
  CellTypeVote,
  ColumnTypeKind,
  ColumnTypeProfile,
  ColumnTypeSummary,
  TypeConflictCandidate,
} from '../types/dataQuality';

/** 有效样本少于这个数就不下类型结论，只说「无法确定」。 */
export const MIN_TYPE_SAMPLES = 3;
/** 主要形态占比低于这个比例视为类型接近混合，不做武断判断。 */
export const MIN_DOMINANT_RATE = 0.7;
/** 每列逐条列出的类型冲突候选上限；总数始终按全量统计。 */
export const MAX_ITEMIZED_TYPE_CONFLICTS = 20;

/**
 * 数值形态：整数、小数、负数、科学计数法都接受；`.5` 与 `12.` 这类写法按数值处理。
 * 千分位（`1,234`）与百分号（`85%`）不在纯数值形态里，交给「数值 + 单位」或文本线索处理。
 */
const NUMBER_SHAPE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
/** 数值后面跟着单位或百分号，例如 `12.4 kg`、`85%`、`5天`。 */
const NUMBER_WITH_UNIT_SHAPE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s?[A-Za-z%°‰\u4e00-\u9fff]\S*$/;
/** 以 0 开头的整数形态，`007`、`0123` 视为编号而不是数值。 */
const LEADING_ZERO_CODE_SHAPE = /^[+-]?0\d+$/;
/** 年在前的日期形态，允许 `-` 或 `/` 分隔（同一段落内必须一致）、可选的日与时间。 */
const DATE_SHAPE = /^(\d{4})([-/])(\d{1,2})(?:(?:\2(\d{1,2}))(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?)?$/;

export const KIND_LABELS: Record<ColumnTypeKind, string> = {
  number: '数值',
  date: '日期',
  text: '文本或类别',
  unknown: '无法确定',
};

/** 字段名里出现这些整词即视为标识符列（分隔符与驼峰已先拆成整词）。 */
const IDENTIFIER_TOKENS = new Set([
  'id',
  'ids',
  'uuid',
  'guid',
  'ssn',
  'sn',
  'serial',
  'serialno',
  'serialnumber',
  'code',
  'codes',
  'barcode',
  'zipcode',
  'postcode',
  'phone',
  'phoneno',
  'telephone',
  'tel',
  'mobile',
  'account',
  'accountno',
  'card',
  'cardno',
  'pin',
]);

/** 中文表头不做分词，直接看是否包含这些标识符词。 */
const IDENTIFIER_CJK_TERMS = [
  '编号',
  '学号',
  '工号',
  '序号',
  '代码',
  '条码',
  '识别码',
  '身份证',
  '证件号',
  '手机号',
  '手机',
  '电话',
  '账号',
  '帐号',
  '卡号',
  '邮编',
  '邮政编码',
  '订单号',
  '单号',
  '型号',
];

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 月份越界时返回 0，调用方据此判为无效日期。 */
export function daysInMonth(year: number, month: number): number {
  if (!(month >= 1 && month <= 12)) return 0;
  return month === 2 && isLeapYear(year) ? 29 : MONTH_DAYS[month - 1];
}

export interface DateParts {
  year: number;
  month: number;
  /** 没有写日（只有年月）时为 null。 */
  day: number | null;
  hour: number | null;
  minute: number | null;
  second: number | null;
}

/**
 * 拆解年在前的日期写法，只按现有 DATE_SHAPE 的形态拆，不做有效性判断、也不补任何缺省值。
 * `2026-03` 一类的年月写法会得到 `day === null`，调用方据此区分「精度不足」与「不是日期」。
 */
export function parseDateParts(value: string): DateParts | null {
  const match = DATE_SHAPE.exec(value.trim());
  if (match === null) return null;
  const [, yearText, , monthText, dayText, hourText, minuteText, secondText] = match;
  const hasDay = dayText !== undefined && dayText !== '';
  const hasTime = hourText !== undefined && hourText !== '';
  return {
    year: Number(yearText),
    month: Number(monthText),
    day: hasDay ? Number(dayText) : null,
    hour: hasTime ? Number(hourText) : null,
    minute: hasTime ? Number(minuteText) : null,
    second: hasTime && secondText !== undefined && secondText !== '' ? Number(secondText) : null,
  };
}

/**
 * 日历有效性校验：`2026-02-30`、`2026-13-01`、`2026-04-31` 都是 false。
 * 只支持年在前的写法（`2026-03-02`、`2026/3/1`、可选 `2026-03-02 08:15:00`），
 * `03/02/2026` 这种月在前的写法存在地区歧义，一律不按日期处理。
 */
export function isCalendarValidDate(value: string): boolean {
  const parts = parseDateParts(value);
  if (parts === null) return false;
  const { year, month, day, hour, minute, second } = parts;
  if (year === 0 || month < 1 || month > 12) return false;
  if (day === null) return true;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hour === null) return true;
  return hour <= 23 && (minute ?? 0) <= 59 && (second ?? 0) <= 59;
}

/**
 * 单元格形态判定。返回 null 表示这一格不参与投票（空字符串、纯空白；缺列 `null` 由调用方挡掉）。
 * 判定只看文本形状，不做任何转换，也不落地写回。
 */
export function classifyCellValue(cell: CsvCellValue): CellTypeVote | null {
  if (cell === null) return null;
  const text = cell.trim();
  if (text === '') return null;

  if (DATE_SHAPE.test(text)) {
    return isCalendarValidDate(text)
      ? { kind: 'date', shape: 'calendar-date' }
      : { kind: 'text', shape: 'invalid-calendar-date' };
  }
  if (LEADING_ZERO_CODE_SHAPE.test(text)) {
    return { kind: 'text', shape: 'leading-zero-code' };
  }
  if (NUMBER_SHAPE.test(text)) {
    return { kind: 'number', shape: 'plain-number' };
  }
  if (NUMBER_WITH_UNIT_SHAPE.test(text)) {
    return { kind: 'text', shape: 'number-with-unit' };
  }
  return { kind: 'text', shape: 'plain-text' };
}

/** 把表头拆成整词：`sample_id` → sample/id，`studentId` → student/id。 */
function headerTokens(header: string): string[] {
  return header
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9\u4e00-\u9fff]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token !== '');
}

/**
 * 标识符字段的启发式：`sample_id`、`student_id`、`学号`、`phone` 这类列即使内容全是数字，
 * 也不应被当成可计算的数值。命中后该列按文本或类别处理，并且不做类型冲突比对。
 */
export function looksLikeIdentifierHeader(header: string): boolean {
  if (headerTokens(header).some((token) => IDENTIFIER_TOKENS.has(token))) return true;
  const compact = header.replace(/\s+/g, '');
  return IDENTIFIER_CJK_TERMS.some((term) => compact.includes(term));
}

function conflictSuggestion(columnKind: CellTypeKind, vote: CellTypeVote): string {
  if (vote.shape === 'invalid-calendar-date') {
    return '看起来想填日期，但日历上没有这一天（例如 2026-02-30）。请回到原始记录核对；系统不会自动顺延、改写或删掉这一格。';
  }
  if (vote.shape === 'number-with-unit') {
    return '像是「数值 + 单位」的写法，与同列的纯数值不同。若之后要参与计算需要先统一单位，本期不自动拆分单位，也不改动单元格。';
  }
  if (vote.shape === 'leading-zero-code') {
    return '以 0 开头的编号形态，按文本保留才不会丢掉前导零。如果同列其它值都是测量值，可能是编号与测量值串了列，请核对来源。';
  }
  if (columnKind === 'number') {
    return '与整列的数值形态不同，可能是备注、缺测标记（如 NA / -）或误填。请先确认它代表什么，不要直接删行。';
  }
  if (columnKind === 'date') {
    return '与整列的日期写法不一致，可能漏了分隔符、只填了年份或把天数写进了日期列。请与原始记录核对。';
  }
  return '文本或类别列里出现了这种形态，可能是分类标签写法不一致、或测量值串进了分组列。请核对表头与列内容是否对应。';
}

function emptyProfile(column: string, index: number, identifierHeader: boolean): ColumnTypeProfile {
  return {
    index,
    column,
    label: column.trim() === '' ? `（第 ${index + 1} 列未命名）` : column,
    kind: 'unknown',
    kindLabel: KIND_LABELS.unknown,
    basis: 'no-samples',
    basisText: '这一列没有非空的取值可判断。',
    sampleCount: 0,
    numberCount: 0,
    dateCount: 0,
    textCount: 0,
    skippedCount: 0,
    dominantKind: null,
    dominantRate: 0,
    identifierHeader,
    conflictCount: 0,
    conflicts: [],
    conflictsTruncated: false,
    conflictRate: 0,
  };
}

/** 投票顺序固定为数值 → 日期 → 文本，同数时按此优先级取胜（结果可复现）。 */
function dominantOf(counts: Record<CellTypeKind, number>): { kind: CellTypeKind; count: number } {
  const order: CellTypeKind[] = ['number', 'date', 'text'];
  let best = order[0];
  for (const kind of order) {
    if (counts[kind] > counts[best]) best = kind;
  }
  return { kind: best, count: counts[best] };
}

function ratio(numerator: number, denominator: number): number {
  if (!(denominator > 0) || !(numerator > 0)) return 0;
  return numerator / denominator;
}

/**
 * 第二趟扫描：逐格比对该列的主要形态，收集不一致的候选。
 * 空 / 纯空白 / 缺列一律不参与比对，因此不会被误判为类型冲突。
 */
function collectConflicts(
  profile: ColumnTypeProfile,
  dominant: CellTypeKind,
  rows: readonly CsvCellValue[][],
): void {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cell = rows[rowIndex][profile.index];
    if (cell === null || cell === '' || cell.trim() === '') continue;
    const vote = classifyCellValue(cell);
    if (vote === null || vote.kind === dominant) continue;

    profile.conflictCount += 1;
    if (profile.conflicts.length < MAX_ITEMIZED_TYPE_CONFLICTS) {
      const candidate: TypeConflictCandidate = {
        rowIndex,
        value: cell,
        observedKind: vote.kind,
        shape: vote.shape,
        suggestion: conflictSuggestion(dominant, vote),
      };
      profile.conflicts.push(candidate);
    }
  }
  profile.conflictsTruncated = profile.conflictCount > profile.conflicts.length;
  profile.conflictRate = ratio(profile.conflictCount, profile.sampleCount);
}

/**
 * 字段类型识别与类型冲突候选检测。
 *
 * 规则是启发式的、可解释的：先逐格判断形态，再按整列投票决定主要类型，
 * 样本太少或比例接近时明确回答「无法确定」。只读 `table.rows`，不改写、不转换、不删除。
 */
export function analyzeColumnTypes(table: CsvTable): ColumnTypeSummary {
  const { columns, rows, recordCount, columnCount } = table;
  const profiles = columns.map((column, index) =>
    emptyProfile(column, index, looksLikeIdentifierHeader(column)),
  );
  const kindTotals: Record<ColumnTypeKind, number> = { number: 0, date: 0, text: 0, unknown: 0 };

  for (let rowIndex = 0; rowIndex < recordCount; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const vote = classifyCellValue(row[columnIndex]);
      const profile = profiles[columnIndex];
      if (vote === null) {
        profile.skippedCount += 1;
        continue;
      }
      profile.sampleCount += 1;
      if (vote.kind === 'number') profile.numberCount += 1;
      else if (vote.kind === 'date') profile.dateCount += 1;
      else profile.textCount += 1;
    }
  }

  let columnsChecked = 0;
  let columnsWithConflicts = 0;
  let totalConflictCells = 0;

  for (const profile of profiles) {
    const counts: Record<CellTypeKind, number> = {
      number: profile.numberCount,
      date: profile.dateCount,
      text: profile.textCount,
    };
    const dominant = dominantOf(counts);
    profile.dominantKind = profile.sampleCount > 0 ? dominant.kind : null;
    profile.dominantRate = ratio(dominant.count, profile.sampleCount);

    if (profile.identifierHeader) {
      // 标识符列按文本处理，内容分布只在依据里说明，不做冲突比对：
      // `student_id` 全是数字是正常的，把它们说成类型冲突只会制造噪音。
      profile.kind = 'text';
      profile.kindLabel = KIND_LABELS.text;
      profile.basis = 'identifier-name';
      profile.basisText =
        profile.sampleCount === 0
          ? '字段名带 id / 编号 这类标识符线索，按文本或类别处理；这一列没有非空取值。'
          : `字段名带 id / 编号 这类标识符线索，按文本或类别处理，不当作数值、也不做类型冲突比对（本列 ${formatCount(profile.sampleCount)} 个有效样本里数值形态 ${formatCount(profile.numberCount)} 个）。`;
    } else if (profile.sampleCount === 0) {
      profile.kind = 'unknown';
      profile.basis = 'no-samples';
      profile.kindLabel = KIND_LABELS.unknown;
      profile.basisText = `这一列的 ${formatCount(recordCount)} 个单元格都是空的、只有空白字符或缺列，没有可判断的取值。`;
    } else if (profile.sampleCount < MIN_TYPE_SAMPLES) {
      profile.kind = 'unknown';
      profile.basis = 'too-few-samples';
      profile.kindLabel = KIND_LABELS.unknown;
      profile.basisText = `有效样本只有 ${formatCount(profile.sampleCount)} 个，少于 ${MIN_TYPE_SAMPLES} 个的下限，不下类型结论。`;
    } else if (profile.dominantRate < MIN_DOMINANT_RATE) {
      profile.kind = 'unknown';
      profile.basis = 'mixed-content';
      profile.kindLabel = KIND_LABELS.unknown;
      profile.basisText = `数值 ${formatCount(profile.numberCount)} 个、日期 ${formatCount(profile.dateCount)} 个、文本 ${formatCount(profile.textCount)} 个，最高占比 ${formatRate(profile.dominantRate)} 低于 ${formatRate(MIN_DOMINANT_RATE)} 阈值，类型接近混合，不做武断判断。`;
    } else {
      profile.kind = dominant.kind;
      profile.kindLabel = KIND_LABELS[dominant.kind];
      profile.basis = 'content';
      profile.basisText = `${formatCount(profile.sampleCount)} 个有效样本里有 ${formatCount(dominant.count)} 个${KIND_LABELS[dominant.kind]}形态（${formatRate(profile.dominantRate)}）。`;
      columnsChecked += 1;
      collectConflicts(profile, dominant.kind, rows);
      if (profile.conflictCount > 0) {
        columnsWithConflicts += 1;
        totalConflictCells += profile.conflictCount;
      }
    }

    kindTotals[profile.kind] += 1;
  }

  return {
    recordCount,
    columnCount,
    columns: profiles,
    kindTotals,
    columnsChecked,
    columnsWithConflicts,
    totalConflictCells,
  };
}

/** 界面与依据文案共用的形态中文名。 */
export const SHAPE_LABELS: Record<CellShapeCode, string> = {
  'plain-number': '纯数值',
  'calendar-date': '日历有效的日期',
  'leading-zero-code': '以 0 开头的编号',
  'number-with-unit': '数值带单位',
  'invalid-calendar-date': '日历上不存在的日期',
  'plain-text': '文本',
};
