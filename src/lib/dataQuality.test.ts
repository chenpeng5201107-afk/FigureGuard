import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ATTENTION_QUALITY_GAP_RATE,
  MAX_ITEMIZED_DUPLICATE_GROUPS,
  MAX_ITEMIZED_QUALITY_FINDINGS,
  analyzeDataQuality,
  evaluateQualityAdmission,
  findDuplicateRecords,
  summarizeMissingValues,
} from './dataQuality';
import { EXAMPLE_CSV_PATH, parseCsvText } from './csv';
import type { CsvTable } from '../types/csv';

const exampleCsvUrl = new URL(`../../public/${EXAMPLE_CSV_PATH}`, import.meta.url);

function tableOf(text: string, fileName = 'quality.csv'): CsvTable {
  const outcome = parseCsvText(text, { fileName, source: 'file' });
  if (outcome.status !== 'ok') {
    throw new Error(`期望解析成功，实际错误：${outcome.error.message}`);
  }
  return outcome.table;
}

function blockerCodes(table: CsvTable): string[] {
  return evaluateQualityAdmission(table).blockers.map((blocker) => blocker.code);
}

describe('准入判断：什么时候可以出正式的数据质量结论', () => {
  it('行列一致、没有解析错误的文件允许分析', () => {
    const table = tableOf('sample_id,group,height_cm\nA,control,12.4\nB,treated,15.1\n');

    const admission = evaluateQualityAdmission(table);

    expect(table.structure.state).toBe('sound');
    expect(table.issueTotals.errors).toBe(0);
    expect(admission.allowed).toBe(true);
    expect(admission.blockers).toEqual([]);
    expect(admission.structureState).toBe('sound');
    expect(admission.parseErrorCount).toBe(0);
  });

  it('字段数不匹配导致结构降级时阻止分析，并带上可追溯的原因', () => {
    const table = tableOf('a,b,c\n1,2,3\n4,5\n');

    const admission = evaluateQualityAdmission(table);

    expect(admission.allowed).toBe(false);
    expect(admission.structureState).toBe('degraded');
    expect(admission.parseErrorCount).toBe(1);
    expect(blockerCodes(table)).toEqual(['structure-degraded', 'parse-errors']);
    const degraded = admission.blockers.find((blocker) => blocker.code === 'structure-degraded');
    expect(degraded?.evidence.join('')).toContain('字段数少于表头');
  });

  it('只有 MissingQuotes、字段数完全匹配的文件也必须阻止分析（修复前 structure.state 仍是 sound 会漏放）', () => {
    const table = tableOf('a\n"foo');

    // 这正是设计缺口：错位读进来的内容没有造成字段数不匹配。
    expect(table.structure.state).toBe('sound');
    expect(table.structure.rowsWithMissingFields).toBe(0);
    expect(table.issueTotals.errors).toBe(1);
    expect(blockerCodes(table)).toEqual(['parse-errors']);

    const admission = evaluateQualityAdmission(table);
    expect(admission.allowed).toBe(false);
    expect(admission.blockers[0].message).toContain('1 条');
    expect(admission.blockers[0].evidence.join('')).toContain('引号未闭合');
  });

  it('说明性提示不会阻止分析：单列文件与重名表头照常出结论', () => {
    const singleColumn = tableOf('name\nA\nB\n');
    const duplicatedHeader = tableOf('name,name\nA,B\n');

    expect(singleColumn.issueTotals.errors).toBe(0);
    expect(singleColumn.issueTotals.notices).toBeGreaterThan(0);
    expect(evaluateQualityAdmission(singleColumn).allowed).toBe(true);
    expect(evaluateQualityAdmission(duplicatedHeader).allowed).toBe(true);
  });

  it('混用换行符按 error 级处理，因此同样阻止正式分析', () => {
    const table = tableOf('a,b\n1,2\r\n3,4\r\n');

    expect(table.structure.mixedLineEndings).toBe(true);
    expect(evaluateQualityAdmission(table).allowed).toBe(false);
  });

  it('解析错误总数按全量真实值判断，不受明细上限影响', () => {
    const lines = ['a,b,c'];
    for (let index = 0; index < 3000; index += 1) lines.push(`${index},1`);
    const table = tableOf(lines.join('\n'));

    expect(table.issues.length).toBeLessThan(3000);
    expect(evaluateQualityAdmission(table).parseErrorCount).toBe(3000);
  });
});

