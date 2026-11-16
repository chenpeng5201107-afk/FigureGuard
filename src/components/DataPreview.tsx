import { useMemo, useState } from 'react';

import { classifyColumn, layoutClassForKind } from '../lib/display';
import { formatBytes, formatCount } from '../lib/format';
import type { CsvCellValue, CsvIssue, CsvTable } from '../types/csv';

const INITIAL_ROW_COUNT = 50;
const ROW_BATCH_SIZE = 50;
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

function IssueList({ issues }: { issues: CsvIssue[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {issues.map((issue, index) => (
        <li key={`${issue.origin}-${issue.code}-${issue.fileLine ?? 'none'}-${index}`} className="text-sm">
          <span className="font-mono text-xs text-slate-500">[{locationLabel(issue)}]</span>{' '}
          {issue.message}
          {issue.rawMessage ? (
            <span className="mt-0.5 block text-xs break-words text-slate-500">
              Papa Parse 原文：{issue.rawMessage}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
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
  const [renderedRowCount, setRenderedRowCount] = useState(INITIAL_ROW_COUNT);
  const [sourceTable, setSourceTable] = useState(table);

  // 载入新数据集时必须回到首批行数，否则会沿用上一次的展开结果。
  if (sourceTable !== table) {
    setSourceTable(table);
    setRenderedRowCount(INITIAL_ROW_COUNT);
  }

  const columnLayout = useMemo(() => {
    const scanRows = table.rows.slice(0, ALIGN_SCAN_ROWS);
    return table.columns.map((_, index) =>
      layoutClassForKind(classifyColumn(scanRows.map((row) => row[index]))),
    );
  }, [table]);

  const visibleRows = table.rows.slice(0, Math.min(renderedRowCount, table.recordCount));
  const remainingRowCount = table.recordCount - visibleRows.length;
  const nextBatchSize = Math.min(ROW_BATCH_SIZE, remainingRowCount);
  const hasEmptyCell = visibleRows.some((row) => row.some((cell) => cell === ''));
  const hasMissingCell = visibleRows.some((row) => row.some((cell) => cell === null));
  const errorIssues = table.issues.filter((issue) => issue.severity === 'error');
  const noticeIssues = table.issues.filter((issue) => issue.severity === 'notice');

  const summary = [
    { label: '记录数', value: `${formatCount(table.recordCount)} 行` },
    { label: '字段数', value: `${formatCount(table.columnCount)} 列` },
    { label: '数据体积', value: formatBytes(table.sizeBytes) },
    { label: '数据来源', value: table.source === 'example' ? '内置示例' : '本地文件' },
  ];

  const indexColumn = 'w-16 min-w-16 text-right tabular-nums';
  const headerCell =
    'sticky top-0 z-20 border-b border-slate-300 bg-slate-100 px-3 py-2.5 font-semibold whitespace-nowrap text-slate-700';
  const bodyCell = 'border-b border-slate-100 px-3 py-2';

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
          <p className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-sm leading-relaxed text-brand-dark">
            当前表格来自内置的 <strong>plant-growth.csv</strong>
            ，是为演示构造的<strong>合成植物生长数据</strong>，与任何真实实验无关；其中刻意保留了空值与可疑数值，
            供后续数据质检功能使用。当前版本只做解析与展示，不判断这些数值是否异常。
          </p>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs text-slate-500">{item.label}</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900 tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>

        {table.issues.length > 0 ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-900">
              解析结果里有 {errorIssues.length} 条需要处理的格式问题、{noticeIssues.length} 条说明性提示
            </h3>
            {errorIssues.length > 0 ? (
              <IssueList issues={errorIssues} />
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                没有会让数据读错的格式问题，下面只是说明 Papa Parse 实际的解析方式。
              </p>
            )}
            {noticeIssues.length > 0 ? (
              <div className="mt-3 border-t border-amber-200 pt-3">
                <h4 className="text-xs font-semibold text-amber-900">说明性提示</h4>
                <IssueList issues={noticeIssues} />
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

        {table.recordCount === 0 ? (
          <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            已识别到 {table.columnCount} 个字段名，但文件里没有数据行。
          </p>
        ) : (
          <>
            {/* border-separate + th 自身不透明背景：避免滚动时数据行文字透出表头 */}
            <div
              data-testid="table-scroll"
              className="isolate mt-5 max-h-[26rem] overflow-auto rounded-xl border border-slate-200"
            >
              <table className="w-full min-w-[28rem] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={`${headerCell} ${indexColumn}`}>
                      #
                    </th>
                    {table.columns.map((column, index) => (
                      <th
                        key={`${column}-${index}`}
                        scope="col"
                        className={`${headerCell} ${columnLayout[index]}`}
                      >
                        {columnLabel(column, index)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="odd:bg-white even:bg-slate-50/60">
                      <td className={`${bodyCell} ${indexColumn} whitespace-nowrap text-slate-400`}>
                        {rowIndex + 1}
                      </td>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={`${bodyCell} ${columnLayout[cellIndex]} whitespace-nowrap text-slate-800`}
                        >
                          {renderCell(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <p>
                共解析 {formatCount(table.recordCount)} 条记录，当前显示前{' '}
                {formatCount(visibleRows.length)} 条。
              </p>
              {remainingRowCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setRenderedRowCount((count) => count + nextBatchSize)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-slate-700 transition-colors hover:bg-slate-100"
                >
                  再显示 {nextBatchSize} 行（还有 {formatCount(remainingRowCount)} 行未显示）
                </button>
              ) : (
                <p className="text-slate-500">已显示全部记录。</p>
              )}
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
      </div>
    </section>
  );
}
