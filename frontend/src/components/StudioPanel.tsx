import { useState } from "react";
import {
  BookOpenCheck,
  CalendarClock,
  FileBarChart2,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  Network,
  RefreshCw,
  Volume2,
} from "lucide-react";
import type {
  AudioOverviewResponse,
  FlashcardsOutput,
  MindMapOutput,
  QuizOutput,
  ReportOutput,
  StudioFeature,
  StudyGuideOutput,
  SummaryOutput,
  TimelineOutput,
} from "../types/api";
import { AudioOverviewRenderer } from "./studio/AudioOverviewRenderer";
import { FlashcardsRenderer } from "./studio/FlashcardsRenderer";
import { MindMapRenderer } from "./studio/MindMapRenderer";
import { QuizRenderer } from "./studio/QuizRenderer";
import { ReportRenderer } from "./studio/ReportRenderer";
import { StudyGuideRenderer } from "./studio/StudyGuideRenderer";
import { SummaryRenderer } from "./studio/SummaryRenderer";
import { TimelineRenderer } from "./studio/TimelineRenderer";

interface StudioPanelProps {
  outputs: Partial<Record<StudioFeature, unknown>>;
  activeFeature: StudioFeature | null;
  loadingFeature: StudioFeature | null;
  readySourceCount: number;
  selectedSourceCount: number;
  onSelectFeature: (feature: StudioFeature | null) => void;
  onGenerate: (feature: StudioFeature, options?: Record<string, unknown>) => Promise<void>;
}

const STUDIO_TILES: Array<{
  id: StudioFeature;
  label: string;
  desc: string;
  icon: typeof FileText;
}> = [
  { id: "summary", label: "Summary", desc: "Key takeaways", icon: FileText },
  { id: "study_guide", label: "Study guide", desc: "Terms & Qs", icon: BookOpenCheck },
  { id: "flashcards", label: "Flashcards", desc: "Flip-card deck", icon: Layers },
  { id: "quiz", label: "Quiz", desc: "Practice MCQ", icon: HelpCircle },
  { id: "mindmap", label: "Mind map", desc: "Concept graph", icon: Network },
  { id: "timeline", label: "Timeline", desc: "Dated events", icon: CalendarClock },
  { id: "report", label: "Report", desc: "Export .md", icon: FileBarChart2 },
  { id: "audio_overview", label: "Audio overview", desc: "2-host script", icon: Volume2 },
];

