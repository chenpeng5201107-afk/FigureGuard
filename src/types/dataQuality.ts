import type { CsvStructureState } from './csv';

/**
 * 质量分析的准入判断结果：回答「这份数据能不能拿来出正式的数据质量结论」，
 * 不做任何统计本身。解析错误与结构降级都会阻止分析，但数据浏览与解析告警照常可用。
 */
export type QualityBlockerCode = 'structure-degraded' | 'parse-errors';

export interface QualityBlocker {
  code: QualityBlockerCode;
  /** 面向用户的中文说明，含真实数量。 */
  message: string;
  /** 可追溯的依据（结构降级原因、按类型聚合的解析错误条数）。 */
  evidence: string[];
}

export interface QualityAdmission {
  /** 只有 true 才允许生成正式的数据质量结论。 */
  allowed: boolean;
  blockers: QualityBlocker[];
  structureState: CsvStructureState;
  /** 会读错数据的解析错误总条数（全量真实值，不受明细上限影响）。 */
  parseErrorCount: number;
  /** 说明性提示条数，不阻止分析，只用于界面解释。 */
  noticeCount: number;
}

/** 单列的缺失统计口径：三类别混淆，因此分开计数。 */
export interface ColumnMissingStats {
  /** 列下标（0 基，与 CsvTable.columns 对齐）。 */
  index: number;
  /** 源表头文字。 */
  column: string;
  /** 界面显示名（空列名给「第 N 列未命名」）。 */
  label: string;
  /** 内容为空字符串 '' 的单元格数：真正的内容缺失。 */
  emptyCount: number;
  /** 只有空白字符的单元格数：疑似空白值，单独口径，不并进 emptyCount。 */
  blankCount: number;
  /** null 单元格数：该行字段数少于表头，属于结构性缺列而不是数据本身为空。 */
  structuralGapCount: number;
  /** 有实际内容的单元格数（含 '0'）。 */
  presentCount: number;
  /** emptyCount / recordCount；recordCount 为 0 时取 0，不产生 NaN。 */
  emptyRate: number;
  blankRate: number;
  /** 三类缺失合计占比，用于排序「需要关注的字段」。 */
  qualityGapRate: number;
}

export interface MissingValueSummary {
  recordCount: number;
  columnCount: number;
  /** recordCount × columnCount，整表单元格总数。 */
  cellCount: number;
  /** 全表空字符串单元格数（任务口径里的「缺失单元格数量」）。 */
  totalEmptyCells: number;
  totalBlankCells: number;
  totalStructuralGaps: number;
  /** 存在空字符串单元格的字段数。 */
  columnsWithEmpty: number;
  /** 存在任意缺失（空 / 疑似空白 / 结构性缺列）的字段数。 */
  columnsWithQualityGap: number;
  /** totalEmptyCells / cellCount；cellCount 为 0 时取 0。 */
  overallEmptyRate: number;
  /** 与 columns 一一对应的全量列统计。 */
  columns: ColumnMissingStats[];
  /** 需要关注的字段：按三类缺失合计降序，只保留至少有一处缺失的列。 */
  focusColumns: ColumnMissingStats[];
}

/** 一组整行完全相同的记录。 */
export interface DuplicateRecordGroup {
  /** 组内第一条记录的数据行下标（0 基，不含表头）。 */
  firstRowIndex: number;
  /** 该组真实记录条数（>= 2）。 */
  occurrenceCount: number;
  /** 组内全部数据行下标，用于人工定位。 */
  rowIndexes: number[];
}

export interface DuplicateSummary {
  recordCount: number;
  /** 全量真实的重复组数。 */
  duplicateGroupCount: number;
  /** 落在重复组里的记录条数（含每组第一条）。 */
  recordsInDuplicateGroups: number;
  /** 可视作额外副本的条数 = recordsInDuplicateGroups - duplicateGroupCount。 */
  extraCopyCount: number;
  /** recordsInDuplicateGroups / recordCount；recordCount 为 0 时取 0。 */
  duplicateRate: number;
  /** 逐条列出的重复组（上限见 MAX_ITEMIZED_DUPLICATE_GROUPS），按首次出现顺序。 */
  groups: DuplicateRecordGroup[];
  /** true 表示还有重复组没有逐条列出，但上面的计数是全量真实值。 */
  groupsTruncated: boolean;
}

/** 单元格参与类型投票时的三种形态；空字符串、纯空白与缺列不参与投票。 */
export type CellTypeKind = 'number' | 'date' | 'text';

/** 字段级结论：三类形态之外还有「无法确定」。 */
export type ColumnTypeKind = CellTypeKind | 'unknown';

