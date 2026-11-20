import { useEffect, useMemo, useRef, useState } from 'react';

import { BASELINE_EXAMPLE_CSV_NAME, MAX_ITEMIZED_ISSUES } from '../lib/csv';
import { classifyColumn, layoutClassForKind } from '../lib/display';
import { formatBytes, formatCount } from '../lib/format';
import { DataQualityPanel } from './DataQualityPanel';
import { ChartLab } from './ChartLab';
import type { ColumnFocusTarget } from './DataQualityPanel';
import type { CsvCellValue, CsvIssue, CsvIssueGroup, CsvTable } from '../types/csv';

/** 表格一次只渲染一页：定位到后面的记录靠翻页，不会将前面的行一起挂进 DOM。 */
const ROW_PAGE_SIZE = 50;
/** 错误明细一次铺 20 条，剩下的点「再显示」逐批加，避免几万条错误一次性进 DOM。 */
const INITIAL_ISSUE_COUNT = 20;
const ISSUE_BATCH_SIZE = 20;
/** 对齐只是排版判断，超大文件不需要为它遍历全部行。 */
const ALIGN_SCAN_ROWS = 1000;

interface DataPreviewProps {
  table: CsvTable;
  onReset: () => void;
}

function columnLabel(column: string, index: number): string {
  return column.trim() === '' ? `（第 ${index + 1} 列未命名）` : column;
}

/** 物理行号来自 Papa Parse 的字符偏移换算，退化为数据行号时明确说明。 */
function locationLabel(issue: CsvIssue): string {
  if (typeof issue.fileLine === 'number') {
    return typeof issue.fileEndLine === 'number' && issue.fileEndLine !== issue.fileLine
      ? `文件第 ${issue.fileLine}–${issue.fileEndLine} 行`
      : `文件第 ${issue.fileLine} 行`;
  }
  if (typeof issue.rowIndex === 'number') return `第 ${issue.rowIndex + 1} 个数据行`;
  return '整个文件';
}

/** Papa Parse 的英文原文默认折叠：中文说明是给学生看的，原文只作核对用。 */
function RawMessage({ text }: { text: string }) {
  return (
    <details className="mt-0.5 text-xs text-slate-500">
      <summary className="cursor-pointer select-none">Papa Parse 原文</summary>
      <p className="mt-1 break-words">{text}</p>
    </details>
  );
}

