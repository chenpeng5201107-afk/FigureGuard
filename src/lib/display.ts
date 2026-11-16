import type { CsvCellValue } from '../types/csv';

/**
 * 仅用于表格排版的视觉分类：不改写单元格文本，也不参与任何数据质量判断。
 */
export type CellLayoutKind = 'number' | 'date' | 'text';

const NUMBER_PATTERN = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?%?$/;
const DATE_PATTERN = /^\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;

export function classifyCellValue(value: string): CellLayoutKind {
  const text = value.trim();
  if (text === '') return 'text';
  if (NUMBER_PATTERN.test(text)) return 'number';
  if (DATE_PATTERN.test(text)) return 'date';
  return 'text';
}

/**
 * 空单元格（''）与缺列（null）不参与判定；数值与日期混在同一列时按文本处理，避免对齐方式误导阅读。
 */
export function classifyColumn(values: readonly CsvCellValue[]): CellLayoutKind {
  let sawNumber = false;
  let sawDate = false;

  for (const value of values) {
    if (value === null || value === '') continue;
    const kind = classifyCellValue(value);
    if (kind === 'text') return 'text';
    if (kind === 'number') sawNumber = true;
    else sawDate = true;
    if (sawNumber && sawDate) return 'text';
  }

  if (sawNumber) return 'number';
  if (sawDate) return 'date';
  return 'text';
}

export function alignForKind(kind: CellLayoutKind): 'left' | 'right' {
  return kind === 'number' ? 'right' : 'left';
}

export function layoutClassForKind(kind: CellLayoutKind): string {
  const align = alignForKind(kind) === 'right' ? 'text-right' : 'text-left';
  if (kind === 'text') return align;
  return `${align} tabular-nums`;
}
