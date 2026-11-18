import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  MAX_ITEMIZED_TYPE_CONFLICTS,
  MIN_DOMINANT_RATE,
  MIN_TYPE_SAMPLES,
  SHAPE_LABELS,
  analyzeColumnTypes,
  classifyCellValue,
  daysInMonth,
  isCalendarValidDate,
  isLeapYear,
  looksLikeIdentifierHeader,
} from './columnTypes';
import { EXAMPLE_CSV_PATH, parseCsvText } from './csv';
import { analyzeDataQuality, evaluateQualityAdmission } from './dataQuality';
import type { CsvTable } from '../types/csv';
import type { ColumnTypeProfile } from '../types/dataQuality';

const exampleCsvUrl = new URL(`../../public/${EXAMPLE_CSV_PATH}`, import.meta.url);

function tableOf(text: string, fileName = 'types.csv'): CsvTable {
  const outcome = parseCsvText(text, { fileName, source: 'file' });
  if (outcome.status !== 'ok') {
    throw new Error(`期望解析成功，实际错误：${outcome.error.message}`);
  }
  return outcome.table;
}

/** 取某一列的推断结论（列名唯一时使用）。 */
function profileOf(table: CsvTable, column: string): ColumnTypeProfile {
  const profile = analyzeColumnTypes(table).columns.find((entry) => entry.column === column);
  if (profile === undefined) throw new Error(`测试数据里没有这一列：${column}`);
  return profile;
}

function columnOf(header: string, values: string[]): CsvTable {
  return tableOf(`${header}\n${values.map((value) => `"${value}"`).join('\n')}`);
}

describe('单元格形态判定（不做任何转换）', () => {
  it('整数、小数、负数、零与科学计数都是数值形态', () => {
    for (const value of ['0', '-0', '0.0', '12', '12.4', '+3.5', '.5', '12.', '1e3', '1.5E-3', '-4.2', '88.6']) {
      expect(classifyCellValue(value)).toEqual({ kind: 'number', shape: 'plain-number' });
    }
  });

  it('空字符串、纯空白与缺列不参与投票', () => {
    for (const value of ['', ' ', '   ', '\t', '\n', ' \u00a0 ']) {
      expect(classifyCellValue(value)).toBeNull();
    }
    expect(classifyCellValue(null)).toBeNull();
  });

  it('`12.4 kg` 与百分号不是纯数值，而是「数值 + 单位」的文本形态', () => {
    for (const value of ['12.4 kg', '12.4kg', '85%', '5天', '1.5 m/s']) {
      const vote = classifyCellValue(value);
      expect(vote?.kind).toBe('text');
      expect(vote?.shape).toBe('number-with-unit');
    }
  });

  it('千分位、货币符号与缺测标记按文本形态处理', () => {
    for (const value of ['1,234', '$12.4', 'NA', 'N/A', '-', 'abc', 'NaN', 'Infinity', '1..2', '--1']) {
      expect(classifyCellValue(value)?.kind).toBe('text');
    }
  });

  it('以 0 开头的编号保持文本形态，但单独的 0 与 0.x 仍是数值', () => {
    for (const value of ['007', '0123', '+007', '00']) {
      expect(classifyCellValue(value)).toEqual({ kind: 'text', shape: 'leading-zero-code' });
    }
    expect(classifyCellValue('0')?.kind).toBe('number');
    expect(classifyCellValue('0.0')?.kind).toBe('number');
    expect(classifyCellValue('-0')?.kind).toBe('number');
  });

  it('年在前的日期写法识别为日期，月在前的写法因地区歧义不按日期处理', () => {
    for (const value of ['2026-03-02', '2026/3/1', '2026-03', '2026-03-02 08:15', '2026-03-02T08:15:30']) {
      expect(classifyCellValue(value)).toEqual({ kind: 'date', shape: 'calendar-date' });
    }
    for (const value of ['03/02/2026', '2-3-2026', '2026-3-2-5']) {
      expect(classifyCellValue(value)?.kind).toBe('text');
    }
  });

  it('日历校验：2026-02-30、2026-13-01、非闰年的 2 月 29 日都不是有效日期', () => {
    expect(isCalendarValidDate('2026-02-30')).toBe(false);
    expect(isCalendarValidDate('2026-02-28')).toBe(true);
    expect(isCalendarValidDate('2026-13-01')).toBe(false);
    expect(isCalendarValidDate('2026-04-31')).toBe(false);
    expect(isCalendarValidDate('2025-02-29')).toBe(false);
    expect(isCalendarValidDate('2024-02-29')).toBe(true);
    expect(isCalendarValidDate('1900-02-29')).toBe(false);
    expect(isCalendarValidDate('2000-02-29')).toBe(true);
    expect(isCalendarValidDate('2026-00-10')).toBe(false);
    expect(isCalendarValidDate('2026-03-01 24:00')).toBe(false);
    expect(isCalendarValidDate('2026-03-01 08:60')).toBe(false);
    expect(classifyCellValue('2026-02-30')).toEqual({ kind: 'text', shape: 'invalid-calendar-date' });
  });

  it('闰年与每月天数按真实日历计算', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 13)).toBe(0);
  });

  it('形态标签覆盖全部形态代码（界面文案不会漏一种）', () => {
    const codes = Object.keys(SHAPE_LABELS);
    expect(codes).toContain('invalid-calendar-date');
    expect(codes).toHaveLength(6);
  });
});

