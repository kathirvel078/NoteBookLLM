import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import type { FlashcardsOutput } from "../../types/api";

export function FlashcardsRenderer({ data }: { data: FlashcardsOutput }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const cards = data.cards;
  if (cards.length === 0) {
    return <p className="text-xs text-stone-500">No flashcards generated.</p>;
  }

  const safeIndex = Math.min(index, cards.length - 1);
  const card = cards[safeIndex];

  const goTo = (nextIdx: number) => {
    setFlipped(false);
    setIndex((nextIdx + cards.length) % cards.length);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-stone-500 dark:text-slate-400">
        <span>
          Card {safeIndex + 1} of {cards.length}
        </span>
        <span className="inline-flex items-center gap-1">
          <RotateCw className="h-3 w-3" /> Click card to flip
        </span>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show flashcard front" : "Show flashcard back"}
        className="perspective-1000 block w-full text-left"
      >
        <div
          className={`preserve-3d relative min-h-[180px] w-full transition-transform duration-500 ${
            flipped ? "rotate-y-180" : ""
          }`}
        >
          <div className="backface-hidden absolute inset-0 flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Prompt
            </span>
            <p className="my-auto text-sm font-semibold leading-relaxed text-stone-900 dark:text-stone-100">
              {card.front}
            </p>
            <span className="truncate text-[11px] text-stone-400">{card.source_ref}</span>
          </div>

          <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col justify-between rounded-2xl border border-indigo-300 bg-indigo-50 p-5 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Answer
            </span>
            <p className="my-auto text-sm leading-relaxed text-stone-900 dark:text-stone-100">
              {card.back}
            </p>
            <span className="truncate text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
              {card.source_ref}
            </span>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(safeIndex - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:border-slate-800 dark:hover:bg-slate-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => goTo(safeIndex + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:border-slate-800 dark:hover:bg-slate-900"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
