import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export function Toast() {
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(clearToast, 6000);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;

  const palette =
    toast.type === "error"
      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/95 dark:text-red-100"
      : toast.type === "success"
        ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/95 dark:text-emerald-100"
        : "border-stone-300 bg-white text-stone-900 dark:border-slate-700 dark:bg-slate-900 dark:text-stone-100";

  const Icon = toast.type === "error" ? AlertCircle : toast.type === "success" ? CheckCircle2 : Info;

  return (
    <div
      role="alert"
      className={`fixed bottom-4 right-4 z-50 flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${palette}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{toast.message}</p>
        {toast.hint && <p className="mt-0.5 text-xs opacity-85">{toast.hint}</p>}
      </div>
      <button
        type="button"
        onClick={clearToast}
        aria-label="Dismiss notification"
        className="rounded p-0.5 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
