// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataPreview } from './DataPreview';
import { parseCsvText } from '../lib/csv';
import type { CsvTable } from '../types/csv';

function tableOf(text: string, fileName = 'demo.csv'): CsvTable {
  const outcome = parseCsvText(text, { fileName, source: 'file' });
  if (outcome.status !== 'ok') throw new Error(`测试数据本该解析成功：${outcome.error.message}`);
  return outcome.table;
}

function csvWithRows(rowCount: number): string {
  const lines = ['sample_id,height_cm'];
  for (let index = 1; index <= rowCount; index += 1) {
    lines.push(`PG-${String(index).padStart(3, '0')},${index / 10}`);
  }
  return lines.join('\n');
}

function bodyRowCount(): number {
  return document.querySelectorAll('tbody tr').length;
}

function issuePanelText(): string {
  const heading = screen.getByRole('heading', { level: 3 });
  return `${heading.textContent ?? ''}|${(heading.parentElement?.textContent ?? '')}`;
}

describe('DataPreview', () => {
  afterEach(cleanup);

  it('按 Papa Parse 的列名渲染表头，并给未命名列表占位标签', () => {
    render(<DataPreview table={tableOf('a,,c\n1,2,3\n')} onReset={vi.fn()} />);

    const headers = [...document.querySelectorAll('thead th')].map((node) => node.textContent);
    expect(headers).toEqual(['#', 'a', '（第 2 列未命名）', 'c']);
    expect(bodyRowCount()).toBe(1);
  });

  it('只有表头时说明识别到字段但没有数据行，不渲染空表格', () => {
    render(<DataPreview table={tableOf('sample_id,date,group,height_cm')} onReset={vi.fn()} />);

    expect(document.querySelector('table')).toBeNull();
    expect(document.body.textContent).toContain('已识别到 4 个字段名，但文件里没有数据行');
  });

  it('区分空值与缺列，并在只有对应情况时才给出图例', () => {
    render(<DataPreview table={tableOf('a,b,c\n1,,3\n4,5\n')} onReset={vi.fn()} />);

    const text = document.body.textContent ?? '';
    expect(text).toContain('空值');
    expect(text).toContain('表示 CSV 源文件里这个单元格本身为空');
    expect(text).toContain('表示该行字段数少于表头');
    expect(document.querySelector('span[title="该行字段数少于表头，没有读到这一列"]')).toBeTruthy();

    // 没有空单元格时不该出现空值图例
    cleanup();
    render(<DataPreview table={tableOf('a,b\n1,2\n')} onReset={vi.fn()} />);
    expect(document.body.textContent).not.toContain('表示 CSV 源文件里这个单元格本身为空');
  });

  it('每批只渲染 50 行，点一次再多 50 行，显示完就换文案', () => {
    render(<DataPreview table={tableOf(csvWithRows(120))} onReset={vi.fn()} />);

    expect(bodyRowCount()).toBe(50);
    expect(document.body.textContent).toContain('共解析 120 条记录，当前显示前 50 条');

    fireEvent.click(screen.getByRole('button', { name: '再显示 50 行（还有 70 行未显示）' }));
    expect(bodyRowCount()).toBe(100);

    fireEvent.click(screen.getByRole('button', { name: '再显示 20 行（还有 20 行未显示）' }));
    expect(bodyRowCount()).toBe(120);
    expect(document.body.textContent).toContain('已显示全部记录');
    expect(screen.queryByRole('button', { name: /再显示/ })).toBeNull();
  });

  it('换成另一个数据集时回到首批行数，不沿用上次展开的结果', () => {
    const first = tableOf(csvWithRows(120), 'first.csv');
    const { rerender } = render(<DataPreview table={first} onReset={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '再显示 50 行（还有 70 行未显示）' }));
    expect(bodyRowCount()).toBe(100);

    rerender(<DataPreview table={tableOf(csvWithRows(120), 'second.csv')} onReset={vi.fn()} />);
    expect(bodyRowCount()).toBe(50);
  });

  it('格式问题给出条数、物理行号区间与 Papa Parse 原文', () => {
    render(<DataPreview table={tableOf('a,b\n1,2\n"x\ny\nz",3,4,5\n')} onReset={vi.fn()} />);

    const text = issuePanelText();
    expect(text).toContain('解析结果里有 1 条需要处理的格式问题、0 条说明性提示');
    expect(text).toContain('[文件第 3–5 行]');
    expect(text).toContain('Papa Parse 原文：Too many fields: expected 2 fields but parsed 4');
  });

  it('引号内换行导致的错位按真实物理行号标注', () => {
    render(<DataPreview table={tableOf('a,b,c\n"x\ny",1,2\n\n3,4\n')} onReset={vi.fn()} />);

    expect(issuePanelText()).toContain('[文件第 5 行]');
  });

  it('只有说明性提示时明确告知没有会读错数据的格式问题', () => {
    render(<DataPreview table={tableOf('name\nA\nB\n')} onReset={vi.fn()} />);

    const text = issuePanelText();
    expect(text).toContain('解析结果里有 0 条需要处理的格式问题、1 条说明性提示');
    expect(text).toContain('没有会让数据读错的格式问题');
    expect(text).toContain("Papa Parse 原文：Unable to auto-detect delimiting character; defaulted to ','");
  });

  it('结构一致的文件只给出绿色结论，不渲染提示列表', () => {
    render(<DataPreview table={tableOf('a,b\n1,2\n')} onReset={vi.fn()} />);

    expect(document.querySelector('ul')).toBeNull();
    expect(document.body.textContent).toContain('Papa Parse 未报告格式错误，行列结构与表头一致');
  });

  it('表头使用不透明背景并与数据层隔离，滚动时不会透出下一行文字', () => {
    render(<DataPreview table={tableOf(csvWithRows(120))} onReset={vi.fn()} />);

    const scroller = screen.getByTestId('table-scroll');
    expect(scroller.className).toContain('isolate');
    const header = document.querySelector('thead th');
    expect(header?.className).toContain('sticky');
    expect(header?.className).toContain('bg-slate-100');
    expect(scroller.className).toContain('overflow-auto');
  });

  it('清除结果按钮把决定权交回上层', () => {
    const onReset = vi.fn();
    render(<DataPreview table={tableOf('a,b\n1,2\n')} onReset={onReset} />);

    fireEvent.click(screen.getByRole('button', { name: '清除结果' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('内置示例数据说明它来自合成文件，且不会随本地文件混用', () => {
    const example = tableOf('sample_id,height_cm\nPG-001,12.4\nPG-002,\n', 'plant-growth.csv');
    render(
      <DataPreview
        table={{ ...example, source: 'example' }}
        onReset={vi.fn()}
      />,
    );

    const text = document.body.textContent ?? '';
    expect(text).toContain('合成植物生长数据');
    expect(text).toContain('内置示例');
    expect(text).not.toContain('本地文件');
  });
});
