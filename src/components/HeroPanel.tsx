const CAPABILITIES = [
  {
    title: '数据质量诊断',
    body: '逐格统计空值、疑似空白值、结构性缺列与整行重复，并识别字段类型与类型不一致候选。',
  },
  {
    title: '图表实验室',
    body: '柱状图 / 散点图 / 折线图，字段、聚合口径、标题与单位可配置，统计按整份数据真实计算。',
  },
  {
    title: '表达风险与修复',
    body: '检查普通柱状图的零基线表达风险，一键恢复含零基线的自动范围，前后双图对比、可撤销。',
  },
  {
    title: '本地导出成果',
    body: '按当前画面重绘 PNG，并导出记录来源、质量、配置、诊断与修复过程的 Markdown 报告。',
  },
];

export function HeroPanel() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-8 pb-5 sm:px-6 sm:pt-12">
      <p className="text-xs font-semibold tracking-wide text-brand sm:text-sm">
        2026 Qoder 高校创造力大赛 · StudyHack 赛道
      </p>
      <h1 className="mt-2 max-w-3xl text-[1.7rem] leading-tight font-bold tracking-tight text-slate-900 sm:text-4xl text-balance">
        实验数据，先看清，再分析。
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
        上传 CSV，在浏览器本地完成数据质量诊断、图表生成与图表表达检查，并把修复前后的对比与结论导出成
        PNG 和 Markdown 报告。每个数字都来自对当前文件的真实计算，数据不上传、不注册、不调用外部接口。
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CAPABILITIES.map((item) => (
          <li key={item.title} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
