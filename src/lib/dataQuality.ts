import { formatCount, formatRate } from './format';
import { MAX_ITEMIZED_TYPE_CONFLICTS, analyzeColumnTypes } from './columnTypes';
import type { CsvTable } from '../types/csv';
import type {
  ColumnTypeProfile,
  DataQualityFinding,
  DataQualityReport,
  DuplicateRecordGroup,
  DuplicateSummary,
  MissingValueSummary,
  ColumnMissingStats,
  ColumnTypeSummary,
  QualityAdmission,
  QualityBlocker,
} from '../types/dataQuality';

/**
 * 重复组明细的逐条上限：总数始终按全量统计，只有「每组一份行索引对象」限量，
 * 避免几十万行高度重复时把几万个数组对象一起交给界面渲染。
 */
export const MAX_ITEMIZED_DUPLICATE_GROUPS = 200;
/** 问题列表一次生成的上限，界面在此之上再做分批展开。 */
export const MAX_ITEMIZED_QUALITY_FINDINGS = 100;
/** 缺失率不低于该阈值的列按「建议优先确认」呈现，低于它只是知情。 */
export const ATTENTION_QUALITY_GAP_RATE = 0.1;
/** 准入说明里最多引用几条解析错误的类型分布。 */
const MAX_BLOCKER_EVIDENCE = 4;

/**
 * 只由空白字符组成的单元格（空格、制表符、换行、不换行空格、全角空格等）。
 * 空白字符按 `String.prototype.trim` 的口径判定，与浏览器对空白的一致。
 */
function isBlankText(cell: string): boolean {
  return cell !== '' && cell.trim() === '';
}

/** 空表头列在界面需要一个可读的名字，口径与数据预览表格一致。 */
function columnLabelOf(column: string, index: number): string {
  return column.trim() === '' ? `（第 ${index + 1} 列未命名）` : column;
}

/** 比率的唯一出口：分母为非正数时返回 0，杜绝 NaN 与 Infinity。 */
function ratioOf(numerator: number, denominator: number): number {
  if (!(denominator > 0) || !(numerator > 0)) return 0;
  return numerator / denominator;
}

/**
 * 数据质量分析的准入判断。
 *
 * `structure.state` 只描述「行列跟不跟得上表头」，而引号未闭合这类解析错误可以在
 * 字段数完全匹配的情况下发生（例如 `a` + `"foo`），此时 state 仍是 sound。
 * 所以准入必须同时看解析错误总数，否则会把错位读进同一个单元格的数据当成可信输入做统计。
 */
export function evaluateQualityAdmission(table: CsvTable): QualityAdmission {
  const blockers: QualityBlocker[] = [];

  if (table.structure.state !== 'sound') {
    blockers.push({
      code: 'structure-degraded',
      message: 'CSV 的行列结构与表头不一致，缺位与丢弃的值不是数据本身的内容，统计会把它们当成真实取值。',
      evidence: [...table.structure.reasons],
    });
  }

  if (table.issueTotals.errors > 0) {
    const distribution = table.issueGroups
      .filter((group) => group.severity === 'error')
      .sort((left, right) => right.total - left.total)
      .slice(0, MAX_BLOCKER_EVIDENCE)
      .map((group) => `${group.label}（${group.code}）：${formatCount(group.total)} 条`);
    blockers.push({
      code: 'parse-errors',
      message: `解析阶段有 ${formatCount(table.issueTotals.errors)} 条会读错数据的格式问题，单元格可能被错位合并或截断。`,
      evidence: distribution,
    });
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    structureState: table.structure.state,
    parseErrorCount: table.issueTotals.errors,
    noticeCount: table.issueTotals.notices,
  };
}

/**
 * 缺失值统计。口径：
 * - `''` = 内容缺失（计入 emptyCount）
 * - 只有空白字符 = 疑似空白值（单独计入 blankCount，不并入内容缺失）
 * - `null` = 结构性缺列（单独计入 structuralGapCount，与空单元格不同）
 * - `'0'`、`'0.0'`、`'00'` 等字符串都是实际内容，不计入任何缺失口径
 *
 * 只读取 `table.rows`，不写回、不排序、不替换任何单元格。
 */
