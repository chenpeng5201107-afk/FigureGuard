// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataPreview } from './DataPreview';
import { MAX_ITEMIZED_ISSUES, parseCsvText } from '../lib/csv';
import { formatCount } from '../lib/format';
import type { CsvTable } from '../types/csv';

const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalScrollTo = Element.prototype.scrollTo;
const scrollToMock = vi.fn();
const scrollIntoViewMock = vi.fn();

/** jsdom 没有 matchMedia：这里统一补一个，测试用 setReduceMotion 切换「减少动态效果」。 */
function setReduceMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && matches,
    media: query,
  }));
}

beforeEach(() => {
  scrollToMock.mockClear();
  scrollIntoViewMock.mockClear();
  Element.prototype.scrollIntoView = scrollIntoViewMock as unknown as typeof Element.prototype.scrollIntoView;
  Element.prototype.scrollTo = scrollToMock as unknown as typeof Element.prototype.scrollTo;
  setReduceMotion(false);
});

afterEach(() => {
  cleanup();
  Element.prototype.scrollIntoView = originalScrollIntoView;
  Element.prototype.scrollTo = originalScrollTo;
  removeTailwindBackgroundRules();
  vi.unstubAllGlobals();
});

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

/**
 * rowCount 行、只有 conflictRowIndexes 指定数据行在 height_cm 里填文本的 CSV。
 * `sample_id` 命中标识符线索不参与冲突比对，所以候选值只会出现这些远处行上。
 */
function csvWithConflictRows(rowCount: number, conflictRowIndexes: number[]): string {
  const conflicts = new Set(conflictRowIndexes);
  const lines = ['sample_id,height_cm'];
  for (let index = 0; index < rowCount; index += 1) {
    const value = conflicts.has(index) ? '待复核' : String((index % 97) + 1);
    lines.push(`PG-${String(index + 1).padStart(6, '0')},${value}`);
  }
  return lines.join('\n');
}

function bodyRowCount(): number {
  return document.querySelectorAll('tbody tr').length;
}

/** 当前页第一行的序号单元格（分页后仍能看出编号没有重新从 1 开始）。 */
function firstRowNumber(): string | undefined {
  return document.querySelector<HTMLTableRowElement>('tbody tr')?.cells[0].textContent;
}

function buttonDisabled(name: string): boolean {
  return (screen.getByRole('button', { name }) as HTMLButtonElement).disabled;
}

/**
 * Tailwind 实际生成的背景工具类，规则先后顺序与构建产物一致：
 * odd:/even: 带伪类，特异性比普通 bg-* 高；同族的 bg-slate-100 又写在 bg-amber-100 之后。
 * 只有把这些规则挂进文档，jsdom 的 getComputedStyle 才能复现「高亮被底色盖掉」这类覆盖问题。
 */
const TAILWIND_BG_RULES_ID = 'tailwind-bg-rules';
const TAILWIND_BG_RULES = `
.bg-amber-50{background-color:#fefce8}
.bg-amber-100{background-color:#fef3c7}
.bg-slate-50{background-color:#f8fafc}
.bg-slate-100{background-color:#f1f5f9}
.bg-white{background-color:#ffffff}
.odd\\:bg-white:nth-child(odd){background-color:#ffffff}
.even\\:bg-slate-50\\/60:nth-child(2n){background-color:rgba(248, 250, 252, 0.6)}
`;
const AMBER_50 = 'rgb(254, 252, 232)';
const AMBER_100 = 'rgb(254, 243, 199)';
const ZEBRA_ODD = 'rgb(255, 255, 255)';
const ZEBRA_EVEN = 'rgba(248, 250, 252, 0.6)';

function mountTailwindBackgroundRules() {
  removeTailwindBackgroundRules();
  const style = document.createElement('style');
  style.id = TAILWIND_BG_RULES_ID;
  style.textContent = TAILWIND_BG_RULES;
  document.head.append(style);
}

function removeTailwindBackgroundRules() {
  document.getElementById(TAILWIND_BG_RULES_ID)?.remove();
}

/** 元素上声明的全部底色类（含 odd:/even: 变体）：同一元素同时挂着高亮色和奇偶色就意味着互相覆盖。 */
function backgroundClasses(node: Element | null | undefined): string[] {
  return [...(node?.classList ?? [])].filter((token) => token.includes('bg-'));
}

