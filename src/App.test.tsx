// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const originalRect = Element.prototype.getBoundingClientRect;
const originalScrollIntoView = Element.prototype.scrollIntoView;

function fileListOf(files: File[]) {
  return Object.assign(files, { item: (index: number) => files[index] ?? null });
}

function csvFile(name = 'lab.csv', text = 'a,b\n1,2\n') {
  return new File([text], name, { type: 'text/csv' });
}

function uploadInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('找不到文件选择控件');
  return input;
}

function resultPanel(): HTMLElement {
  const panel = document.querySelector<HTMLElement>('.scroll-mt-24');
  if (!panel) throw new Error('找不到结果面板容器');
  return panel;
}

/** 结果面板顶部距离视口顶部的距离，用来验证「已经看得见就不再滚动」。 */
function setPanelTop(top: number) {
  Element.prototype.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + 400,
      left: 0,
      right: 800,
      width: 800,
      height: 400,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as unknown as DOMRect;
}

/** jsdom 没有 window.matchMedia，App 调它之前必须补一个（见 beforeEach），这里只切换命中与否。 */
let reduceMotion = false;

function stubReduceMotion(matches: boolean) {
  reduceMotion = matches;
}

async function upload(file: File) {
  await act(async () => {
    fireEvent.change(uploadInput(), { target: { files: fileListOf([file]) } });
  });
}

async function clickExample() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '体验示例数据' }));
  });
}

describe('App 解析结果定位与播报', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    setPanelTop(1200);
    reduceMotion = false;
    Object.defineProperty(window, 'innerHeight', { value: 900, writable: true, configurable: true });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && reduceMotion,
      media: query,
    }));
  });

  afterEach(() => {
    cleanup();
    Element.prototype.getBoundingClientRect = originalRect;
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('解析成功后把结果面板滚进视野，一次解析只滚一次', async () => {
    render(<App />);

    await upload(csvFile('lab.csv', 'sample_id,height_cm\nPG-001,12.4\n'));

    expect(await screen.findByRole('heading', { name: '数据预览' })).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('结果面板已经在视野上半部时不再重复滚动', async () => {
    setPanelTop(120);
    render(<App />);

    await upload(csvFile('lab.csv', 'a,b\n1,2\n'));

    expect(await screen.findByRole('heading', { name: '数据预览' })).toBeTruthy();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('系统开启「减少动态效果」时直接定位，不做平滑滚动', async () => {
    stubReduceMotion(true);
    render(<App />);

    await upload(csvFile('lab.csv', 'a,b\n1,2\n'));

    expect(await screen.findByRole('heading', { name: '数据预览' })).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('解析失败同样滚进视野，并给出 role=alert 的错误面板与错误代码', async () => {
    render(<App />);

    await upload(csvFile('empty.csv', ''));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('解析未成功');
    expect(alert.textContent).toContain('错误代码：empty-file');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('非 UTF-8 内容给出编码错误而不是硬解析', async () => {
    render(<App />);

    await upload(csvFile('utf16.csv', 'a\u0000,b\u0000\n1\u0000,2\u0000\n'));

    expect((await screen.findByRole('alert')).textContent).toContain('unsupported-encoding');
  });

  it('清除结果后再次上传，两次解析各滚动一次', async () => {
    render(<App />);

    await upload(csvFile('first.csv', 'a,b\n1,2\n'));
    expect(await screen.findByRole('heading', { name: '数据预览' })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '清除结果' }));
    });
    expect(resultPanel().textContent).toBe('');

    await upload(csvFile('second.csv', 'c,d\n3,4\n'));

    expect(await screen.findByRole('heading', { name: '数据预览' })).toBeTruthy();
    expect(document.querySelector('span[title="3"]')).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('成功播报用读屏能听到的方式说明行列数与提示数量', async () => {
    render(<App />);

    await upload(csvFile('ragged.csv', 'a,b,c\n1,2\n3,4,5,6\n'));

    await waitFor(() => expect(resultPanel().textContent).toContain('数据预览'));
    const status = screen.getAllByRole('status').find((node) => node.getAttribute('aria-live') === 'polite');
    expect(status?.className).toContain('sr-only');
    expect(status?.textContent).toBe('解析完成：2 行 3 列，2 条格式问题、0 条说明提示。');
  });

  it('示例数据与本地文件来回切换时，来源与表格内容各自正确', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('sample_id,height_cm\nPG-001,12.4\n'))),
    );
    render(<App />);

    await clickExample();
    await waitFor(() => expect(resultPanel().textContent).toContain('内置示例'));

    await upload(csvFile('mine.csv', 'name,score\nAnn,9\n'));
    await waitFor(() => expect(resultPanel().textContent).toContain('本地文件'));
    expect(resultPanel().textContent).toContain('Ann');
    expect(resultPanel().textContent).not.toContain('PG-001');
  });

  it('示例文件读取失败时错误面板可用，不留下半截结果', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 404 }))));
    render(<App />);

    await clickExample();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('read-failed');
    expect(resultPanel().textContent).not.toContain('数据预览');
  });
});
