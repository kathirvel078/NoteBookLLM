import { AlertTriangle, ArrowLeft, BookOpen, Moon, RefreshCw, Sun, Terminal } from "lucide-react";
import type { HealthResponse } from "../types/api";

interface HeaderProps {
  health: HealthResponse | null;
  healthError: boolean;
  onRetryHealth: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  activeNotebookTitle: string | null;
  onBackHome: () => void;
}

export function Header({
  health,
  healthError,
  onRetryHealth,
  theme,
  onToggleTheme,
  activeNotebookTitle,
  onBackHome,
}: HeaderProps) {
  const isOk = health?.status === "ok";
  const isDegraded = health?.status === "degraded";

  const dotColor = healthError
    ? "bg-red-500"
    : isOk
      ? "bg-emerald-500"
      : isDegraded
        ? "bg-amber-500"
        : "bg-stone-400";

  const badgeTone = healthError
    ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
    : isOk
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
      : isDegraded
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
        : "border-stone-200 bg-stone-100 text-stone-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";

  const statusText = healthError
    ? "Backend unreachable"
    : isOk
      ? `Ollama ready · ${health.ollama.model}`
      : isDegraded
        ? health.ollama.reachable
          ? `Model missing (${health.ollama.model})`
          : "Ollama offline"
        : "Checking services…";

  const bannerCommand = healthError
    ? "uvicorn app.main:app --host 127.0.0.1 --port 8000"
    : health?.hint || "ollama serve";

  return (
    <header className="shrink-0 border-b border-slate-200/90 bg-white/95 shadow-[0_1px_2px_rgba(60,64,67,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {activeNotebookTitle ? (
            <button
              type="button"
              onClick={onBackHome}
              aria-label="Back to notebooks"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Notebooks</span>
            </button>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_2px_5px_rgba(26,115,232,0.3)]">
              <BookOpen className="h-4 w-4" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                {activeNotebookTitle ?? "LocalLM Notebook"}
              </h1>
              {activeNotebookTitle && (
                  <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 md:inline">
                  LocalLM Notebook
                </span>
              )}
            </div>
            {!activeNotebookTitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                100% local document research powered by Ollama
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="status"
            aria-label="Local AI status"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${badgeTone}`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            <span className="max-w-[160px] truncate sm:max-w-none">{statusText}</span>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            className="nb-icon-button inline-flex h-9 items-center gap-1.5 px-2.5 text-xs font-medium"
          >
            {theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{theme === "light" ? "Dark" : "Light"}</span>
          </button>
        </div>
      </div>

      {(isDegraded || healthError) && (
        <div
          role="alert"
          className={`flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs sm:px-6 ${
            healthError
              ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/70 dark:text-red-100"
              : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/70 dark:text-amber-100"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">
              {healthError
                ? "Cannot reach FastAPI backend."
                : health?.message || "Local AI service is degraded."}
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-black/10 px-2 py-0.5 font-mono text-[11px] dark:bg-white/10">
              <Terminal className="h-3 w-3" />
              {bannerCommand}
            </span>
          </div>
          <button
            type="button"
            onClick={onRetryHealth}
            className="inline-flex items-center gap-1 rounded border border-current/25 px-2 py-0.5 font-medium hover:bg-black/5 dark:hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}
    </header>
  );
}
