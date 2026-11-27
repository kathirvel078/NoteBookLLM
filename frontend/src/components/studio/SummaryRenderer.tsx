import { CheckCircle2 } from "lucide-react";
import type { SummaryOutput } from "../../types/api";

export function SummaryRenderer({ data }: { data: SummaryOutput }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">{data.title}</h3>
        <p className="mt-2 leading-relaxed text-stone-700 dark:text-slate-300">{data.overview}</p>
      </div>

      {data.key_points.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/70">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
            Key Takeaways
          </h4>
          <ul className="space-y-2">
            {data.key_points.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.conclusion && (
        <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 p-3.5 text-xs leading-relaxed text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-100">
          <span className="font-semibold">Conclusion: </span>
          {data.conclusion}
        </div>
      )}
    </div>
  );
}
