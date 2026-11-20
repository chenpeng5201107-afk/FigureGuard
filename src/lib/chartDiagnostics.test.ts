import { describe, expect, it } from 'vitest';

import { diagnoseBaseline } from './chartDiagnostics';
import { resolveYAxisStart } from './chartConfig';
import type { ResolvedYAxisStart } from './chartConfig';

// 与 resolveYAxisStart 输出对齐的最小构造器，聚焦诊断逻辑本身。
function autoStart(): ResolvedYAxisStart {
  return { mode: 'auto', appliedMin: null, parsed: null, error: null, notice: null };
}
function manualStart(
  appliedMin: number | null,
  error: string | null = null,
  parsed: number | null = appliedMin,
  notice: string | null = null,
): ResolvedYAxisStart {
  return { mode: 'manual', appliedMin, parsed, error, notice };
}
// 走真实解析链：配置 → resolveYAxisStart → diagnoseBaseline，验证两个模块用的是同一个起点。
function diagnoseResolved(raw: string, yRange: { min: number; max: number } | null, kind: 'bar' | 'scatter' | 'line' = 'bar') {
  return diagnoseBaseline({
    kind,
    yRange,
    axisStart: resolveYAxisStart({ mode: 'manual', raw }, yRange),
    yFieldLabel: 'value',
  });
}

describe('diagnoseBaseline：A 组 风险识别', () => {
  it('A=96、B=98，起点 95（不含 0）→ 识别为非零基线风险', () => {
    const d = diagnoseBaseline({ kind: 'bar', yRange: { min: 96, max: 98 }, axisStart: manualStart(95), yFieldLabel: 'value' });
    expect(d.status).toBe('risk');
    expect(d.level).toBe('advisory');
    expect(d.title).toBe('柱状图非零基线');
    expect(d.summary).toContain('95');
    expect(d.summary).toContain('不包含 0');
    expect(d.impact).toContain('放大');
    expect(d.recommendation).toContain('零基线');
    expect(d.axisStart).toEqual({ mode: 'manual', appliedMin: 95 });
    expect(d.dataRange).toEqual({ min: 96, max: 98 });
  });

  it('A=96、B=98，起点 0 → 不产生该风险', () => {
    const d = diagnoseBaseline({ kind: 'bar', yRange: { min: 96, max: 98 }, axisStart: manualStart(0), yFieldLabel: 'value' });
    expect(d.status).toBe('clear');
    expect(d.level).toBe('none');
    expect(d.summary).toContain('包含 0');
  });

  it('纵轴包含负数与 0（起点 -10，数据 -5..20）→ 不产生该风险', () => {
    const d = diagnoseBaseline({ kind: 'bar', yRange: { min: -5, max: 20 }, axisStart: manualStart(-10), yFieldLabel: 'v' });
    expect(d.status).toBe('clear');
  });

  it('合法负数柱状图 + 自动模式 → 正确处理零基线，不报风险', () => {
    const d = diagnoseBaseline({ kind: 'bar', yRange: { min: -4.2, max: 88.6 }, axisStart: autoStart(), yFieldLabel: 'height_cm' });
    expect(d.status).toBe('clear');
    expect(d.axisStart.appliedMin).toBeNull();
  });

  it('起点为正、数据也含负值（起点 5，数据 -10..20）：真实解析链会拦下裁剪，诊断报配置无效而非放行', () => {
    const d = diagnoseResolved('5', { min: -10, max: 20 });
    expect(d.status).toBe('invalid-config');
    expect(d.axisStart.appliedMin).toBeNull();
    expect(d.summary).toContain('高于数据最小值 -10');
  });

  it('起点为正、数据全为正且起点不高于最小值（起点 5，数据 6..20）→ 明确不含 0，报风险', () => {
    const d = diagnoseBaseline({ kind: 'bar', yRange: { min: 6, max: 20 }, axisStart: manualStart(5), yFieldLabel: 'v' });
    expect(d.status).toBe('risk');
  });

  it('空数据（yRange=null）→ 不产生虚假诊断', () => {
    const d = diagnoseBaseline({ kind: 'bar', yRange: null, axisStart: autoStart(), yFieldLabel: 'v' });
    expect(d.status).toBe('no-data');
    expect(d.level).toBe('none');
    expect(d.dataRange).toBeNull();
  });

  it('无效坐标轴配置 → 报告配置问题而非零基线风险', () => {
    const d = diagnoseBaseline({
      kind: 'bar',
      yRange: { min: 96, max: 98 },
      axisStart: manualStart(null, '起点 99 不低于数据最大值 98，已阻止应用', 99),
      yFieldLabel: 'v',
    });
    expect(d.status).toBe('invalid-config');
    expect(d.summary).toContain('起点');
    expect(d.title).toBe('Y 轴起点配置无效');
  });

  it('自动模式判断依据与实际坐标轴一致：appliedMin 为 null，不报风险', () => {
    const d = diagnoseBaseline({ kind: 'bar', yRange: { min: 1, max: 100 }, axisStart: autoStart(), yFieldLabel: 'v' });
    expect(d.status).toBe('clear');
    expect(d.axisStart.mode).toBe('auto');
    expect(d.axisStart.appliedMin).toBeNull();
  });
});

