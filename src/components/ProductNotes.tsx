const VALUE_POINTS = [
  {
    title: '只呈现真实计算结果',
    body: '记录数、缺失数量、聚合平均值、坐标轴范围全部来自对当前文件的实际遍历，不预设结论、不伪造数值。',
  },
  {
    title: '结论可解释、可复核',
    body: '每项提示都给出依据、影响与建议，并能定位到具体数据行与字段；修复只改图表配置，不改动任何单元格。',
  },
  {
    title: '纯前端，零上传',
    body: '不接数据库、不调外部接口，文件内容只在当前浏览器的内存里处理，关闭页面即消失。',
  },
];

const COVERED = [
  'CSV 解析、预览与解析告警定位（含文件物理行号）',
  '数据质量概览：空值 / 疑似空白值 / 结构性缺列 / 疑似重复记录，全部按真实单元格计算',
  '字段类型识别与类型不一致候选，可点击定位到表格对应位置',
  '柱状图 / 散点图 / 折线图：按类别聚合时给出每组有效样本数 n；单位只作标注、不做换算',
  '如实标注参与绘图，以及按缺失 / 类型 / 日期精度排除的记录数',
  '普通柱状图的零基线表达风险检查、一键修复、前后双图对比与撤销',
  'PNG 图表导出与 Markdown 诊断报告导出（均在浏览器本地完成）',
];

const NOT_COVERED = [
  '异常值判定（IQR / Z-score）与数据质量评分',
  '误差棒、图例、配色等其他图表表达检查项',
  'PDF / Word / Excel 导出与报告内嵌图片',
  '缺失值自动填充、重复记录自动删除等改写数据的操作',
  '多文件与多 sheet、Excel 原生 .xlsx 解析、云端存储与协作',
];

export function ProductNotes() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
      <h2 className="text-lg font-semibold text-slate-900">为什么先做「看清数据」这一步</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {VALUE_POINTS.map((point) => (
          <div key={point.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <dt className="text-sm font-semibold text-slate-900">{point.title}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-slate-600">{point.body}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-brand-ring bg-brand-soft p-5">
          <h3 className="text-sm font-semibold text-brand-dark">当前版本已覆盖</h3>
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-700">
            {COVERED.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">尚未实现，界面上也没有入口</h3>
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-600">
            {NOT_COVERED.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-500">
            「未发现风险」只表示当前这一条规则在现行配置下没有发现问题，不等于图表或科研结论正确；
            数据本身读错位时（结构降级或存在解析错误），系统不会输出正式的质量统计、图表与诊断结论。
          </p>
        </div>
      </div>
    </section>
  );
}
