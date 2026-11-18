export type CsvCellValue = string | null;

export type CsvSourceKind = 'file' | 'example';

export type CsvErrorCode =
  | 'empty-file'
  | 'file-too-large'
  | 'not-a-csv'
  | 'unsupported-encoding'
  | 'read-failed'
  | 'no-header'
  | 'parse-failed';

export interface CsvError {
  code: CsvErrorCode;
  message: string;
}

/** error = 会影响数据可用性，notice = 只是说明解析方式，不代表数据有问题。 */
export type CsvIssueSeverity = 'error' | 'notice';

/** papaparse = Papa Parse 原始告警；figureguard = 我们根据解析结果补充的结构提示。 */
export type CsvIssueOrigin = 'papaparse' | 'figureguard';

export interface CsvIssue {
  /** Papa Parse 的告警类型；结构提示统一为 Structure。 */
  type: string;
  /** Papa Parse 的告警代码；结构提示使用自有代码。 */
  code: string;
  /** 简短中文类别名，用于「问题类型分布」。 */
  label: string;
  /** 面向用户的中文说明（Papa 告警的英文原文保留在 rawMessage）。 */
  message: string;
  /** Papa Parse 返回的原始英文消息，逐字保留。 */
  rawMessage?: string;
  /** Papa Parse 给出的数据行索引（0 基，不含表头行）。 */
  rowIndex?: number;
  /** 该问题在源文件中的起始物理行号（1 基，已考虑引号内换行与被跳过的空行）。 */
  fileLine?: number;
  /** 记录跨多行时的结束物理行号；与 fileLine 相同时省略。 */
  fileEndLine?: number;
  severity: CsvIssueSeverity;
  origin: CsvIssueOrigin;
}

/** 同一类问题的真实条数：明细有上限，计数没有。 */
export interface CsvIssueGroup {
  type: string;
  code: string;
  label: string;
  severity: CsvIssueSeverity;
  origin: CsvIssueOrigin;
  /** 源文件里这类问题的真实条数。 */
  total: number;
  /** 已经逐条列出的条数；小于 total 说明还有同类问题没进明细。 */
  itemized: number;
}

export type CsvStructureState = 'sound' | 'degraded';

/**
 * 结构完整性状态：只回答「行列跟不跟得上表头、有没有值被丢掉」，不做数据质量判断。
 * 后续的数据质量分析必须在 state === 'sound' 时才把 rows 当作可信输入，
 * 否则统计会把缺列的位置当成数据本身。
 */
export interface CsvStructureStatus {
  state: CsvStructureState;
  /** 字段数少于表头的记录数（这些行有 null 单元格）。 */
  rowsWithMissingFields: number;
  /** 字段数多于表头的记录数。 */
  rowsWithExtraFields: number;
  /** 因超出表头列数而没有进入表格的字段值个数。 */
  droppedExtraValues: number;
  /** Papa Parse 因重名或空列名改写的表头列数（列名与源文件首行不同，但数据没丢）。 */
  renamedHeaderColumns: number;
  /** 文件混用 LF 与 CRLF，部分单元格结尾残留回车符。 */
  mixedLineEndings: boolean;
  /** 中文原因；state 为 degraded 时非空。 */
  reasons: string[];
}

export interface CsvTable {
  fileName: string;
  source: CsvSourceKind;
  /** 解析内容的真实字节数。 */
  sizeBytes: number;
  /** Papa Parse 实际使用的分隔符（可能是自动检测出来的）。 */
  delimiter: string;
  columns: string[];
  rows: CsvCellValue[][];
  recordCount: number;
  columnCount: number;
  /** 逐条列出的问题明细（每种来源有上限，见 lib/csv.ts 的 MAX_ITEMIZED_ISSUES）。 */
  issues: CsvIssue[];
  /** 不受明细上限影响的真实条数。 */
  issueTotals: { errors: number; notices: number };
  /** 按问题类型聚合的分布，用于「总数 + 类型」概览。 */
  issueGroups: CsvIssueGroup[];
  structure: CsvStructureStatus;
}

export type ParseOutcome =
  | { status: 'ok'; table: CsvTable }
  | { status: 'error'; error: CsvError };