describe('diagnoseBaseline：B 组 图表类型边界', () => {
  it('柱状图规则生效', () => {
    expect(diagnoseBaseline({ kind: 'bar', yRange: { min: 96, max: 98 }, axisStart: manualStart(95), yFieldLabel: 'v' }).status).toBe('risk');
  });

  it('散点图不套用柱状图规则，且不谎报为通过', () => {
    const d = diagnoseBaseline({ kind: 'scatter', yRange: { min: 96, max: 98 }, axisStart: manualStart(95), yFieldLabel: 'v' });
    expect(d.status).toBe('not-applicable');
    expect(d.title).toContain('不适用');
  });

  it('折线图不套用柱状图规则', () => {
    expect(diagnoseBaseline({ kind: 'line', yRange: { min: 96, max: 98 }, axisStart: manualStart(95), yFieldLabel: 'v' }).status).toBe('not-applicable');
  });

  it('折线图起点为正也不误报非零基线', () => {
    const d = diagnoseBaseline({ kind: 'line', yRange: { min: 96, max: 98 }, axisStart: manualStart(95), yFieldLabel: 'v' });
    expect(d.level).toBe('none');
  });

  it('聚合柱状图仍用真实聚合结果范围判断：聚合后 96..98 + 起点 95 → 风险', () => {
    // 聚合口径由 chartData 产出真实 yRange，诊断只认这个范围。
    const d = diagnoseBaseline({ kind: 'bar', yRange: { min: 96, max: 98 }, axisStart: manualStart(95), yFieldLabel: 'value' });
    expect(d.status).toBe('risk');
    expect(d.dataRange).toEqual({ min: 96, max: 98 });
  });

  it('极端数据值本身不自动产生非零基线风险（自动模式）', () => {
    const d = diagnoseBaseline({ kind: 'bar', yRange: { min: 5e307, max: 1e308 }, axisStart: autoStart(), yFieldLabel: 'v' });
    expect(d.status).toBe('clear');
  });

  it('每条诊断都带唯一规则 ID 与配置来源，可供 Day 8 修复定位', () => {
    const d = diagnoseBaseline({ kind: 'bar', yRange: { min: 96, max: 98 }, axisStart: manualStart(95), yFieldLabel: 'v' });
    expect(d.ruleId).toBe('bar-zero-baseline');
    expect(d.appliesTo).toBe('bar');
    expect(d.configSource).toBe('chartConfig.yAxisStart');
  });
});

describe('diagnoseBaseline × resolveYAxisStart：裁剪配置不会被「未发现风险」掩盖', () => {
  it('数据 96–98、起点 95：合法应用，判为非零基线风险', () => {
    const d = diagnoseResolved('95', { min: 96, max: 98 });
    expect(d.status).toBe('risk');
    expect(d.axisStart.appliedMin).toBe(95);
  });

  it('数据 96–98、起点 97：部分裁剪被阻止，诊断是配置无效而不是未发现风险', () => {
    const d = diagnoseResolved('97', { min: 96, max: 98 });
    expect(d.status).toBe('invalid-config');
    expect(d.level).toBe('none');
    expect(d.axisStart.appliedMin).toBeNull();
    expect(d.summary).not.toContain('未发现');
    expect(d.dataRange).toEqual({ min: 96, max: 98 });
  });

  it('数据 96–98、起点 99：全部裁剪同样归入配置无效', () => {
    expect(diagnoseResolved('99', { min: 96, max: 98 }).status).toBe('invalid-config');
  });

  it('数据 -5–20、起点 -10：数据完整且含零基线 → 未发现风险', () => {
    const d = diagnoseResolved('-10', { min: -5, max: 20 });
    expect(d.status).toBe('clear');
    expect(d.axisStart.appliedMin).toBe(-10);
  });

  it('数据 -5–20、起点 -1：负数被裁掉 → 配置无效', () => {
    expect(diagnoseResolved('-1', { min: -5, max: 20 }).status).toBe('invalid-config');
  });

  it('数据 -5–20、起点 0：含零基线但藏掉 -5 → 配置无效，绝不返回未发现风险', () => {
    const d = diagnoseResolved('0', { min: -5, max: 20 });
    expect(d.status).toBe('invalid-config');
    expect(d.title).toBe('Y 轴起点配置无效');
    expect(d.summary).toContain('高于数据最小值 -5');
  });

  it('数据 96–98、起点 0：合法且含零基线 → 无该风险', () => {
    const d = diagnoseResolved('0', { min: 96, max: 98 });
    expect(d.status).toBe('clear');
    expect(d.axisStart.appliedMin).toBe(0);
  });

  it('起点恰好等于数据最小值：已应用，风险级别仍按零基线判断，不因裁剪谎报无效', () => {
    const d = diagnoseResolved('96', { min: 96, max: 98 });
    expect(d.status).toBe('risk');
    expect(d.axisStart.appliedMin).toBe(96);
  });

  it('起点恰好等于数据最小值 -5：已应用且含零基线 → 未发现风险（零长度代价提示由配置层给出）', () => {
    const d = diagnoseResolved('-5', { min: -5, max: 20 });
    expect(d.status).toBe('clear');
    expect(resolveYAxisStart({ mode: 'manual', raw: '-5' }, { min: -5, max: 20 }).notice).toContain('长度 0');
  });

  it('非法输入与空串仍归入配置无效（原有行为不回归）', () => {
    expect(diagnoseResolved('abc', { min: 96, max: 98 }).status).toBe('invalid-config');
    expect(diagnoseResolved('', { min: 96, max: 98 }).status).toBe('invalid-config');
  });

  it('非柱状图即使配置会被裁剪也先回答「不适用」，不越界下判断', () => {
    expect(diagnoseResolved('97', { min: 96, max: 98 }, 'scatter').status).toBe('not-applicable');
  });

  it('没有可绘制数值时保持安全空状态：判无数据，不虚构裁剪结论', () => {
    const d = diagnoseResolved('97', null);
    expect(d.status).toBe('no-data');
    expect(d.dataRange).toBeNull();
  });
});
