import { Info, Volume2 } from "lucide-react";
import { apiUrl } from "../../api/client";
import type { AudioOverviewResponse } from "../../types/api";

export function AudioOverviewRenderer({ data }: { data: AudioOverviewResponse }) {
  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-xl border border-stone-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-sm font-bold">{data.title}</h3>
        </div>

        {data.audio_url ? (
          <div className="mt-3">
            <audio controls className="w-full" src={apiUrl(data.audio_url)}>
              Your browser does not support audio playback.
            </audio>
            {data.tts_engine && (
              <p className="mt-1 text-[11px] text-stone-500 dark:text-slate-400">
                Synthesized locally using {data.tts_engine}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {data.tts_message ||
                "No local TTS engine is available; showing the generated two-host script only."}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
          Transcript ({data.turns.length} turns)
        </h4>
        {data.turns.map((turn, idx) => {
          const isHostA = turn.speaker === "Host A";
          return (
            <div
              key={idx}
              className={`rounded-xl border p-3 ${
                isHostA
                  ? "border-indigo-200/80 bg-indigo-50/50 dark:border-indigo-900/60 dark:bg-indigo-950/30"
                  : "border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {turn.speaker}
              </p>
              <p className="mt-1 leading-relaxed text-stone-800 dark:text-slate-200">{turn.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
