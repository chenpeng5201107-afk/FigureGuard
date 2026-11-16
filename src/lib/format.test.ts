import { describe, expect, it } from 'vitest';

import { formatBytes, formatCount } from './format';

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