describe('标识符表头启发式', () => {
  it('id / 编号 / 学号 / 电话 这类列名判为标识符', () => {
    for (const header of [
      'sample_id',
      'student_id',
      'ID',
      'id',
      'uuid',
      'zip_code',
      'phone',
      'barcode',
      'cardno',
      '学号',
      '样本编号',
      '订单号',
      '身份证号',
      '邮政编码',
    ]) {
      expect(looksLikeIdentifierHeader(header)).toBe(true);
    }
  });

  it('valid / width / group 这类列名不该被误判成标识符', () => {
    for (const header of ['valid', 'validate', 'width_cm', 'paid', 'group', 'date', 'height_cm', '备注']) {
      expect(looksLikeIdentifierHeader(header)).toBe(false);
    }
  });
});

describe('整列类型推断', () => {
  it('1. 全部是合法数值：判为数值，占比 100%，没有任何冲突候选', () => {
    const profile = profileOf(columnOf('height_cm', ['12.4', '15.1', '-4.2', '0', '88.6', '1.5e2']), 'height_cm');

    expect(profile.kind).toBe('number');
    expect(profile.kindLabel).toBe('数值');
    expect(profile.basis).toBe('content');
    expect(profile.sampleCount).toBe(6);
    expect(profile.dominantRate).toBe(1);
    expect(profile.conflictCount).toBe(0);
    expect(profile.conflicts).toEqual([]);
  });

  it('2. 全部是合法日期：判为日期', () => {
    const profile = profileOf(
      columnOf('date', ['2026-03-01', '2026-03-02', '2026-03-03', '2026-02-28 08:15']),
      'date',
    );

    expect(profile.kind).toBe('date');
    expect(profile.sampleCount).toBe(4);
    expect(profile.dateCount).toBe(4);
    expect(profile.conflictCount).toBe(0);
  });

  it('3. 数值列混入一个文本值：标出该单元格并给出行序号与原始值', () => {
    const profile = profileOf(columnOf('height_cm', ['12.4', '15.1', 'abc', '13.8', '14.0']), 'height_cm');

    expect(profile.kind).toBe('number');
    expect(profile.conflictCount).toBe(1);
    expect(profile.conflictRate).toBeCloseTo(1 / 5, 10);
    expect(profile.conflicts[0].rowIndex).toBe(2);
    expect(profile.conflicts[0].value).toBe('abc');
    expect(profile.conflicts[0].observedKind).toBe('text');
    expect(profile.conflicts[0].shape).toBe('plain-text');
    expect(profile.conflicts[0].suggestion).toContain('不要直接删行');
  });

  it('4. 日期列出现不存在的日期：冲突形态是「日历上不存在的日期」，且提示不会自动改写', () => {
    const profile = profileOf(
      columnOf('date', ['2026-03-01', '2026-03-02', '2026-03-03', '2026-02-30']),
      'date',
    );

    expect(profile.kind).toBe('date');
    expect(profile.conflictCount).toBe(1);
    expect(profile.conflicts[0].shape).toBe('invalid-calendar-date');
    expect(profile.conflicts[0].rowIndex).toBe(3);
    expect(profile.conflicts[0].suggestion).toContain('日历上没有这一天');
  });

  it('5. 空单元格、纯空白与缺列都不会被误判成类型冲突', () => {
    const clean = analyzeColumnTypes(tableOf('a,b\n1,x\n,y\n  ,z\n3,w\n4,e'));
    const columnA = clean.columns[0];
    expect(clean.recordCount).toBe(5);
    expect(columnA.sampleCount).toBe(3);
    expect(columnA.skippedCount).toBe(2);
    expect(columnA.kind).toBe('number');
    expect(columnA.conflictCount).toBe(0);
    // 每列的投票样本 + 跳过格恰好等于记录数，没有把空格算成冲突。
    for (const profile of clean.columns) {
      expect(profile.sampleCount + profile.skippedCount).toBe(clean.recordCount);
    }

    // 缺列（null）只跳过投票；这份文件结构降级，正式结论仍由准入拦下。
    const ragged = tableOf('a,b,c\n1,2,3\n4,5');
    const gapProfile = analyzeColumnTypes(ragged).columns[2];
    expect(ragged.rows[1][2]).toBeNull();
    expect(gapProfile.sampleCount).toBe(1);
    expect(gapProfile.skippedCount).toBe(1);
    expect(gapProfile.conflictCount).toBe(0);
    expect(evaluateQualityAdmission(ragged).allowed).toBe(false);
  });

  it('6. 0、负数、小数、科学计数与缺测标记混合：只有 NA 这类文本才算冲突候选', () => {
    const profile = profileOf(
      columnOf('value', ['0', '-4.2', '1.5e3', '12.', '.5', 'NA', '7', '8']),
      'value',
    );

    expect(profile.kind).toBe('number');
    expect(profile.sampleCount).toBe(8);
    expect(profile.numberCount).toBe(7);
    expect(profile.conflictCount).toBe(1);
    expect(profile.conflicts[0].rowIndex).toBe(5);
    expect(profile.conflicts[0].suggestion).toContain('缺测标记');
  });

  it('7. 标识符字段里的数字字符串按文本处理，不做数值转换也不报冲突', () => {
    const table = tableOf('student_id,score\n007,91\n008,88\n009,77\n2024001,60');
    const summary = analyzeColumnTypes(table);

    const id = summary.columns.find((entry) => entry.column === 'student_id');
    expect(id?.identifierHeader).toBe(true);
    expect(id?.kind).toBe('text');
    expect(id?.basis).toBe('identifier-name');
    expect(id?.conflictCount).toBe(0);
    // 007 / 008 / 009 是「以 0 开头的编号」，按文本投票；只有 2024001 是数值形态。
    expect(id?.numberCount).toBe(1);
    expect(id?.textCount).toBe(3);
    expect(id?.basisText).toContain('标识符线索');

    const score = summary.columns.find((entry) => entry.column === 'score');
    expect(score?.kind).toBe('number');
    expect(score?.conflictCount).toBe(0);
  });

  it('以 0 开头的编号列即使列名没有线索也按文本保留', () => {
    const profile = profileOf(columnOf('label', ['007', '008', '009', '010']), 'label');

    expect(profile.identifierHeader).toBe(false);
    expect(profile.kind).toBe('text');
    expect(profile.textCount).toBe(4);
    expect(profile.conflictCount).toBe(0);
  });

  it('8. 样本很少、全部为空、无法确定时明确回答无法确定', () => {
    const single = profileOf(columnOf('a', ['12.4']), 'a');
    expect(single.kind).toBe('unknown');
    expect(single.basis).toBe('too-few-samples');
    expect(single.sampleCount).toBe(1);
    expect(single.conflictCount).toBe(0);

    const two = profileOf(columnOf('a', ['12.4', 'abc']), 'a');
    expect(two.kind).toBe('unknown');
    expect(two.basis).toBe('too-few-samples');
    expect(MIN_TYPE_SAMPLES).toBe(3);

    const allEmpty = profileOf(tableOf('a,b\n1,\n2,\n3,'), 'b');
    expect(allEmpty.kind).toBe('unknown');
    expect(allEmpty.basis).toBe('no-samples');
    expect(allEmpty.sampleCount).toBe(0);
    expect(allEmpty.skippedCount).toBe(3);
    expect(allEmpty.dominantRate).toBe(0);

    const blankOnly = profileOf(tableOf('a,b\n" ",1\n"\t",2\n"  ",3'), 'a');
    expect(blankOnly.kind).toBe('unknown');
    expect(blankOnly.basis).toBe('no-samples');
    expect(blankOnly.skippedCount).toBe(3);
    expect(blankOnly.conflictCount).toBe(0);
  });

  it('9. 类型比例接近时不做武断判断，达到阈值才下结论', () => {
    const mixed = profileOf(columnOf('a', ['1', '2', '3', '4', '5', 'x', 'y', 'z', 'w']), 'a');
    expect(mixed.kind).toBe('unknown');
    expect(mixed.basis).toBe('mixed-content');
    expect(mixed.dominantRate).toBeCloseTo(5 / 9, 10);
    expect(mixed.conflictCount).toBe(0);
    expect(mixed.basisText).toContain('不做武断判断');
    expect(MIN_DOMINANT_RATE).toBe(0.7);

    // 恰好 70% 视为稳定主要类型，7/10 是边界。
    const atThreshold = profileOf(columnOf('a', ['1', '2', '3', '4', '5', '6', '7', 'x', 'y', 'z']), 'a');
    expect(atThreshold.kind).toBe('number');
    expect(atThreshold.dominantRate).toBeCloseTo(0.7, 10);
    expect(atThreshold.conflictCount).toBe(3);
  });

  it('数值列与日期列混半对半时判为无法确定，而不是任选一边', () => {
    const profile = profileOf(columnOf('a', ['2026-03-01', '2026-03-02', '12.4', '15.1', '18.0']), 'a');

    expect(profile.kind).toBe('unknown');
    expect(profile.basis).toBe('mixed-content');
    expect(profile.conflictCount).toBe(0);
  });

  it('任务示例：height_cm 混入 abc、date 出现 2026-02-30 各自被标出', () => {
    const table = tableOf(
      'sample_id,height_cm,date\nPG-001,12.4,2026-03-01\nPG-002,15.1,2026-03-02\nPG-003,abc,2026-03-03\nPG-004,13.8,2026-02-30',
    );
    const summary = analyzeColumnTypes(table);
    const byName = new Map(summary.columns.map((entry) => [entry.column, entry]));

    expect(byName.get('sample_id')?.kind).toBe('text');
    expect(byName.get('sample_id')?.conflictCount).toBe(0);
    expect(byName.get('height_cm')?.kind).toBe('number');
    expect(byName.get('height_cm')?.conflictCount).toBe(1);
    expect(byName.get('height_cm')?.conflicts[0].rowIndex).toBe(2);
    expect(byName.get('date')?.kind).toBe('date');
    expect(byName.get('date')?.conflictCount).toBe(1);
    expect(byName.get('date')?.conflicts[0].rowIndex).toBe(3);
    expect(byName.get('date')?.conflicts[0].value).toBe('2026-02-30');
    expect(summary.columnsWithConflicts).toBe(2);
    expect(summary.totalConflictCells).toBe(2);
    expect(summary.kindTotals).toEqual({ number: 1, date: 1, text: 1, unknown: 0 });
  });

  it('文本或类别列里混进数值与日期也会标出，建议里说明可能是串列', () => {
    const profile = profileOf(
      columnOf('group', ['control', 'treated', 'control', 'treated', '12.4', '2026-03-01', 'control']),
      'group',
    );

    expect(profile.kind).toBe('text');
    expect(profile.conflictCount).toBe(2);
    expect(profile.conflicts[0].observedKind).toBe('number');
    expect(profile.conflicts[1].observedKind).toBe('date');
    expect(profile.conflicts[0].suggestion).toContain('串进了分组列');
  });

  it('冲突候选数量全量统计，明细有上限且明确标注被截断', () => {
    const values: string[] = [];
    for (let index = 0; index < 60; index += 1) values.push(`${index}`);
    for (let index = 0; index < 25; index += 1) values.push(`bad${index}`);
    const profile = profileOf(columnOf('a', values), 'a');

    expect(profile.kind).toBe('number');
    expect(profile.sampleCount).toBe(85);
    expect(profile.conflictCount).toBe(25);
    expect(profile.conflicts).toHaveLength(MAX_ITEMIZED_TYPE_CONFLICTS);
    expect(profile.conflictsTruncated).toBe(true);
    expect(MAX_ITEMIZED_TYPE_CONFLICTS).toBe(20);
    expect(profile.conflicts[0].rowIndex).toBe(60);
  });

  it('只有表头的文件：每列都是无法确定且不出现 NaN 或 Infinity', () => {
    const summary = analyzeColumnTypes(tableOf('sample_id,date,group,height_cm'));

    expect(summary.recordCount).toBe(0);
    expect(summary.columnCount).toBe(4);
    expect(summary.kindTotals.unknown).toBe(3);
    expect(summary.kindTotals.text).toBe(1);
    expect(summary.columnsChecked).toBe(0);
    expect(summary.totalConflictCells).toBe(0);
    for (const profile of summary.columns) {
      expect(Number.isFinite(profile.dominantRate)).toBe(true);
      expect(Number.isFinite(profile.conflictRate)).toBe(true);
      expect(profile.dominantKind).toBeNull();
      expect(profile.conflictCount).toBe(0);
    }
  });

  it('单列文件与空表头列都有可读标签', () => {
    const summary = analyzeColumnTypes(tableOf('a,,c\n1,2,3\n4,5,6\n7,8,9'));

    expect(summary.columns[1].label).toBe('（第 2 列未命名）');
    expect(summary.columns[1].kind).toBe('number');
    expect(summary.columns[0].conflictCount).toBe(0);
  });

  it('内置示例数据：四列分别是文本 / 日期 / 文本或类别 / 数值且没有类型冲突', () => {
    const summary = analyzeColumnTypes(tableOf(readFileSync(exampleCsvUrl, 'utf8'), 'plant-growth.csv'));
    const kinds = summary.columns.map((profile) => `${profile.column}:${profile.kind}`);

    expect(kinds).toEqual([
      'sample_id:text',
      'date:date',
      'group:text',
      'height_cm:number',
    ]);
    expect(summary.totalConflictCells).toBe(0);
    // height_cm 的两个空单元格只是跳过投票，不会被算成类型冲突。
    const height = summary.columns[3];
    expect(height.sampleCount).toBe(10);
    expect(height.skippedCount).toBe(2);
    expect(height.conflictCount).toBe(0);
  });

  it('同一份数据重复推断结果完全一致，不携带上一次的统计', () => {
    const table = tableOf('a,b\n1,x\n2,y\n3,z');

    expect(analyzeColumnTypes(table)).toEqual(analyzeColumnTypes(table));
    expect(analyzeColumnTypes(tableOf('a\n1\n2\n3'))).toEqual(analyzeColumnTypes(tableOf('a\n1\n2\n3')));
  });

  it('类型诊断不改变原始 CsvTable.rows（逐行引用 + 逐值快照）', () => {
    const table = tableOf('id,value,note\nA,1,\nB,1,\n" q\nr ",2,3\nC,3,x\nD,,4\n');
    const before = JSON.stringify(table.rows);
    const rowReferences = table.rows.map((row) => row);
    const cellReferences = table.rows.map((row) => [...row]);

    const summary = analyzeColumnTypes(table);
    analyzeDataQuality(table);

    expect(JSON.stringify(table.rows)).toBe(before);
    expect(summary.columns.length).toBeGreaterThan(0);
    table.rows.forEach((row, index) => {
      expect(row).toBe(rowReferences[index]);
      expect([...row]).toEqual(cellReferences[index]);
    });
  });
});

