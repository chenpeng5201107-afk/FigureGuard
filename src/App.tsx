import { useEffect, useRef, useState } from 'react';

import { AppHeader } from './components/AppHeader';
import { CsvUploadPanel } from './components/CsvUploadPanel';
import { DataPreview } from './components/DataPreview';
import { HeroPanel } from './components/HeroPanel';
import { ParseErrorPanel } from './components/ParseErrorPanel';
import { ProductNotes } from './components/ProductNotes';
import { loadExampleCsv, readCsvFile } from './lib/csv';
import { formatCount } from './lib/format';
import type { ParseOutcome } from './types/csv';

export default function App() {
  const [outcome, setOutcome] = useState<ParseOutcome | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  /** 每完成一次解析加一，滚动只跟着它触发，避免同一结果被重复滚动。 */
  const [resultToken, setResultToken] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  function commitOutcome(next: ParseOutcome) {
    setOutcome(next);
    setResultToken((token) => token + 1);
  }

  async function parseTask(task: () => Promise<ParseOutcome>) {
    setIsParsing(true);
    setOutcome(null);
    try {
      commitOutcome(await task());
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      commitOutcome({
        status: 'error',
        error: { code: 'parse-failed', message: `解析过程中出现未预期的异常：${detail}` },
      });
    } finally {
      setIsParsing(false);
    }
  }

  // 成功和失败都要把结果送进视野；系统开启「减少动态效果」时直接定位，不做平滑滚动。
  useEffect(() => {
    if (resultToken === 0 || outcome === null) return;
    const panel = resultRef.current;
    if (!panel) return;

    // 面板顶部已经在视野上半部分时，再滚一次只是打扰，不滚动。
    const box = panel.getBoundingClientRect();
    if (box.top >= 0 && box.top <= window.innerHeight * 0.5) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [resultToken, outcome]);

  // 播报用真实总条数（issueTotals），而不是有上限的明细条数。
  const parsedTable = outcome?.status === 'ok' ? outcome.table : null;
  const summary = parsedTable
    ? `解析完成：${formatCount(parsedTable.recordCount)} 行 ${formatCount(parsedTable.columnCount)} 列，${
        parsedTable.issueTotals.errors + parsedTable.issueTotals.notices === 0
          ? '没有格式提示'
          : `${formatCount(parsedTable.issueTotals.errors)} 条格式问题、${formatCount(
              parsedTable.issueTotals.notices,
            )} 条说明提示`
      }。`
    : '';

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main>
        <HeroPanel />
        <CsvUploadPanel
          busy={isParsing}
          onFileSelected={(file) => void parseTask(() => readCsvFile(file))}
          onUseExample={() => void parseTask(loadExampleCsv)}
        />
        {/* 常驻的柔和播报：结果变化时读屏能跟上，不需要先看见面板 */}
        <p role="status" aria-live="polite" className="sr-only">
          {summary}
        </p>
        <div ref={resultRef} className="scroll-mt-24">
          {isParsing ? null : outcome?.status === 'ok' ? (
            <DataPreview table={outcome.table} onReset={() => setOutcome(null)} />
          ) : outcome?.status === 'error' ? (
            <ParseErrorPanel error={outcome.error} onReset={() => setOutcome(null)} />
          ) : null}
        </div>
        <ProductNotes />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-slate-500 sm:px-6">
          FigureGuard 当前版本：CSV 读取、数据预览、缺失值与重复记录统计、字段类型识别与类型冲突候选提示、图表实验室（柱状图 / 散点图 / 折线图；柱状图可逐条原始记录或按类别求平均、求和，图表标题与坐标轴标题、单位可自定义）。示例数据为合成的植物生长记录，仅用于功能演示。
        </p>
      </footer>
    </div>
  );
}