describe('缺失值统计', () => {
  it('正常且没有缺失的数据：所有计数为 0，比率为可计算的 0 而不是 NaN', () => {
    const summary = summarizeMissingValues(tableOf('id,score\nA,12.4\nB,15.1\nC,9.8'));

    expect(summary.recordCount).toBe(3);
    expect(summary.columnCount).toBe(2);
    expect(summary.cellCount).toBe(6);
    expect(summary.totalEmptyCells).toBe(0);
    expect(summary.totalBlankCells).toBe(0);
    expect(summary.totalStructuralGaps).toBe(0);
    expect(summary.columnsWithEmpty).toBe(0);
    expect(summary.columnsWithQualityGap).toBe(0);
    expect(summary.overallEmptyRate).toBe(0);
    expect(summary.focusColumns).toEqual([]);
    expect(summary.columns.every((column) => Number.isFinite(column.emptyRate))).toBe(true);
    expect(summary.columns.map((column) => column.presentCount)).toEqual([3, 3]);
  });

  it('多个空单元格：逐列计数、逐列缺失率与全表缺失数一致', () => {
    const summary = summarizeMissingValues(tableOf('a,b,c\n1,,3\n,5,\n7,8,'));

    expect(summary.recordCount).toBe(3);
    expect(summary.totalEmptyCells).toBe(4);
    expect(summary.columnsWithEmpty).toBe(3);
    expect(summary.overallEmptyRate).toBeCloseTo(4 / 9, 10);

    const byName = new Map(summary.columns.map((column) => [column.column, column]));
    expect(byName.get('a')?.emptyCount).toBe(1);
    expect(byName.get('b')?.emptyCount).toBe(1);
    expect(byName.get('c')?.emptyCount).toBe(2);
    expect(byName.get('c')?.emptyRate).toBeCloseTo(2 / 3, 10);
    expect(byName.get('c')?.presentCount).toBe(1);

    // 需要关注的字段按缺失率降序：c(2/3) > a(1/3) > b(1/3，同率时按列序)
    expect(summary.focusColumns.map((column) => column.column)).toEqual(['c', 'a', 'b']);
  });

  it('数值 0 与文本「0」都不是缺失值', () => {
    const summary = summarizeMissingValues(tableOf('a,b,c,d\n0,0.0,-0,0\n1,2,3,4'));

    expect(summary.totalEmptyCells).toBe(0);
    expect(summary.columnsWithEmpty).toBe(0);
    expect(summary.columns.map((column) => column.presentCount)).toEqual([2, 2, 2, 2]);
  });

  it('只有空白字符的单元格单独标记为疑似空白值，不并入缺失数量', () => {
    const summary = summarizeMissingValues(tableOf('a,b\n"  ",1\n" ",2\n3,4'));

    const columnA = summary.columns[0];
    expect(columnA.blankCount).toBe(2);
    expect(columnA.emptyCount).toBe(0);
    expect(columnA.presentCount).toBe(1);
    expect(columnA.blankRate).toBeCloseTo(2 / 3, 10);
    expect(summary.totalBlankCells).toBe(2);
    expect(summary.totalEmptyCells).toBe(0);
    expect(summary.columnsWithEmpty).toBe(0);
    expect(summary.columnsWithQualityGap).toBe(1);
    expect(summary.focusColumns.map((column) => column.column)).toEqual(['a']);
  });

  it('结构性缺列与正常空单元格分开计数，互不重复统计', () => {
    const table = tableOf('a,b,c\n1,,3\n4,5');
    const summary = summarizeMissingValues(table);

    expect(table.rows[1][2]).toBeNull();
    expect(summary.totalEmptyCells).toBe(1);
    expect(summary.totalStructuralGaps).toBe(1);
    expect(summary.columns[1].emptyCount).toBe(1);
    expect(summary.columns[2].structuralGapCount).toBe(1);
    expect(summary.columns[2].emptyCount).toBe(0);
    expect(summary.columns.reduce((sum, column) => sum + column.emptyCount + column.blankCount + column.structuralGapCount + column.presentCount, 0))
      .toBe(summary.cellCount);
  });

  it('只有表头没有记录时不出现除零、NaN 或 Infinity', () => {
    const summary = summarizeMissingValues(tableOf('sample_id,date,group,height_cm'));

    expect(summary.recordCount).toBe(0);
    expect(summary.columnCount).toBe(4);
    expect(summary.cellCount).toBe(0);
    expect(summary.totalEmptyCells).toBe(0);
    expect(summary.overallEmptyRate).toBe(0);
    expect(Number.isFinite(summary.overallEmptyRate)).toBe(true);
    expect(Number.isSafeInteger(summary.overallEmptyRate)).toBe(true);
    expect(summary.columns).toHaveLength(4);
    expect(summary.columns.every((column) => Number.isFinite(column.emptyRate) && Number.isFinite(column.qualityGapRate))).toBe(
      true,
    );
    expect(summary.columns.every((column) => column.emptyRate === 0 && column.presentCount === 0)).toBe(true);
    expect(evaluateQualityAdmission(tableOf('sample_id,date,group,height_cm')).allowed).toBe(true);
  });

  it('空白行在解析阶段就被 skipEmptyLines: greedy 跳过，缺失统计只看真正保留的记录', () => {
    // 与 Day 2 的解析口径保持一致：整行字段全为空白（如 `  ,  `）不成为记录，因此不参与缺失率分母。
    const table = tableOf('a,b\n,1\n\n  ,  \n,2');
    const summary = summarizeMissingValues(table);

    expect(table.recordCount).toBe(2);
    expect(summary.recordCount).toBe(2);
    expect(summary.columns[0].emptyCount).toBe(2);
    expect(summary.columns[1].emptyCount).toBe(0);
    expect(summary.totalEmptyCells).toBe(2);
    expect(summary.overallEmptyRate).toBeCloseTo(2 / 4, 10);
  });

  it('空表头列在报告里有可读标签，列下标仍然指向真实位置', () => {
    const summary = summarizeMissingValues(tableOf('a,,c\n1,2,\n3,4,'));

    expect(summary.columns[1].label).toBe('（第 2 列未命名）');
    expect(summary.columns[2].label).toBe('c');
    expect(summary.columns[2].emptyCount).toBe(2);
    expect(summary.columns[2].emptyRate).toBe(1);
  });

  it('内置示例数据：12 行 4 列，height_cm 有 2 个空单元格且没有整行重复', () => {
    const table = tableOf(readFileSync(exampleCsvUrl, 'utf8'), 'plant-growth.csv');
    const report = analyzeDataQuality(table);

    expect(evaluateQualityAdmission(table).allowed).toBe(true);
    expect(report.recordCount).toBe(12);
    expect(report.columnCount).toBe(4);
    expect(report.missing.totalEmptyCells).toBe(2);
    expect(report.missing.columnsWithEmpty).toBe(1);
    expect(report.missing.focusColumns.map((column) => column.column)).toEqual(['height_cm']);
    expect(report.missing.overallEmptyRate).toBeCloseTo(2 / 48, 10);
    expect(report.duplicates.duplicateGroupCount).toBe(0);
    expect(report.duplicates.recordsInDuplicateGroups).toBe(0);
    expect(report.findings.some((finding) => finding.kind === 'column-quality')).toBe(true);
  });
});

