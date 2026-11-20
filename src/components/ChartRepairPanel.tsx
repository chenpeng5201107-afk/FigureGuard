import { EChartCanvas } from './EChartCanvas';
import { BASELINE_STATUS_LABELS } from '../lib/chartDiagnostics';
import type { BaselineDiagnostic } from '../lib/chartDiagnostics';
import { describeRepairChanges, describeRepairComparison } from '../lib/chartRepair';
import type { ChartRepairRecord } from '../lib/chartRepair';
import { formatComputedValue } from '../lib/format';

/** 对比区两侧使用同一高度，前后差异只来自坐标轴配置本身。 */
const COMPARE_HEIGHT = 320;

interface ChartRepairPanelProps {
  /** 修复发生时钉存的那一份记录。 */
  record: ChartRepairRecord;
  /** 修复后按当前配置重新计算的真实诊断；null 表示当前没有可诊断的图表。 */
  afterDiagnostic: BaselineDiagnostic | null;
  /** 供读屏的图表等价说明，与主图同一口径。 */
  description: string;
  onUndo: () => void;
}

/** 对比卡片的外框配色：修复前用琥珀（有风险），修复后用品牌青绿（本规则未发现问题）。 */
const CARD_TONE = {
  before: 'border-amber-300 bg-amber-50',
  after: 'border-brand-ring bg-brand-soft',
} as const;

/**
 * 修复前后对比区：左右两张**真实 ECharts 图表**共用同一份 ChartDataResult，
 * 只有纵轴下界配置不同；下方逐条列出本次真实修改了什么，并提供单步撤销。
 * 这里不复制数据、不用截图替代图表，也不宣称修复后的图表已经完全科学正确。
 */
export function ChartRepairPanel({ record, afterDiagnostic, description, onUndo }: ChartRepairPanelProps) {
  const changes = describeRepairChanges(record);
  const floor = formatComputedValue(record.beforeAppliedMin);

  return (
    <section
      data-testid="chart-repair-comparison"
      aria-labelledby="chart-repair-heading"
      className="mt-4 min-w-0 rounded-xl border border-brand-ring bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="chart-repair-heading" className="text-sm font-semibold text-slate-900">
          修复前后对比
        </h3>
        <span data-testid="repair-after-status" className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-white">
          {afterDiagnostic ? BASELINE_STATUS_LABELS[afterDiagnostic.status] : '已重新检查'}
        </span>
      </div>

      <p role="status" data-testid="repair-done" className="mt-2 text-sm leading-relaxed text-brand-dark">
        已恢复包含零基线的自动纵轴范围：图表配置已调整，原始实验数据未发生变化。
      </p>

      <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
        <div data-testid="repair-before" className={`min-w-0 rounded-xl border p-3 ${CARD_TONE.before}`}>
          <h4 className="text-xs font-semibold text-amber-900">修复前</h4>
          <p className="mt-1 break-words text-xs leading-relaxed text-amber-900">
            纵轴下界为 {floor}（手动设置），可见范围不含 0：这条柱子表达存在非零基线风险，可能放大数值之间的视觉差距。
          </p>
          <div className="mt-2 rounded-lg bg-white/70 p-1">
            <EChartCanvas
              key="repair-before"
              option={record.beforeOption}
              ariaLabel="修复前柱状图预览"
              description={`修复前，纵轴下界 ${floor}。${description}`}
              height={COMPARE_HEIGHT}
            />
          </div>
        </div>

        <div data-testid="repair-after" className={`min-w-0 rounded-xl border p-3 ${CARD_TONE.after}`}>
          <h4 className="text-xs font-semibold text-brand-dark">修复后</h4>
          <p className="mt-1 break-words text-xs leading-relaxed text-brand-dark">
            纵轴起点恢复自动范围、包含零基线；存在负值时一并显示，不裁剪任何有效数值。
          </p>
          <div className="mt-2 rounded-lg bg-white/70 p-1">
            <EChartCanvas
              key="repair-after"
              option={record.afterOption}
              ariaLabel="修复后柱状图预览"
              description={`修复后，纵轴为自动范围并包含 0。${description}`}
              height={COMPARE_HEIGHT}
            />
          </div>
        </div>
      </div>

      <p data-testid="repair-compare-note" className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
        {describeRepairComparison(record)}
      </p>

      <div data-testid="repair-changes" className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-xs font-semibold text-slate-800">本次修复修改了什么？</h4>
        <dl className="mt-2 space-y-1.5">
          {changes.map((item) => (
            <div key={item.label} className="flex flex-wrap gap-x-2 text-xs leading-relaxed text-slate-600">
              <dt className="font-semibold text-slate-700">{item.label}</dt>
              <dd className="min-w-0 flex-1 break-words">{item.value}</dd>
            </div>
          ))}
          <div className="flex flex-wrap gap-x-2 border-t border-slate-200 pt-1.5 text-xs leading-relaxed text-slate-600">
            <dt className="font-semibold text-slate-700">重新检查</dt>
            <dd className="min-w-0 flex-1 break-words">
              {afterDiagnostic
                ? `${BASELINE_STATUS_LABELS[afterDiagnostic.status]}：${afterDiagnostic.summary}`
                : '当前选择下没有可检查的图表，未产出诊断结论。'}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          自动范围表示纵轴包含 0，不等于实际刻度下界恰好为 0；本条规则的重新检查结果由当前配置重新计算得到。
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="repair-undo"
          onClick={onUndo}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          撤销本次修复
        </button>
        <p className="min-w-0 flex-1 break-words text-xs leading-relaxed text-slate-500">
          撤销只把 Y 轴起点恢复成修复前的手动数值，不改写 CSV 数据、字段、聚合结果与记录计数。
          本工具只调整图表表达，不据此认定数据对错，也不表示图表已通过全部检查。
        </p>
      </div>
    </section>
  );
}
