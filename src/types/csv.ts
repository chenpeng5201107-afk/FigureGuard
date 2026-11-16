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
  issues: CsvIssue[];
}

export type ParseOutcome =
  | { status: 'ok'; table: CsvTable }
  | { status: 'error'; error: CsvError };
