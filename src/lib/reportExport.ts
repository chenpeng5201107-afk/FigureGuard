import { AGGREGATION_LABELS, CHART_KIND_LABELS, diffChartConfig } from './chartConfig';
import type { ChartConfigSnapshot, ResolvedYAxisStart } from './chartConfig';
import { BASELINE_STATUS_LABELS, BASELINE_RULE_ID } from './chartDiagnostics';
import type { AxisStartEvidence, BaselineDiagnostic } from './chartDiagnostics';
import type { ChartScopeSummary, ChartDataResult } from './chartData';
import { formatTimeTick } from './chartData';
import { REPAIR_ACTION, REPAIR_ACTION_LABEL, describeRepairChanges, diffYAxisStart } from './chartRepair';
import type { ChartRepairRecord } from './chartRepair';
import { formatBytes, formatComputedValue, formatCount, formatRate } from './format';
import { buildExportFileName } from './fileDownload';
import type { CategoryAggregation, ChartKind } from '../types/chart';
import type { CsvTable } from '../types/csv';
import type { DataQualityReport, QualityAdmission } from '../types/dataQuality';

/**
 * Markdown 诊断报告（Day 9）：纯函数模块，不依赖 React、ECharts 与 DOM。
 *
 * 报告里的每一个数字都直接取自调用方当次渲染的真实计算结果（`CsvTable`、`analyzeDataQuality()`、
 * `computeChartData()`、`summarizeChartScope()`、`diagnoseBaseline()`、`ChartRepairRecord`），
 * 本模块只负责把它们排成可复核的章节，不重新实现任何统计口径，也不写死示例数据与结论。
 * 用户可控文本（文件名、表头、类别、单位）一律先压平换行再做 Markdown 转义，防止破坏标题与表格结构。
 *
 * 准入闸门在本模块内部落实：`input.admission.allowed === false` 时，第 2 至第 6 节一律只写「未执行、正式结果未输出」，
 * 即使调用方误传了非空的 `quality` / `chart` / `repair`，这里也不会把不可信的统计与诊断写成正式结论（防御式，不依赖 React UI 的禁用）。
 */

/** 报告正文的语言标识，便于阅读者确认这是机器生成的证据摘要。 */
export const REPORT_TITLE = 'FigureGuard 数据与图表诊断报告';
/** 逐条列出的上限：报告是摘要与证据，不是整份 CSV 的无上限复制。 */
export const MAX_REPORT_COLUMNS = 40;
export const MAX_REPORT_FINDINGS = 20;
export const MAX_REPORT_GROUPS = 20;
export const MAX_REPORT_DUPLICATE_GROUPS = 10;
export const MAX_REPORT_CONFLICT_CANDIDATES = 3;
export const MAX_REPORT_ROW_INDEXES = 8;

const NOT_FILLED = '未填写';
const NOT_APPLICABLE = '不适用';

/**
 * 准入未通过时第 2 至第 6 节共用的收尾说明。
 * 只说「本节未执行」还不够：阅读者很容易把「报告里没有风险」误读成「风险检查通过」，
 * 因此每个未执行的章节都要把这条误读正面堵住。
 */
export const ADMISSION_BLOCKED_SECTION_NOTE =
  '「未执行」不等于「检查通过」，也不等于「没有问题」：本节没有产出任何正式结论，不能把它当作数据或图表已被核实的证据。';

/** 准入未通过时首段的固定声明，与第 2 至第 6 节、下载面板的提示同一套说法。 */
export const ADMISSION_BLOCKED_HEADLINE =
  '**⚠ 非正式结论**：本数据集未通过质量准入。本报告仅记录文件来源、解析问题和阻止原因，' +
  '不提供正式数据统计、图表诊断或修复结论，请勿把它当作正式的数据质检结果引用。';

export interface ReportChartContext {
  kind: ChartKind;
  /** 字段原始下标（0 基）：重复表头时只有下标能唯一定位。 */
  xIndex: number;
  yIndex: number;
  xFieldLabel: string;
  yFieldLabel: string;
  aggregation: CategoryAggregation;
  /** 当前生效的标题 / 轴标题 / 单位快照。 */
  snapshot: ChartConfigSnapshot;
  /** 当前真正生效的纵轴起点解析结果（`appliedMin` 即写进 ECharts 的下界）。 */
  axisStart: ResolvedYAxisStart;
  result: ChartDataResult;
  scope: ChartScopeSummary;
  diagnostic: BaselineDiagnostic | null;
}

/** 图表类型别名：与 `types/chart` 的字面量集合一致，报告模块只接受这三种。 */
export type ReportChartKind = ChartKind;

export interface ReportInput {
  table: CsvTable;
  admission: QualityAdmission;
  /** 只有 `admission.allowed` 时才有值；准入未通过时本模块忽略它，不产出正式质量统计。 */
  quality: DataQualityReport | null;
  /** 当前画面上的图表；没有可绘制图形时为 null。准入未通过时本模块忽略它，不输出正式图表结论。 */
  chart: ReportChartContext | null;
  /** 当前仍然有效的修复记录；已撤销或已失效时调用方必须传 null。准入未通过时本模块同样忽略它。 */
  repair: ChartRepairRecord | null;
  generatedAt: Date;
}

