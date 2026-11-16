// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CsvUploadPanel } from './CsvUploadPanel';

function csvFile(name = 'lab.csv', text = 'a,b\n1,2\n') {
  return new File([text], name, { type: 'text/csv' });
}

/** 浏览器给 input.files / dataTransfer.files 的是 FileList（有 item()），测试里补齐同样的接口。 */
function fileListOf(files: File[]) {
  return Object.assign(files, { item: (index: number) => files[index] ?? null });
}

/** 面板里的隐藏 file input，用它模拟「在文件对话框里选中一个文件」。 */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('找不到文件选择控件');
  return input;
}

function zone(): HTMLElement {
  const element = document.querySelector<HTMLElement>('div[class*="border-dashed"]');
  if (!element) throw new Error('找不到拖拽区域');
  return element;
}

function zoneTitle(): string {
  return document.querySelector('#upload-heading')?.textContent ?? '';
}

/**
 * jsdom 没有 DragEvent，fireEvent 的属性赋值也盖不住 MouseEvent 原型上的 relatedTarget getter，
 * 所以手动 defineProperty 注入，才能测「拖到区域内子元素上」这种真实光标路径。
 */
function dragLeave(relatedTarget: Element | null) {
  const event = new MouseEvent('dragleave', { bubbles: true });
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  fireEvent(zone(), event);
}

describe('CsvUploadPanel', () => {
  afterEach(cleanup);

  it('选择文件时把 File 交给上层，重复选择同一个文件仍会触发解析', () => {
    const onFileSelected = vi.fn();
    render(<CsvUploadPanel busy={false} onFileSelected={onFileSelected} onUseExample={vi.fn()} />);

    const input = fileInput();
    const file = csvFile();
    fireEvent.change(input, { target: { files: fileListOf([file]) } });

    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect(onFileSelected.mock.calls[0][0]).toBe(file);
    // 处理器会把 value 清空，因此同一个文件再选一次仍然算一次新的 change。
    expect(input.value).toBe('');

    fireEvent.change(input, { target: { files: fileListOf([file]) } });
    expect(onFileSelected).toHaveBeenCalledTimes(2);
  });

  it('拖拽整块区域即可解析，经过内部子元素不取消高亮', () => {
    const onFileSelected = vi.fn();
    render(<CsvUploadPanel busy={false} onFileSelected={onFileSelected} onUseExample={vi.fn()} />);

    fireEvent.dragOver(zone(), { dataTransfer: { files: [] } });
    expect(zoneTitle()).toBe('松开即可解析这个文件');

    // relatedTarget 落在区域内元素上时不算离开，否则高亮会闪烁。
    dragLeave(screen.getByRole('heading', { level: 2 }));
    expect(zoneTitle()).toBe('松开即可解析这个文件');

    dragLeave(null);
    expect(zoneTitle()).toBe('上传实验数据 CSV');

    const file = csvFile('dropped.csv');
    fireEvent.drop(zone(), { dataTransfer: { files: fileListOf([file]) } });
    expect(onFileSelected).toHaveBeenCalledWith(file);
    expect(zoneTitle()).toBe('上传实验数据 CSV');
  });

  it('解析中禁用两个按钮、给出 role=status 文案，并忽略点击与拖放', () => {
    const onFileSelected = vi.fn();
    const onUseExample = vi.fn();
    render(<CsvUploadPanel busy onFileSelected={onFileSelected} onUseExample={onUseExample} />);

    expect(screen.getByRole('status').textContent).toContain('正在浏览器本地解析');
    expect(screen.getByRole('button', { name: '体验示例数据' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '上传我的 CSV' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '体验示例数据' }));
    fireEvent.drop(zone(), { dataTransfer: { files: fileListOf([csvFile()]) } });
    expect(onUseExample).not.toHaveBeenCalled();
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('点击区域空白处打开文件选择框，点击按钮不重复触发', () => {
    render(<CsvUploadPanel busy={false} onFileSelected={vi.fn()} onUseExample={vi.fn()} />);
    const input = fileInput();
    const openDialog = vi.fn();
    Object.defineProperty(input, 'click', { value: openDialog, writable: true, configurable: true });

    fireEvent.click(zone());
    expect(openDialog).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '上传我的 CSV' }));
    expect(openDialog).toHaveBeenCalledTimes(2);
  });
});
