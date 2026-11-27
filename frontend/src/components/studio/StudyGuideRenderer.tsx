import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { StudyGuideOutput } from "../../types/api";

export function StudyGuideRenderer({ data }: { data: StudyGuideOutput }) {
  const [openTerms, setOpenTerms] = useState<Record<number, boolean>>({ 0: true });
  const [showQuestions, setShowQuestions] = useState(true);

  const toggleTerm = (idx: number) =>
    setOpenTerms((prev) => ({ ...prev, [idx]: !prev[idx] }));

  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/70">
        <h4 className="font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
          Overview
        </h4>
        <p className="mt-1.5 text-sm leading-relaxed">{data.summary}</p>
      </div>

      <div>
        <h4 className="mb-2 font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
          Key Concepts ({data.key_concepts.length})
        </h4>
        <div className="space-y-1.5">
          {data.key_concepts.map((kc, idx) => {
            const isOpen = !!openTerms[idx];
            return (
              <div
                key={idx}
                className="rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => toggleTerm(idx)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left font-semibold"
                >
                  <span>{kc.term}</span>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-stone-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-stone-400" />
                  )}
                </button>
                {isOpen && (
                  <p className="border-t border-stone-100 px-3 py-2.5 leading-relaxed text-stone-600 dark:border-slate-800 dark:text-slate-300">
                    {kc.definition}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {data.important_questions.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setShowQuestions((s) => !s)}
            aria-expanded={showQuestions}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left font-semibold"
          >
            <span>Self-Test Questions ({data.important_questions.length})</span>
            {showQuestions ? (
              <ChevronDown className="h-4 w-4 text-stone-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-stone-400" />
            )}
          </button>
          {showQuestions && (
            <ol className="list-decimal space-y-1.5 border-t border-stone-100 py-2.5 pl-7 pr-3 text-stone-700 dark:border-slate-800 dark:text-slate-300">
              {data.important_questions.map((q, idx) => (
                <li key={idx}>{q}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {data.further_study.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/70">
          <h4 className="font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
            Further Study
          </h4>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-stone-700 dark:text-slate-300">
            {data.further_study.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
