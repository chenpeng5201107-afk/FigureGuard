import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, MouseEvent } from 'react';

import { MAX_CSV_BYTES } from '../lib/csv';
import { formatBytes } from '../lib/format';

interface CsvUploadPanelProps {
  busy: boolean;
  onFileSelected: (file: File) => void;
  onUseExample: () => void;
}

export function CsvUploadPanel({ busy, onFileSelected, onUseExample }: CsvUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function openFileDialog() {
    inputRef.current?.click();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.item(0);
    if (file) onFileSelected(file);
    // 清空以便再次选择同一个文件时仍能触发 change 事件。
    event.target.value = '';
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!busy) setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    // 经过区域内其他元素时也会派发 dragleave，用包含关系过滤掉才不会闪烁。
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const file = event.dataTransfer.files?.item(0);
    if (file) onFileSelected(file);
  }

  function handleZoneClick(event: MouseEvent<HTMLDivElement>) {
    if (busy) return;
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    openFileDialog();
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6" aria-labelledby="upload-heading">
      <div
        onClick={handleZoneClick}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-5 transition-colors sm:p-6 ${
          isDragging ? 'border-brand bg-brand-soft' : 'border-slate-300 bg-white'
        } ${busy ? '' : 'cursor-pointer'}`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 id="upload-heading" className="text-base font-semibold text-slate-900 sm:text-lg">
              {isDragging ? '松开即可解析这个文件' : '上传实验数据 CSV'}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              把文件拖到这一整块区域，或用按钮选择。单个文件不超过 {formatBytes(MAX_CSV_BYTES)}
              ，解析在浏览器本地完成，不会发送到任何服务器。
            </p>
            <p className="mt-3 text-xs text-slate-500 sm:text-sm">
              无需注册 · 文件在浏览器本地解析 · 支持 CSV 格式
            </p>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2.5 sm:w-auto sm:flex-row lg:w-56 lg:flex-col">
            <button
              type="button"
              disabled={busy}
              onClick={onUseExample}
              className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto lg:w-full"
            >
              体验示例数据
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={openFileDialog}
              className="w-full rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-brand hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto lg:w-full"
            >
              上传我的 CSV
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleInputChange}
            />
            {busy ? (
              <p
                role="status"
                aria-live="polite"
                className="flex items-center justify-center gap-2 text-sm font-medium text-brand-dark sm:justify-start lg:justify-center"
              >
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-ring border-t-brand"
                />
                正在浏览器本地解析……
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
