import { useId } from 'react';

import type { CsvError } from '../types/csv';

const ERROR_HINTS: Record<CsvError['code'], string> = {
  'empty-file': '请确认文件里至少包含表头行和若干数据行。',
  'file-too-large': '可以删除无关列或按批次拆分后再上传。',
  'not-a-csv': '目前只接受 .csv 文本文件，请先在表格软件里另存为 CSV UTF-8。',
  'unsupported-encoding': '请在表格软件里「另存为 → CSV UTF-8」，不要用「文本（UTF-16）」或二进制格式导出。',
  'no-header': '请把字段名放在 CSV 的第一行后再上传。',
  'read-failed': '请确认文件未被其他程序占用、网络仍然可用，或重新选择一次。',
  'parse-failed': '解析已在浏览器本地中止，数据未被修改；若反复出现，请记下错误代码一并反馈。',
};

interface ParseErrorPanelProps {
  error: CsvError;
  onReset: () => void;
}

export function ParseErrorPanel({ error, onReset }: ParseErrorPanelProps) {
  const titleId = useId();
  const detailId = useId();

  return (
    <section
      className="mx-auto max-w-6xl px-4 pb-10 sm:px-6"
      role="alert"
      aria-labelledby={titleId}
      aria-describedby={detailId}
    >
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <h2 id={titleId} className="text-base font-semibold text-rose-900">
          解析未成功
        </h2>
        <p id={detailId} className="mt-2 text-sm leading-relaxed break-words text-rose-900/90">
          {error.message}
        </p>
        <p className="mt-2 text-sm text-rose-900/75">{ERROR_HINTS[error.code]}</p>
        <p className="mt-2 font-mono text-xs text-rose-900/60">错误代码：{error.code}</p>
        <button
          type="button"
          onClick={onReset}
          className="mt-4 rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm text-rose-900 transition-colors hover:bg-rose-100"
        >
          关闭提示并重新选择
        </button>
      </div>
    </section>
  );
}