export function StudioPanel({
  outputs,
  activeFeature,
  loadingFeature,
  readySourceCount,
  selectedSourceCount,
  onSelectFeature,
  onGenerate,
}: StudioPanelProps) {
  const [flashcardCount, setFlashcardCount] = useState(10);
  const [quizCount, setQuizCount] = useState(5);

  const activeData = activeFeature ? outputs[activeFeature] : undefined;
  const activeMeta = STUDIO_TILES.find((t) => t.id === activeFeature);

  const optionsFor = (feature: StudioFeature): Record<string, unknown> | undefined => {
    if (feature === "flashcards") return { count: flashcardCount };
    if (feature === "quiz") return { count: quizCount };
    return undefined;
  };

  function handleTileClick(feature: StudioFeature) {
    if (outputs[feature]) {
      onSelectFeature(feature);
      return;
    }
    onSelectFeature(feature);
    void onGenerate(feature, optionsFor(feature));
  }

  return (
    <section aria-label="Studio" className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold tracking-tight">Studio</h2>
        <p className="text-[11px] text-stone-500 dark:text-slate-400">
          Generate grounded outputs from {selectedSourceCount || readySourceCount} active{" "}
          {(selectedSourceCount || readySourceCount) === 1 ? "source" : "sources"}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5">
        <div className="grid grid-cols-2 gap-2">
          {STUDIO_TILES.map((tile) => {
            const Icon = tile.icon;
            const isLoading = loadingFeature === tile.id;
            const hasSaved = Boolean(outputs[tile.id]);
            const isActive = activeFeature === tile.id;

            return (
              <button
                key={tile.id}
                type="button"
                disabled={readySourceCount === 0 || loadingFeature !== null}
                onClick={() => handleTileClick(tile.id)}
                className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition disabled:opacity-50 ${
                  isActive
                    ? "border-blue-500 bg-blue-50/70 shadow-sm dark:border-blue-500 dark:bg-blue-950/40"
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-blue-700 dark:hover:bg-slate-900"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  )}
                  {hasSaved && !isLoading && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Saved
                    </span>
                  )}
                </div>
                <span className="mt-2 text-xs font-semibold text-stone-900 dark:text-stone-100">
                  {tile.label}
                </span>
                <span className="text-[10px] text-stone-500 dark:text-slate-400">
                  {isLoading ? "Generating…" : tile.desc}
                </span>
              </button>
            );
          })}
        </div>

        {(activeFeature === "flashcards" || activeFeature === "quiz") && (
          <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
            <label htmlFor="studio-count-select" className="font-medium">
              {activeFeature === "flashcards" ? "Flashcard count" : "Question count"}
            </label>
            <select
              id="studio-count-select"
              value={activeFeature === "flashcards" ? flashcardCount : quizCount}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (activeFeature === "flashcards") setFlashcardCount(val);
                else setQuizCount(val);
              }}
              className="rounded border border-stone-300 bg-white px-2 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              {(activeFeature === "flashcards" ? [5, 10, 15, 20] : [3, 5, 10]).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}

        {loadingFeature && loadingFeature === activeFeature && !activeData && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/40 p-6 text-center dark:border-indigo-900 dark:bg-indigo-950/20">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600 dark:text-indigo-400" />
            <p className="mt-2 text-xs font-semibold">
              Generating {activeMeta?.label ?? "Studio output"} with local Llama…
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500 dark:text-slate-400">
              Grounded synthesis can take 15–90 seconds on CPU.
            </p>
          </div>
        )}

        {activeFeature && activeData !== undefined && (
          <div className="space-y-3 border-t border-stone-200 pt-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-slate-400">
                {activeMeta?.label}
              </h3>
              <button
                type="button"
                disabled={loadingFeature !== null}
                onClick={() => void onGenerate(activeFeature, optionsFor(activeFeature))}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-medium hover:bg-stone-100 disabled:opacity-50 dark:border-slate-800 dark:hover:bg-slate-900"
              >
                <RefreshCw className={`h-3 w-3 ${loadingFeature === activeFeature ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            </div>

            {activeFeature === "summary" && <SummaryRenderer data={activeData as SummaryOutput} />}
            {activeFeature === "study_guide" && (
              <StudyGuideRenderer data={activeData as StudyGuideOutput} />
            )}
            {activeFeature === "flashcards" && (
              <FlashcardsRenderer data={activeData as FlashcardsOutput} />
            )}
            {activeFeature === "quiz" && <QuizRenderer data={activeData as QuizOutput} />}
            {activeFeature === "mindmap" && <MindMapRenderer data={activeData as MindMapOutput} />}
            {activeFeature === "timeline" && (
              <TimelineRenderer data={activeData as TimelineOutput} />
            )}
            {activeFeature === "report" && <ReportRenderer data={activeData as ReportOutput} />}
            {activeFeature === "audio_overview" && (
              <AudioOverviewRenderer data={activeData as AudioOverviewResponse} />
            )}
          </div>
        )}

        {!activeFeature && readySourceCount > 0 && (
          <div className="rounded-xl border border-dashed border-stone-200 p-4 text-center text-xs text-stone-500 dark:border-slate-800 dark:text-slate-400">
            Pick a Studio tile above to synthesize notes, flashcards, quizzes, mind maps, reports, or an audio overview.
          </div>
        )}
      </div>
    </section>
  );
}
