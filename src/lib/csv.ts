import Papa from 'papaparse';

import type {
  CsvCellValue,
  CsvError,
  CsvIssue,
  CsvIssueSeverity,
  CsvSourceKind,
  CsvTable,
  ParseOutcome,
} from '../types/csv';

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const EXAMPLE_CSV_PATH = 'examples/plant-growth.csv';
export const EXAMPLE_CSV_NAME = 'plant-growth.csv';

const FALLBACK_DELIMITER = ',';
const FALLBACK_LINEBREAK = '\n';
/** Papa Parse 在字段数多于表头时写入的临时键，不属于真实列。 */
const EXTRA_FIELDS_KEY = '__parsed_extra';

export interface ParseTextOptions {
  fileName: string;
  source: CsvSourceKind;
  /** 不传则按 UTF-8 编码计算真实字节数。 */
  sizeBytes?: number;
}

/** Papa Parse 的告警代码 → 给学生的中文说明；未列出的代码按 error 处理。 */
const PAPA_ERROR_MESSAGES: Record<string, { severity: CsvIssueSeverity; message: string }> = {
  TooManyFields: {
    severity: 'error',
    message: '这一行的字段数比表头多，多出来的值没有进入表格，数量见下面的原始提示。',
  },
  TooFewFields: {
    severity: 'error',
    message: '这一行的字段数比表头少，缺少的列在表格里显示为「—」。',
  },
  MissingQuotes: {
    severity: 'error',
    message: '有引号没有闭合，Papa Parse 从这一行开始把后面的内容读进了同一个字段，后面的行可能整体错位。',
  },
  InvalidQuotes: {
    severity: 'error',
    message: '引号前后出现了多余字符，这个字段可能没有按预期拆分。',
  },
  UndetectableDelimiter: {
    severity: 'notice',
    message:
      'Papa Parse 无法自动判断分隔符，退回默认的逗号。文件本来只有一列时这属于正常现象；' +
      '如果实际用分号或 Tab 分隔，请检查列有没有被正确拆开。',
  },
};

interface FileLine {
  fileLine?: number;
  fileEndLine?: number;
}

function fail(code: CsvError['code'], message: string): ParseOutcome {
  return { status: 'error', error: { code, message } };
}

function byteLengthOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeColumns(fields: string[] | undefined): string[] {
  if (!fields) return [];
  return fields.filter((field) => field !== EXTRA_FIELDS_KEY);
}

/**
 * Papa Parse 会把重复或空的表头改写成 `name_1`、`_1`，`meta.renamedHeaders` 记录
 * 「新列名 → 原列名」，据此还原源文件里真实的表头文字，不需要自己按分隔符切字符串。
 */
function originalHeaderNames(fields: string[], renamedHeaders?: Record<string, string> | null): string[] {
  return fields.map((field) => renamedHeaders?.[field] ?? field);
}

function delimiterLabel(delimiter: string): string {
  if (delimiter === '\t') return 'Tab（制表符）';
  if (delimiter === ';') return '分号 ;';
  if (delimiter === ',') return '逗号 ,';
  if (delimiter === '|') return '竖线 |';
  return `「${delimiter}」`;
}

/**
 * 浏览器按 UTF-8 读取文件，UTF-16 或二进制内容会变成 NUL 与替换字符混排的噪声。
 * 与其解析出乱码列名，不如直接说明编码不支持。
 */
function detectUnsupportedEncoding(text: string): CsvError | null {
  if (text.charCodeAt(0) === 0xfffd) {
    return {
      code: 'unsupported-encoding',
      message: '文件开头的字节不是合法的 UTF-8 文本，可能是 UTF-16 或其他编码保存的 CSV。',
    };
  }
  if (text.slice(0, 4096).includes('\0')) {
    return {
      code: 'unsupported-encoding',
      message: '文件内容包含 NUL（0x00）字节，不是可直接解析的 UTF-8 文本 CSV。',
    };
  }
  return null;
}

