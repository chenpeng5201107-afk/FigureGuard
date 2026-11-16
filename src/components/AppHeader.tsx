export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <img src="/favicon.svg" alt="" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-xl" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-base font-semibold tracking-tight text-slate-900">FigureGuard</p>
          <p className="truncate text-xs text-slate-500">科研图表急救室</p>
        </div>
        <span className="ml-auto hidden shrink-0 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-dark sm:block">
          CSV 仅在浏览器本地解析
        </span>
      </div>
    </header>
  );
}