describe('类型结论接入质量报告', () => {
  it('报告带 columnTypes，且每个有冲突的字段生成一条 column-type 问题', () => {
    const report = analyzeDataQuality(
      tableOf('sample_id,height_cm,date\nPG-001,12.4,2026-03-01\nPG-002,15.1,2026-03-02\nPG-003,abc,2026-03-03\nPG-004,13.8,2026-02-30'),
    );

    expect(report.columnTypes.columnsWithConflicts).toBe(2);
    const typeFindings = report.findings.filter((finding) => finding.kind === 'column-type');
    expect(typeFindings).toHaveLength(2);
    expect(typeFindings.every((finding) => finding.severity === 'attention')).toBe(true);
    expect(typeFindings[0].title).toContain('类型不一致的候选值');
    expect(typeFindings[0].detail).toContain('第 3 个数据行「abc」');
    expect(typeFindings[0].detail).toContain('不等于填错了');
    expect(typeFindings[1].detail).toContain('第 4 个数据行「2026-02-30」');
  });

  it('干净文件没有任何类型问题条目', () => {
    const report = analyzeDataQuality(tableOf('sample_id,height_cm\nA,12.4\nB,15.1\nC,13.0'));

    expect(report.findings).toEqual([]);
    expect(report.columnTypes.kindTotals).toEqual({ number: 1, date: 0, text: 1, unknown: 0 });
  });

  it('标识符列与无法确定的列都不生成类型问题条目', () => {
    const report = analyzeDataQuality(tableOf('student_id,answer,note\n007,a,x\n008,b,y\n009,c,'));

    // 没有类型冲突问题；note 列的空单元格会触发缺失值问题，那是另一类结论。
    expect(report.findings.filter((finding) => finding.kind === 'column-type')).toEqual([]);
    expect(report.columnTypes.columnsChecked).toBe(1);
    expect(report.columnTypes.kindTotals.text).toBe(2);
    expect(report.columnTypes.kindTotals.unknown).toBe(1);
  });

  it('问题条目里的长单元格只截取前面一段', () => {
    const long = 'x'.repeat(80);
    const report = analyzeDataQuality(tableOf(`a\n1\n2\n3\n4\n5\n"${long}"`));
    const finding = report.findings.find((entry) => entry.kind === 'column-type');

    expect(finding?.detail).toContain('…');
    expect(finding?.detail.length).toBeLessThan(600);
    expect(finding?.detail).not.toContain(long);
  });
});