/** 换行序列在文本中的起始偏移，用于把 Papa Parse 的字符偏移换算成物理行号。 */
function breakOffsetsOf(text: string, linebreak: string): number[] {
  const offsets: number[] = [];
  if (!linebreak) return offsets;
  let at = text.indexOf(linebreak);
  while (at !== -1) {
    offsets.push(at);
    at = text.indexOf(linebreak, at + linebreak.length);
  }
  return offsets;
}

/** 1 基物理行号：该偏移之前出现了几个换行序列。 */
function lineAt(offsets: number[], position: number): number {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] < position) low = middle + 1;
    else high = middle;
  }
  return low + 1;
}

/**
 * 行号换算必须用 Papa Parse 自己的分词结果：只有它知道引号内的换行和被跳过的空行
 * 落在哪些位置。这里用 header: false 重走一遍，只收集每条记录结束的字符偏移。
 */
function recordCursors(text: string, delimiter: string, neededRecords: number): number[] {
  const cursors: number[] = [];
  try {
    Papa.parse<string[]>(text, {
      delimiter,
      header: false,
      skipEmptyLines: 'greedy',
      step: (results, parser) => {
        cursors.push(results.meta.cursor);
        if (cursors.length > neededRecords) parser.abort();
      },
    });
  } catch {
    // 换算失败时退回 Papa 的逻辑行号，不影响解析结果本身。
    return [];
  }
  return cursors;
}

function embeddedBreakCount(row: CsvCellValue[] | undefined, linebreak: string): number {
  if (!row || !linebreak) return 0;
  let count = 0;
  for (const cell of row) {
    if (typeof cell !== 'string') continue;
    let at = cell.indexOf(linebreak);
    while (at !== -1) {
      count += 1;
      at = cell.indexOf(linebreak, at + linebreak.length);
    }
  }
  return count;
}

/** 值为 true 表示单元格里有孤立的回车符（后面没有跟着 \n），即换行符混用的痕迹。 */
function hasLoneCarriageReturn(cell: CsvCellValue): boolean {
  if (typeof cell !== 'string' || !cell.includes('\r')) return false;
  for (let at = cell.indexOf('\r'); at !== -1; at = cell.indexOf('\r', at + 1)) {
    if (cell[at + 1] !== '\n') return true;
  }
  return false;
}

function findCarriageReturnRow(rows: CsvCellValue[][]): number {
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].some(hasLoneCarriageReturn)) return index;
  }
  return -1;
}

export function parseCsvText(text: string, options: ParseTextOptions): ParseOutcome {
  if (text.trim().length === 0) {
    return fail('empty-file', 'CSV 文件内容为空，没有解析到任何表头或数据行。');
  }

  const encodingError = detectUnsupportedEncoding(text);
  if (encodingError) return { status: 'error', error: encodingError };

  let parsed: Papa.ParseResult<Record<string, CsvCellValue>>;
  try {
    parsed = Papa.parse<Record<string, CsvCellValue>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail('parse-failed', `Papa Parse 解析失败：${detail}`);
  }

  const delimiter = parsed.meta.delimiter || Papa.DefaultDelimiter || FALLBACK_DELIMITER;
  const linebreak = parsed.meta.linebreak || FALLBACK_LINEBREAK;
  const columns = normalizeColumns(parsed.meta.fields);
  const rawHeaders = originalHeaderNames(columns, parsed.meta.renamedHeaders);

  // 表头是否存在只看 Papa 还原出来的原始首行文字，重复表头会被改名但不会凭空造出名字。
  if (columns.length === 0) {
    return fail('no-header', '未识别到表头行：文件里读不出任何字段名，请确认 CSV 第一行是字段名称。');
  }
  if (!rawHeaders.some((name) => name.trim() !== '')) {
    return fail(
      'no-header',
      `未识别到表头行：第一行的 ${columns.length} 个字段名都是空的，请把字段名写在 CSV 的第一行后再上传。`,
    );
  }

  const rows = (parsed.data as Array<Record<string, CsvCellValue>>).map((row) =>
    columns.map((column) => {
      const value = row[column];
      return typeof value === 'string' ? value : null;
    }),
  );

  const issues = collectIssues({
    body: stripBom(text),
    delimiter,
    linebreak,
    columns,
    rawHeaders,
    renamedHeaders: parsed.meta.renamedHeaders,
    papaErrors: parsed.errors,
    rows,
  });

  const table: CsvTable = {
    fileName: options.fileName,
    source: options.source,
    sizeBytes: options.sizeBytes ?? byteLengthOf(text),
    delimiter,
    columns,
    rows,
    recordCount: rows.length,
    columnCount: columns.length,
    issues,
  };

  return { status: 'ok', table };
}

