import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EXAMPLE_CSV_PATH,
  MAX_CSV_BYTES,
  MAX_ITEMIZED_ISSUES,
  loadExampleCsv,
  parseCsvText,
  readCsvFile,
  validateCsvFileName,
} from './csv';
import type { CsvIssue } from '../types/csv';

const exampleCsvUrl = new URL(`../../public/${EXAMPLE_CSV_PATH}`, import.meta.url);

/** 每行都比表头少一个字段：用来复现「几万条格式问题」的错误密集场景。 */
function raggedRows(rowCount: number, separator = ','): string {
  const lines = [['a', 'b', 'c'].join(separator)];
  for (let index = 0; index < rowCount; index += 1) {
    lines.push([String(index), '1'].join(separator));
  }
  return lines.join('\n');
}

const VALID_CSV = [
  'sample_id,date,group,height_cm',
  'PG-001,2026-03-02,control,12.4',
  'PG-002,2026-03-02,treated,15.1',
  'PG-003,2026-03-03,control,',
].join('\n');

function parseOk(text: string) {
  const outcome = parseCsvText(text, { fileName: 'test.csv', source: 'file' });
  if (outcome.status !== 'ok') {
    throw new Error(`期望解析成功，实际错误：${outcome.error.message}`);
  }
  return outcome.table;
}

function errorCodeOf(text: string) {
  const outcome = parseCsvText(text, { fileName: 'test.csv', source: 'file' });
  if (outcome.status !== 'error') {
    throw new Error(`期望解析失败，实际成功：${JSON.stringify(outcome.table.columns)}`);
  }
  return outcome.error;
}

function codesOf(issues: CsvIssue[]) {
  return issues.map((issue) => issue.code);
}

function issueOf(issues: CsvIssue[], code: string) {
  const issue = issues.find((candidate) => candidate.code === code);
  if (!issue) throw new Error(`没有 ${code} 提示：${JSON.stringify(codesOf(issues))}`);
  return issue;
}

describe('parseCsvText 正常解析', () => {
  it('按表头拆出列名并按顺序生成单元格', () => {
    const table = parseOk(VALID_CSV);

    expect(table.columns).toEqual(['sample_id', 'date', 'group', 'height_cm']);
    expect(table.rows[0]).toEqual(['PG-001', '2026-03-02', 'control', '12.4']);
    expect(table.issues).toEqual([]);
  });

  it('保留空单元格为空字符串，缺列才表示为 null', () => {
    const table = parseOk(VALID_CSV);
    const shortRowTable = parseOk('a,b,c\n1,2\n');

    expect(table.rows[2]).toEqual(['PG-003', '2026-03-03', 'control', '']);
    expect(shortRowTable.rows[0]).toEqual(['1', '2', null]);
  });

  it('统计字段数与记录数', () => {
    const table = parseOk(VALID_CSV);

    expect(table.columnCount).toBe(4);
    expect(table.recordCount).toBe(3);
    expect(table.rows.length).toBe(table.recordCount);
  });

  it('只有表头时返回 0 条记录而非报错', () => {
    const table = parseOk('sample_id,date,group,height_cm\n');

    expect(table.columnCount).toBe(4);
    expect(table.recordCount).toBe(0);
    expect(table.rows).toEqual([]);
  });

  it('行长与表头不匹配时记录 Papa Parse 的真实告警', () => {
    const table = parseOk('a,b,c\n1,2\n3,4,5,6\n');

    expect(table.recordCount).toBe(2);
    expect(table.issues.map((issue) => issue.code)).toContain('TooFewFields');
    expect(table.issues.map((issue) => issue.code)).toContain('TooManyFields');
  });

  it('跳过纯空行，不计入记录数', () => {
    const table = parseOk('a,b\n1,2\n\n\n3,4\n');

    expect(table.recordCount).toBe(2);
    expect(table.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('计算 UTF-8 内容的真实字节数', () => {
    const table = parseOk('name,note\nA,中文\n');

    expect(table.sizeBytes).toBe(new TextEncoder().encode('name,note\nA,中文\n').length);
  });
});

describe('parseCsvText 空文件与格式错误', () => {
  it.each([
    ['完全为空', ''],
    ['只有空白字符', '   \n\t\n  '],
  ])('%s 时返回 empty-file 错误', (_label, text) => {
    const outcome = parseCsvText(text, { fileName: 'blank.csv', source: 'file' });

    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.error.code).toBe('empty-file');
    }
  });

  it('首行没有可用字段名时返回 no-header 错误', () => {
    const outcome = parseCsvText(',,\n1,2\n', { fileName: 'no-header.csv', source: 'file' });

    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.error.code).toBe('no-header');
    }
  });
});

