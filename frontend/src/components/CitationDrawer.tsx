import { FileText, X } from "lucide-react";
import type { Citation } from "../types/api";

interface CitationDrawerProps {
  citation: Citation | null;
  onClose: () => void;
}

export function CitationDrawer({ citation, onClose }: CitationDrawerProps) {
  if (!citation) return null;

  const locationLabel = citation.page_start
    ? citation.page_end && citation.page_end !== citation.page_start
      ? `Pages ${citation.page_start}–${citation.page_end}`
      : `Page ${citation.page_start}`
    : citation.section || "Document section";

  return (
    <aside
      aria-label="Citation details"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-indigo-600 px-2 text-xs font-bold text-white">
            [{citation.index}]
          </span>
          <h3 className="text-sm font-semibold">Source Citation</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close citation drawer"
          className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-2.5">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold">{citation.filename}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-stone-600 dark:text-slate-400">
                <span className="rounded bg-white px-2 py-0.5 font-medium dark:bg-slate-800">
                  {locationLabel}
                </span>
                <span className="rounded bg-white px-2 py-0.5 dark:bg-slate-800">
                  Match {(citation.score * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
            Extracted Passage
          </p>
          <blockquote className="rounded-xl border border-stone-200 bg-white p-4 text-sm leading-relaxed text-stone-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-stone-200">
            {citation.snippet}
          </blockquote>
        </div>
      </div>
    </aside>
  );
}