interface IssueContext {
  /** 与 Papa Parse 的字符偏移一致（Papa 内部同样先剥掉了 BOM）。 */
  body: string;
  delimiter: string;
  linebreak: string;
  columns: string[];
  rawHeaders: string[];
  renamedHeaders?: Record<string, string> | null;
  papaErrors: Papa.ParseError[];
  rows: CsvCellValue[][];
}

function collectIssues(context: IssueContext): CsvIssue[] {
  const { body, delimiter, linebreak, columns, rawHeaders, renamedHeaders, papaErrors, rows } = context;
  const issues: CsvIssue[] = [];

  const carriageReturnRow = findCarriageReturnRow(rows);
  const neededRows = new Set<number>();
  for (const error of papaErrors) {
    if (typeof error.row === 'number') neededRows.add(error.row);
  }
  if (carriageReturnRow >= 0) neededRows.add(carriageReturnRow);
  const needsOffsetLines = papaErrors.some((error) => typeof error.index === 'number');

  let cursors: number[] = [];
  let offsets: number[] = [];
  if (neededRows.size > 0 || needsOffsetLines) {
    offsets = breakOffsetsOf(body, linebreak);
    if (neededRows.size > 0) {
      cursors = recordCursors(body, delimiter, Math.max(...neededRows) + 1);
    }
  }

  /** 逻辑数据行 → 源文件里的物理行区间（引号内换行、被跳过的空行都已算进去）。 */
  const lineOfRow = (rowIndex: number): FileLine => {
    const cursor = cursors[rowIndex + 1];
    if (typeof cursor !== 'number') return {};
    const terminated = cursor >= linebreak.length && body.slice(cursor - linebreak.length, cursor) === linebreak;
    const end = lineAt(offsets, Math.max(0, terminated ? cursor - linebreak.length : cursor - 1));
    const start = Math.max(1, end - embeddedBreakCount(rows[rowIndex], linebreak));
    return start === end ? { fileLine: start } : { fileLine: start, fileEndLine: end };
  };

  for (const error of papaErrors) {
    const known = PAPA_ERROR_MESSAGES[error.code];
    const rowIndex = typeof error.row === 'number' ? error.row : undefined;
    // 引号类错误自带字符偏移，比逻辑行号更准；字段数不匹配的错误只有行号，需要换算。
    const line =
      typeof error.index === 'number'
        ? { fileLine: lineAt(offsets, error.index) }
        : rowIndex !== undefined
          ? lineOfRow(rowIndex)
          : {};
    issues.push({
      origin: 'papaparse',
      severity: known?.severity ?? 'error',
      type: error.type,
      code: error.code,
      message: known?.message ?? error.message,
      rawMessage: error.message,
      rowIndex,
      ...line,
    });
  }

  // 重复表头：Papa 改名后数据仍可读取，但列名已经不是源文件里的文字了，必须告诉用户。
  if (renamedHeaders) {
    for (const [renamed, original] of Object.entries(renamedHeaders)) {
      const columnIndex = columns.indexOf(renamed);
      if (columnIndex < 0) continue;
      issues.push({
        origin: 'figureguard',
        severity: 'notice',
        type: 'Structure',
        code: 'DuplicateHeaderRenamed',
        message: `表头第 ${columnIndex + 1} 列的「${original.trim() === '' ? '（空）' : original}」与前面的列重名，Papa Parse 已把它读作「${renamed}」；表格按新列名显示，这一列的数据没有丢失。`,
      });
    }
  }

  rawHeaders.forEach((name, index) => {
    if (name.trim() !== '') return;
    const displayed = columns[index].trim() === '' ? `（第 ${index + 1} 列未命名）` : columns[index];
    issues.push({
      origin: 'figureguard',
      severity: 'notice',
      type: 'Structure',
      code: 'EmptyHeaderColumn',
      message: `表头第 ${index + 1} 列没有字段名（首行这一格是空的），表格里显示为「${displayed}」，这一列的数据照常读取。`,
    });
  });

  if (delimiter !== ',') {
    issues.push({
      origin: 'figureguard',
      severity: 'notice',
      type: 'Structure',
      code: 'DelimiterDetected',
      message: `本次按 Papa Parse 自动检测的${delimiterLabel(delimiter)}拆分列，共 ${columns.length} 列。`,
    });
  }

  if (carriageReturnRow >= 0) {
    issues.push({
      origin: 'figureguard',
      severity: 'error',
      type: 'Structure',
      code: 'MixedLineEndings',
      message: '文件里混用了 LF 和 CRLF 换行：部分单元格结尾残留了一个回车符 \\r，已按原样保留在数据中，建议先统一换行符。',
      rowIndex: carriageReturnRow,
      ...lineOfRow(carriageReturnRow),
    });
  }

  return issues;
}

