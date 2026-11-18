// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DataQualityPanel } from './DataQualityPanel';
import { parseCsvText } from '../lib/csv';
import type { CsvTable } from '../types/csv';

function tableOf(text: string, fileName = 'quality.csv'): CsvTable {
  const outcome = parseCsvText(text, { fileName, source: 'file' });
  if (outcome.status !== 'ok') throw new Error(`期望解析成功，实际错误：${outcome.error.message}`);
  return outcome.table;
}

function panelText(): string {
  return screen.getByTestId('quality-panel').textContent ?? '';
}

function findingCount(): number {
  return screen.getByTestId('quality-findings').querySelectorAll('li').length;
}

/** 10 列 × 6 行：第 3 列与第 9 列（0 基 2 与 8）各有一处类型不一致候选，用来验证卡片排序与首屏数量。 */
function tenColumnCsv(): string {
  const columns = Array.from({ length: 10 }, (_, index) => `c${index + 1}`);
  const lines = [columns.join(',')];
  for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
    lines.push(
      columns
        .map((_, columnIndex) => {
          if (columnIndex === 8 && rowIndex === 4) return '待复核';
          if (columnIndex === 2 && rowIndex === 3) return '待复核';
          return String(rowIndex * 10 + columnIndex);
        })
        .join(','),
    );
  }
  return lines.join('\n');
}

/** 卡片上标注的原始列下标，按界面上的实际排列顺序读取。 */
function typeCardColumnIndexes(): number[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="column-type-card"]')].map(
    (node) => Number(node.dataset.columnIndex),
  );
}

/** 12 列 × 5 行，每列恰好 1 个空单元格：制造超过首屏数量、且缺失率达 20% 的问题列表。 */
function manyMissingColumnsCsv(): string {
  const columns = Array.from({ length: 12 }, (_, index) => `c${index + 1}`);
  const rows = [columns.join(',')];
  for (let rowIndex = 0; rowIndex < 5; rowIndex += 1) {
    rows.push(columns.map((_, columnIndex) => (columnIndex % 5 === rowIndex ? '' : `${rowIndex}-${columnIndex}`)).join(','));
  }
  return rows.join('\n');
}

describe('DataQualityPanel 统计展示', () => {
  afterEach(cleanup);

  it('干净数据给出四项统计，并说明没有发现空值或整行重复', () => {
    render(<DataQualityPanel table={tableOf('id,value\nA,1\nB,2\nC,3')} />);

    const stats = screen.getByTestId('quality-stats').textContent ?? '';
    expect(stats).toContain('数据总行数');
    expect(stats).toContain('3 行');
    expect(stats).toContain('0 / 2 列');
    expect(stats).toContain('0 个');
    expect(stats).toContain('0 行');
    expect(panelText()).toContain('没有发现空值或整行重复');
    expect(screen.queryByTestId('quality-blockers')).toBeNull();
    expect(screen.queryByTestId('quality-findings')).toBeNull();
  });

  it('统计数字来自真实计算：空值数、涉及字段数与疑似重复行数各自正确', () => {
    render(<DataQualityPanel table={tableOf('id,value\nA,1\nA,1\nB,')} />);

    const values = [...screen.getByTestId('quality-stats').querySelectorAll('dd')].map((node) => node.textContent);
    expect(values).toEqual(['3 行', '1 / 2 列', '1 个', '2 行']);
    expect(panelText()).toContain('疑似重复记录共 1 组、额外副本 1 行');
    expect(panelText()).toContain('占全部记录的 66.7%');
  });

  it('空白字符单元格单独标记为疑似空白值，不算进空值数量', () => {
    render(<DataQualityPanel table={tableOf('a,b\n"  ",1\n" ",2\n3,4')} />);

    expect(panelText()).toContain('2 个疑似空白值');
    expect(panelText()).toContain('空值占 0.0%');
    const values = [...screen.getByTestId('quality-stats').querySelectorAll('dd')].map((node) => node.textContent);
    expect(values[2]).toBe('0 个');
    // 三行整行内容互不相同，因此疑似重复记录为 0 行。
    expect(values[3]).toBe('0 行');
  });

  it('数值 0 不被当成缺失', () => {
    render(<DataQualityPanel table={tableOf('a,b\n0,0.0\n1,2')} />);

    expect(panelText()).toContain('0 个');
    expect(panelText()).toContain('没有发现空值或整行重复');
  });

  it('只有表头时报告 0 行并给出一条说明，而不是伪造统计结论', () => {
    render(<DataQualityPanel table={tableOf('sample_id,date,group,height_cm')} />);

    const values = [...screen.getByTestId('quality-stats').querySelectorAll('dd')].map((node) => node.textContent);
    expect(values[0]).toBe('0 行');
    expect(values[2]).toBe('0 个');
    expect(panelText()).toContain('文件只有表头，没有数据行可分析');
    expect(panelText()).not.toContain('NaN');
    expect(panelText()).not.toContain('Infinity');
  });

  it('疑似重复记录使用谨慎措辞并给数据行序号，不宣称已删除', () => {
    render(<DataQualityPanel table={tableOf('id,value\nA,1\nA,1\nB,2\nB,2\nB,2')} />);

    const findings = screen.getByTestId('quality-findings').textContent ?? '';
    expect(findings).toContain('疑似重复记录');
    expect(findings).toContain('请人工确认');
    expect(findings).toContain('涉及数据行序号：3、4、5');
    expect(findings).toContain('没有删除或改写任何行');
    expect(findings).toContain('建议确认');
  });

  it('问题列表首屏 5 条，点两次逐批展开到全部', () => {
    render(<DataQualityPanel table={tableOf(manyMissingColumnsCsv())} />);

    expect(findingCount()).toBe(5);
    expect(panelText()).toContain('已列出 12 条建议确认');

    fireEvent.click(screen.getByRole('button', { name: '再显示 5 条问题（还有 7 条未展开）' }));
    expect(findingCount()).toBe(10);

    fireEvent.click(screen.getByRole('button', { name: '再显示 2 条问题（还有 2 条未展开）' }));
    expect(findingCount()).toBe(12);
    expect(screen.queryByRole('button', { name: /再显示/ })).toBeNull();
    expect(panelText()).toContain('已显示全部12条问题');
  });

  it('换成另一份文件时问题列表回到首批，不沿用上一份的展开状态与数字', () => {
    const { rerender } = render(<DataQualityPanel table={tableOf(manyMissingColumnsCsv(), 'many.csv')} />);
    fireEvent.click(screen.getByRole('button', { name: '再显示 5 条问题（还有 7 条未展开）' }));
    expect(findingCount()).toBe(10);

    rerender(<DataQualityPanel table={tableOf('id,value\nA,1\nB,2', 'clean.csv')} />);

    expect(screen.queryByTestId('quality-findings')).toBeNull();
    const values = [...screen.getByTestId('quality-stats').querySelectorAll('dd')].map((node) => node.textContent);
    expect(values).toEqual(['2 行', '0 / 2 列', '0 个', '0 行']);
    expect(panelText()).toContain('没有发现空值或整行重复');
    expect(panelText()).not.toContain('c12');
  });

  it('从「被阻止分析」的文件换到正常文件时，警告与统计不会串联', () => {
    const blocked = tableOf('a\n"foo', 'broken.csv');
    const { rerender } = render(<DataQualityPanel table={blocked} />);
    expect(screen.getByTestId('quality-blockers').querySelectorAll('li').length).toBeGreaterThan(0);

    rerender(<DataQualityPanel table={tableOf('id,value\nA,1\nA,1', 'clean.csv')} />);

    expect(screen.queryByTestId('quality-blockers')).toBeNull();
    expect(screen.getByTestId('quality-stats').textContent).toContain('2 行');
  });
});

