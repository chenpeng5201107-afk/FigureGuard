/**
 * 浏览器本地文件下载与导出文件名工具（Day 9）。
 *
 * 全程不经过服务器：内容在内存里拼好后交给 Blob + Object URL，由 `<a download>` 触发另存为。
 * 文件名一律由「固定前缀 + 安全处理后的来源名片段 + 时间戳」组成，用户 CSV 的原始名字
 * 可能带路径分隔符、控制字符或 `..`，不能直接用作下载路径。
 */

/** Object URL 在点击之后再延迟释放：立即回收会让部分浏览器来不及真正开始下载。 */
export const OBJECT_URL_RELEASE_DELAY_MS = 4000;
/** 来源文件名片段的最大长度：只作辨识，不参与任何计算。 */
export const MAX_FILE_STEM_LENGTH = 40;

const RESERVED_STEMS = new Set(['con', 'prn', 'aux', 'nul']);

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** 本地时间戳 `YYYYMMDD-HHMMSS`：同一份数据重复导出不会互相覆盖。 */
export function formatTimestamp(date: Date): string {
  if (!Number.isFinite(date.getTime())) return 'invalid-time';
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * 把来源文件名压成安全的文件名片段。
 *
 * - 先取最后一段路径（`C:\a\b.csv`、`../../etc/passwd` 都只留末段），再去掉扩展名；
 * - 只保留文字、数字、连字符与下划线，其余（路径分隔符、控制字符、`#`、`|`、引号、空格、换行）换成 `_`；
 * - 折叠连续的 `_` 并裁掉首尾，`..` 这类相对路径片段因此会被清空；
 * - 命中 Windows 保留名（`con`、`nul`…）时加前缀，避免系统拒收；
 * - 结果按码点截断到 `maxLength`，为空时由调用方省略这一段。
 */
export function sanitizeFileStem(fileName: string, maxLength = MAX_FILE_STEM_LENGTH): string {
  const segments = fileName.split(/[/\\:*?"<>|]/g);
  const base = segments.filter((segment) => segment !== '').pop() ?? '';
  const dot = base.lastIndexOf('.');
  const withoutExtension = dot > 0 ? base.slice(0, dot) : base;

  const safe = [...withoutExtension]
    .map((char) => (/[^\p{L}\p{N}_-]/u.test(char) ? '_' : char))
    .join('')
    .replace(/_{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');

  if (safe === '') return '';
  const trimmed = [...safe].slice(0, maxLength).join('').replace(/[_-]+$/g, '');
  if (trimmed === '') return '';
  return RESERVED_STEMS.has(trimmed.toLowerCase()) ? `fig-${trimmed}` : trimmed;
}

/**
 * 组装导出文件名：`figureguard-chart-<来源名片段>-YYYYMMDD-HHMMSS.png`。
 * 来源名片段不安全或为空时直接省略，前缀与时间戳保证名字始终合法且可区分。
 */
export function buildExportFileName(kind: string, extension: string, sourceName: string, date: Date): string {
  const stem = sanitizeFileStem(sourceName);
  const parts = ['figureguard', kind];
  if (stem !== '') parts.push(stem);
  parts.push(formatTimestamp(date));
  return `${parts.join('-')}.${extension}`;
}

export type SaveFileOutcome =
  | { ok: true; fileName: string; byteLength: number }
  | { ok: false; fileName: string; message: string };

function scheduleObjectUrlRelease(url: string): void {
  const release = () => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // 环境没有实现 revokeObjectURL：URL 随页面卸载回收，不影响已触发的下载。
    }
  };
  if (typeof setTimeout === 'function') {
    setTimeout(release, OBJECT_URL_RELEASE_DELAY_MS);
  } else {
    release();
  }
}

/**
 * 用 Blob + Object URL 触发一次本地另存为。
 * 任何一步失败（无 DOM、无 Blob、无 Object URL 支持）都返回带中文说明的结果，不抛给调用方。
 */
export function saveFile(parts: BlobPart[], mimeType: string, fileName: string): SaveFileOutcome {
  const doc = typeof document === 'undefined' ? null : document;
  if (doc === null || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return { ok: false, fileName, message: '当前浏览器环境不支持本地文件下载，请更换浏览器后重试。' };
  }

  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    if (typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
      return { ok: false, fileName, message: '当前浏览器不支持 Blob 下载（Object URL 不可用），请更换浏览器后重试。' };
    }
    const blob = new Blob(parts, { type: mimeType });
    if (blob.size === 0) {
      return { ok: false, fileName, message: '导出内容为空，没有生成文件。' };
    }
    url = URL.createObjectURL(blob);
    anchor = doc.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    doc.body.appendChild(anchor);
    anchor.click();
    return { ok: true, fileName, byteLength: blob.size };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, fileName, message: `文件保存失败：${detail}` };
  } finally {
    if (anchor !== null) {
      try {
        anchor.remove();
      } catch {
        // 容器已被移除：不影响下载结果。
      }
    }
    if (url !== null) scheduleObjectUrlRelease(url);
  }
}