/** 单元格形态的具体线索，用于给出针对性的处理建议。 */
export type CellShapeCode =
  | 'plain-number'
  | 'calendar-date'
  | 'leading-zero-code'
  | 'number-with-unit'
  | 'invalid-calendar-date'
  | 'plain-text';

/** 单个单元格的投票结果：形态类别 + 判定线索。 */
export interface CellTypeVote {
  kind: CellTypeKind;
  shape: CellShapeCode;
}

/** 列结论的来源，决定界面如何解释「这个类型是怎么来的」。 */
export type ColumnTypeBasis =
  /** 按内容投票得到稳定主要类型（含标识符列按文本结论）。 */
  | 'content'
  /** 字段名带 id / 编号 这类线索，直接按文本或类别处理，不做冲突比对。 */
  | 'identifier-name'
  /** 有效样本太少，不足以判断。 */
  | 'too-few-samples'
  /** 各形态占比接近，不做武断判断。 */
  | 'mixed-content'
  /** 整列没有非空取值。 */
  | 'no-samples';

/** 一个与主要类型不一致的单元格候选。 */
export interface TypeConflictCandidate {
  /** 数据行下标（0 基，不含表头）。 */
  rowIndex: number;
  /** 源文件里的原始值，未裁剪、未改写（首尾空白在展示时保留原样）。 */
  value: string;
  /** 这个单元格自己的形态判断。 */
  observedKind: CellTypeKind;
  shape: CellShapeCode;
  /** 谨慎的处理建议，不宣称已经修正。 */
  suggestion: string;
}

export interface ColumnTypeProfile {
  index: number;
  /** 源表头文字。 */
  column: string;
  /** 界面显示名（空列名给「第 N 列未命名」）。 */
  label: string;
  /** 最终推断类型。 */
  kind: ColumnTypeKind;
  /** 中文类型名：数值 / 日期 / 文本或类别 / 无法确定。 */
  kindLabel: string;
  basis: ColumnTypeBasis;
  /** 一句话判断依据，含真实数量。 */
  basisText: string;
  /** 参与投票的有效样本数（非空、非纯空白、非缺列）。 */
  sampleCount: number;
  numberCount: number;
  dateCount: number;
  textCount: number;
  /** 空字符串 + 纯空白 + 结构性缺列的数量，与 sampleCount 之和等于 recordCount。 */
  skippedCount: number;
  /** 内容投票出来的主要形态；没有任何样本时为 null。 */
  dominantKind: CellTypeKind | null;
  /** dominantCount / sampleCount；sampleCount 为 0 时取 0。 */
  dominantRate: number;
  /** 字段名是否命中标识符线索。 */
  identifierHeader: boolean;
  /** 与主要类型不一致的单元格数量（全量真实值，不受明细上限影响）。 */
  conflictCount: number;
  /** 逐条列出的冲突候选（有上限），按数据行顺序。 */
  conflicts: TypeConflictCandidate[];
  conflictsTruncated: boolean;
  /** conflictCount / sampleCount，用于判断这列是偶发还是普遍。 */
  conflictRate: number;
}

export interface ColumnTypeSummary {
  recordCount: number;
  columnCount: number;
  /** 与 columns 一一对应的全量列结论。 */
  columns: ColumnTypeProfile[];
  /** 按最终类型统计的列数分布。 */
  kindTotals: Record<ColumnTypeKind, number>;
  /** 真正参与类型冲突比对的列数（类型已确定且不是标识符列）。 */
  columnsChecked: number;
  /** 存在类型不一致候选的字段数。 */
  columnsWithConflicts: number;
  /** 全表类型不一致候选单元格总数（全量真实值）。 */
  totalConflictCells: number;
}

export type DataQualityFindingKind = 'no-records' | 'column-quality' | 'duplicate-rows' | 'column-type';

/** attention = 建议优先人工确认；info = 只需知情。 */
export type DataQualityFindingSeverity = 'attention' | 'info';

export interface DataQualityFinding {
  id: string;
  kind: DataQualityFindingKind;
  severity: DataQualityFindingSeverity;
  /** 一句话结论，数字全部来自真实统计。 */
  title: string;
  /** 口径与定位说明。 */
  detail: string;
}

export interface DataQualityReport {
  fileName: string;
  recordCount: number;
  columnCount: number;
  missing: MissingValueSummary;
  duplicates: DuplicateSummary;
  /** 字段类型识别与类型冲突候选（Day 4），同样只读不改写数据。 */
  columnTypes: ColumnTypeSummary;
  /** 逐条写出的问题（有上限），排序为 attention 在前。 */
  findings: DataQualityFinding[];
  /** 与 findings 一一对应的分类条数；真实的缺失/重复总量见 missing 与 duplicates。 */
  itemizedFindingTotals: { attention: number; info: number };
  findingsTruncated: boolean;
}
