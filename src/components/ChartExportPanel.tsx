import { useRef, useState } from 'react';

import { errorText, runPngExport, runReportExport } from '../lib/chartExport';
import type { ChartExportAvailability, PngExportContext, ReportBuildContext } from '../lib/chartExport';
import { formatBytes } from '../lib/format';

/**
 * 「导出分析成果」区域（Day 9）。
 *
 * 组件本身不做任何统计与判定：可用性由 `evaluateChartExport()` 算好后传进来，
 * 内容在点击那一刻由 `runPngExport()` / `runReportExport()` 按当前画面重新生成。
 * 一次只允许一个导出在进行（按钮互斥禁用 + 同步 ref 兜底，同一帧内的重复点击也不会起第二个实例）；
 * 进度与成败都用固定文案的按钮旁的中文回显表达，按钮可访问名保持不变。
 */

type ExportPhase = 'idle' | 'png' | 'report';

interface Feedback {
  tone: 'status' | 'alert';
  text: string;
}

export interface ChartExportPanelProps {
  availability: ChartExportAvailability;
  /** 当前画面的 PNG 导出输入；没有可导出图表时为 null（同时 availability.png.enabled 为 false）。 */
  pngContext: PngExportContext | null;
  /** 当前画面的报告输入。 */
  reportContext: ReportBuildContext;
  /** 「导出的到底是哪张图」的说明文本。 */
  caption: string;
  /** 质量准入是否通过：决定报告说明承诺的是完整七章节，还是只留证解析问题与阻止依据。 */
  admissionAllowed: boolean;
}

export function ChartExportPanel({
  availability,
  pngContext,
  reportContext,
  caption,
  admissionAllowed,
}: ChartExportPanelProps) {
  const [phase, setPhase] = useState<ExportPhase>('idle');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // 同一帧内的重复点击看不到上一条 setPhase：用 ref 兜住，确保一次只有一个导出在跑。
  const runningRef = useRef(false);
  const busy = phase !== 'idle';

  async function handlePngExport() {
    if (pngContext === null || !availability.png.enabled || busy || runningRef.current) return;
    runningRef.current = true;
    setPhase('png');
    setFeedback({ tone: 'status', text: '正在按当前画面重绘并导出 PNG…' });
    try {
      const outcome = await runPngExport(pngContext, new Date());
      setFeedback(
        outcome.ok
          ? {
              tone: 'status',
              text: `PNG 已导出：${outcome.fileName}（${formatBytes(outcome.byteLength)}，白色背景、2 倍像素比）。` +
                '请在浏览器下载列表或默认下载目录里查看。',
            }
          : { tone: 'alert', text: `PNG 导出失败：${outcome.message}` },
      );
    } catch (cause) {
      setFeedback({ tone: 'alert', text: `PNG 导出失败：${errorText(cause)}` });
    } finally {
      runningRef.current = false;
      setPhase('idle');
    }
  }

  function handleReportExport() {
    if (!availability.report.enabled || busy || runningRef.current) return;
    runningRef.current = true;
    setPhase('report');
    setFeedback({ tone: 'status', text: '正在按当前画面重新计算并生成 Markdown 报告…' });
    try {
      const outcome = runReportExport(reportContext, new Date());
      setFeedback(
        outcome.ok
          ? {
              tone: 'status',
              text: `Markdown 报告已导出：${outcome.fileName}（${formatBytes(outcome.byteLength)}，UTF-8）。` +
                '报告按当前画面重新计算，请在浏览器下载列表或默认下载目录里查看。',
            }
          : { tone: 'alert', text: `报告导出失败：${outcome.message}` },
      );
    } catch (cause) {
      setFeedback({ tone: 'alert', text: `报告导出失败：${errorText(cause)}` });
    } finally {
      runningRef.current = false;
      setPhase('idle');
    }
  }

  const pngDisabledHint = availability.png.enabled ? '' : availability.png.reason;
  const buttonBase =
    'rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <section aria-label="导出分析成果" className="mt-4 min-w-0 rounded-xl border border-brand-ring bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">导出分析成果</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        两项导出都在浏览器本地完成：不上传服务器、不需要登录、不调用外部接口，也不会改动原始数据与当前图表配置。
      </p>

      <p data-testid="export-target" className="mt-2 min-w-0 break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
        {caption}
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={handlePngExport}
          disabled={!availability.png.enabled || busy}
          aria-describedby="export-png-hint"
          aria-busy={phase === 'png'}
          className={`${buttonBase} bg-brand text-white hover:bg-brand-dark`}
        >
          导出当前图表 PNG
        </button>
        <button
          type="button"
          onClick={handleReportExport}
          disabled={!availability.report.enabled || busy}
          aria-describedby="export-report-hint"
          aria-busy={phase === 'report'}
          className={`${buttonBase} border border-brand-ring bg-brand-soft text-brand-dark hover:bg-brand-soft/70`}
        >
          导出 Markdown 报告
        </button>
      </div>

      <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
        {pngDisabledHint !== '' ? (
          <p id="export-png-hint" data-testid="export-png-reason" className="min-w-0 break-words text-amber-900">
            PNG 导出不可用：{pngDisabledHint}
          </p>
        ) : (
          <p id="export-png-hint">PNG 用当前生效的字段、聚合口径、纵轴起点与标题重新绘制一次，白底、约 2 倍像素比，适合插进报告或幻灯片。</p>
        )}
        {admissionAllowed ? (
          <p id="export-report-hint">
            Markdown 报告含数据来源、质量摘要、图表配置、参与与排除记录、风险诊断、修复记录与分析边界七个部分；
            报告里只有数字与口径说明，不含原始 CSV 的全部数据行，也不自动生成科研结论。建议与 PNG 一同归档。
          </p>
        ) : (
          <p id="export-report-hint" className="min-w-0 break-words text-amber-900">
            当前数据未通过质量准入：Markdown 报告只留证文件来源、解析问题与阻止依据，正文标注为非正式结论，
            不提供正式数据质量统计、图表配置与绘图结果、风险诊断或修复结论（报告第 2 至第 6 节写明「未执行」）。
            「未执行」不等于「检查通过」；修好源文件后重新上传，才能导出完整的七章节报告与 PNG。
          </p>
        )}
      </div>

      {feedback ? (
        <p
          data-testid="export-feedback"
          role={feedback.tone}
          aria-live={feedback.tone === 'alert' ? 'assertive' : 'polite'}
          className={`mt-3 min-w-0 break-words rounded-xl border px-3 py-2 text-sm leading-relaxed ${
            feedback.tone === 'alert' ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-brand-ring bg-brand-soft text-brand-dark'
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
    </section>
  );
}
