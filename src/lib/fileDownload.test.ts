// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_FILE_STEM_LENGTH,
  OBJECT_URL_RELEASE_DELAY_MS,
  buildExportFileName,
  formatTimestamp,
  sanitizeFileStem,
  saveFile,
} from './fileDownload';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalClick = HTMLAnchorElement.prototype.click;

/** 记录每一次被点击的临时 `<a>`：节点已从文档摘掉，但属性仍可读回。 */
const clickedAnchors: HTMLAnchorElement[] = [];

beforeEach(() => {
  clickedAnchors.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:figureguard/stub-id') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = vi.fn(function (this: HTMLAnchorElement) {
    clickedAnchors.push(this);
  }) as unknown as typeof HTMLAnchorElement.prototype.click;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  HTMLAnchorElement.prototype.click = originalClick;
  document.body.innerHTML = '';
});

describe('formatTimestamp：文件名时间戳', () => {
  it('按本地时间补零拼成 YYYYMMDD-HHMMSS', () => {
    expect(formatTimestamp(new Date(2026, 10, 19, 9, 5, 3))).toBe('20261119-090503');
    expect(formatTimestamp(new Date(2026, 0, 1, 23, 59, 59))).toBe('20260101-235959');
  });

  it('非法日期不会写出 NaN', () => {
    expect(formatTimestamp(new Date('不是时间'))).toBe('invalid-time');
  });
});

describe('sanitizeFileStem：来源文件名片段', () => {
  it('去掉扩展名，只保留可辨识主体', () => {
    expect(sanitizeFileStem('plant-growth.csv')).toBe('plant-growth');
    expect(sanitizeFileStem('实验数据-第3组.CSV')).toBe('实验数据-第3组');
  });

  it('路径分隔符只取最后一段，绝不带上目录', () => {
    expect(sanitizeFileStem('C:\\Users\\zxcvb\\Desktop\\data.csv')).toBe('data');
    expect(sanitizeFileStem('../../etc/passwd.csv')).toBe('passwd');
    expect(sanitizeFileStem('/tmp/a/b/c')).toBe('c');
    expect(sanitizeFileStem('..')).toBe('');
    expect(sanitizeFileStem('./..')).toBe('');
  });

  it('控制字符、空白与 Markdown 特殊符号换成下划线并折叠', () => {
    expect(sanitizeFileStem('weird\tname\n#1 2.csv')).toBe('weird_name_1_2');
    expect(sanitizeFileStem('a b_c-d.csv')).toBe('a_b_c-d');
    expect(sanitizeFileStem('   ')).toBe('');
    expect(sanitizeFileStem('')).toBe('');
  });

  it('纯符号名字返回空串，由调用方省略这一段', () => {
    expect(sanitizeFileStem('###')).toBe('');
    expect(sanitizeFileStem('---')).toBe('');
  });

  it('Windows 保留名加前缀，避免系统拒收', () => {
    expect(sanitizeFileStem('con.csv')).toBe('fig-con');
    expect(sanitizeFileStem('NUL')).toBe('fig-NUL');
    expect(sanitizeFileStem('config.csv')).toBe('config');
  });

  it('按码点截断到上限，不把代理对截半', () => {
    expect(sanitizeFileStem('a'.repeat(120))).toHaveLength(MAX_FILE_STEM_LENGTH);
    expect(sanitizeFileStem(`${'组'.repeat(60)}.csv`)).toBe('组'.repeat(MAX_FILE_STEM_LENGTH));
    // U+1D41A 是需要代理对的字母：截断必须落在完整码点上
    expect(sanitizeFileStem(`${'𝐚'.repeat(60)}.csv`)).toBe('𝐚'.repeat(MAX_FILE_STEM_LENGTH));
    // emoji 不属于文字/数字，整段被视为不安全 → 返回空串，由调用方省略这一段
    expect(sanitizeFileStem(`${'😀'.repeat(5)}.csv`)).toBe('');
  });
});

describe('buildExportFileName：导出文件名', () => {
  it('拼出 figureguard-<用途>-<来源>-<时间戳>.<后缀>', () => {
    expect(buildExportFileName('chart', 'png', 'plant-growth.csv', new Date(2026, 10, 19, 9, 5, 3))).toBe(
      'figureguard-chart-plant-growth-20261119-090503.png',
    );
    expect(buildExportFileName('report', 'md', '实验.csv', new Date(2026, 10, 19, 9, 5, 3))).toBe(
      'figureguard-report-实验-20261119-090503.md',
    );
  });

  it('来源名片段不安全时省略该段，文件名仍然合法可区分', () => {
    expect(buildExportFileName('chart', 'png', '../../etc/passwd', new Date(2026, 10, 19, 9, 5, 3))).toBe(
      'figureguard-chart-passwd-20261119-090503.png',
    );
    expect(buildExportFileName('report', 'md', '###', new Date(2026, 10, 19, 9, 5, 3))).toBe(
      'figureguard-report-20261119-090503.md',
    );
  });

  it('文件名里没有路径分隔符、空白与控制字符', () => {
    const name = buildExportFileName('chart', 'png', 'a b/c\\d\ne\tf.csv', new Date(2026, 10, 19, 9, 5, 3));
    expect(name).not.toMatch(/[/\\:*?"<>|\s]/u);
    expect(name).not.toMatch(/\p{Cc}/u);
  });
});

describe('saveFile：浏览器本地另存为', () => {
  it('用 Blob + Object URL 触发一次下载，并立刻摘掉临时 <a>', () => {
    const outcome = saveFile(['图表内容'], 'text/markdown', 'figureguard-report.md');
    expect(outcome).toEqual({
      ok: true,
      fileName: 'figureguard-report.md',
      byteLength: new Blob(['图表内容']).size,
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedAnchors).toHaveLength(1);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('下载属性使用传入文件名，关系属性为 noopener 且没有新窗口', () => {
    saveFile(['x'], 'image/png', 'figureguard-chart.png');
    expect(clickedAnchors).toHaveLength(1);
    const anchor = clickedAnchors[0]!;
    expect(anchor.download).toBe('figureguard-chart.png');
    expect(anchor.getAttribute('target')).toBeNull();
    expect(anchor.rel).toBe('noopener');
    expect(anchor.href).toBe('blob:figureguard/stub-id');
  });

  it('Object URL 延迟释放：点击返回时尚未 revoke，到点后回收', () => {
    vi.useFakeTimers();
    saveFile(['x'], 'text/markdown', 'a.md');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(OBJECT_URL_RELEASE_DELAY_MS);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:figureguard/stub-id');
  });

  it('空内容不生成 0 字节文件', () => {
    const outcome = saveFile([], 'text/markdown', 'empty.md');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('导出内容为空');
    expect(clickedAnchors).toHaveLength(0);
  });

  it('环境不支持 Object URL 时给出中文提示而不是抛错', () => {
    URL.createObjectURL = undefined as unknown as typeof URL.createObjectURL;
    const outcome = saveFile(['x'], 'text/markdown', 'a.md');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('不支持 Blob 下载');
  });

  it('没有 document 时安全失败', () => {
    vi.stubGlobal('document', undefined);
    const outcome = saveFile(['x'], 'text/markdown', 'a.md');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('本地文件下载');
  });

  it('click 抛错也被捕获，同时仍然摘掉临时节点', () => {
    HTMLAnchorElement.prototype.click = vi.fn(() => {
      throw new Error('浏览器拒绝了这次下载');
    }) as unknown as typeof HTMLAnchorElement.prototype.click;
    const outcome = saveFile(['x'], 'text/markdown', 'a.md');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('浏览器拒绝了这次下载');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
});
