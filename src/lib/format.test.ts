import { describe, expect, it } from 'vitest';

import { formatBytes, formatComputedValue, formatCount } from './format';

describe('formatBytes', () => {
  it('按 B / KB / MB 分级显示', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(395)).toBe('395 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });

  it('异常输入不显示假数值', () => {
    expect(formatBytes(-1)).toBe('未知大小');
    expect(formatBytes(Number.NaN)).toBe('未知大小');
  });
});

describe('formatCount', () => {
  it('只做千分位分组', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(12)).toBe('12');
    expect(formatCount(260000)).toBe('260,000');
  });

  it('负数与 NaN 显示为未知', () => {
    expect(formatCount(-1)).toBe('未知');
    expect(formatCount(Number.NaN)).toBe('未知');
  });
});

describe('formatComputedValue：只格式化展示文本，不改变参与计算的值', () => {
  it('聚合结果的浮点尾数在展示时缩略，数值本身仍可取回', () => {
    const mean = 13.139999999999997;
    expect(formatComputedValue(mean, 2)).toBe('13.14');
    expect(formatComputedValue(mean)).toBe('13.14');
    expect(mean).not.toBe(13.14);
    expect(formatComputedValue(26.439999999999998)).toBe('26.44');
  });

  it('求和与平均的浮点累加误差不显示成假整数', () => {
    expect(formatComputedValue(65.69999999999999, 10)).toBe('65.7');
    expect(formatComputedValue(132.2)).toBe('132.2');
    expect(formatComputedValue(1 / 3, 4)).toBe('0.3333');
    expect(formatComputedValue(1 / 3, 2)).toBe('0.33');
  });

  it('0、负值与原样可表示的值都不加不减', () => {
    expect(formatComputedValue(0)).toBe('0');
    expect(formatComputedValue(-4.2)).toBe('-4.2');
    expect(formatComputedValue(88.6)).toBe('88.6');
    expect(formatComputedValue(5)).toBe('5');
    expect(formatComputedValue(2.5, 1)).toBe('2.5');
  });

  it('极小但不为 0 的结果不会显示成 0', () => {
    expect(formatComputedValue(1e-7)).toBe('1.00e-7');
    expect(formatComputedValue(-1e-9)).toBe('-1.00e-9');
  });

  it('不可表示的计算结果明确说明无法计算', () => {
    expect(formatComputedValue(Number.NaN)).toBe('无法计算');
    expect(formatComputedValue(Number.POSITIVE_INFINITY)).toBe('无法计算');
    expect(formatComputedValue(Number.NEGATIVE_INFINITY)).toBe('无法计算');
  });
});