/** tbody 里第 index 条数据行对应的奇偶底色：第 1 行是第 1 个子元素，属于 odd。 */
function zebraColorForRowIndex(index: number): string {
  return (index + 1) % 2 === 1 ? ZEBRA_ODD : ZEBRA_EVEN;
}

function rowByIndex(index: number): HTMLTableRowElement | null {
  return document.querySelector<HTMLTableRowElement>(`tbody tr[data-row-anchor="${index}"]`);
}

function headerByColumn(index: number): Element | null {
  return document.querySelector(`thead th[data-column-anchor="${index}"]`);
}

function focusedRowCount(): number {
  return document.querySelectorAll('tbody tr.bg-amber-50').length;
}

/** 读取真实级联后的背景色：类名里挂着什么不重要，浏览器最终算出哪个色值才重要。 */
function backgroundOf(node: Element | null | undefined, label: string): string {
  if (!node) throw new Error(`测试里本该存在${label}`);
  return getComputedStyle(node).backgroundColor;
}

function scrollToBehavior(): unknown {
  const last = scrollToMock.mock.calls.at(-1)?.[0] as ScrollToOptions | undefined;
  return last?.behavior;
}

function issueListItemCount(): number {
  return document.querySelectorAll('[data-testid="issue-list"] li').length;
}

/** 每一行都少一个字段的错误密集文件，用来验证明细上限与全量计数。 */
function raggedRows(rowCount: number): string {
  const lines = ['a,b,c'];
  for (let index = 0; index < rowCount; index += 1) lines.push(`${index},1`);
  return lines.join('\n');
}

function issuePanelText(): string {
  const headings = screen.getAllByRole('heading', { level: 3 });
  const heading = headings[0];
  return `${heading.textContent ?? ''}|${(heading.parentElement?.textContent ?? '')}`;
}

/** 8 列 × 6 行、每列各一个空单元格：制造超过首屏 5 条的问题列表，用来验切换文件后的重置。 */
function manyMissingColumnsCsv(): string {
  const columns = Array.from({ length: 8 }, (_, index) => `c${index + 1}`);
  const rows = [columns.join(',')];
  for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
    rows.push(
      columns.map((_, columnIndex) => (columnIndex % 6 === rowIndex ? '' : `${rowIndex}-${columnIndex}`)).join(','),
    );
  }
  return rows.join('\n');
}

