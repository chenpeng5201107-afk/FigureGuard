import { useMemo, useState } from 'react';

import {
  MAX_ITEMIZED_DUPLICATE_GROUPS,
  MAX_ITEMIZED_QUALITY_FINDINGS,
  analyzeDataQuality,
  evaluateQualityAdmission,
} from '../lib/dataQuality';
import { MAX_ITEMIZED_TYPE_CONFLICTS, SHAPE_LABELS } from '../lib/columnTypes';
import { formatCount, formatRate } from '../lib/format';
import type { CsvTable } from '../types/csv';
import type {
  ColumnTypeProfile,
  DataQualityFinding,
  TypeConflictCandidate,
} from '../types/dataQuality';

/** 问题列表首屏只铺 5 条，其余逐批展开，避免几十万条缺失提示一次性进 DOM。 */
const INITIAL_FINDING_COUNT = 5;
const FINDING_BATCH_SIZE = 5;
/** 字段类型概览首屏只铺 8 张卡片，优先展示有类型冲突的字段，其余逐批展开。 */
const INITIAL_TYPE_CARD_COUNT = 8;
const TYPE_CARD_BATCH_SIZE = 8;

export interface ColumnFocusTarget {
  columnIndex: number;
  rowIndex?: number;
}

interface DataQualityPanelProps {
  table: CsvTable;
  /** 可选：点击某个类型冲突候选时回调，用于跨区定位到表格对应列（P1 交互）。 */
  onFocusColumn?: (target: ColumnFocusTarget) => void;
}

function severityBadge(severity: DataQualityFinding['severity']): string {
  return severity === 'attention'
    ? 'rounded-sm bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand-dark'
    : 'rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600';
}

function severityLabel(severity: DataQualityFinding['severity']): string {
  return severity === 'attention' ? '建议确认' : '仅说明';
}

function FindingItem({ finding }: { finding: DataQualityFinding }) {
  return (
    <li data-severity={finding.severity} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-medium text-slate-900">
        <span className={`${severityBadge(finding.severity)} mr-2 align-middle`}>{severityLabel(finding.severity)}</span>
        {finding.title}
      </p>
      <p className="mt-1 text-xs leading-relaxed break-words text-slate-600">{finding.detail}</p>
    </li>
  );
}

/** 冲突候选 chip：点击后定位到对应列（可选行），不修改任何数据。 */
function ConflictChip({
  candidate,
  onClick,
}: {
  candidate: TypeConflictCandidate;
  onClick: () => void;
}) {
  const shapeLabel = SHAPE_LABELS[candidate.shape] ?? '其他形态';
  const value = candidate.value.trim();
  const shown = value.length > 24 ? `${value.slice(0, 24)} …` : value;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-baseline gap-1 rounded-md border border-brand-ring bg-brand-soft px-2 py-0.5 text-xs text-brand-dark transition-colors hover:bg-slate-100"
    >
      <span className="font-medium">第 {formatCount(candidate.rowIndex + 1)} 个数据行</span>
      <span className="max-w-[12rem] truncate" title={value}>
        「{shown}」
      </span>
      <span className="text-slate-500">· {shapeLabel}</span>
    </button>
  );
}