describe('DataQualityPanel 准入拦截', () => {  afterEach(cleanup);

  it('MissingQuotes 让字段数保持正确但结构不可信：只给警告，不输出统计卡片', () => {
    const table = tableOf('a\n"foo');
    expect(table.structure.state).toBe('sound');
    expect(table.issueTotals.errors).toBe(1);

    render(<DataQualityPanel table={table} />);

    const blockers = screen.getByTestId('quality-blockers');
    expect(blockers.textContent).toContain('引号未闭合');
    expect(panelText()).toContain('暂时没有进行数据质量分析');
    expect(panelText()).toContain('原始数据表格与解析告警照常可以浏览');
    expect(screen.queryByTestId('quality-stats')).toBeNull();
    expect(screen.queryByTestId('quality-findings')).toBeNull();
  });

  it('结构性缺列时解释原因并给出可追溯的数量', () => {
    render(<DataQualityPanel table={tableOf('a,b,c\n1,2,3\n4,5')} />);

    const blockers = screen.getByTestId('quality-blockers');
    expect(blockers.textContent).toContain('字段数少于表头');
    expect(blockers.textContent).toContain('1 条');
    expect(panelText()).toContain('degraded');
    expect(screen.queryByTestId('quality-stats')).toBeNull();
  });

  it('说明性提示不阻止分析：重名表头的文件照常给出统计卡片', () => {
    render(<DataQualityPanel table={tableOf('name,name\nA,B')} />);

    expect(screen.queryByTestId('quality-blockers')).toBeNull();
    expect(screen.getByTestId('quality-stats').textContent).toContain('1 行');
  });
});

describe('DataQualityPanel 字段类型概览（Day 4 整改）', () => {
  afterEach(cleanup);

  it('首屏只铺 8 张卡片，有类型冲突的字段排在最前且标原始列号', () => {
    render(<DataQualityPanel table={tableOf(tenColumnCsv())} />);

    expect(typeCardColumnIndexes()).toEqual([2, 8, 0, 1, 3, 4, 5, 6]);
    const overview = screen.getByTestId('column-type-overview').textContent ?? '';
    // 第 3 列与第 9 列有冲突，优先展示，原始 1 基列号写在卡片上
    expect(overview).toContain('优先展示这 2 个有类型不一致候选的字段');
    expect(overview).toContain('第 3 列');
    expect(overview).toContain('第 9 列');
    // 排序只影响卡片展示顺序，类型分布与冲突数量仍是原来的统计结果
    expect(overview).toContain('数值 10 列');
    expect(overview).toContain('有 2 个存在类型不一致候选');
    expect(overview).toContain('共 2 处');
  });

  it('点「展开剩余」补齐其余字段，不改动统计数字', () => {
    render(<DataQualityPanel table={tableOf(tenColumnCsv())} />);

    expect(screen.getByRole('button', { name: /展开剩余 2 个字段的类型卡片（还有 2 个未展开）/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /展开剩余 2 个字段的类型卡片/ }));

    expect(typeCardColumnIndexes()).toEqual([2, 8, 0, 1, 3, 4, 5, 6, 7, 9]);
    expect(screen.getByTestId('column-type-overview').textContent).toContain('已显示全部 10 个字段的类型卡片');
  });
});
