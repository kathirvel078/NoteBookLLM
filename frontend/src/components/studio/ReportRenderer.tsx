import { Download } from "lucide-react";
import type { ReportOutput } from "../../types/api";

export function ReportRenderer({ data }: { data: ReportOutput }) {
  function handleExportMarkdown() {
    const md = [
      `# ${data.title}`,
      "",
      "## Executive Summary",
      data.executive_summary,
      "",
      ...data.sections.flatMap((s) => [`## ${s.heading}`, s.content, ""]),
      "## Conclusion",
      data.conclusion,
      "",
    ].join("\n");

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "report"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">{data.title}</h3>
        <button
          type="button"
          onClick={handleExportMarkdown}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium hover:bg-stone-100 dark:border-slate-800 dark:hover:bg-slate-900"
        >
          <Download className="h-3.5 w-3.5" />
          Export .md
        </button>
      </div>

      <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/70">
        <h4 className="font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
          Executive Summary
        </h4>
        <p className="mt-1.5 leading-relaxed">{data.executive_summary}</p>
      </div>

      {data.sections.map((section, idx) => (
        <section
          key={idx}
          className="rounded-xl border border-stone-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
        >
          <h4 className="text-sm font-semibold">{section.heading}</h4>
          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-stone-700 dark:text-slate-300">
            {section.content}
          </p>
        </section>
      ))}

      <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 p-3.5 leading-relaxed dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <span className="font-semibold">Conclusion: </span>
        {data.conclusion}
      </div>
    </div>
  );
}