export function summarizeMissingValues(table: CsvTable): MissingValueSummary {
  const { columns, rows, recordCount, columnCount } = table;
  const emptyCounts = new Array<number>(columnCount).fill(0);
  const blankCounts = new Array<number>(columnCount).fill(0);
  const gapCounts = new Array<number>(columnCount).fill(0);

  for (let rowIndex = 0; rowIndex < recordCount; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cell = row[columnIndex];
      if (cell === null) {
        gapCounts[columnIndex] += 1;
      } else if (cell === '') {
        emptyCounts[columnIndex] += 1;
      } else if (isBlankText(cell)) {
        blankCounts[columnIndex] += 1;
      }
    }
  }

  let totalEmptyCells = 0;
  let totalBlankCells = 0;
  let totalStructuralGaps = 0;
  let columnsWithEmpty = 0;
  let columnsWithQualityGap = 0;

  const stats: ColumnMissingStats[] = columns.map((column, index) => {
    const emptyCount = emptyCounts[index];
    const blankCount = blankCounts[index];
    const structuralGapCount = gapCounts[index];
    totalEmptyCells += emptyCount;
    totalBlankCells += blankCount;
    totalStructuralGaps += structuralGapCount;
    if (emptyCount > 0) columnsWithEmpty += 1;
    if (emptyCount + blankCount + structuralGapCount > 0) columnsWithQualityGap += 1;
    const gapTotal = emptyCount + blankCount + structuralGapCount;

    return {
      index,
      column,
      label: columnLabelOf(column, index),
      emptyCount,
      blankCount,
      structuralGapCount,
      presentCount: recordCount - gapTotal,
      emptyRate: ratioOf(emptyCount, recordCount),
      blankRate: ratioOf(blankCount, recordCount),
      qualityGapRate: ratioOf(gapTotal, recordCount),
    };
  });

  const cellCount = recordCount * columnCount;
  const focusColumns = stats
    .filter((entry) => entry.emptyCount + entry.blankCount + entry.structuralGapCount > 0)
    .sort(
      (left, right) =>
        right.qualityGapRate - left.qualityGapRate ||
        right.emptyCount - left.emptyCount ||
        left.index - right.index,
    );

  return {
    recordCount,
    columnCount,
    cellCount,
    totalEmptyCells,
    totalBlankCells,
    totalStructuralGaps,
    columnsWithEmpty,
    columnsWithQualityGap,
    overallEmptyRate: ratioOf(totalEmptyCells, cellCount),
    columns: stats,
    focusColumns,
  };
}

/**
 * 整行序列化成 Map 的键：`JSON.stringify` 会把 `null`（缺列）与 `''`（空单元格）区分开，
 * 单元格里的逗号、引号、换行也都被转义，所以不需要自定义分隔符。
 * 完全重复的判定就是「每个字段都相同」，因此 `sample_id` 不同但测量值相同的两行不会被算成重复。
 */
function rowKeyOf(row: readonly (string | null)[]): string {
  return JSON.stringify(row);
}

/**
 * 完全重复记录检测：单趟扫描 + Map 计数，没有逐行两两比较。
 * 只报告，不删除、不去重、不改动 `table.rows`。
 */