describe('validateCsvFileName', () => {
  it('拒绝非 .csv 扩展名', () => {
    expect(validateCsvFileName('data.xlsx')?.code).toBe('not-a-csv');
    expect(validateCsvFileName('notes.txt')?.code).toBe('not-a-csv');
  });

  it('接受大小写混合的 .csv 扩展名', () => {
    expect(validateCsvFileName('Measurements.CSV')).toBeNull();
  });
});

describe('边界：编码与换行符', () => {
  const BOM = '\uFEFF';

  it('解析 UTF-8 BOM 文件时不会把 BOM 带进第一个列名', () => {
    const table = parseOk(`${BOM}sample_id,height_cm\nPG-001,12.4\n`);

    expect(table.columns).toEqual(['sample_id', 'height_cm']);
    expect(table.rows[0]).toEqual(['PG-001', '12.4']);
    expect(table.issues).toEqual([]);
  });

  it('BOM 计入真实字节数', () => {
    const text = `${BOM}a,b\n1,2\n`;

    expect(parseOk(text).sizeBytes).toBe(new TextEncoder().encode(text).length);
  });

  it.each([
    ['只有 BOM', BOM],
    ['只有空白行', '\n \n'],
    ['BOM 加空白行', `${BOM} \n`],
  ])('%s 仍然返回 empty-file', (_label, text) => {
    expect(errorCodeOf(text).code).toBe('empty-file');
  });

  it('BOM 不会被当成字段名，no-header 判断只看首行文字', () => {
    expect(errorCodeOf(`${BOM},,\n1,2\n`).code).toBe('no-header');
  });

  it('纯 CRLF 文件正常解析，单元格不留回车符', () => {
    const table = parseOk('a,b\r\n1,2\r\n3,4\r\n');

    expect(table.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(table.issues).toEqual([]);
  });

  it('混用 LF 与 CRLF 时保留原始字符并给出 MixedLineEndings 提示', () => {
    const table = parseOk('a,b\n1,2\r\n3,4\r\n');

    // Papa Parse 按首个 LF 切分，因此 CRLF 行末的 \r 留在数据里，原样呈现不加工。
    expect(table.rows[0]).toEqual(['1', '2\r']);
    const issue = issueOf(table.issues, 'MixedLineEndings');
    expect(issue.severity).toBe('error');
    expect(issue.origin).toBe('figureguard');
    expect(issue.fileLine).toBe(2);
    expect(issue.message).toContain('混用');
  });

  it('内容含 NUL 字节时返回 unsupported-encoding', () => {
    expect(errorCodeOf('a\u0000,b\u0000\n1\u0000,2\u0000\n').code).toBe('unsupported-encoding');
  });

  it('首字节不是合法 UTF-8 时返回 unsupported-encoding', () => {
    expect(errorCodeOf('\uFFFDa,b\n1,2\n').code).toBe('unsupported-encoding');
  });

  it('表头前有空白行时照样识别表头', () => {
    const table = parseOk('\n\na,b\n1,2\n');

    expect(table.columns).toEqual(['a', 'b']);
    expect(table.recordCount).toBe(1);
  });
});

describe('边界：引号字段', () => {
  it('引号内的逗号不会被拆成两列', () => {
    const table = parseOk('name,note\n"Doe, John",ok\n');

    expect(table.columns).toEqual(['name', 'note']);
    expect(table.rows[0]).toEqual(['Doe, John', 'ok']);
    expect(table.issues).toEqual([]);
  });

  it('引号内的换行属于同一个单元格，记录数不受影响', () => {
    const table = parseOk('name,note\n"line1\nline2",ok\nplain,2\n');

    expect(table.recordCount).toBe(2);
    expect(table.rows[0]).toEqual(['line1\nline2', 'ok']);
    expect(table.rows[1]).toEqual(['plain', '2']);
    expect(table.issues).toEqual([]);
  });

  it('跨行引号字段之后的错位行，行号按文件物理行给出', () => {
    const table = parseOk('a,b,c\n"x\ny",1,2\n\n3,4\n');

    expect(table.columns).toEqual(['a', 'b', 'c']);
    expect(table.recordCount).toBe(2);
    expect(table.rows[0]).toEqual(['x\ny', '1', '2']);
    expect(table.rows[1]).toEqual(['3', '4', null]);

    const issue = issueOf(table.issues, 'TooFewFields');
    expect(issue.rowIndex).toBe(1);
    // 简单换算 rowIndex + 2 会得出第 3 行，实际数据在文件第 5 行。
    expect(issue.fileLine).toBe(5);
    expect(issue.fileEndLine).toBeUndefined();
  });

  it('问题记录本身跨多行时给出起止行号', () => {
    const table = parseOk('a,b\n1,2\n"x\ny\nz",3,4,5\n');
    const issue = issueOf(table.issues, 'TooManyFields');

    expect(issue.rowIndex).toBe(1);
    expect(issue.fileLine).toBe(3);
    expect(issue.fileEndLine).toBe(5);
  });

  it('未闭合引号会报告 MissingQuotes 并定位到所在行', () => {
    const table = parseOk('a,b\n"unclosed,2\n3,4\n');
    const issue = issueOf(table.issues, 'MissingQuotes');

    expect(issue.severity).toBe('error');
    expect(issue.origin).toBe('papaparse');
    expect(issue.fileLine).toBe(2);
    expect(issue.rawMessage).toBe('Quoted field unterminated');
  });
});

describe('边界：表头结构', () => {
  it('重复表头按 Papa Parse 的重命名结果读取，并说明改名前后', () => {
    const table = parseOk('name,name,group\nA,B,C\n');

    expect(table.columns).toEqual(['name', 'name_1', 'group']);
    expect(table.rows[0]).toEqual(['A', 'B', 'C']);

    const issue = issueOf(table.issues, 'DuplicateHeaderRenamed');
    expect(issue.severity).toBe('notice');
    expect(issue.message).toContain('name_1');
    expect(issue.message).toContain('重名');
  });

  it('重复表头第二次解析得到同样的列名', () => {
    const text = 'name,name\nA,B\n';

    expect(parseOk(text).columns).toEqual(parseOk(text).columns);
  });

  it('首行全是空字段名时返回 no-header，而不是接受改名后的列', () => {
    const error = errorCodeOf(',,\n1,2\n');

    expect(error.code).toBe('no-header');
    expect(error.message).toContain('字段名');
  });

  it('单个空字段名同样返回 no-header', () => {
    expect(errorCodeOf(',\n1,2\n').code).toBe('no-header');
  });

  it('部分表头为空时正常解析，并逐列提示未命名', () => {
    const table = parseOk('a,,c\n1,2,3\n');

    expect(table.columns).toEqual(['a', '', 'c']);
    expect(table.rows[0]).toEqual(['1', '2', '3']);

    const issue = issueOf(table.issues, 'EmptyHeaderColumn');
    expect(issue.severity).toBe('notice');
    expect(issue.message).toContain('第 2 列');
  });

  it('表头结尾多一个逗号时按空列名提示，而不是静默多出无名列', () => {
    const table = parseOk('a,b,\n1,2,3\n');

    expect(table.columns).toEqual(['a', 'b', '']);
    expect(table.recordCount).toBe(1);
    expect(codesOf(table.issues)).toContain('EmptyHeaderColumn');
  });

  it('只有表头没有数据行时返回 0 条记录且不报错', () => {
    const table = parseOk('sample_id,date,group,height_cm');

    expect(table.recordCount).toBe(0);
    expect(table.columnCount).toBe(4);
    expect(table.rows).toEqual([]);
    expect(table.issues).toEqual([]);
  });
});

describe('边界：字段数不一致与分隔符', () => {
  it('缺列补 null，多出的字段不会变成列', () => {
    const table = parseOk('a,b,c\n1,2\n3,4,5,6\n');

    expect(table.columnCount).toBe(3);
    expect(table.columns).not.toContain('__parsed_extra');
    expect(table.rows).toEqual([
      ['1', '2', null],
      ['3', '4', '5'],
    ]);
    expect(codesOf(table.issues)).toEqual(expect.arrayContaining(['TooFewFields', 'TooManyFields']));
  });

  it('行号换算覆盖两个方向的错位', () => {
    const table = parseOk('a,b,c\n1,2,3\n4,5\n6,7,8,9\n');
    const lines = table.issues
      .filter((issue) => typeof issue.rowIndex === 'number')
      .map((issue) => `${issue.code}@${issue.fileLine}`);

    expect(lines).toEqual(expect.arrayContaining(['TooFewFields@3', 'TooManyFields@4']));
  });

  it('单列 CSV 正常解析，自动分隔符提示降级为 notice', () => {
    const table = parseOk('name\nA\nB\n');

    expect(table.columns).toEqual(['name']);
    expect(table.rows).toEqual([['A'], ['B']]);
    expect(codesOf(table.issues)).toContain('UndetectableDelimiter');
    expect(table.issues.every((issue) => issue.severity === 'notice')).toBe(true);
  });

  it('分号分隔文件按 Papa Parse 检测出的分隔符解析并说明', () => {
    const table = parseOk('a;b\n1;2\n');

    expect(table.delimiter).toBe(';');
    expect(table.columns).toEqual(['a', 'b']);
    expect(table.rows[0]).toEqual(['1', '2']);

    const issue = issueOf(table.issues, 'DelimiterDetected');
    expect(issue.severity).toBe('notice');
    expect(issue.message).toContain('分号');
  });

  it('逗号分隔时不出现分隔符提示', () => {
    expect(codesOf(parseOk('a,b\n1,2\n').issues)).not.toContain('DelimiterDetected');
  });
});

describe('回归：合法表头 __parsed_extra 不得被删列', () => {
  it('表头叫 __parsed_extra 时两列都保留，数据不变', () => {
    const table = parseOk('__parsed_extra,x\nhello,world\n');

    expect(table.columns).toEqual(['__parsed_extra', 'x']);
    expect(table.columnCount).toBe(2);
    expect(table.rows).toEqual([['hello', 'world']]);
    expect(table.recordCount).toBe(1);
    expect(table.structure.state).toBe('sound');
    // 与解析器内部键同名属于需要说明的事实，但不改变数据本身。
    expect(codesOf(table.issues)).toContain('ParsedExtraHeaderCollision');
    expect(issueOf(table.issues, 'ParsedExtraHeaderCollision').severity).toBe('notice');
  });

  it('__parsed_extra 列与多余字段同时出现时，保留真实单元格并只丢弃多出来的值', () => {
    const table = parseOk('__parsed_extra,x\nhello,world\na,b,c\n');

    expect(table.columns).toEqual(['__parsed_extra', 'x']);
    expect(table.rows).toEqual([
      ['hello', 'world'],
      ['a', 'b'],
    ]);
    expect(table.structure.rowsWithExtraFields).toBe(1);
    expect(table.structure.droppedExtraValues).toBe(1);
    expect(table.structure.state).toBe('degraded');
  });

  it('__parsed_extra 列本身是空值时仍然保留空字符串', () => {
    const table = parseOk('a,__parsed_extra\n1,\n');

    expect(table.columns).toEqual(['a', '__parsed_extra']);
    expect(table.rows).toEqual([['1', '']]);
  });

  it('单列且列名就是 __parsed_extra 时不丢列', () => {
    const table = parseOk('__parsed_extra\nv1\nv2\n');

    expect(table.columns).toEqual(['__parsed_extra']);
    expect(table.rows).toEqual([['v1'], ['v2']]);
  });

  it('普通文件的多余字段仍然不进列、只计入丢弃数量', () => {
    const table = parseOk('a,b,c\n1,2\n3,4,5,6\n');

    expect(table.columns).toEqual(['a', 'b', 'c']);
    expect(table.columns).not.toContain('__parsed_extra');
    expect(table.structure.rowsWithExtraFields).toBe(1);
    expect(table.structure.rowsWithMissingFields).toBe(1);
    expect(table.structure.droppedExtraValues).toBe(1);
  });
});

describe('回归：结构告警状态（供后续质检判断数据是否可信）', () => {
  it('行列一致的文件结构状态为 sound，原因为空', () => {
    const table = parseOk(VALID_CSV);

    expect(table.structure).toMatchObject({
      state: 'sound',
      rowsWithMissingFields: 0,
      rowsWithExtraFields: 0,
      droppedExtraValues: 0,
      renamedHeaderColumns: 0,
      mixedLineEndings: false,
    });
    expect(table.structure.reasons).toEqual([]);
  });

  it('表头重名只改名不丢数据，不算结构降级', () => {
    const table = parseOk('name,name\nA,B\n');

    expect(table.structure.renamedHeaderColumns).toBe(1);
    expect(table.structure.state).toBe('sound');
    expect(codesOf(table.issues)).toContain('DuplicateHeaderRenamed');
  });

  it('缺列与多列都记入结构降级原因，并给出真实数量', () => {
    const table = parseOk('a,b\n1,2,3,4\n5\n');

    expect(table.structure.state).toBe('degraded');
    expect(table.structure.rowsWithExtraFields).toBe(1);
    expect(table.structure.rowsWithMissingFields).toBe(1);
    expect(table.structure.droppedExtraValues).toBe(2);
    expect(table.structure.reasons.join('')).toContain('字段数少于表头');
    expect(table.structure.reasons.join('')).toContain('没有进入表格');
  });

  it('混用换行符同样标为降级', () => {
    const table = parseOk('a,b\n1,2\r\n3,4\r\n');

    expect(table.structure.mixedLineEndings).toBe(true);
    expect(table.structure.state).toBe('degraded');
    expect(table.structure.reasons.join('')).toContain('混用');
  });
});

describe('回归：错误密集型 CSV 的开销与上限', () => {
  it('14 万条缺列记录不会撑爆调用栈（修复前 RangeError）', () => {
    const started = Date.now();
    const table = parseOk(raggedRows(140000));

    expect(table.recordCount).toBe(140000);
    expect(table.issueTotals.errors).toBe(140000);
    expect(Date.now() - started).toBeLessThan(8000);
  });

  it('明细有上限，但总条数与类型分布是全量真实值', () => {
    const table = parseOk(raggedRows(3000));

    expect(table.issues.length).toBe(MAX_ITEMIZED_ISSUES);
    expect(table.issueTotals).toEqual({ errors: 3000, notices: 0 });
    const itemized = table.issues.filter((issue) => issue.code === 'TooFewFields');
    expect(itemized.length).toBe(MAX_ITEMIZED_ISSUES);
    expect(itemized[0].fileLine).toBe(2);
    const group = table.issueGroups.find((candidate) => candidate.code === 'TooFewFields');
    expect(group?.total).toBe(3000);
    expect(group?.itemized).toBe(MAX_ITEMIZED_ISSUES);
    expect(group?.label).toBe('字段数少于表头');
    expect(table.structure.rowsWithMissingFields).toBe(3000);
  });

  it('明细上限之内仍然逐条换算物理行号', () => {
    const table = parseOk('a,b,c\n1,2\n3,4\n5,6\n');

    expect(table.issues.map((issue) => issue.fileLine)).toEqual([2, 3, 4]);
  });

  it('派生结构提示不会因为 Papa 错误挤满明细而消失', () => {
    const table = parseOk(raggedRows(1000, ';'));

    expect(table.issueTotals.errors).toBe(1000);
    expect(codesOf(table.issues)).toContain('DelimiterDetected');
    expect(table.issues.filter((issue) => issue.origin === 'papaparse').length).toBe(MAX_ITEMIZED_ISSUES);
  });

  it('issueTotals 恒等于各分组的真实条数之和', () => {
    for (const text of [VALID_CSV, 'a,b,c\n1,2\n3,4,5,6\n', raggedRows(500), 'a;b\n1;2\n', 'name\nA\n']) {
      const table = parseOk(text);
      const errors = table.issueGroups
        .filter((group) => group.severity === 'error')
        .reduce((sum, group) => sum + group.total, 0);
      const notices = table.issueGroups
        .filter((group) => group.severity === 'notice')
        .reduce((sum, group) => sum + group.total, 0);
      const itemized = table.issueGroups.reduce((sum, group) => sum + group.itemized, 0);

      expect(table.issueTotals).toEqual({ errors, notices });
      expect(itemized).toBe(table.issues.length);
      expect(itemized).toBeLessThanOrEqual(errors + notices);
    }
  });
});

describe('parseCsvText 稳定性', () => {
  it('同一段文本重复解析结果完全一致', () => {
    const text = VALID_CSV;

    expect(parseOk(text)).toEqual(parseOk(text));
  });

  it('rows 长度、列数与每行单元格数始终自洽', () => {
    for (const text of [VALID_CSV, 'a,b,c\n1,2\n3,4,5,6\n', 'name\nA\n', 'a,b,c\n', 'a,b\r\n1,2\r\n']) {
      const table = parseOk(text);

      expect(table.recordCount).toBe(table.rows.length);
      expect(table.columnCount).toBe(table.columns.length);
      for (const row of table.rows) expect(row.length).toBe(table.columnCount);
    }
  });
});

describe('readCsvFile', () => {
  function fakeFile(name: string, text: string, size = new TextEncoder().encode(text).length) {
    return {
      name,
      size,
      text: () => Promise.resolve(text),
    } as unknown as File;
  }

  it('读取 .csv 文件时带上文件名与真实体积', async () => {
    const outcome = await readCsvFile(fakeFile('lab-notes.csv', 'a,b\n1,2\n'));

    if (outcome.status !== 'ok') throw new Error(outcome.error.message);
    expect(outcome.table.fileName).toBe('lab-notes.csv');
    expect(outcome.table.source).toBe('file');
    expect(outcome.table.sizeBytes).toBe(8);
  });

  it('重复读取同一个文件对象结果一致', async () => {
    const file = fakeFile('same.csv', 'a,b\n1,2\n');

    expect(await readCsvFile(file)).toEqual(await readCsvFile(file));
  });

  it('拒绝非 csv 扩展名', async () => {
    const outcome = await readCsvFile(fakeFile('notes.txt', 'a,b\n'));

    if (outcome.status !== 'error') throw new Error('期望失败');
    expect(outcome.error.code).toBe('not-a-csv');
  });

  it('超过 5 MB 上限时拒绝解析', async () => {
    const outcome = await readCsvFile(fakeFile('big.csv', 'a,b\n1,2\n', MAX_CSV_BYTES + 1));

    if (outcome.status !== 'error') throw new Error('期望失败');
    expect(outcome.error.code).toBe('file-too-large');
    expect(outcome.error.message).toContain('5 MB');
  });

  it('file.text() 抛错时返回 read-failed', async () => {
    const outcome = await readCsvFile({
      name: 'broken.csv',
      size: 4,
      text: () => Promise.reject(new Error('文件已被移动')),
    } as unknown as File);

    if (outcome.status !== 'error') throw new Error('期望失败');
    expect(outcome.error.code).toBe('read-failed');
    expect(outcome.error.message).toContain('文件已被移动');
  });

  it('二进制内容在读取后返回 unsupported-encoding', async () => {
    const outcome = await readCsvFile(fakeFile('utf16.csv', 'a\u0000,b\u0000\n'));

    if (outcome.status !== 'error') throw new Error('期望失败');
    expect(outcome.error.code).toBe('unsupported-encoding');
  });
});

describe('loadExampleCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(implement: () => Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn(implement));
  }

  it('示例数据解析为内置来源、文件名与真实字节数', async () => {
    const text = 'sample_id,height_cm\nPG-001,12.4\nPG-002,\n';
    stubFetch(() => Promise.resolve(new Response(text)));

    const outcome = await loadExampleCsv();
    if (outcome.status !== 'ok') throw new Error(outcome.error.message);

    expect(outcome.table.source).toBe('example');
    expect(outcome.table.fileName).toBe('plant-growth.csv');
    expect(outcome.table.recordCount).toBe(2);
    expect(outcome.table.sizeBytes).toBe(new TextEncoder().encode(text).length);
  });

  it('示例数据与本地文件来回切换时结果互不污染', async () => {
    stubFetch(() => Promise.resolve(new Response('a,b\n1,2\n')));
    const example = await loadExampleCsv();
    const local = await readCsvFile({
      name: 'mine.csv',
      size: 8,
      text: () => Promise.resolve('c,d\n3,4\n'),
    } as unknown as File);

    if (example.status !== 'ok' || local.status !== 'ok') throw new Error('期望两次都成功');
    expect(example.table.source).toBe('example');
    expect(local.table.source).toBe('file');
    expect(local.table.columns).toEqual(['c', 'd']);
    expect(example.table.columns).toEqual(['a', 'b']);

    // 同一份示例文本第二次加载仍然得到同样的结构（Papa 的改名状态没有跨调用泄漏）。
    const again = await loadExampleCsv();
    expect(again).toEqual(example);
  });

  it('fetch 抛错时返回 read-failed', async () => {
    stubFetch(() => Promise.reject(new Error('Network down')));

    const outcome = await loadExampleCsv();
    if (outcome.status !== 'error') throw new Error('期望失败');
    expect(outcome.error.code).toBe('read-failed');
    expect(outcome.error.message).toContain('Network down');
  });

  it('示例文件缺失（HTTP 404）时返回 read-failed', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 404 })));

    const outcome = await loadExampleCsv();
    if (outcome.status !== 'error') throw new Error('期望失败');
    expect(outcome.error.code).toBe('read-failed');
    expect(outcome.error.message).toContain('404');
  });

  it('响应体读取中断时返回 read-failed 而不是伪成功', async () => {
    const response = { ok: true, status: 200, text: () => Promise.reject(new Error('body 中断')) };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)));

    const outcome = await loadExampleCsv();
    if (outcome.status !== 'error') throw new Error('期望失败');
    expect(outcome.error.code).toBe('read-failed');
    expect(outcome.error.message).toContain('响应体');
  });
});

describe('内置示例数据', () => {
  it('public/examples/plant-growth.csv 可被解析为 12 条记录 4 个字段', () => {
    const text = readFileSync(exampleCsvUrl, 'utf-8');
    const table = parseOk(text);

    expect(table.columns).toEqual(['sample_id', 'date', 'group', 'height_cm']);
    expect(table.recordCount).toBe(12);
    expect(table.columnCount).toBe(4);
    expect(table.issues).toEqual([]);
  });

  it('示例数据确实包含空值，可用于后续质检演示', () => {
    const text = readFileSync(exampleCsvUrl, 'utf-8');
    const table = parseOk(text);
    const emptyCells = table.rows.flat().filter((cell) => cell === null || cell === '');

    expect(emptyCells.length).toBeGreaterThan(0);
  });
});
