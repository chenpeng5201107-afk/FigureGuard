import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { EXAMPLE_CSV_PATH, parseCsvText } from './csv';
import { alignForKind, classifyColumn, classifyCellValue } from './display';

const exampleCsvUrl = new URL(`../../public/${EXAMPLE_CSV_PATH}`, import.meta.url);

describe('classifyCellValue 单元格视觉分类', () => {
  it('识别整数、小数、负号、千分位与百分号', () => {
    for (const value of ['12', '-4.2', '88.6', '+3', '1,240.5', '45%', '1.2e3']) {
      expect(classifyCellValue(value)).toBe('number');
    }
  });

  it('识别日期与日期时间', () => {
    for (const value of ['2026-03-02', '2026/3/2', '2026-03', '2026-03-02 08:15', '2026-03-02T08:15:30']) {
      expect(classifyCellValue(value)).toBe('date');
    }
  });

  it('编号、分类名与空文本按文本处理', () => {
    for (const value of ['PG-001', 'control', '', '   ', '12.4 kg', '03-02']) {
      expect(classifyCellValue(value)).toBe('text');
    }
  });
});

describe('classifyColumn 整列视觉分类', () => {
  it('空单元格与缺列不影响判定', () => {
    expect(classifyColumn(['12.4', '', null, '88.6'])).toBe('number');
    expect(classifyColumn(['2026-03-02', '', null])).toBe('date');
  });

  it('只要有一个文本值就整列按文本处理', () => {
    expect(classifyColumn(['12.4', '88.6', '未记录'])).toBe('text');
  });

  it('数值与日期混合时按文本处理，避免对齐误导', () => {
    expect(classifyColumn(['12.4', '2026-03-02'])).toBe('text');
  });

  it('整列为空时按文本处理', () => {
    expect(classifyColumn(['', '', null])).toBe('text');
  });

  it('数值列右对齐，日期与文本列左对齐', () => {
    expect(alignForKind('number')).toBe('right');
    expect(alignForKind('date')).toBe('left');
    expect(alignForKind('text')).toBe('left');
  });
});

describe('内置示例数据的列对齐判定', () => {
  it('与 plant-growth.csv 的真实内容一致', () => {
    const outcome = parseCsvText(readFileSync(exampleCsvUrl, 'utf8'), {
      fileName: 'plant-growth.csv',
      source: 'example',
    });
    if (outcome.status !== 'ok') {
      throw new Error(`示例数据解析失败：${outcome.error.message}`);
    }
    const { columns, rows } = outcome.table;
    const kinds = columns.map((_, index) => classifyColumn(rows.map((row) => row[index])));

    expect(columns).toEqual(['sample_id', 'date', 'group', 'height_cm']);
    expect(kinds).toEqual(['text', 'date', 'text', 'number']);
  });
});