function TypeCard({
  profile,
  onFocusColumn,
}: {
  profile: ColumnTypeProfile;
  onFocusColumn?: (target: ColumnFocusTarget) => void;
}) {
  const hasConflicts = profile.conflictCount > 0;
  return (
    <div
      data-testid="column-type-card"
      data-column-index={profile.index}
      className="rounded-xl border border-slate-200 bg-white px-4 py-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-900" title={profile.label}>
          <span className="mr-1.5 font-mono text-xs text-slate-400 tabular-nums">第 {formatCount(profile.index + 1)} 列</span>
          {profile.label}
        </p>
        <span
          className={
            profile.kind === 'unknown'
              ? 'rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600'
              : 'rounded-sm bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand-dark'
          }
        >
          {profile.kindLabel}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        主要类型占比 {formatRate(profile.dominantRate)} · 有效样本 {formatCount(profile.sampleCount)} / {formatCount(profile.sampleCount + profile.skippedCount)}
      </p>
      <p className="mt-1 text-xs leading-relaxed break-words text-slate-500">{profile.basisText}</p>
      {hasConflicts ? (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs font-medium text-amber-900">
            待核查的类型不一致候选 {formatCount(profile.conflictCount)} 处
            {profile.conflictsTruncated ? `（最多列出 ${MAX_ITEMIZED_TYPE_CONFLICTS} 处）` : ''}，点击可在下方表格中定位并高亮该单元格：
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.conflicts.map((candidate) => (
              <ConflictChip
                key={`${candidate.rowIndex}-${candidate.value}`}
                candidate={candidate}
                onClick={() => onFocusColumn?.({ columnIndex: profile.index, rowIndex: candidate.rowIndex })}
              />
            ))}
          </div>
          {profile.conflicts.map((candidate) => (
            <p key={`hint-${candidate.rowIndex}`} className="text-xs leading-relaxed text-slate-500">
              <span className="font-medium text-slate-700">第 {formatCount(candidate.rowIndex + 1)} 行「{candidate.value.length > 24 ? `${candidate.value.slice(0, 24)} …` : candidate.value}」：</span>{' '}
              {candidate.suggestion}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DataQualityPanel({ table, onFocusColumn }: DataQualityPanelProps) {
  const [renderedFindingCount, setRenderedFindingCount] = useState(INITIAL_FINDING_COUNT);
  const [renderedTypeCardCount, setRenderedTypeCardCount] = useState(INITIAL_TYPE_CARD_COUNT);

  const admission = useMemo(() => evaluateQualityAdmission(table), [table]);
  // 准入不通过时连统计都不做：不把读错位的单元格包装成正式的质量结论。
  const report = useMemo(() => (admission.allowed ? analyzeDataQuality(table) : null), [table, admission]);

  // 换成另一份文件时回到首批问题与首批类型卡片，不沿用上一份数据的展开状态。
  const [sourceTable, setSourceTable] = useState(table);
  if (sourceTable !== table) {
    setSourceTable(table);
    setRenderedFindingCount(INITIAL_FINDING_COUNT);
    setRenderedTypeCardCount(INITIAL_TYPE_CARD_COUNT);
  }

  const findings = report?.findings ?? [];
  const visibleFindings = findings.slice(0, Math.min(renderedFindingCount, findings.length));
  const remainingFindings = findings.length - visibleFindings.length;
  const nextBatchSize = Math.min(FINDING_BATCH_SIZE, remainingFindings);

  if (!admission.allowed || report === null) {
    return (
      <section
        data-testid="quality-panel"
        aria-label="数据质量概览"
        className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6"
      >
        <h2 className="text-lg font-semibold text-amber-900">数据质量概览</h2>
        <p className="mt-1 text-sm leading-relaxed text-amber-900">
          这份 CSV 暂时没有进行数据质量分析，下面的警告说明原因。原始数据表格与解析告警照常可以浏览。
        </p>
        <ul data-testid="quality-blockers" className="mt-4 space-y-3">
          {admission.blockers.map((blocker) => (
            <li key={blocker.code} className="rounded-xl border border-amber-300 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">{blocker.message}</p>
              {blocker.evidence.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-amber-900/90">
                  {blocker.evidence.map((evidence) => (
                    <li key={evidence} className="break-words">
                      · {evidence}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        <details className="mt-4 text-xs leading-relaxed text-amber-900/80">
          <summary className="cursor-pointer select-none text-amber-900">准入规则说明</summary>
          <p className="mt-2 break-words">
            结构状态为 <code className="font-mono">degraded</code>（行列跟不上表头）或解析错误数大于 0
            时不输出正式结论。引号未闭合这类问题即使没有造成字段数不匹配，也会让后面的内容整体错位，因此同样阻止分析；
            先把源文件修好（补齐引号、统一字段数）再重新上传，即可获得缺失值、疑似重复记录与字段类型识别的统计。
          </p>
        </details>
        {admission.parseErrorCount > 0 && admission.noticeCount > 0 ? (
          <p className="mt-2 text-xs text-amber-900/70">
            另有 {formatCount(admission.noticeCount)} 条说明性提示，它们不会阻止分析，只在上面的解析告警里逐条列出。
          </p>
        ) : null}
      </section>
    );
  }

  const { missing, duplicates, columnTypes } = report;
  const stats = [
    { label: '数据总行数', value: `${formatCount(missing.recordCount)} 行` },
    { label: '存在空值的字段数', value: `${formatCount(missing.columnsWithEmpty)} / ${formatCount(missing.columnCount)} 列` },
    { label: '缺失单元格数量', value: `${formatCount(missing.totalEmptyCells)} 个` },
    { label: '涉及重复的记录数', value: `${formatCount(duplicates.recordsInDuplicateGroups)} 行` },
  ];

  // 有类型冲突候选的字段优先展示；两组内部都按原始列序排列，卡片另外标出原始列号，统计结果不变。
  const orderedTypeCards = [...columnTypes.columns].sort(
    (a, b) => Number(b.conflictCount > 0) - Number(a.conflictCount > 0) || a.index - b.index,
  );
  const conflictFirstCount = orderedTypeCards.findIndex((profile) => profile.conflictCount === 0);
  const prioritizedCount = conflictFirstCount === -1 ? orderedTypeCards.length : conflictFirstCount;
  const visibleTypeCards = orderedTypeCards.slice(0, Math.min(renderedTypeCardCount, orderedTypeCards.length));
  const remainingTypeCards = orderedTypeCards.length - visibleTypeCards.length;
  const nextTypeBatchSize = Math.min(TYPE_CARD_BATCH_SIZE, remainingTypeCards);

  return (
    <section data-testid="quality-panel" aria-label="数据质量概览" className="mt-4 rounded-2xl border border-brand-ring bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">数据质量概览</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        以下数字来自对已解析单元格的逐格统计：空字符串算内容缺失，数值 0 不算缺失，只有空白字符的单元格单独标记为疑似空白值。
      </p>

      <dl data-testid="quality-stats" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-brand-soft px-4 py-3">
            <dt className="text-xs text-brand-dark">{item.label}</dt>
            <dd className="mt-1 text-base font-semibold text-slate-900 tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        整表 {formatCount(missing.cellCount)} 个单元格里空值占 {formatRate(missing.overallEmptyRate)}
        {missing.totalBlankCells > 0
          ? `，另有 ${formatCount(missing.totalBlankCells)} 个疑似空白值（只由空白字符组成，没有并进缺失数量）`
          : ''}
        {missing.totalStructuralGaps > 0
          ? `，还有 ${formatCount(missing.totalStructuralGaps)} 处结构性缺列`
          : ''}
        。疑似重复记录共 {formatCount(duplicates.duplicateGroupCount)} 组、额外副本{' '}
        {formatCount(duplicates.extraCopyCount)} 行，占全部记录的 {formatRate(duplicates.duplicateRate)}。
      </p>

      <div className="mt-4 border-t border-slate-200 pt-4" data-testid="column-type-overview">
        <h3 className="text-sm font-semibold text-slate-900">字段类型概览</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          数值 {formatCount(columnTypes.kindTotals.number)} 列、日期 {formatCount(columnTypes.kindTotals.date)} 列、文本或类别{' '}
          {formatCount(columnTypes.kindTotals.text)} 列、无法确定 {formatCount(columnTypes.kindTotals.unknown)} 列；已比对的{' '}
          {formatCount(columnTypes.columnsChecked)} 个字段里有 {formatCount(columnTypes.columnsWithConflicts)} 个存在类型不一致候选
          {columnTypes.totalConflictCells > 0
            ? `（共 ${formatCount(columnTypes.totalConflictCells)} 处，待人工核查，不等于数据错误）`
            : '。'}
        </p>
        {prioritizedCount > 0 ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            下面的卡片优先展示这 {formatCount(prioritizedCount)} 个有类型不一致候选的字段，其余字段按原始顺序分批展开；
            每张卡片上的「第 N 列」就是它在源文件里的原始位置，顺序调整不影响任何统计数字。
          </p>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTypeCards.map((profile) => (
            <TypeCard key={profile.index} profile={profile} onFocusColumn={onFocusColumn} />
          ))}
        </div>
        {remainingTypeCards > 0 ? (
          <button
            type="button"
            onClick={() => setRenderedTypeCardCount((count) => count + nextTypeBatchSize)}
            className="mt-2 rounded-xl border border-brand-ring bg-brand-soft px-3 py-1.5 text-sm text-brand-dark transition-colors hover:bg-slate-100"
          >
            展开剩余 {nextTypeBatchSize} 个字段的类型卡片（还有 {formatCount(remainingTypeCards)} 个未展开）
          </button>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            已显示全部 {formatCount(columnTypes.columns.length)} 个字段的类型卡片。
          </p>
        )}
        <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          <summary className="cursor-pointer select-none text-slate-700">类型推断与冲突判定的规则</summary>
          <p className="mt-2 break-words">
            每个非空单元格先按形态投票：数值（整数 / 小数 / 负数 / 科学计数法，例如 <code className="font-mono">12.4</code>、<code className="font-mono">1.5e-3</code>）、日期（年在前的写法，例如 <code className="font-mono">2026-03-02</code>，且必须通过日历校验，<code className="font-mono">2026-02-30</code> 不算有效日期）、文本或类别（其余，含 <code className="font-mono">12.4 kg</code> 这类带单位的写法与 <code className="font-mono">007</code> 这类以 0 开头的编号）。空字符串、纯空白与缺列不参与投票，因此不会被误判成类型冲突。
          </p>
          <p className="mt-2 break-words">
            整列结论按投票结果决定：有效样本少于 3 个 → 无法确定；主要形态占比低于 70% → 无法确定（类型接近混合，不下武断结论）；字段名带 <code className="font-mono">id</code> / <code className="font-mono">编号</code> / <code className="font-mono">学号</code> / <code className="font-mono">code</code> / <code className="font-mono">phone</code> 这类标识符线索 → 直接按文本或类别处理，不做冲突比对，避免把 <code className="font-mono">007</code> 这类编号说成类型错误。
          </p>
          <p className="mt-2 break-words">
            类型冲突候选：当一列具有稳定的主要类型时，标出与该类型不一致的单元格；冲突不等于错误，可能只是备注、缺测标记、单位不一致或串列。系统只报告、不修改、不删除、不填充任何单元格。
          </p>
        </details>
      </div>

      {findings.length > 0 ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-semibold text-slate-900">
            需要确认的问题（已列出 {formatCount(report.itemizedFindingTotals.attention)} 条建议确认、
            {formatCount(report.itemizedFindingTotals.info)} 条仅说明）
          </p>
          <ul data-testid="quality-findings" className="mt-2 space-y-2">
            {visibleFindings.map((finding) => (
              <FindingItem key={finding.id} finding={finding} />
            ))}
          </ul>
          {remainingFindings > 0 ? (
            <button
              type="button"
              onClick={() => setRenderedFindingCount((count) => count + nextBatchSize)}
              className="mt-2 rounded-xl border border-brand-ring bg-brand-soft px-3 py-1.5 text-sm text-brand-dark transition-colors hover:bg-slate-100"
            >
              再显示 {nextBatchSize} 条问题（还有 {formatCount(remainingFindings)} 条未展开）
            </button>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              已显示全部{formatCount(findings.length)}条问题
              {report.findingsTruncated ? `（明细最多列出 ${formatCount(MAX_ITEMIZED_QUALITY_FINDINGS)} 条）` : ''}。
            </p>
          )}
          {report.findingsTruncated && remainingFindings === 0 ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              上面的缺失数量、重复组数与副本数按整份文件统计，没有少算；逐条列出的问题最多 {formatCount(MAX_ITEMIZED_QUALITY_FINDINGS)}{' '}
              条，重复组明细最多 {formatCount(MAX_ITEMIZED_DUPLICATE_GROUPS)} 组，类型冲突明细每列最多 {formatCount(MAX_ITEMIZED_TYPE_CONFLICTS)} 处。
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          逐格统计后没有发现空值或整行重复：{formatCount(missing.totalEmptyCells)} 个空单元格、
          {formatCount(duplicates.recordsInDuplicateGroups)} 行涉及重复的记录；字段类型也没有不一致的候选值。
        </p>
      )}

      <details className="mt-4 text-xs leading-relaxed text-slate-500">
        <summary className="cursor-pointer select-none">判定口径说明</summary>
        <p className="mt-2 break-words">
          「涉及重复的记录」只表示整行每个字段都相同，不必然等于录错；重复的行没有被删除或改写。
          缺失率与重复率的分母是当前文件的记录数，只有表头没有数据行时按 0 处理。
          字段类型识别是启发式的，不承诺 100% 正确；类型冲突候选只是「与整列主流写法不同」的提示，不直接等同于数据错误。
          字段类型冲突的候选值可点击定位到表格中对应的行列并高亮；缺失与重复的逐条问题只给出数据行序号文本，不提供跳转定位。
        </p>
      </details>
    </section>
  );
}