export function validateCsvFileName(fileName: string): CsvError | null {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase() ?? '';
  if (extension === 'csv') return null;

  if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'numbers', 'et'].includes(extension)) {
    return {
      code: 'not-a-csv',
      message: `「${fileName}」是表格软件的二进制工作簿（.${extension}），目前只能解析纯文本 CSV。请在表格软件里「另存为 → CSV UTF-8」后重新上传。`,
    };
  }
  if (['tsv', 'tab'].includes(extension)) {
    return {
      code: 'not-a-csv',
      message: `「${fileName}」是 Tab 分隔文件（.${extension}），当前版本只接受 .csv 扩展名。另存为 .csv 时不用改动内容，分隔符会被自动识别。`,
    };
  }
  return {
    code: 'not-a-csv',
    message: `「${fileName}」不是 .csv 文件${extension ? `（扩展名 .${extension}）` : ''}，请选择逗号分隔值文件，或先把数据另存为 CSV UTF-8。`,
  };
}

export async function readCsvFile(file: File): Promise<ParseOutcome> {
  const nameError = validateCsvFileName(file.name);
  if (nameError) return { status: 'error', error: nameError };

  if (file.size > MAX_CSV_BYTES) {
    return fail(
      'file-too-large',
      `文件「${file.name}」超过 ${MAX_CSV_BYTES / 1024 / 1024} MB 上限，请精简或拆分后再上传。`,
    );
  }

  let text: string;
  try {
    text = await file.text();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail('read-failed', `浏览器读取文件失败：${detail}`);
  }

  return parseCsvText(text, {
    fileName: file.name,
    source: 'file',
    sizeBytes: file.size,
  });
}

export async function loadExampleCsv(): Promise<ParseOutcome> {
  let response: Response;
  try {
    response = await fetch(`/${EXAMPLE_CSV_PATH}`);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail('read-failed', `内置示例数据加载失败：${detail}`);
  }

  if (!response.ok) {
    return fail('read-failed', `内置示例数据加载失败（HTTP ${response.status}）。`);
  }

  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail('read-failed', `内置示例数据读取响应体失败：${detail}`);
  }

  return parseCsvText(text, {
    fileName: EXAMPLE_CSV_NAME,
    source: 'example',
    sizeBytes: byteLengthOf(text),
  });
}