describe('完全重复记录检测', () => {
  it('多组完全重复：区分重复组数、涉及记录数与额外副本数', () => {
    const summary = findDuplicateRecords(tableOf('id,value\nA,1\nA,1\nB,2\nB,2\nB,2\nC,3'));

    expect(summary.recordCount).toBe(6);
    expect(summary.duplicateGroupCount).toBe(2);
    expect(summary.recordsInDuplicateGroups).toBe(5);
    expect(summary.extraCopyCount).toBe(3);
    expect(summary.duplicateRate).toBeCloseTo(5 / 6, 10);
    expect(summary.groupsTruncated).toBe(false);
    expect(summary.groups).toHaveLength(2);
    expect(summary.groups[0]).toEqual({ firstRowIndex: 0, occurrenceCount: 2, rowIndexes: [0, 1] });
    expect(summary.groups[1]).toEqual({ firstRowIndex: 2, occurrenceCount: 3, rowIndexes: [2, 3, 4] });
  });

  it('两行只差一个字段时不算完全重复', () => {
    const summary = findDuplicateRecords(tableOf('id,value,note\nA,1,first day\nA,1,second day'));

    expect(summary.duplicateGroupCount).toBe(0);
    expect(summary.recordsInDuplicateGroups).toBe(0);
    expect(summary.extraCopyCount).toBe(0);
    expect(summary.groups).toEqual([]);
  });

  it('测量值相同但 sample_id 不同不算重复；反过来说空单元格也参与比较', () => {
    const distinctIds = findDuplicateRecords(tableOf('sample_id,height_cm\nPG-001,12.4\nPG-002,12.4'));
    const emptyCells = findDuplicateRecords(tableOf('a,b\n1,\n1,'));

    expect(distinctIds.duplicateGroupCount).toBe(0);
    expect(emptyCells.duplicateGroupCount).toBe(1);
    expect(emptyCells.groups[0].rowIndexes).toEqual([0, 1]);
  });

  it('缺列、引号内换行与空白差异都不会被误判为相同行', () => {
    const summary = findDuplicateRecords(tableOf('a,b\n1,2\n1,2\n"2,3",4\n2,3,4\n1, "2"'));

    // 第 3 行（0 基 2）与第 1、2 行整行相同；引号内的逗号与空格让其余行彼此不同。
    expect(summary.duplicateGroupCount).toBe(1);
    expect(summary.groups[0].rowIndexes).toEqual([0, 1]);
  });

  it('null（缺列）与空字符串（空单元格）是不同的单元格，不会凑成同一组', () => {
    const table = tableOf('a,b,c\n1,2\n1,2,');
    const summary = findDuplicateRecords(table);

    expect(table.rows[0][2]).toBeNull();
    expect(table.rows[1][2]).toBe('');
    expect(summary.duplicateGroupCount).toBe(0);
  });

  it('只有一行数据时没有重复，记录数为 0 时比率取 0 而不是 NaN', () => {
    expect(findDuplicateRecords(tableOf('a,b\n1,2')).duplicateGroupCount).toBe(0);

    const empty = findDuplicateRecords(tableOf('a,b'));
    expect(empty.recordCount).toBe(0);
    expect(empty.duplicateRate).toBe(0);
    expect(Number.isFinite(empty.duplicateRate)).toBe(true);
    expect(empty.groups).toEqual([]);
  });

  it('12,000 行数据的重复检查：计数全量准确、明细有上限、不退化成两两比较', () => {
    const lines = ['sample_id,height_cm'];
    for (let pair = 0; pair < 6000; pair += 1) {
      const row = `S${pair},${pair / 10}`;
      lines.push(row, row);
    }
    const table = tableOf(lines.join('\n'));

    const started = Date.now();
    const summary = findDuplicateRecords(table);
    const elapsed = Date.now() - started;

    expect(table.recordCount).toBe(12000);
    expect(summary.duplicateGroupCount).toBe(6000);
    expect(summary.recordsInDuplicateGroups).toBe(12000);
    expect(summary.extraCopyCount).toBe(6000);
    expect(summary.duplicateRate).toBe(1);
    expect(summary.groups).toHaveLength(MAX_ITEMIZED_DUPLICATE_GROUPS);
    expect(summary.groupsTruncated).toBe(true);
    expect(summary.groups[0].rowIndexes).toEqual([0, 1]);
    expect(summary.groups[MAX_ITEMIZED_DUPLICATE_GROUPS - 1].firstRowIndex).toBe(398);
    expect(elapsed).toBeLessThan(8000);
  });

  it('12,000 行全部互不相同时的开销上限（没有重复组）', () => {
    const lines = ['sample_id,height_cm'];
    for (let index = 0; index < 12000; index += 1) lines.push(`S${index},${index / 10}`);

    const summary = findDuplicateRecords(tableOf(lines.join('\n')));

    expect(summary.duplicateGroupCount).toBe(0);
    expect(summary.groups).toEqual([]);
    expect(summary.groupsTruncated).toBe(false);
  });
});

