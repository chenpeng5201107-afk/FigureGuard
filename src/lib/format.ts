export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知大小';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/** 只做千分位分组，不改变数值本身。 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '未知';
  return value.toLocaleString('en-US');
}