describe('DataPreview', () => {

  it('按 Papa Parse 的列名渲染表头，并给未命名列表占位标签', () => {
    render(<DataPreview table={tableOf('a,,c\n1,2,3\n')} onReset={vi.fn()} />);

    const headers = [...document.querySelectorAll('thead th')].map((node) => node.textContent);
    expect(headers).toEqual(['#', 'a', '（第 2 列未命名）', 'c']);
    expect(bodyRowCount()).toBe(1);
  });

  it('__parsed_extra 作为真实表头出现在表头行与数据里', () => {
    render(<DataPreview table={tableOf('__parsed_extra,x\nhello,world\n')} onReset={vi.fn()} />);

    const headers = [...document.querySelectorAll('thead th')].map((node) => node.textContent);
    expect(headers).toEqual(['#', '__parsed_extra', 'x']);
    expect(document.querySelector('tbody tr')?.textContent).toContain('hello');
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

  it('每页只渲染 50 行，翻页后行号继续原始数据行而不是重新从 1 开始', () => {
    render(<DataPreview table={tableOf(csvWithRows(120))} onReset={vi.fn()} />);

    expect(bodyRowCount()).toBe(50);
    expect(firstRowNumber()).toBe('1');
    expect(screen.getByTestId('page-summary').textContent).toContain('共解析 120 条记录，第 1 / 3 页');
    expect(screen.getByTestId('page-summary').textContent).toContain('本页显示第 1–50 条');

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(bodyRowCount()).toBe(50);
    expect(firstRowNumber()).toBe('51');
    expect(document.querySelector('tbody tr[data-row-anchor="50"]')).toBeTruthy();
    expect(document.querySelector('tbody tr[data-row-anchor="0"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(firstRowNumber()).toBe('101');

    // 最后一页只有 20 行，「下一页」禁用而不是渲染出空白行。
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(bodyRowCount()).toBe(20);
    expect(screen.getByTestId('page-summary').textContent).toContain('本页显示第 101–120 条');
    expect(buttonDisabled('下一页')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '返回第一页' }));
    expect(firstRowNumber()).toBe('1');
    expect(buttonDisabled('上一页')).toBe(true);
    expect(buttonDisabled('返回第一页')).toBe(true);
  });

  it('换到另一个数据集时回到第一页，不沿用上一页码', () => {
    const first = tableOf(csvWithRows(120), 'first.csv');
    const { rerender } = render(<DataPreview table={first} onReset={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(firstRowNumber()).toBe('51');

    rerender(<DataPreview table={tableOf(csvWithRows(120), 'second.csv')} onReset={vi.fn()} />);
    expect(firstRowNumber()).toBe('1');
    expect(bodyRowCount()).toBe(50);
    expect(screen.getByTestId('page-summary').textContent).toContain('第 1 / 3 页');
  });

  it('格式问题给出条数、物理行号区间与 Papa Parse 原文', () => {
    render(<DataPreview table={tableOf('a,b\n1,2\n"x\ny\nz",3,4,5\n')} onReset={vi.fn()} />);

    const text = issuePanelText();
    expect(text).toContain('解析结果里有 1 条需要处理的格式问题、0 条说明性提示');
    expect(text).toContain('[文件第 3–5 行]');
    // 英文原文改放进默认折叠的 details，标签与原文都还在，只是不再直接铺开后。
    expect(text).toContain('Papa Parse 原文');
    expect(text).toContain('Too many fields: expected 2 fields but parsed 4');
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
    expect(text).toContain('Papa Parse 原文');
    expect(text).toContain("Unable to auto-detect delimiting character; defaulted to ','");
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

  it('错误明细首批只铺 20 条，点一次再多 20 条', () => {
    render(<DataPreview table={tableOf(raggedRows(60))} onReset={vi.fn()} />);

    expect(issueListItemCount()).toBe(20);
    expect(document.body.textContent).toContain('还有 40 条已列明细未展开');

    fireEvent.click(screen.getByRole('button', { name: /再显示 20 条错误明细/ }));
    expect(issueListItemCount()).toBe(40);

    fireEvent.click(screen.getByRole('button', { name: /再显示 20 条错误明细/ }));
    expect(issueListItemCount()).toBe(60);
    expect(screen.queryByRole('button', { name: /再显示 20 条错误明细/ })).toBeNull();
  });

  it('几千条格式问题也只渲染明细上限，总条数与类型分布仍是全量真实值', () => {
    render(<DataPreview table={tableOf(raggedRows(3000))} onReset={vi.fn()} />);

    // 上限之外不再逐条进 DOM：整页 li 数量与错误条数无关
    expect(document.querySelectorAll('li').length).toBeLessThan(40);
    expect(issueListItemCount()).toBe(20);

    const text = issuePanelText();
    expect(text).toContain('解析结果里有 3,000 条需要处理的格式问题、0 条说明性提示');
    expect(text).toContain(`字段数少于表头（TooFewFields）：3,000 条，已列出 ${MAX_ITEMIZED_ISSUES} 条`);
    expect(text).toContain(
      `另有 ${formatCount(3000 - MAX_ITEMIZED_ISSUES)} 条同类格式问题没有逐条列出`,
    );
    expect(text).toContain('数据结构不完整');
    expect(document.querySelector('tbody')?.children.length).toBe(50);
  });

  it('Papa Parse 英文原文放进默认折叠的 details', () => {
    render(<DataPreview table={tableOf(raggedRows(2))} onReset={vi.fn()} />);

    const collapsed = [...document.querySelectorAll('details')];
    expect(collapsed.length).toBeGreaterThan(0);
    expect(collapsed.every((node) => node.open === false)).toBe(true);
    expect(collapsed[0].querySelector('summary')?.textContent).toContain('Papa Parse 原文');
    expect(collapsed[0].textContent).toContain('Too few fields: expected 3 fields but parsed 2');
  });

  it('结构不完整时给出可追溯的数量，而不是只说有问题', () => {
    render(<DataPreview table={tableOf('a,b\n1,2,3,4\n5\n')} onReset={vi.fn()} />);

    const text = issuePanelText();
    expect(text).toContain('数据结构不完整');
    expect(text).toContain('有 1 行字段数少于表头');
    expect(text).toContain('有 1 行字段数多于表头，共 2 个值没有列名接收、没有进入表格。');
  });

  it('结构与表头一致的文件不出现结构告警', () => {
    render(<DataPreview table={tableOf('a,b\n1,2\n')} onReset={vi.fn()} />);

    expect(document.body.textContent).not.toContain('数据结构不完整');
    expect(document.querySelector('ul')).toBeNull();
  });

  it('换到另一份文件时错误明细回到首批 20 条', () => {
    const { rerender } = render(<DataPreview table={tableOf(raggedRows(60))} onReset={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /再显示 20 条错误明细/ }));
    expect(issueListItemCount()).toBe(40);

    rerender(<DataPreview table={tableOf(raggedRows(60), 'second.csv')} onReset={vi.fn()} />);
    expect(issueListItemCount()).toBe(20);
  });

  it('表格横向放不下时才提示左右滑动查看更多字段', () => {
    render(<DataPreview table={tableOf(csvWithRows(3))} onReset={vi.fn()} />);
    expect(screen.queryByTestId('swipe-hint')).toBeNull();
    cleanup();

    // jsdom 不做布局：把元素改成「内容 1200px、可视 300px」来制造真实的横向溢出条件
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 1200 });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 });
    try {
      render(<DataPreview table={tableOf(csvWithRows(3))} onReset={vi.fn()} />);
      const hint = screen.getByTestId('swipe-hint');
      expect(hint.textContent).toContain('左右滑动可查看更多字段');
      expect(hint.textContent).toContain('2 列');
    } finally {
      const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;
      delete prototype.scrollWidth;
      delete prototype.clientWidth;
    }
  });

  it('干净文件在预览区里同时给出数据质量概览，数字全部来自真实统计', () => {
    render(<DataPreview table={tableOf('id,value\nA,1\nA,1\nB,')} onReset={vi.fn()} />);

    const panel = screen.getByTestId('quality-panel');
    expect(panel.textContent).toContain('数据质量概览');
    expect(panel.textContent).toContain('疑似重复记录');
    const values = [...screen.getByTestId('quality-stats').querySelectorAll('dd')].map((node) => node.textContent);
    expect(values).toEqual(['3 行', '1 / 2 列', '1 个', '2 行']);
    // 质量结论与原始表格分区共存：表格里仍然逐格显示源数据。
    expect(bodyRowCount()).toBe(3);
    expect(document.querySelector('tbody')?.textContent).toContain('A');
  });

  it('解析错误阻止质量分析时，原始表格与解析告警照常可以浏览', () => {
    render(<DataPreview table={tableOf('a\n"foo')} onReset={vi.fn()} />);

    expect(screen.getByTestId('quality-blockers')).toBeTruthy();
    expect(screen.getByTestId('quality-panel').textContent).toContain('暂时没有进行数据质量分析');
    expect(screen.queryByTestId('quality-stats')).toBeNull();
    expect(document.querySelector('table')).toBeTruthy();
    // 1 条引号未闭合（error）+ 1 条无法自动判断分隔符（notice），单列文件本来就两条都有。
    expect(issueListItemCount()).toBe(2);
    expect(issuePanelText()).toContain('解析结果里有 1 条需要处理的格式问题、1 条说明性提示');
    expect(issuePanelText()).toContain('引号未闭合');
  });

  it('换到另一份文件时质量概览重新计算，问题列表不沿用上一份的展开状态', () => {
    const { rerender } = render(
      <DataPreview table={tableOf(manyMissingColumnsCsv(), 'many.csv')} onReset={vi.fn()} />,
    );

    expect(screen.getByTestId('quality-findings').querySelectorAll('li')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: '再显示 3 条问题（还有 3 条未展开）' }));
    expect(screen.getByTestId('quality-findings').querySelectorAll('li')).toHaveLength(8);

    rerender(<DataPreview table={tableOf('id,value\nA,1\nB,2', 'clean.csv')} onReset={vi.fn()} />);

    expect(screen.queryByTestId('quality-findings')).toBeNull();
    const values = [...screen.getByTestId('quality-stats').querySelectorAll('dd')].map((node) => node.textContent);
    expect(values).toEqual(['2 行', '0 / 2 列', '0 个', '0 行']);
    expect(screen.getByTestId('quality-panel').textContent).not.toContain('c8');
  });

  it('点击类型冲突候选后定位到对应列与行，高亮显示并出现定位提示', () => {
    const csv = 'id,value\nPG-001,12.4\nPG-002,5.6\nPG-003,7.8\nPG-004,abc\n';
    render(<DataPreview table={tableOf(csv)} onReset={vi.fn()} />);

    const conflictChip = screen.getByRole('button', { name: /第 4 个数据行.*abc/ });
    fireEvent.click(conflictChip);

    const focusNote = screen.getByTestId('focus-note');
    expect(focusNote.textContent).toContain('已定位到第 2 列');
    expect(focusNote.textContent).toContain('第 4 个数据行');

    const header = document.querySelector('thead th[data-column-anchor="1"]');
    expect(header?.className).toContain('bg-amber-100');

    const row = document.querySelector('tbody tr[data-row-anchor="3"]');
    expect(row?.className).toContain('bg-amber-50');

    const cell = document.querySelector('tbody tr[data-row-anchor="3"] td[data-column-anchor="1"]');
    expect(cell?.className).toContain('bg-amber-50');
  });

  it('再次点击同一个候选会取消定位', () => {
    const csv = 'id,value\nPG-001,12.4\nPG-002,5.6\nPG-003,7.8\nPG-004,abc\n';
    render(<DataPreview table={tableOf(csv)} onReset={vi.fn()} />);

    const conflictChip = screen.getByRole('button', { name: /第 4 个数据行.*abc/ });
    fireEvent.click(conflictChip);
    expect(screen.getByTestId('focus-note')).toBeTruthy();

    fireEvent.click(conflictChip);
    expect(screen.queryByTestId('focus-note')).toBeNull();
  });

  it('点击「取消定位」按钮清除焦点', () => {
    const csv = 'id,value\nPG-001,12.4\nPG-002,5.6\nPG-003,7.8\nPG-004,abc\n';
    render(<DataPreview table={tableOf(csv)} onReset={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /第 4 个数据行.*abc/ }));
    expect(screen.getByTestId('focus-note')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '取消定位' }));
    expect(screen.queryByTestId('focus-note')).toBeNull();
  });

  it('换成另一份文件时清除定位状态', () => {
    const csv1 = 'id,value\nPG-001,12.4\nPG-002,5.6\nPG-003,7.8\nPG-004,abc\n';
    const { rerender } = render(<DataPreview table={tableOf(csv1, 'first.csv')} onReset={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /第 4 个数据行.*abc/ }));
    expect(screen.getByTestId('focus-note')).toBeTruthy();

    const csv2 = 'id,value\nPG-005,9.0\nPG-006,10.1\n';
    rerender(<DataPreview table={tableOf(csv2, 'second.csv')} onReset={vi.fn()} />);
    expect(screen.queryByTestId('focus-note')).toBeNull();
  });

  describe('跨行定位的分页安全（Day 4 整改）', () => {
    it('50 行以内定位正常：不换页，直接高亮目标行与列', () => {
      render(<DataPreview table={tableOf(csvWithConflictRows(120, [7]))} onReset={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /第 8 个数据行/ }));

      expect(firstRowNumber()).toBe('1');
      const target = document.querySelector('tbody tr[data-row-anchor="7"]');
      expect(target?.className).toContain('bg-amber-50');
      expect(target?.querySelector('td[data-column-anchor="1"]')?.className).toContain('bg-amber-50');
      expect(screen.getByTestId('focus-note').textContent).toContain('第 8 个数据行（第 1 页）');
    });

    it('定位第 2,000 行只切到目标所在页，DOM 里不超过一页的 50 行', () => {
      render(<DataPreview table={tableOf(csvWithConflictRows(2000, [1999]))} onReset={vi.fn()} />);

      expect(bodyRowCount()).toBe(50);
      fireEvent.click(screen.getByRole('button', { name: /第 2,000 个数据行/ }));

      expect(bodyRowCount()).toBeLessThanOrEqual(50);
      expect(firstRowNumber()).toBe('1,951');
      // 前面的记录没有因为定位被挂进 DOM
      expect(document.querySelector('tbody tr[data-row-anchor="0"]')).toBeNull();
      expect(document.querySelector('tbody tr[data-row-anchor="1949"]')).toBeNull();

      const target = document.querySelector<HTMLTableRowElement>('tbody tr[data-row-anchor="1999"]');
      expect(target).toBeTruthy();
      expect(target?.className).toContain('bg-amber-50');
      expect(target?.cells[0].textContent).toBe('2,000');
      expect(target?.querySelector('td[data-column-anchor="1"]')?.className).toContain('bg-amber-50');
      expect(document.querySelector('thead th[data-column-anchor="1"]')?.className).toContain('bg-amber-100');
      expect(screen.getByTestId('page-summary').textContent).toContain('第 40 / 40 页');
      expect(screen.getByTestId('focus-note').textContent).toContain('第 2,000 个数据行（第 40 页）');
    });

    it('定位第 50,000 行也不会把前面的记录渲染出来', () => {
      render(<DataPreview table={tableOf(csvWithConflictRows(50000, [49999]))} onReset={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /第 50,000 个数据行/ }));

      expect(bodyRowCount()).toBe(50);
      expect(firstRowNumber()).toBe('49,951');
      expect(document.querySelector('tbody tr[data-row-anchor="49999"]')?.className).toContain('bg-amber-50');
      expect(document.querySelector('tbody tr[data-row-anchor="0"]')).toBeNull();
      expect(screen.getByTestId('page-summary').textContent).toContain('第 1,000 / 1,000 页');
    });

    it('换到另一份文件时分页与定位状态一起重置', () => {
      const { rerender } = render(
        <DataPreview table={tableOf(csvWithConflictRows(2000, [1999]), 'first.csv')} onReset={vi.fn()} />,
      );

      fireEvent.click(screen.getByRole('button', { name: /第 2,000 个数据行/ }));
      expect(screen.getByTestId('focus-note')).toBeTruthy();
      expect(firstRowNumber()).toBe('1,951');

      rerender(<DataPreview table={tableOf(csvWithConflictRows(2000, [1999]), 'second.csv')} onReset={vi.fn()} />);

      expect(screen.queryByTestId('focus-note')).toBeNull();
      expect(firstRowNumber()).toBe('1');
      expect(bodyRowCount()).toBe(50);
      expect(screen.getByTestId('page-summary').textContent).toContain('第 1 / 40 页');
    });

    it('默认允许动效时定位用平滑滚动，且只在表格容器内滚', () => {
      render(<DataPreview table={tableOf(csvWithConflictRows(60, [59]))} onReset={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /第 60 个数据行/ }));

      expect(scrollToMock).toHaveBeenCalledTimes(1);
      expect(scrollToBehavior()).toBe('smooth');
      // 不动用整页 scrollIntoView，页面不会跟着反复跳动
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });

    it('开启「减少动态效果」时定位直接到位，不做平滑滚动', () => {
      setReduceMotion(true);
      render(<DataPreview table={tableOf(csvWithConflictRows(60, [59]))} onReset={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /第 60 个数据行/ }));

      expect(scrollToMock).toHaveBeenCalledTimes(1);
      expect(scrollToBehavior()).toBe('auto');
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });

    it('翻页与定位只改变显示范围，不修改 CsvTable.rows 与诊断结果', () => {
      const table = tableOf(csvWithConflictRows(200, [199]));
      const rowsSnapshot = JSON.stringify(table.rows);
      render(<DataPreview table={table} onReset={vi.fn()} />);
      const statsBefore = screen.getByTestId('quality-stats').textContent;

      fireEvent.click(screen.getByRole('button', { name: /第 200 个数据行/ }));
      fireEvent.click(screen.getByRole('button', { name: '返回第一页' }));
      fireEvent.click(screen.getByRole('button', { name: '下一页' }));

      expect(JSON.stringify(table.rows)).toBe(rowsSnapshot);
      expect(table.recordCount).toBe(200);
      expect(table.columns).toEqual(['sample_id', 'height_cm']);
      expect(screen.getByTestId('quality-stats').textContent).toBe(statsBefore);
    });
  });

  describe('定位高亮与奇偶行底色的覆盖关系（Day 4 UI 补丁）', () => {
    /** 目标行与奇偶底色同时挂在同一个元素上时，odd:/even: 会赢，高亮就看不见了。 */
    const ZEBRA_TOKENS = 'odd:bg-white even:bg-slate-50/60';

    function assertRowBackgroundIsExclusive(row: Element | null): void {
      const tokens = backgroundClasses(row).join(' ');
      expect(tokens === 'bg-amber-50' || tokens === ZEBRA_TOKENS).toBe(true);
    }

    it('目标行落在 odd 位置时，计算出来的背景色仍是琥珀色而不是白色', () => {
      mountTailwindBackgroundRules();
      // 第 9 个数据行（index 8）是 tbody 的第 9 个子元素，命中 odd:bg-white。
      render(<DataPreview table={tableOf(csvWithConflictRows(120, [8]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 9 个数据行/ }));

      const target = rowByIndex(8);
      expect(backgroundClasses(target)).toEqual(['bg-amber-50']);
      assertRowBackgroundIsExclusive(target);
      expect(backgroundOf(target, '目标行')).toBe(AMBER_50);
      expect(backgroundOf(target, '目标行')).not.toBe(zebraColorForRowIndex(8));
    });

    it('目标行落在 even 位置时，计算出来的背景色仍是琥珀色而不是斑马灰', () => {
      mountTailwindBackgroundRules();
      // 第 8 个数据行（index 7）是第 8 个子元素，命中 even:bg-slate-50/60。
      render(<DataPreview table={tableOf(csvWithConflictRows(120, [7]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 8 个数据行/ }));

      const target = rowByIndex(7);
      expect(backgroundClasses(target)).toEqual(['bg-amber-50']);
      expect(backgroundOf(target, '目标行')).toBe(AMBER_50);
      expect(backgroundOf(target, '目标行')).not.toBe(zebraColorForRowIndex(7));
    });

    it('定位行以外的普通行继续保留交替底色', () => {
      mountTailwindBackgroundRules();
      render(<DataPreview table={tableOf(csvWithConflictRows(120, [8]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 9 个数据行/ }));

      for (const index of [0, 1, 7, 9, 49]) {
        const row = rowByIndex(index);
        expect(backgroundClasses(row)).toEqual(['odd:bg-white', 'even:bg-slate-50/60']);
        expect(backgroundOf(row, `第 ${index + 1} 行`)).toBe(zebraColorForRowIndex(index));
      }
    });

    it('表头定位色不会被后声明的 bg-slate-100 压掉', () => {
      mountTailwindBackgroundRules();
      render(<DataPreview table={tableOf(csvWithConflictRows(120, [8]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 9 个数据行/ }));

      const focusedHeader = headerByColumn(1);
      expect(backgroundClasses(focusedHeader)).toEqual(['bg-amber-100']);
      expect(backgroundOf(focusedHeader, '定位列表头')).toBe(AMBER_100);

      // 未定位的字段列和序号列仍是不透明的 bg-slate-100，滚动时不会透出数据行。
      expect(backgroundClasses(headerByColumn(0))).toEqual(['bg-slate-100']);
      expect(backgroundClasses(document.querySelector('thead th'))).toEqual(['bg-slate-100']);
    });

    it('定位列的单元格高亮与所在行的底色互不冲突', () => {
      mountTailwindBackgroundRules();
      render(<DataPreview table={tableOf(csvWithConflictRows(120, [8]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 9 个数据行/ }));

      const targetRow = rowByIndex(8);
      const focusedCell = targetRow?.querySelector('td[data-column-anchor="1"]');
      expect(backgroundClasses(focusedCell)).toEqual(['bg-amber-50']);
      expect(backgroundOf(focusedCell, '定位单元格')).toBe(AMBER_50);
      // 同一行的其它单元格没有挂任何背景类，透出的是行上的琥珀色。
      expect(backgroundClasses(targetRow?.querySelector('td[data-column-anchor="0"]'))).toEqual([]);
    });

    it('整页每一行的底色类都只有一组，不存在互相覆盖的写法', () => {
      mountTailwindBackgroundRules();
      render(<DataPreview table={tableOf(csvWithConflictRows(2000, [1999]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 2,000 个数据行/ }));

      const rows = [...document.querySelectorAll('tbody tr')];
      expect(rows.length).toBe(50);
      for (const row of rows) assertRowBackgroundIsExclusive(row);
      expect(focusedRowCount()).toBe(1);
      expect(backgroundOf(rowByIndex(1999), '目标行')).toBe(AMBER_50);
      for (const header of [...document.querySelectorAll('thead th')]) {
        expect(backgroundClasses(header)).toHaveLength(1);
      }
    });
  });

  describe('手动翻页后的定位提示（Day 4 UI 补丁）', () => {
    it('上一页之后提示不再声称仍定位到目标行', () => {
      render(<DataPreview table={tableOf(csvWithConflictRows(2000, [1999]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 2,000 个数据行/ }));
      expect(screen.getByTestId('focus-note').textContent).toContain('第 2,000 个数据行（第 40 页）');

      fireEvent.click(screen.getByRole('button', { name: '上一页' }));

      expect(screen.getByTestId('page-summary').textContent).toContain('第 39 / 40 页');
      const note = screen.getByTestId('focus-note').textContent ?? '';
      expect(note).toContain('已定位到第 2 列「height_cm」');
      expect(note).not.toContain('个数据行');
      expect(note).not.toContain('第 40 页');
      expect(focusedRowCount()).toBe(0);
    });

    it('返回第一页后清掉旧行定位，但当前页的定位列仍然高亮', () => {
      mountTailwindBackgroundRules();
      render(<DataPreview table={tableOf(csvWithConflictRows(2000, [1999]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 2,000 个数据行/ }));

      fireEvent.click(screen.getByRole('button', { name: '返回第一页' }));

      expect(firstRowNumber()).toBe('1');
      expect(focusedRowCount()).toBe(0);
      const note = screen.getByTestId('focus-note').textContent ?? '';
      expect(note).not.toContain('个数据行');
      expect(backgroundOf(headerByColumn(1), '定位列表头')).toBe(AMBER_100);
      expect(backgroundOf(rowByIndex(0)?.querySelector('td[data-column-anchor="1"]'), '当前页定位列单元格')).toBe(
        AMBER_50,
      );
    });

    it('下一页之后不残留误导性的行定位提示', () => {
      render(<DataPreview table={tableOf(csvWithConflictRows(120, [8]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 9 个数据行/ }));
      expect(screen.getByTestId('focus-note').textContent).toContain('第 9 个数据行（第 1 页）');

      fireEvent.click(screen.getByRole('button', { name: '下一页' }));

      expect(firstRowNumber()).toBe('51');
      expect(rowByIndex(8)).toBeNull();
      expect(screen.getByTestId('focus-note').textContent).not.toContain('个数据行');
      expect(focusedRowCount()).toBe(0);
    });

    it('手动翻页只清掉行定位，列定位在前后翻页中都继续保留', () => {
      render(<DataPreview table={tableOf(csvWithConflictRows(120, [8]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 9 个数据行/ }));
      fireEvent.click(screen.getByRole('button', { name: '下一页' }));

      expect(screen.getByTestId('focus-note').textContent).toContain('已定位到第 2 列「height_cm」');
      fireEvent.click(screen.getByRole('button', { name: '上一页' }));
      expect(screen.getByTestId('focus-note').textContent).toContain('已定位到第 2 列「height_cm」');
      expect(headerByColumn(1)?.classList.contains('bg-amber-100')).toBe(true);
    });

    it('手动翻页后再点同一个候选，仍跳回目标页并恢复行高亮', () => {
      mountTailwindBackgroundRules();
      render(<DataPreview table={tableOf(csvWithConflictRows(2000, [1999]))} onReset={vi.fn()} />);
      const chip = screen.getByRole('button', { name: /第 2,000 个数据行/ });

      fireEvent.click(chip);
      fireEvent.click(screen.getByRole('button', { name: '返回第一页' }));
      expect(firstRowNumber()).toBe('1');
      expect(focusedRowCount()).toBe(0);

      fireEvent.click(chip);

      expect(firstRowNumber()).toBe('1,951');
      expect(screen.getByTestId('page-summary').textContent).toContain('第 40 / 40 页');
      expect(backgroundOf(rowByIndex(1999), '目标行')).toBe(AMBER_50);
      expect(screen.getByTestId('focus-note').textContent).toContain('第 2,000 个数据行（第 40 页）');
    });

    it('翻页清掉行定位后，「取消定位」按钮仍能一次清空', () => {
      render(<DataPreview table={tableOf(csvWithConflictRows(120, [8]))} onReset={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /第 9 个数据行/ }));
      fireEvent.click(screen.getByRole('button', { name: '下一页' }));

      fireEvent.click(screen.getByRole('button', { name: '取消定位' }));

      expect(screen.queryByTestId('focus-note')).toBeNull();
      expect(focusedRowCount()).toBe(0);
      expect(backgroundClasses(headerByColumn(1))).toEqual(['bg-slate-100']);
    });
  });
});