export function findDuplicateRecords(table: CsvTable): DuplicateSummary {
  const { rows, recordCount } = table;
  // 只出现过一次时存下标本身，重复了才升级为数组：干净文件里不会为每行分配数组。
  const buckets = new Map<string, number | number[]>();

  for (let rowIndex = 0; rowIndex < recordCount; rowIndex += 1) {
    const key = rowKeyOf(rows[rowIndex]);
    const previous = buckets.get(key);
    if (previous === undefined) {
      buckets.set(key, rowIndex);
    } else if (typeof previous === 'number') {
      buckets.set(key, [previous, rowIndex]);
    } else {
      previous.push(rowIndex);
    }
  }

  let duplicateGroupCount = 0;
  let recordsInDuplicateGroups = 0;
  const groups: DuplicateRecordGroup[] = [];

  for (const bucket of buckets.values()) {
    if (typeof bucket === 'number') continue;
    duplicateGroupCount += 1;
    recordsInDuplicateGroups += bucket.length;
    if (groups.length < MAX_ITEMIZED_DUPLICATE_GROUPS) {
      groups.push({ firstRowIndex: bucket[0], occurrenceCount: bucket.length, rowIndexes: [...bucket] });
    }
  }

  return {
    recordCount,
    duplicateGroupCount,
    recordsInDuplicateGroups,
    extraCopyCount: recordsInDuplicateGroups - duplicateGroupCount,
    duplicateRate: ratioOf(recordsInDuplicateGroups, recordCount),
    groups,
    groupsTruncated: duplicateGroupCount > groups.length,
  };
}

/** 数据行序号提示：明确是「数据行」，不含表头，也不与文件物理行号混用。 */
function dataRowLabel(rowIndex: number): string {
  return `第 ${formatCount(rowIndex + 1)} 个数据行`;
}

function rowIndexText(indexes: readonly number[]): string {
  const shown = indexes.slice(0, 6).map((index) => formatCount(index + 1)).join('、');
  return indexes.length > 6 ? `${shown} …（共 ${formatCount(indexes.length)} 行）` : shown;
}

function columnFinding(stats: ColumnMissingStats, recordCount: number): DataQualityFinding {
  const parts: string[] = [];
  if (stats.emptyCount > 0) parts.push(`${formatCount(stats.emptyCount)} 个空单元格（${formatRate(stats.emptyRate)}）`);
  if (stats.blankCount > 0) {
    parts.push(`${formatCount(stats.blankCount)} 个只含空白字符的单元格（${formatRate(stats.blankRate)}，单列为疑似空白值，没有并进缺失数量）`);
  }
  if (stats.structuralGapCount > 0) {
    parts.push(`${formatCount(stats.structuralGapCount)} 处结构性缺列（该行字段数少于表头，不是数据本身为空）`);
  }

  return {
    id: `column-${stats.index}`,
    kind: 'column-quality',
    severity: stats.qualityGapRate >= ATTENTION_QUALITY_GAP_RATE ? 'attention' : 'info',
    title: `「${stats.label}」有 ${formatCount(stats.emptyCount + stats.blankCount + stats.structuralGapCount)} 处内容不完整`,
    detail: `${formatCount(recordCount)} 条记录里${parts.join('；')}。数值 0 与文本「0」按实际内容处理，不算缺失。`,
  };
}

function duplicateFinding(group: DuplicateRecordGroup): DataQualityFinding {
  return {
    id: `duplicate-${group.firstRowIndex}`,
    kind: 'duplicate-rows',
    severity: 'attention',
    title: `疑似重复记录：${formatCount(group.occurrenceCount)} 行内容完全相同（从${dataRowLabel(group.firstRowIndex)}开始）`,
    detail: `涉及数据行序号：${rowIndexText(group.rowIndexes)}。判定口径是整行每个字段都一致（数据行序号不含表头）；重复不等于错误，可能是同一份记录的合法副本，请人工确认后再决定是否处理，本次没有删除或改写任何行。`,
  };
}

function typeConflictFinding(profile: ColumnTypeProfile): DataQualityFinding {
  const shown = profile.conflicts
    .slice(0, 6)
    .map((candidate) => `第 ${formatCount(candidate.rowIndex + 1)} 个数据行「${compactValue(candidate.value)}」`)
    .join('、');
  const more =
    profile.conflictCount > 6 ? `…（共 ${formatCount(profile.conflictCount)} 处，最多列出 ${MAX_ITEMIZED_TYPE_CONFLICTS} 处）` : '';

  return {
    id: `column-type-${profile.index}`,
    kind: 'column-type',
    severity: 'attention',
    title: `「${profile.label}」按${profile.kindLabel}看，有 ${formatCount(profile.conflictCount)} 个类型不一致的候选值`,
    detail: `判断依据：${profile.basisText}不一致的位置：${shown}${more}。类型不一致只是「和整列的主流写法不同」，不等于填错了：它可能是备注、单位、缺测标记，也可能这一列本来混装了两种含义。请先与原始记录核对，本次没有把任何单元格改成数值或日期，也没有删除、填充或改写数据。`,
  };
}