const MARKDOWN_ESCAPES = /[\\`*_[\]{}()<>|&~#]/g;

function isControlChar(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * 把用户可控文本变成不会破坏 Markdown 结构的普通文字。
 *
 * - 换行、制表符与其它控制字符换成空格：动态内容不能自己新开标题、列表或表格行；
 * - `\` `` ` `` `*` `_` `[` `]` `<` `>` `&` `|` `~` `#` 加反斜杠转义：避免被解析成强调、代码、
 *   链接、HTML 标签、实体或表格分隔符（`&#60;` 这类数字实体会被 CommonMark 解码，所以 `&` 也必须转义）；
 * - 只处理要写进报告的文本，不改动 `CsvTable` 里的任何单元格。
 */
export function escapeMarkdownText(text: string): string {
  let flat = '';
  for (const char of text) {
    flat += isControlChar(char.codePointAt(0) ?? 0) ? ' ' : char;
  }
  return flat.replace(MARKDOWN_ESCAPES, (char) => `\\${char}`).replace(/ {2,}/g, ' ');
}

/** 带书名号的动态文本：即使转义后为空串也能看出「这里有一个空的值」。 */
function quoted(text: string): string {
  const escaped = escapeMarkdownText(text);
  return `「${escaped === '' ? '（空）' : escaped}」`;
}

function cell(text: string): string {
  const escaped = escapeMarkdownText(text);
  return escaped === '' ? '（空）' : escaped;
}

function tableRow(...values: string[]): string {
  return `| ${values.join(' | ')} |`;
}

const TABLE_DIVIDER = '| --- | --- |';
const TABLE_DIVIDER_3 = '| --- | --- | --- |';
const TABLE_ROW_HEADER_PROJECT = '| 项目 | 内容 |';

function formatClock(date: Date): string {
  if (!Number.isFinite(date.getTime())) return '（时间不可用）';
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

const SOURCE_LABELS: Record<CsvTable['source'], string> = {
  file: '用户上传文件（仅在当前浏览器内存里处理）',
  example: '内置合成示例数据（演示用，不是真实科研实验结果）',
};

function unitText(unit: string): string {
  return unit === '' ? `${NOT_FILLED}（系统不猜测、不换算单位）` : quoted(unit);
}

function fieldPosition(index: number): string {
  return `原始第 ${formatCount(index + 1)} 列（下标 ${index}）`;
}

function rowIndexList(indexes: readonly number[]): string {
  const shown = indexes.slice(0, MAX_REPORT_ROW_INDEXES).map((index) => formatCount(index + 1));
  const rest = indexes.length - shown.length;
  return rest > 0 ? `${shown.join('、')} 等 ${formatCount(indexes.length)} 条` : shown.join('、');
}

/** 纵轴起点在报告里的说法：只认真正生效的 `appliedMin`，不复述输入框原文。 */
function axisStartText(axisStart: ResolvedYAxisStart): string {
  if (axisStart.mode === 'auto') return '自动范围：不固定纵轴下界，由坐标轴自动包含 0（负值与 0 一并显示，不裁剪）';
  if (axisStart.appliedMin === null) {
    return `手动设置未生效：${axisStart.error ?? '配置无效，已退回自动范围'}`;
  }
  const notice = axisStart.notice === null ? '' : ` 注意：${axisStart.notice}`;
  return `手动 ${formatComputedValue(axisStart.appliedMin)}（该值已真正写进 ECharts 的 yAxis.min，是画布实际使用的下界）${notice}`;
}

/** 修复记录里保存的轴证据快照的说法：只有模式与生效下界，没有当次解析的错误文本。 */
function evidenceStartText(start: AxisStartEvidence): string {
  if (start.mode === 'auto') return '自动范围：不固定纵轴下界，由坐标轴自动包含 0（负值与 0 一并显示，不裁剪）';
  return start.appliedMin === null ? '手动配置未生效（按自动范围绘制）' : `手动 ${formatComputedValue(start.appliedMin)}`;
}

function aggregationText(aggregation: CategoryAggregation, kind: ReportChartKind): string {
  if (kind !== 'bar') return `${AGGREGATION_LABELS.raw}（散点图与折线图没有类别轴，恒为逐条原始记录）`;
  return AGGREGATION_LABELS[aggregation];
}

function statusText(diagnostic: BaselineDiagnostic | null): string {
  if (diagnostic === null) return '未产出诊断（当前没有可检查的图表）';
  return `${BASELINE_STATUS_LABELS[diagnostic.status]}（状态码 ${diagnostic.status}）`;
}

// ---------------------------------------------------------------- 各章节

function sectionSource(table: CsvTable, admission: QualityAdmission, generatedAt: Date): string[] {
  const lines: string[] = ['## 1. 数据来源', ''];
  lines.push(TABLE_ROW_HEADER_PROJECT, TABLE_DIVIDER);
  lines.push(tableRow('CSV 文件名称', quoted(table.fileName)));
  lines.push(tableRow('来源类型', cell(SOURCE_LABELS[table.source])));
  lines.push(tableRow('原始文件大小', `${cell(formatBytes(table.sizeBytes))}（按 UTF-8 字节统计）`));
  lines.push(tableRow('数据记录数', `${cell(formatCount(table.recordCount))} 条（不含表头）`));
  lines.push(tableRow('字段数', `${cell(formatCount(table.columnCount))} 个`));
  lines.push(tableRow('实际使用的分隔符', quoted(table.delimiter)));
  lines.push(
    tableRow(
      '字段名（按原始列序）',
      cell(
        table.columns
          .slice(0, MAX_REPORT_COLUMNS)
          .map((column, index) => `${index}:${column.trim() === '' ? '（空表头）' : column}`)
          .join(' ｜ '),
      ),
    ),
  );
  if (table.columns.length > MAX_REPORT_COLUMNS) {
    lines.push(
      tableRow(
        '字段名截断说明',
        cell(`只逐条列出前 ${formatCount(MAX_REPORT_COLUMNS)} 个字段名，字段数共 ${formatCount(table.columnCount)} 个。`),
      ),
    );
  }
  lines.push(
    tableRow(
      '当前数据解析状态',
      cell(
        `${table.structure.state === 'sound' ? '行列结构与表头一致（sound）' : '行列结构降级（degraded）'}；` +
          `${formatCount(admission.parseErrorCount)} 条会读错数据的格式错误、${formatCount(admission.noticeCount)} 条说明性提示`,
      ),
    ),
  );
  lines.push(tableRow('数据质量准入', admission.allowed ? '通过' : '未通过'));
  lines.push(tableRow('报告生成时间', `${cell(formatClock(generatedAt))}（本地时区）`));
  lines.push('');

  if (table.structure.state !== 'sound') {
    lines.push('结构降级依据：');
    for (const reason of table.structure.reasons) lines.push(`- ${cell(reason)}`);
    lines.push(
      `- 字段数少于表头的记录 ${cell(formatCount(table.structure.rowsWithMissingFields))} 条、` +
        `多于表头的记录 ${cell(formatCount(table.structure.rowsWithExtraFields))} 条、` +
        `没有列名接收而被丢弃的值 ${cell(formatCount(table.structure.droppedExtraValues))} 个、` +
        `被改名的表头列 ${cell(formatCount(table.structure.renamedHeaderColumns))} 个。`,
    );
    lines.push('');
  }
  if (admission.blockers.length > 0) {
    lines.push('阻止正式结论的原因：');
    for (const blocker of admission.blockers) {
      lines.push(`- ${cell(blocker.message)}`);
      for (const evidence of blocker.evidence) lines.push(`  - 依据：${cell(evidence)}`);
    }
    lines.push('');
  }

  lines.push(
    '说明：文件名称只用于标明数据来源。FigureGuard 不上传、不保存原始文件，' +
      '全部解析与统计都在当前浏览器内存里完成，关闭页面即消失；本报告也不包含原始 CSV 的全部数据行。',
  );
  lines.push('');
  return lines;
}

function sectionQuality(admission: QualityAdmission, quality: DataQualityReport | null): string[] {
  const lines: string[] = ['## 2. 数据质量摘要', ''];

  if (!admission.allowed) {
    lines.push(
      '本次**未输出**数据质量统计：上面的准入判断没有通过，单元格可能已经错位或丢值，' +
        '在此之上算出的缺失值、重复记录与类型结论都不可信。',
    );
    lines.push('');
    lines.push('本节因质量准入未通过而**未执行**：调用方传入的统计结果不会在这里被复述，缺失、重复与类型冲突都没有被检查。');
    lines.push('');
    lines.push(ADMISSION_BLOCKED_SECTION_NOTE);
    lines.push('');
    lines.push('第 1 节的解析状态与阻止原因即为该数据集当前的真实结论；修好源文件（补齐引号、统一每行字段数）后重新上传，才会生成正式的质量摘要。');
    lines.push('');
    return lines;
  }

  if (quality === null) {
    lines.push(
      '本节**未执行**，正式数据质量统计**未输出**：调用方没有提供质量分析结果，本报告不会凭空补一份统计，也不会据此判断数据有没有问题。',
    );
    lines.push('');
    lines.push(ADMISSION_BLOCKED_SECTION_NOTE);
    lines.push('');
    return lines;
  }

  const { missing, duplicates, columnTypes } = quality;
  lines.push('以下数字直接取自 `analyzeDataQuality()` 的既有统计口径（空字符串、纯空白、结构性缺列与「0」分开计数），本模块不重新统计。', '');
  lines.push(TABLE_ROW_HEADER_PROJECT, TABLE_DIVIDER);
  lines.push(tableRow('原始记录数 / 列数', `${cell(formatCount(missing.recordCount))} 条 ／ ${cell(formatCount(missing.columnCount))} 列`));
  lines.push(tableRow('整表单元格数', `${cell(formatCount(missing.cellCount))} 个`));
  lines.push(
    tableRow(
      '空字符串单元格（内容缺失）',
      `${cell(formatCount(missing.totalEmptyCells))} 个（占整表 ${cell(formatRate(missing.overallEmptyRate))}）`,
    ),
  );
  lines.push(tableRow('只有空白字符的单元格', `${cell(formatCount(missing.totalBlankCells))} 个（单列口径，未并入上面的缺失数量）`));
  lines.push(tableRow('结构性缺列', `${cell(formatCount(missing.totalStructuralGaps))} 处（该行字段数少于表头，不是数据本身为空）`));
  lines.push(tableRow('存在内容不完整的字段', `${cell(formatCount(missing.columnsWithQualityGap))} ／ ${cell(formatCount(missing.columnCount))} 列`));
  lines.push(tableRow('完全重复组数', `${cell(formatCount(duplicates.duplicateGroupCount))} 组（判定口径：整行每个字段都相同）`));
  lines.push(tableRow('涉及重复的记录数', `${cell(formatCount(duplicates.recordsInDuplicateGroups))} 条（占记录数 ${cell(formatRate(duplicates.duplicateRate))}）`));
  lines.push(tableRow('额外副本数量', `${cell(formatCount(duplicates.extraCopyCount))} 条（= 涉及记录数 − 重复组数）`));
  lines.push(
    tableRow(
      '字段类型冲突候选',
      `${cell(formatCount(columnTypes.totalConflictCells))} 个单元格，分布在 ${cell(formatCount(columnTypes.columnsWithConflicts))} ／ ` +
        `${cell(formatCount(columnTypes.columnsChecked))} 个参与比对的字段中`,
    ),
  );
  lines.push('');

  lines.push('### 2.1 字段类型推断', '');
  lines.push('| 字段（位置） | 推断类型与依据 | 冲突候选 |', TABLE_DIVIDER_3);
  const profiles = columnTypes.columns.slice(0, MAX_REPORT_COLUMNS);
  for (const profile of profiles) {
    lines.push(
      tableRow(
        `${quoted(profile.label)}（${fieldPosition(profile.index)}）`,
        `${cell(profile.kindLabel)}｜${cell(profile.basisText)}`,
        profile.conflictCount === 0
          ? '0 个'
          : `${cell(formatCount(profile.conflictCount))} 个${profile.conflictsTruncated ? `（逐条列出上限之外仍按全量计数）` : ''}`,
      ),
    );
  }
  if (columnTypes.columns.length > profiles.length) {
    lines.push('');
    lines.push(
      `字段类型表只逐条列出前 ${cell(formatCount(profiles.length))} 列，共 ${cell(formatCount(columnTypes.columnCount))} 列；` +
        '未列出的字段仍按真实结果参与上面的总量统计。',
    );
  }
  lines.push('');

  const withConflicts = columnTypes.columns.filter((profile) => profile.conflictCount > 0);
  if (withConflicts.length > 0) {
    lines.push('冲突候选样例（每个字段最多列出若干处，完整计数见上表）：');
    for (const profile of withConflicts.slice(0, MAX_REPORT_COLUMNS)) {
      const shown = profile.conflicts
        .slice(0, MAX_REPORT_CONFLICT_CANDIDATES)
        .map((conflict) => `第 ${cell(formatCount(conflict.rowIndex + 1))} 个数据行 ${quoted(conflict.value)}`)
        .join('、');
      const rest = profile.conflictCount - Math.min(profile.conflicts.length, MAX_REPORT_CONFLICT_CANDIDATES);
      const suggestion = profile.conflicts[0]?.suggestion ?? '';
      lines.push(
        `- ${quoted(profile.label)}：${shown}${rest > 0 ? `；另有 ${cell(formatCount(rest))} 处未逐条列出` : ''}。` +
          `${suggestion === '' ? '' : cell(suggestion)}`,
      );
    }
    lines.push('');
  }

  lines.push('### 2.2 质量规则发现的问题摘要', '');
  const totals = quality.itemizedFindingTotals;
  lines.push(
    `本节逐条列出 ${cell(formatCount(quality.findings.length))} 条（${cell(formatCount(totals.attention))} 条建议优先确认、` +
      `${cell(formatCount(totals.info))} 条仅说明）。这是**已列出的明细条数**，不是问题的真实总数：` +
      '完整的缺失、重复与冲突计数一律以上面的统计表为准。',
  );
  lines.push('');
  if (quality.findings.length === 0) {
    lines.push('- 本次规则没有发现需要列出的问题条目（仅指当前规则覆盖的缺失、整行重复与类型不一致，不代表数据完全正确）。');
  }
  for (const finding of quality.findings.slice(0, MAX_REPORT_FINDINGS)) {
    lines.push(`- ${cell(finding.title)}`);
    lines.push(`  - ${cell(finding.detail)}`);
  }
  const hiddenFindings = quality.findings.length - Math.min(quality.findings.length, MAX_REPORT_FINDINGS);
  if (hiddenFindings > 0) {
    lines.push(`- 另有 ${cell(formatCount(hiddenFindings))} 条问题摘要未在报告中逐条展开，完整列表见页面「数据质量概览」；上面的分类计数不受此影响。`);
  }
  if (quality.findingsTruncated) {
    lines.push(
      '- 说明：问题列表一次最多生成 100 条（受上游明细上限约束），超出部分仍按真实数量计入统计表，不会因为没写进报告而少算。',
    );
  }
  lines.push('');

  if (duplicates.duplicateGroupCount > 0) {
    lines.push('重复组明细（只列前若干组，组数与记录数按全量统计）：');
    for (const group of duplicates.groups.slice(0, MAX_REPORT_DUPLICATE_GROUPS)) {
      lines.push(
        `- 从第 ${cell(formatCount(group.firstRowIndex + 1))} 个数据行开始的 ${cell(formatCount(group.occurrenceCount))} 条记录整行相同：` +
          `行号 ${rowIndexList(group.rowIndexes)}。`,
      );
    }
    const hiddenGroups = duplicates.duplicateGroupCount - Math.min(duplicates.groups.length, MAX_REPORT_DUPLICATE_GROUPS);
    if (hiddenGroups > 0) {
      lines.push(`- 另有 ${cell(formatCount(hiddenGroups))} 组重复记录没有逐条列出，已计入上面的重复组数与涉及记录数。`);
    }
    lines.push('');
  }

  lines.push(
    '以上统计全程只读：没有填充缺失值、没有删除重复行、没有改写任何单元格，也没有判断数值大小是否合理（异常值分析未实现）。',
  );
  lines.push('');
  return lines;
}

function groupSummaryLines(chart: ReportChartContext): string[] {
  const { result } = chart;
  if (result.aggregation === 'raw' || result.groups.length === 0) return [];
  const valueLabel = result.aggregation === 'mean' ? '平均值' : '合计';
  const lines: string[] = [
    '',
    `分组摘要（${cell(AGGREGATION_LABELS[result.aggregation])}，每组给出有效样本数 n 与原始数据行号）：`,
    '',
    '| 类别 | 有效样本数 n | ' + valueLabel + ' | 原始数据行号 |',
    '| --- | --- | --- | --- |',
  ];
  for (const group of result.groups.slice(0, MAX_REPORT_GROUPS)) {
    lines.push(
      tableRow(
        quoted(group.key),
        formatCount(group.samples.length),
        formatComputedValue(group.value),
        rowIndexList(group.samples.map((sample) => sample.rowIndex)),
      ),
    );
  }
  if (result.groups.length > MAX_REPORT_GROUPS) {
    lines.push(
      '',
      `分组摘要只逐条列出前 ${cell(formatCount(MAX_REPORT_GROUPS))} 组，本图实际成柱 ${cell(formatCount(result.groups.length))} 根、` +
        `类别组共 ${cell(formatCount(result.categoryTotal ?? 0))} 组。`,
    );
  }
  if (result.overflowGroups.length > 0) {
    lines.push('');
    lines.push(
      `另有 ${cell(formatCount(result.overflowGroups.length))} 个类别组的聚合结果无法用有限数值表示，没有成柱；` +
        '组内记录仍然有效，样本与行号未丢失。',
    );
  }
  return lines;
}

function sectionChartConfig(chart: ReportChartContext | null, admissionAllowed: boolean): string[] {
  const lines: string[] = ['## 3. 当前图表配置', ''];

  if (!admissionAllowed) {
    lines.push(
      '本节**未执行**：本数据集未通过质量准入（依据见第 1 节），正式图表分析结论**未输出**——' +
        '图表类型、X ／ Y 字段配对、聚合口径、标题与单位、纵轴起点、分组聚合结果与数据范围一律不写进本报告。',
    );
    lines.push('');
    lines.push('屏幕上当前的字段选择只用于浏览与修好文件后的对照，不构成对这份数据的绘图结论；调用方传入的图表配置同样不会被复述。');
    lines.push('');
    lines.push(ADMISSION_BLOCKED_SECTION_NOTE);
    lines.push('');
    return lines;
  }

  if (chart === null) {
    lines.push('当前画面没有可导出的图表：或未选择合法的 X ／ Y 字段，或所选字段下没有可绘制的数据点。');
    lines.push('本节只描述**已经生效并画在屏幕上**的配置，不为没有生成的图表编造参数。');
    lines.push('');
    return lines;
  }

  const { snapshot, result } = chart;
  lines.push(TABLE_ROW_HEADER_PROJECT, TABLE_DIVIDER);
  lines.push(tableRow('图表类型', cell(CHART_KIND_LABELS[chart.kind])));
  lines.push(tableRow('X 轴字段', `${quoted(chart.xFieldLabel)}（${cell(fieldPosition(chart.xIndex))}）`));
  lines.push(tableRow('Y 轴字段', `${quoted(chart.yFieldLabel)}（${cell(fieldPosition(chart.yIndex))}）`));
  lines.push(
    tableRow(
      '字段位置为何要写进报告',
      '表头允许重复与改名，只有原始列下标能唯一定位字段；此处下标为 0 基，第 1 列即下标 0。',
    ),
  );
  lines.push(tableRow('图表标题', quoted(snapshot.title)));
  lines.push(tableRow('X 轴标题', quoted(snapshot.xTitle)));
  lines.push(tableRow('X 轴单位', unitText(snapshot.xUnit)));
  lines.push(tableRow('X 轴标注（轴标题 + 单位）', quoted(snapshot.xAxisLabel)));
  lines.push(tableRow('Y 轴标题', quoted(snapshot.yTitle)));
  lines.push(tableRow('Y 轴单位', unitText(snapshot.yUnit)));
  lines.push(tableRow('Y 轴标注（轴标题 + 单位）', quoted(snapshot.yAxisLabel)));
  lines.push(
    tableRow('分类聚合方式', `${cell(aggregationText(result.aggregation, chart.kind))}（该口径由用户在界面上选择）`),
  );
  lines.push(
    tableRow(
      '纵轴起点',
      chart.kind === 'bar' ? cell(axisStartText(chart.axisStart)) : `${NOT_APPLICABLE}：Y 轴起点配置只作用于柱状图的纵轴下界`,
    ),
  );
  lines.push(tableRow('单图展示上限', `${cell(formatCount(result.cap))} 个展示单元（柱状图按类别组或记录计，散点／折线按观测点计）`));
  lines.push(
    tableRow(
      '进入图表的 Y 数值范围',
      result.yRange === null ? '无（本图没有绘制任何数值）' : `${cell(formatComputedValue(result.yRange.min))} – ${cell(formatComputedValue(result.yRange.max))}`,
    ),
  );
  if (chart.kind === 'bar') {
    const labels = result.points.map((point) => point.axisLabel).filter((label) => label !== '');
    const shown = labels.slice(0, MAX_REPORT_GROUPS);
    lines.push(
      tableRow(
        '类别轴（前若干项）',
        shown.length === 0
          ? '无'
          : `${shown.map((label) => quoted(label)).join('、')}${labels.length > shown.length ? ` 等 ${cell(formatCount(labels.length))} 项` : ''}`,
      ),
    );
  } else if (chart.kind === 'line' && result.timeRange !== null) {
    lines.push(
      tableRow(
        'X 轴时间范围（UTC）',
        `${cell(formatTimeTick(result.timeRange.min))} – ${cell(formatTimeTick(result.timeRange.max))}（折线实际绘制的起止时刻）`,
      ),
    );
  } else {
    const xValues = result.points
      .map((point) => point.xValue)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    lines.push(
      tableRow(
        'X 轴数值范围',
        xValues.length === 0
          ? '无（本图没有绘制任何数值）'
          : `${cell(formatComputedValue(Math.min(...xValues)))} – ${cell(formatComputedValue(Math.max(...xValues)))}（按实际绘制的点统计）`,
      ),
    );
  }
  lines.push('');
  lines.push(
    '单位一律由用户填写，系统不猜测、不做换算；标题与轴标注只改变图表表达，不参与任何数值计算。',
    '',
  );

  lines.push('### 3.1 数据处理与展示口径', '');
  for (const note of chart.scope.methodNotes) lines.push(`- ${cell(note)}`);
  if (chart.kind !== 'bar') {
    lines.push('- 当前不是柱状图：不存在按类别求平均或求和，所有展示单元都对应逐条原始记录。');
  }
  if (result.aggregation === 'sum') {
    lines.push('- 求和是**用户选择的聚合方式**：本报告不据此推断该指标具有科学可加性，也不判断求和是否适合该列。');
  }
  if (result.aggregation === 'mean') {
    lines.push('- 平均值按组内有效样本数 n 计算，n 已随每组一起列出；缺失与无效记录既不进入分子也不进入分母。');
  }
  if (chart.kind === 'line') {
    lines.push('- 时间排序规则：按 UTC 组装的时间戳升序连接观测点，同一时刻按上传顺序排列；不平滑、不插值、不补测。');
  }
  lines.push(...groupSummaryLines(chart));
  lines.push('');
  return lines;
}

function sectionRecords(chart: ReportChartContext | null, admissionAllowed: boolean): string[] {
  const lines: string[] = ['## 4. 参与绘图与排除记录', ''];

  if (!admissionAllowed) {
    lines.push(
      '本节**未执行**，正式结果**未输出**：准入未通过时不统计「有效记录数、因缺失排除、因类型不符排除、实际显示单元、' +
        '受展示上限隐藏」这些数字——它们建立在可能已经错位的单元格之上，写出来只会把解析问题包装成数据统计。',
    );
    lines.push('');
    lines.push('文件里共有多少条记录、多少个字段，见第 1 节的解析状态；那是解析层面的事实，不是本节的数据参与统计结论。');
    lines.push('');
    lines.push(ADMISSION_BLOCKED_SECTION_NOTE);
    lines.push('');
    return lines;
  }

  if (chart === null) {
    lines.push('没有参与绘图的记录可报告：当前没有生成图表（见第 3 节）。');
    lines.push('');
    return lines;
  }

  const { result } = chart;
  const aggregated = result.aggregation !== 'raw';
  lines.push(TABLE_ROW_HEADER_PROJECT, TABLE_DIVIDER);
  lines.push(tableRow('1. 原始记录总数', `${cell(formatCount(result.rawTotal))} 条（整份数据集，不受表格分页影响）`));
  lines.push(tableRow('2. 满足当前 X ／ Y 条件的有效记录数', `${cell(formatCount(result.validCount))} 条`));
  lines.push(tableRow('3a. 因缺失值排除', `${cell(formatCount(result.missingExcluded))} 条`));
  lines.push(tableRow('3b. 因类型不符或非有限数值排除', `${cell(formatCount(result.invalidExcluded))} 条`));
  lines.push(
    tableRow(
      '4. 实际显示的数据单元',
      `${cell(formatCount(result.displayedCount))} ${aggregated ? '根柱子' : '个观测点'}`,
    ),
  );
  lines.push(
    tableRow(
      '5. 有效但因展示上限未显示',
      aggregated
        ? `${cell(formatCount(result.capHidden))} 条记录，属于 ${cell(formatCount(result.hiddenCategoryCount))} 个未成柱的类别组`
        : `${cell(formatCount(result.capHidden))} 条`,
    ),
  );
  lines.push(
    tableRow(
      '6. 聚合结果无法有限表示、因此未成图的类别组',
      aggregated
        ? `${cell(formatCount(result.overflowGroups.length))} 组（含 ${cell(
            formatCount(result.overflowGroups.reduce((sum, group) => sum + group.samples.length, 0)),
          )} 条有效记录）`
        : `${NOT_APPLICABLE}（当前没有类别聚合）`,
    ),
  );
  if (aggregated) {
    lines.push(tableRow('类别组总数（全量）', `${cell(formatCount(result.categoryTotal ?? 0))} 组`));
  }
  lines.push('');
  lines.push(`统计口径：${cell(chart.scope.headline)}`);
  lines.push('');
  for (const breakdown of chart.scope.breakdown) lines.push(`- ${cell(breakdown)}`);
  if (chart.scope.capNote !== null) lines.push(`- ${cell(chart.scope.capNote)}`);
  if (chart.scope.overflowNote !== null) lines.push(`- ${cell(chart.scope.overflowNote)}`);
  lines.push('');
  lines.push(
    aggregated
      ? '注意：显示的数据单元数不等于参与计算的原始记录数。上表的分组聚合把同一条别的若干记录合并成一根柱子，' +
        '每组背后的有效样本数 n 与原始行号见第 3.1 节的分组摘要；被合并的记录一条都没有被丢弃或改写。'
      : '注意：显示的数据点数可能少于有效记录数（受上面的展示上限影响），未显示的记录仍然有效，只是没有出现在图上。',
  );
  lines.push('');
  return lines;
}

function sectionDiagnostic(chart: ReportChartContext | null, admissionAllowed: boolean): string[] {
  const lines: string[] = ['## 5. 图表表达风险诊断', ''];

  if (!admissionAllowed) {
    lines.push(
      '本节**未执行**：本数据集未通过质量准入（依据见第 1 节），零基线等图表表达风险诊断没有运行，' +
        '诊断状态**未输出**——本报告在这里既不给「存在风险」的结论，也不给「未发现风险」的结论。',
    );
    lines.push('');
    lines.push(
      '调用方传入的诊断结果（无论 risk、clear 还是 not-applicable）都不会被复述：数据本身可能已经错位，' +
        '在此基础上判断图表表达是否误导没有意义。准入未通过说的是**数据可信度不足**，与这张图有没有非零基线风险是两件事，互不能替代。',
    );
    lines.push('');
    lines.push(ADMISSION_BLOCKED_SECTION_NOTE);
    lines.push('');
    return lines;
  }

  if (chart === null || chart.diagnostic === null) {
    lines.push('当前没有可诊断的图表，未产出任何风险结论（没有生成图表不等于「检查通过」）。');
    lines.push('');
    return lines;
  }

  const diagnostic = chart.diagnostic;
  lines.push(TABLE_ROW_HEADER_PROJECT, TABLE_DIVIDER);
  lines.push(tableRow('规则 ID', `\`${cell(diagnostic.ruleId)}\``));
  lines.push(
    tableRow(
      '检查对象',
      `${cell(CHART_KIND_LABELS[diagnostic.chartKind])}（本规则只适用于${cell(CHART_KIND_LABELS[diagnostic.appliesTo])}，配置来源 \`${cell(diagnostic.configSource)}\`）`,
    ),
  );
  lines.push(tableRow('检查状态', cell(statusText(diagnostic))));
  lines.push(tableRow('风险级别', diagnostic.level === 'advisory' ? '建议核查（advisory）' : '无（none）'));
  lines.push(
    tableRow(
      '当前真实生效的轴配置',
      chart.kind === 'bar'
        ? cell(axisStartText(chart.axisStart))
        : `${NOT_APPLICABLE}：散点图与折线图的坐标轴起点不受该配置影响`,
    ),
  );
  lines.push(
    tableRow(
      '参与判断的 Y 轴数值范围',
      diagnostic.dataRange === null
        ? '无（本图没有绘制任何数值）'
        : `${cell(formatComputedValue(diagnostic.dataRange.min))} – ${cell(formatComputedValue(diagnostic.dataRange.max))}（字段 ${quoted(diagnostic.yFieldLabel)}）`,
    ),
  );
  lines.push(tableRow('判断依据', cell(diagnostic.summary)));
  lines.push(tableRow('可能影响', diagnostic.impact === '' ? '本状态不产出视觉影响判断' : cell(diagnostic.impact)));
  lines.push(tableRow('改进建议', cell(diagnostic.recommendation)));
  lines.push('');

  if (diagnostic.status === 'not-applicable') {
    lines.push(
      '当前主要检查项只有「普通柱状图的零基线表达风险」这一条规则：散点图与折线图**不适用**该规则，' +
        '这是「未作判断」，不是「所有风险检查通过」，也不代表该图没有任何表达问题。',
    );
  } else if (diagnostic.status === 'clear') {
    lines.push(
      '「未发现风险」只说明当前这条规则（`' + cell(BASELINE_RULE_ID) + '`）在现行配置下没有发现问题，' +
        '不能据此认为图表或科研结论正确；图例、误差棒、样本量、异常值等检查项本工具尚未实现。',
    );
  } else if (diagnostic.status === 'invalid-config') {
    lines.push('当前纵轴起点配置无效、并没有真正应用到坐标轴上，因此本规则不产出风险判断，图表按自动范围绘制。');
  } else if (diagnostic.status === 'no-data') {
    lines.push('没有可绘制的有限数值，本规则无法判断纵轴可见范围。');
  } else {
    lines.push('这是一条基于图表表达的建议，用于帮助你核查纵轴起点，不据此认定数据错误，也不构成对科研结论真伪的判断。');
  }
  lines.push('');
  return lines;
}

function sectionRepair(chart: ReportChartContext | null, repair: ChartRepairRecord | null, admissionAllowed: boolean): string[] {
  const lines: string[] = ['## 6. 图表修复记录', ''];

  if (!admissionAllowed) {
    lines.push(
      '本节**未执行**，修复结论**未输出**：本数据集未通过质量准入（依据见第 1 节），' +
        '报告不记录生效的修复操作，也不列出修复前后的配置差异与前后诊断状态。',
    );
    lines.push('');
    lines.push(
      '即使调用方传入了修复记录，这里也不会复述：在可能错位的单元格上宣称「已恢复零基线」，' +
        '等于给一份不可信的图表盖上已修复的章。准入通过并重新出图后，修复记录才会随当次的真实配置一起写入。',
    );
    lines.push('');
    lines.push(ADMISSION_BLOCKED_SECTION_NOTE);
    lines.push('');
    return lines;
  }

  if (repair === null) {
    lines.push(
      '当前没有生效的修复记录：本次会话没有执行过零基线修复，或修复已被撤销、' +
        '或因更换数据文件／图表类型／X ／ Y 字段／聚合方式／标题与单位而失效并被清除。',
    );
    lines.push('本报告只记录当前画面的真实状态（见第 3 与第 5 节），不追述已经失效的历史对比。');
    lines.push('');
    return lines;
  }

  const currentDiagnostic = chart?.diagnostic ?? null;
  const configDiff = diffChartConfig(repair.beforeSnapshot, repair.afterSnapshot);
  const axisDiff = diffYAxisStart(repair.beforeAxisStart, repair.afterAxisStart);

  lines.push(TABLE_ROW_HEADER_PROJECT, TABLE_DIVIDER);
  lines.push(
    tableRow('使用的风险规则', `${quoted(repair.evidence.title)}（规则 ID \`${cell(repair.ruleId)}\`，当时状态 ${cell(repair.evidence.status)}）`),
  );
  lines.push(tableRow('本次修复操作', `${cell(REPAIR_ACTION_LABEL)}（操作 ID \`${cell(REPAIR_ACTION)}\`）`));
  lines.push(
    tableRow(
      '修复前真实纵轴下界',
      `${cell(formatComputedValue(repair.beforeAppliedMin))}（取自当时真正写进 ECharts yAxis.min 的值，不是输入框里的原文）`,
    ),
  );
  lines.push(tableRow('修复后纵轴模式', cell(evidenceStartText(repair.afterAxisStart))));
  lines.push('');

  lines.push('修复前后的配置差异：', '');
  lines.push('| 项目 | 修复前 | 修复后 |', TABLE_DIVIDER_3);
  if (axisDiff !== null) lines.push(tableRow(axisDiff.label, cell(axisDiff.before), cell(axisDiff.after)));
  if (configDiff.length === 0 && axisDiff === null) {
    lines.push(tableRow('（无差异）', '—', '—'));
  }
  for (const change of configDiff) lines.push(tableRow(change.label, cell(change.before), cell(change.after)));
  lines.push('');

  for (const item of describeRepairChanges(repair)) lines.push(`- ${cell(item.label)}：${cell(item.value)}`);
  lines.push(
    `- 修复后重新计算的诊断状态：${cell(statusText(currentDiagnostic))}${
      currentDiagnostic === null ? '' : `（${cell(currentDiagnostic.summary)}）`
    }`,
  );
  lines.push('');
  lines.push(
    '本记录的数据上下文是第 1 节所描述的当前这份数据。更换 CSV、字段、聚合方式或再次修改任何图表配置后，' +
      '这条记录即失效并从报告里消失，不会把旧文件的对比带进新报告。',
  );
  lines.push('自动范围表示纵轴包含 0，不等于实际刻度下界恰好等于 0；修复只调整表达配置，没有改变任何原始数值。');
  lines.push('');
  return lines;
}

function sectionBoundary(chart: ReportChartContext | null, admissionAllowed: boolean): string[] {
  const lines: string[] = ['## 7. 分析边界与说明', ''];
  lines.push('- 数据质量检测只能发现空值、整行重复与类型写法不一致这类结构问题，**不能证明数据完全正确**，也不能替代与原始记录的核对。');
  lines.push('- 类型冲突候选与疑似重复只是「和主流写法不同」的提示，不等于数据错误：可能是备注、单位、缺测标记或合法副本，需人工确认。');
  lines.push('- 图表修复只改变表达配置（柱状图纵轴起点），不改变原始实验数据、字段选择、聚合结果与记录计数。');
  lines.push('- 柱状图零基线规则不适用于所有图表类型：散点图与折线图记为「不适用」，其它表达问题（图例、误差棒、配色、样本量）尚未纳入检查。');
  lines.push('- 相关性不等于因果：散点图与折线图只呈现已录入的观测点，未做拟合、插值、平滑、显著性检验或趋势外推。');
  lines.push('- 本报告不自动生成统计显著性、误差棒、置信区间、异常值判定或任何科学结论；「未发现风险」不等于科研结论正确。');

  if (!admissionAllowed) {
    lines.push(
      '- 本次质量准入未通过：第 2 至第 6 节**未执行**，本报告只记录文件来源、解析状态、阻止依据与分析限制，' +
        '不含正式数据质量统计、图表配置与绘图结果、风险诊断或修复结论。',
    );
    lines.push('- 未执行不等于通过检查：不能把本报告读作「数据没有缺失与重复」「图表没有表达风险」或「不需要修复」。');
    lines.push('- 准入未通过时不提供 PNG 导出：屏幕上没有正式图表，也就没有可以归档的图片。修好源文件后重新上传，再一起导出正式报告与 PNG。');
  } else if (chart === null) {
    lines.push('- 本次没有生成图表，因此第 3 至第 6 节只说明未生成的事实，不含任何对图表表达的推断。');
  } else {
    if (chart.result.capHidden > 0) {
      lines.push(
        `- 受单图展示上限（${cell(formatCount(chart.result.cap))}）影响，本图有 ${cell(formatCount(chart.result.capHidden))} 条有效记录未显示，` +
          '它们未出现在 PNG 中，也没有进入第 5 节的 Y 数值范围判断。',
      );
    }
    if (chart.result.overflowGroups.length > 0) {
      lines.push(
        `- ${cell(formatCount(chart.result.overflowGroups.length))} 个类别组的聚合结果超出可表示范围，没有成柱；` +
          '这些组的记录本身有效，不能按无效数据理解。',
      );
    }
    lines.push('- 与本报告配套的 PNG 图表需作为单独附件一同归档：本文件不内嵌图片，只有两者一起才能复核「屏幕上看到什么、报告里就写了什么」。');
  }
  lines.push('- 全部导出都在浏览器本地完成，不发送到服务器，不需要登录，也不调用外部接口或大模型服务。');
  lines.push('');
  return lines;
}

/**
 * 生成完整的 Markdown 报告文本（LF 换行、UTF-8 交给调用方编码）。
 * 每一次调用都会重新读取传入的真实计算结果，因此修复、撤销、换字段、换文件之后再生成即为最新状态。
 *
 * `admission.allowed === false` 时本函数自身即拒绝输出正式结论：第 2 至第 6 节改为「未执行」说明，
 * 传入的 `quality` / `chart` / `repair` 一律不复述。调用层的禁用与这里的闸门是两道独立防线。
 */
export function buildMarkdownReport(input: ReportInput): string {
  const allowed = input.admission.allowed;
  const lines: string[] = [`# ${REPORT_TITLE}`, ''];

  if (!allowed) {
    lines.push(ADMISSION_BLOCKED_HEADLINE, '');
    lines.push(
      `阻止依据共 ${formatCount(input.admission.blockers.length)} 条，逐条列在第 1 节的「阻止正式结论的原因」里；` +
        '第 2 至第 6 节因准入未通过而**未执行**，正式结果**未输出**，第 7 节说明本次分析边界。',
      '',
    );
    lines.push(
      '修好源文件（补齐引号、统一每行字段数）后重新上传，才会按当时的画面生成正式的数据质量摘要、图表配置记录、风险诊断与修复记录。',
      '',
    );
  } else {
    lines.push(
      '本报告由 FigureGuard 在浏览器本地根据**当前数据集、当前图表配置与当次诊断计算结果**实时生成，' +
        '所有数字都可追溯到 CSV 的行列与界面所示的统计口径。',
      '',
    );
  }

  lines.push(...sectionSource(input.table, input.admission, input.generatedAt));
  lines.push(...sectionQuality(input.admission, input.quality));
  lines.push(...sectionChartConfig(input.chart, allowed));
  lines.push(...sectionRecords(input.chart, allowed));
  lines.push(...sectionDiagnostic(input.chart, allowed));
  lines.push(...sectionRepair(input.chart, input.repair, allowed));
  lines.push(...sectionBoundary(input.chart, allowed));

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/** 报告下载文件名：`figureguard-report-<来源名片段>-YYYYMMDD-HHMMSS.md`。 */
export function buildReportFileName(table: CsvTable, date: Date): string {
  return buildExportFileName('report', 'md', table.fileName, date);
}
