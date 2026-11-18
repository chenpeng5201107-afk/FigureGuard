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

/**
 * 比率一律按 0–1 传入，输出成百分比。非法或负数不猜数值，直接说明未知。
 * 记录数为 0 时上游必须传 0（而不是 0/0），所以这里不会出现 NaN 或 Infinity。
 */
export function formatRate(rate: number, digits = 1): string {
  if (!Number.isFinite(rate) || rate < 0) return '无法计算';
  return `${(rate * 100).toFixed(digits)}%`;
}

/**
 * 计算结果（平均值、求和等）的展示文本：最多保留 `digits` 位小数并去掉尾随 0。
 * 只格式化要显示的那串字符，参与计算与绘图的仍是完整精度数值；不可表示时明确说明，不伪造。
 */
export function formatComputedValue(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return '无法计算';
  const rounded = Number(value.toFixed(digits));
  // 四舍五入到 0 会让「极小但不为 0」的计算结果看起来像 0，改用科学计数保住这个事实。
  if (rounded === 0 && value !== 0) return value.toExponential(2);
  return String(rounded);
}