describe('问题列表（全部来自真实统计）', () => {
  it('干净数据没有任何问题', () => {
    const report = analyzeDataQuality(tableOf('id,value\nA,1\nB,2'));

    expect(report.findings).toEqual([]);
    expect(report.itemizedFindingTotals).toEqual({ attention: 0, info: 0 });
    expect(report.findingsTruncated).toBe(false);
  });

  it('只有表头时给出一条说明，而不是伪造统计结论', () => {
    const report = analyzeDataQuality(tableOf('id,value'));

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].kind).toBe('no-records');
    expect(report.findings[0].severity).toBe('info');
    expect(report.findings[0].detail).toContain('0 条记录');
    expect(report.itemizedFindingTotals.info).toBe(1);
  });

  it('缺失率超过阈值的列标为建议确认，低于阈值的只作说明', () => {
    const heavy = analyzeDataQuality(tableOf('a,b\n,1\n,2'));

    const lightLines = ['a,b'];
    for (let index = 0; index < 20; index += 1) lightLines.push(index === 0 ? ',1' : `${index},1`);
    const light = analyzeDataQuality(tableOf(lightLines.join('\n')));

    const heavyColumn = heavy.findings.find((finding) => finding.kind === 'column-quality');
    const lightColumns = light.findings.filter((finding) => finding.kind === 'column-quality');

    // 20 行里只有 1 个空单元格：1 / 20 = 5%，低于 10% 阈值，只说明不警告。
    expect(heavyColumn?.severity).toBe('attention');
    expect(heavyColumn?.title).toContain('「a」');
    expect(heavyColumn?.detail).toContain('空单元格');
    expect(lightColumns).toHaveLength(1);
    expect(lightColumns[0].severity).toBe('info');
    expect(ATTENTION_QUALITY_GAP_RATE).toBe(0.1);
  });

  it('疑似重复记录用谨慎措辞，并给原始数据行索引', () => {
    const report = analyzeDataQuality(tableOf('id,value\nA,1\nA,1\nB,2\nB,2'));
    const duplicate = report.findings.find((finding) => finding.kind === 'duplicate-rows');

    expect(duplicate?.severity).toBe('attention');
    expect(duplicate?.title).toContain('疑似重复记录');
    expect(duplicate?.title).toContain('2 行内容完全相同');
    expect(duplicate?.detail).toContain('数据行序号：1、2');
    expect(duplicate?.detail).toContain('没有删除或改写任何行');
  });

  it('重复组超过明细上限时，总数仍然全量准确并明确说明折叠', () => {
    const lines = ['a,b'];
    for (let pair = 0; pair < MAX_ITEMIZED_DUPLICATE_GROUPS + 5; pair += 1) {
      const row = `${pair},1`;
      lines.push(row, row);
    }
    const report = analyzeDataQuality(tableOf(lines.join('\n')));

    expect(report.duplicates.duplicateGroupCount).toBe(MAX_ITEMIZED_DUPLICATE_GROUPS + 5);
    expect(report.duplicates.groups).toHaveLength(MAX_ITEMIZED_DUPLICATE_GROUPS);
    expect(report.findings.some((finding) => finding.id === 'duplicate-truncated')).toBe(true);
    expect(report.findings).toHaveLength(MAX_ITEMIZED_QUALITY_FINDINGS);
    expect(report.findingsTruncated).toBe(true);
    // itemizedFindingTotals 数的是「已生成的问题条目」；真实重复组数只在 duplicates.duplicateGroupCount 里，
    // 超出重复组明细上限的那 5 组由折叠说明代表，不会被静默丢掉。
    expect(report.itemizedFindingTotals.attention).toBe(MAX_ITEMIZED_QUALITY_FINDINGS - 1);
    expect(report.itemizedFindingTotals.info).toBe(1);
    expect(
      report.findings.filter((finding) => finding.id === 'duplicate-truncated')[0].title,
    ).toContain('5 组');
  });

  it('分析前后 CsvTable 的原始 rows 完全一致（不被排序、填充或删除）', () => {
    const table = tableOf('id,value,note\nA,1,\nA,1,\nB,,x\n" q\nr ",2,3\nC,3');
    const before = JSON.stringify(table.rows);
    const rowReferences = table.rows.map((row) => row);
    const cellReferences = table.rows.map((row) => [...row]);

    analyzeDataQuality(table);
    evaluateQualityAdmission(table);

    expect(JSON.stringify(table.rows)).toBe(before);
    expect(table.rows).toHaveLength(rowReferences.length);
    table.rows.forEach((row, index) => {
      expect(row).toBe(rowReferences[index]);
      expect([...row]).toEqual(cellReferences[index]);
    });
  });

  it('同一份数据重复分析结果一致，不携带上一次的统计', () => {
    const table = tableOf('id,value\nA,1\nA,1\nB,');

    expect(analyzeDataQuality(table)).toEqual(analyzeDataQuality(table));
  });

  it('报告里的每个数字都能追溯到行列：缺失数 + 有内容数 = 单元格总数', () => {
    const report = analyzeDataQuality(tableOf('a,b,c\n1,,3\n,2\n4,5,6'));

    expect(report.missing.cellCount).toBe(report.missing.recordCount * report.missing.columnCount);
    expect(
      report.missing.totalEmptyCells + report.missing.totalBlankCells + report.missing.totalStructuralGaps,
    ).toBe(3);
    expect(report.missing.columns.reduce((sum, column) => sum + column.presentCount, 0)).toBe(
      report.missing.cellCount - 3,
    );
    expect(report.fileName).toBe('quality.csv');
  });
});