/** 单元格可能很长（引号里含整段文字），问题条目里只取前面一段。 */
function compactValue(value: string): string {
  const text = value.trim();
  return text.length > 24 ? `${text.slice(0, 24)} …` : text;
}

/**
 * 把统计结果换成给学生看的问题列表。
 * 排序固定为「建议优先确认」在前，明细有上限但分类总数是全量真实值。
 */
export function buildQualityFindings(
  missing: MissingValueSummary,
  duplicates: DuplicateSummary,
  columnTypes: ColumnTypeSummary,
): {
  findings: DataQualityFinding[];
  itemizedTotals: { attention: number; info: number };
  truncated: boolean;
} {
  const drafts: DataQualityFinding[] = [];

  if (missing.recordCount === 0) {
    drafts.push({
      id: 'no-records',
      kind: 'no-records',
      severity: 'info',
      title: '文件只有表头，没有数据行可分析',
      detail: `识别到 ${formatCount(missing.columnCount)} 个字段名、0 条记录，缺失率与重复率按 0 处理，不做除零运算。`,
    });
  }

  for (const stats of missing.focusColumns) {
    drafts.push(columnFinding(stats, missing.recordCount));
  }

  for (const profile of columnTypes.columns) {
    if (profile.conflictCount > 0) drafts.push(typeConflictFinding(profile));
  }

  for (const group of duplicates.groups) {
    drafts.push(duplicateFinding(group));
  }

  const ordered = [...drafts].sort((left, right) => {
    const rank = (severity: DataQualityFinding['severity']): number => (severity === 'attention' ? 0 : 1);
    return rank(left.severity) - rank(right.severity);
  });

  // 「明细已折叠」这条说明必须出现在列表里，否则上限之外的重复组就成了静默丢弃。
  // 它不参与数据发现本身，所以从配额里预留一格，保证总数与逐条上限都仍然成立。
  const truncationNote: DataQualityFinding[] = duplicates.groupsTruncated
    ? [
        {
          id: 'duplicate-truncated',
          kind: 'duplicate-rows',
          severity: 'info',
          title: `另有 ${formatCount(duplicates.duplicateGroupCount - duplicates.groups.length)} 组重复记录没有逐条列出`,
          detail: `上面的重复组数、涉及记录数与额外副本数都按整份文件统计，没有少算；逐条列出的重复组最多 ${MAX_ITEMIZED_DUPLICATE_GROUPS} 组。`,
        },
      ]
    : [];
  const capacity = MAX_ITEMIZED_QUALITY_FINDINGS - truncationNote.length;
  const findings = [...ordered.slice(0, capacity), ...truncationNote];
  const itemizedTotals = { attention: 0, info: 0 };
  for (const finding of findings) {
    itemizedTotals[finding.severity] += 1;
  }

  return {
    findings,
    itemizedTotals,
    truncated: ordered.length > capacity,
  };
}

/**
 * 生成完整的数据质量报告。这是一个纯计算入口：它自身不做准入判断，
 * 调用方必须先确认 `evaluateQualityAdmission(table).allowed`，否则不得把结果当作正式结论展示。
 */
export function analyzeDataQuality(table: CsvTable): DataQualityReport {
  const missing = summarizeMissingValues(table);
  const duplicates = findDuplicateRecords(table);
  const columnTypes = analyzeColumnTypes(table);
  const findings = buildQualityFindings(missing, duplicates, columnTypes);

  return {
    fileName: table.fileName,
    recordCount: table.recordCount,
    columnCount: table.columnCount,
    missing,
    duplicates,
    columnTypes,
    findings: findings.findings,
    itemizedFindingTotals: findings.itemizedTotals,
    findingsTruncated: findings.truncated,
  };
}
