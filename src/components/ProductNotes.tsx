const VALUE_POINTS = [
  {
    title: '只呈现真实解析结果',
    body: '字段数、记录数、解析告警全部来自 Papa Parse 的实际输出，不预设结论、不伪造数值。',
  },
  {
    title: '先看清数据再分析',
    body: '质检的前提是理解表格结构，因此第一步是完整还原 CSV 的行列内容、空值位置和缺列情况。',
  },
  {
    title: '纯前端，零上传',
    body: '不接数据库、不调外部接口，文件内容只在当前浏览器的内存里处理，关闭页面即消失。',
  },
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
      <p className="mt-4 rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-xs leading-relaxed text-slate-600 sm:text-sm">
        当前版本范围：CSV 读取、数据预览与数据质量概览（缺失值统计、疑似重复记录检测、字段类型识别与类型冲突候选提示，全部按真实单元格计算），以及图表实验室（柱状图 / 散点图 / 折线图；柱状图默认逐条原始记录，可切换为按类别计算平均值或求和并给出每组有效样本数 n；图表标题、坐标轴标题与单位可自定义，单位只作标注、不做换算；如实标注参与绘图与按缺失 / 类型 / 日期精度排除的记录数）。
        异常值标注、图表表达诊断、修复前后对比、报告导出尚未实现，因此页面上没有这些入口，也不会给出任何未经计算的结论。
      </p>
    </section>
  );
}
