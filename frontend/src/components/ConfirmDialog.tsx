import { AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div
            className={`rounded-full p-2 ${
              danger
                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                : "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 id="confirm-dialog-title" className="text-base font-semibold">
              {title}
            </h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>}
    </AnimatePresence>
  );
}