function IssueList({ issues }: { issues: CsvIssue[] }) {
  return (
    <ul data-testid="issue-list" className="mt-2 space-y-2">
      {issues.map((issue, index) => (
        <li key={`${issue.origin}-${issue.code}-${issue.fileLine ?? 'none'}-${index}`} className="text-sm">
          <span className="font-mono text-xs text-slate-500">[{locationLabel(issue)}]</span>{' '}
          {issue.message}
          {issue.rawMessage ? <RawMessage text={issue.rawMessage} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** 类型分布：明细有上限，这里的条数是全量真实值。 */
function IssueGroups({ groups }: { groups: CsvIssueGroup[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-900/80">
      {groups.map((group) => (
        <li key={`${group.origin}-${group.code}`}>
          {group.label}（{group.code}）：{formatCount(group.total)} 条
          {group.total > group.itemized ? `，已列出 ${formatCount(group.itemized)} 条` : ''}
        </li>
      ))}
    </ul>
  );
}

function omittedCount(groups: CsvIssueGroup[], severity: CsvIssue['severity']): number {
  return groups
    .filter((group) => group.severity === severity)
    .reduce((sum, group) => sum + (group.total - group.itemized), 0);
}

function renderCell(cell: CsvCellValue) {
  if (cell === null) {
    return (
      <span
        title="该行字段数少于表头，没有读到这一列"
        className="rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500"
      >
        —
      </span>
    );
  }
  if (cell === '') {
    return (
      <span
        title="CSV 源文件里这个单元格是空的"
        className="rounded-sm border border-dashed border-slate-400 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-500"
      >
        空值
      </span>
    );
  }
  return (
    <span className="block max-w-[24rem] truncate" title={cell}>
      {cell}
    </span>
  );
}

export function DataPreview({ table, onReset }: DataPreviewProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [renderedIssueCount, setRenderedIssueCount] = useState(INITIAL_ISSUE_COUNT);
  const [sourceTable, setSourceTable] = useState(table);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [focusTarget, setFocusTarget] = useState<ColumnFocusTarget | null>(null);

  // 载入新数据集时必须回到第一页并清除定位，否则会沿用上一份文件的页码与高亮。
  if (sourceTable !== table) {
    setSourceTable(table);
    setPageIndex(0);
    setRenderedIssueCount(INITIAL_ISSUE_COUNT);
    setFocusTarget(null);
  }

  const pageCount = Math.max(1, Math.ceil(table.recordCount / ROW_PAGE_SIZE));
  // 兜住极端情况下的越界页码，避免渲染出空表格。
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPage * ROW_PAGE_SIZE;

  function handleFocusColumn(target: ColumnFocusTarget) {
    if (focusTarget?.columnIndex === target.columnIndex && focusTarget?.rowIndex === target.rowIndex) {
      setFocusTarget(null);
      return;
    }
    setFocusTarget(target);
    // 目标行大概率不在当前页：直接切到它所在的那一页，只渲染这一页的记录。
    if (target.rowIndex !== undefined) {
      const neededPage = Math.min(Math.max(0, Math.floor(target.rowIndex / ROW_PAGE_SIZE)), pageCount - 1);
      setPageIndex(neededPage);
    }
  }

  function goToPage(next: number) {
    setPageIndex(Math.min(Math.max(0, next), pageCount - 1));
    // 手动翻页后目标行已经不在这一页，留着行定位会给出「仍在第 N 页」的误导提示；列仍然在每一页，可以保留。
    setFocusTarget((current) => (current?.rowIndex === undefined ? current : { columnIndex: current.columnIndex }));
  }

  const columnLayout = useMemo(() => {
    const scanRows = table.rows.slice(0, ALIGN_SCAN_ROWS);
    return table.columns.map((_, index) =>
      layoutClassForKind(classifyColumn(scanRows.map((row) => row[index]))),
    );
  }, [table]);

  const visibleRows = table.rows.slice(pageStart, pageStart + ROW_PAGE_SIZE);
  const hasEmptyCell = visibleRows.some((row) => row.some((cell) => cell === ''));
  const hasMissingCell = visibleRows.some((row) => row.some((cell) => cell === null));
  const errorIssues = table.issues.filter((issue) => issue.severity === 'error');
  const noticeIssues = table.issues.filter((issue) => issue.severity === 'notice');
  const visibleErrorIssues = errorIssues.slice(0, renderedIssueCount);
  const remainingItemizedErrors = errorIssues.length - visibleErrorIssues.length;
  const nextIssueBatchSize = Math.min(ISSUE_BATCH_SIZE, remainingItemizedErrors);
  const omittedErrors = omittedCount(table.issueGroups, 'error');
  const omittedNotices = omittedCount(table.issueGroups, 'notice');
  const showGroups = table.issueGroups.length > 1 || omittedErrors + omittedNotices > 0;
  const issueTotals = table.issueTotals;
  const totalIssueCount = issueTotals.errors + issueTotals.notices;

  // 窄屏下表格会被容器截断，只有真的横向放不下时才提示可以滑动。
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => setHasHorizontalOverflow(node.scrollWidth - node.clientWidth > 1);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [table, pageStart]);

  // 定位只在表格容器内部滚动：整页位置不动，一次点击只滚一次，避免页面反复跳动。
  useEffect(() => {
    const container = scrollRef.current;
    if (!focusTarget || !container) return;

    let nextLeft: number | null = null;
    let nextTop: number | null = null;
    const containerBox = container.getBoundingClientRect();

    const columnAnchor = container.querySelector<HTMLElement>(
      `[data-column-anchor="${focusTarget.columnIndex}"]`,
    );
    if (columnAnchor) {
      const columnBox = columnAnchor.getBoundingClientRect();
      if (columnBox.left - containerBox.left < 0 || columnBox.right - containerBox.right > 0) {
        nextLeft = container.scrollLeft + (columnBox.left - containerBox.left);
      }
    }

    // 目标行只在它所属的那一页里定位，切换页码后不会为别的页去滚动。
    if (focusTarget.rowIndex !== undefined && Math.floor(focusTarget.rowIndex / ROW_PAGE_SIZE) === currentPage) {
      const rowAnchor = container.querySelector<HTMLElement>(`[data-row-anchor="${focusTarget.rowIndex}"]`);
      if (rowAnchor) {
        const rowBox = rowAnchor.getBoundingClientRect();
        const centered = container.scrollTop + (rowBox.top - containerBox.top) - (container.clientHeight - rowBox.height) / 2;
        const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
        nextTop = Math.min(Math.max(0, centered), maxTop);
      }
    }

    if (nextLeft === null && nextTop === null) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({
      left: nextLeft ?? container.scrollLeft,
      top: nextTop ?? container.scrollTop,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [focusTarget, currentPage]);

  const summary = [
    { label: '记录数', value: `${formatCount(table.recordCount)} 行` },
    { label: '字段数', value: `${formatCount(table.columnCount)} 列` },
    { label: '数据体积', value: formatBytes(table.sizeBytes) },
    { label: '数据来源', value: table.source === 'example' ? '内置示例' : '本地文件' },
  ];

  const indexColumn = 'w-16 min-w-16 text-right tabular-nums';
  // 表头底色与文字色必须整组切换：同族工具类（bg-slate-100 / bg-amber-100）后写的会盖掉前写的，不能并存。
  const headerCell = 'sticky top-0 z-20 border-b border-slate-300 px-3 py-2.5 font-semibold whitespace-nowrap';
  const headerCellIdle = 'bg-slate-100 text-slate-700';
  const headerCellFocused = 'bg-amber-100 text-amber-900';
  const bodyCell = 'border-b border-slate-100 px-3 py-2';
  // odd:/even: 带伪类，特异性高于普通 bg-amber-50，定位行必须放弃奇偶底色才压得住。
  const rowZebra = 'odd:bg-white even:bg-slate-50/60';
  const rowFocused = 'bg-amber-50';
  const pageNavClass =
    'rounded-xl border border-slate-300 px-3 py-1.5 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">数据预览</h2>
            <p
              className="mt-1 truncate text-sm text-slate-500"
              title={`${table.fileName}（${formatBytes(table.sizeBytes)}）`}
            >
              文件名：<span className="font-medium text-slate-700">{table.fileName}</span>
              （{formatBytes(table.sizeBytes)}）
            </p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
          >
            清除结果
          </button>
        </div>

        {table.source === 'example' ? (
          table.fileName === BASELINE_EXAMPLE_CSV_NAME ? (
            <p className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-sm leading-relaxed text-brand-dark">
              当前表格来自内置的 <strong>{BASELINE_EXAMPLE_CSV_NAME}</strong>
              ，是为演示纵轴起点问题构造的<strong>合成数据</strong>（A=96、B=98、C=97），与任何真实实验无关；
              它的作用是把「发现非零基线 → 一键恢复零基线 → 前后对比 → 撤销」这一条路走完。
              修复只改图表纵轴配置，这份合成数据的单元格、记录数与行号都不会被改写。
            </p>
          ) : (
            <p className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-sm leading-relaxed text-brand-dark">
              当前表格来自内置的 <strong>plant-growth.csv</strong>
              ，是为演示构造的<strong>合成植物生长数据</strong>，与任何真实实验无关；其中刻意保留了空值与可疑数值，
              供数据质量概览与后续质检功能使用。当前版本会统计缺失值与疑似重复记录，但还没有异常值判断，
              因此不会断言这些数值本身是否离谱。
            </p>
          )
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs text-slate-500">{item.label}</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900 tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>

        {totalIssueCount > 0 ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-900">
              解析结果里有 {formatCount(issueTotals.errors)} 条需要处理的格式问题、{formatCount(issueTotals.notices)} 条说明性提示
            </h3>
            {table.structure.state === 'degraded' ? (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-100/80 p-3">
                <h4 className="text-xs font-semibold text-amber-900">
                  数据结构不完整，后续的数据质量分析不能把这份数据当作完全可信
                </h4>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-900">
                  {table.structure.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {showGroups ? <IssueGroups groups={table.issueGroups} /> : null}
            {errorIssues.length > 0 ? (
              <>
                <IssueList issues={visibleErrorIssues} />
                {remainingItemizedErrors > 0 ? (
                  <button
                    type="button"
                    onClick={() => setRenderedIssueCount((count) => count + nextIssueBatchSize)}
                    className="mt-2 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-amber-100"
                  >
                    再显示 {nextIssueBatchSize} 条错误明细（还有 {formatCount(remainingItemizedErrors)} 条已列明细未展开）
                  </button>
                ) : null}
                {omittedErrors > 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-amber-900/80">
                    另有 {formatCount(omittedErrors)} 条同类格式问题没有逐条列出（明细每种来源最多 {MAX_ITEMIZED_ISSUES}{' '}
                    条）；上面的总条数与类型分布按整份文件统计，没有少算。
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                没有会让数据读错的格式问题，下面只是说明 Papa Parse 实际的解析方式。
              </p>
            )}
            {noticeIssues.length > 0 ? (
              <div className="mt-3 border-t border-amber-200 pt-3">
                <h4 className="text-xs font-semibold text-amber-900">说明性提示</h4>
                <IssueList issues={noticeIssues} />
                {omittedNotices > 0 ? (
                  <p className="mt-2 text-xs text-amber-900/80">
                    另有 {formatCount(omittedNotices)} 条同类提示没有逐条列出（明细每种来源最多 {MAX_ITEMIZED_ISSUES} 条）。
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-3 text-xs leading-relaxed text-amber-900/70">
              行号是文件里的物理行号（表头算第 1 行，引号内的换行也占行），被跳过的空行不计入记录数。
            </p>
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Papa Parse 未报告格式错误，行列结构与表头一致。
          </p>
        )}

        <DataQualityPanel table={table} onFocusColumn={handleFocusColumn} />

        {table.recordCount === 0 ? (
          <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            已识别到 {table.columnCount} 个字段名，但文件里没有数据行。
          </p>
        ) : (
          <>
            {/* border-separate + th 自身不透明背景：避免滚动时数据行文字透出表头 */}
            <div
              ref={scrollRef}
              data-testid="table-scroll"
              className="isolate mt-5 max-h-[26rem] overflow-auto rounded-xl border border-slate-200"
            >
              <table className="w-full min-w-[28rem] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={`${headerCell} ${headerCellIdle} ${indexColumn}`}>
                      #
                    </th>
                    {table.columns.map((column, index) => (
                      <th
                        key={`${column}-${index}`}
                        scope="col"
                        data-column-anchor={index}
                        className={`${headerCell} ${
                          focusTarget?.columnIndex === index ? headerCellFocused : headerCellIdle
                        } ${columnLayout[index]}`}
                      >
                        {columnLabel(column, index)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, offset) => {
                    // 序号按原始 CSV 数据行计算，翻页不重新从 1 开始编号。
                    const rowIndex = pageStart + offset;
                    const isFocusedRow = focusTarget?.rowIndex === rowIndex;
                    return (
                      <tr
                        key={rowIndex}
                        data-row-anchor={rowIndex}
                        className={isFocusedRow ? rowFocused : rowZebra}
                      >
                        <td className={`${bodyCell} ${indexColumn} whitespace-nowrap text-slate-400`}>
                          {formatCount(rowIndex + 1)}
                        </td>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            data-column-anchor={cellIndex}
                            className={`${bodyCell} ${columnLayout[cellIndex]} whitespace-nowrap text-slate-800 ${
                              focusTarget?.columnIndex === cellIndex ? 'bg-amber-50' : ''
                            }`}
                          >
                            {renderCell(cell)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasHorizontalOverflow ? (
              <p data-testid="swipe-hint" className="mt-2 text-xs text-slate-500">
                <span aria-hidden="true">↔</span> 列宽超过屏幕，左右滑动可查看更多字段（本次共 {table.columnCount} 列）。
              </p>
            ) : null}

            {focusTarget ? (
              <div data-testid="focus-note" className="mt-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span>
                  已定位到第 {formatCount(focusTarget.columnIndex + 1)} 列「{table.columns[focusTarget.columnIndex] ?? ''}」
                  {focusTarget.rowIndex !== undefined
                    ? `，第 ${formatCount(focusTarget.rowIndex + 1)} 个数据行（第 ${formatCount(
                        Math.floor(focusTarget.rowIndex / ROW_PAGE_SIZE) + 1,
                      )} 页）`
                    : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setFocusTarget(null)}
                  className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-900 transition-colors hover:bg-amber-100"
                >
                  取消定位
                </button>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <p data-testid="page-summary">
                共解析 {formatCount(table.recordCount)} 条记录，第 {formatCount(currentPage + 1)} / {formatCount(pageCount)} 页，
                本页显示第 {formatCount(pageStart + 1)}–{formatCount(pageStart + visibleRows.length)} 条。
              </p>
              {pageCount > 1 ? (
                <div role="group" aria-label="表格分页" className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToPage(0)}
                    disabled={currentPage === 0}
                    className={pageNavClass}
                  >
                    返回第一页
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 0}
                    className={pageNavClass}
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= pageCount - 1}
                    className={pageNavClass}
                  >
                    下一页
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-2 space-y-1 text-xs text-slate-500">
              <p>数值列右对齐并使用等宽数字，日期与文本列左对齐；对齐只影响排版，单元格文字保持源文件原样。</p>
              {hasEmptyCell ? (
                <p>
                  <span className="rounded-sm border border-dashed border-slate-400 bg-slate-50 px-1.5 py-0.5">
                    空值
                  </span>{' '}
                  表示 CSV 源文件里这个单元格本身为空（两个分隔符之间没有内容）。
                </p>
              ) : null}
              {hasMissingCell ? (
                <p>
                  <span className="rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5">—</span>{' '}
                  表示该行字段数少于表头，Papa Parse 没有读到对应列。
                </p>
              ) : null}
            </div>
          </>
        )}

        <ChartLab table={table} />
      </div>
    </section>
  );
}
