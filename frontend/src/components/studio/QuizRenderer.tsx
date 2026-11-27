import { useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { QuizOutput } from "../../types/api";

export function QuizRenderer({ data }: { data: QuizOutput }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const questions = data.questions;
  const score = useMemo(() => {
    return questions.reduce(
      (acc, q, idx) => (answers[idx] === q.correct_index ? acc + 1 : acc),
      0,
    );
  }, [answers, questions]);

  if (questions.length === 0) {
    return <p className="text-xs text-stone-500">No quiz questions generated.</p>;
  }

  return (
    <div className="space-y-4 text-xs">
      {submitted && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 font-semibold text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100"
        >
          <span>
            Score: {score} / {questions.length} (
            {Math.round((score / questions.length) * 100)}%)
          </span>
          <button
            type="button"
            onClick={() => {
              setAnswers({});
              setSubmitted(false);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-2 py-1 text-[11px] hover:bg-indigo-100 dark:border-indigo-700 dark:hover:bg-indigo-900"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {questions.map((q, qIdx) => {
        const picked = answers[qIdx];
        return (
          <div
            key={qIdx}
            className="rounded-xl border border-stone-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-sm font-semibold leading-snug">
              {qIdx + 1}. {q.question}
            </p>
            <div className="mt-2.5 space-y-1.5">
              {q.options.map((opt, oIdx) => {
                const isSelected = picked === oIdx;
                const isCorrect = oIdx === q.correct_index;

                let tone =
                  "border-stone-200 hover:border-indigo-300 dark:border-slate-800 dark:hover:border-indigo-700";
                if (submitted) {
                  if (isCorrect) {
                    tone =
                      "border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100";
                  } else if (isSelected && !isCorrect) {
                    tone =
                      "border-red-400 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100";
                  }
                } else if (isSelected) {
                  tone =
                    "border-indigo-500 bg-indigo-50 font-medium text-indigo-950 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-100";
                }

                return (
                  <button
                    key={oIdx}
                    type="button"
                    disabled={submitted}
                    onClick={() => setAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${tone}`}
                  >
                    <span>{opt}</span>
                    {submitted && isCorrect && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    )}
                    {submitted && isSelected && !isCorrect && (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                    )}
                  </button>
                );
              })}
            </div>

            {submitted && (
              <div className="mt-2.5 rounded-lg bg-stone-50 p-2.5 text-[11px] leading-relaxed text-stone-700 dark:bg-slate-800/70 dark:text-slate-300">
                <p>
                  <span className="font-semibold">Explanation: </span>
                  {q.explanation}
                </p>
                <p className="mt-1 text-stone-500 dark:text-slate-400">Ref: {q.source_ref}</p>
              </div>
            )}
          </div>
        );
      })}

      {!submitted && (
        <button
          type="button"
          disabled={Object.keys(answers).length < questions.length}
          onClick={() => setSubmitted(true)}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Check answers ({Object.keys(answers).length}/{questions.length})
        </button>
      )}
    </div>
  );
}
