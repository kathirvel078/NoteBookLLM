import { Calendar } from "lucide-react";
import type { TimelineOutput } from "../../types/api";

export function TimelineRenderer({ data }: { data: TimelineOutput }) {
  if (data.events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 p-5 text-center text-xs text-stone-500 dark:border-slate-800 dark:text-slate-400">
        <Calendar className="mx-auto h-6 w-6 opacity-50" />
        <p className="mt-2 font-medium">No explicit dates found in the selected sources.</p>
      </div>
    );
  }

  return (
    <ol className="relative ml-2.5 space-y-4 border-l-2 border-indigo-200 pl-5 text-xs dark:border-indigo-900">
      {data.events.map((ev, idx) => (
        <li key={idx} className="relative">
          <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-indigo-600 bg-white dark:bg-slate-950" />
          <span className="inline-block rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
            {ev.date}
          </span>
          <h4 className="mt-1.5 text-sm font-semibold text-stone-900 dark:text-stone-100">
            {ev.title}
          </h4>
          <p className="mt-1 leading-relaxed text-stone-600 dark:text-slate-300">
            {ev.description}
          </p>
          <p className="mt-1 text-[11px] text-stone-400">{ev.source_ref}</p>
        </li>
      ))}
    </ol>
  );
}
