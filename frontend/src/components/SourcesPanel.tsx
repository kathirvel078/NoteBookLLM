import { DragEvent, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Search, Trash2, Upload, XCircle } from "lucide-react";
import type { SourceRead } from "../types/api";
import { ConfirmDialog } from "./ConfirmDialog";

interface SourcesPanelProps {
  notebookId: string;
  sources: SourceRead[];
  loading: boolean;
  selectedSourceIds: string[];
  uploadProgress: number | null;
  onUpload: (files: File[]) => Promise<void>;
  onToggleSource: (sourceId: string) => void;
  onSelectAll: (allReadyIds: string[], selected: boolean) => void;
  onDeleteSource: (sourceId: string) => Promise<void>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SourcesPanel({
  sources,
  loading,
  selectedSourceIds,
  uploadProgress,
  onUpload,
  onToggleSource,
  onSelectAll,
  onDeleteSource,
}: SourcesPanelProps) {
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<SourceRead | null>(null);

  const readyIds = useMemo(
    () => sources.filter((s) => s.status === "ready").map((s) => s.id),
    [sources],
  );
  const allSelected = readyIds.length > 0 && readyIds.every((id) => selectedSourceIds.includes(id));

  const filteredSources = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => s.filename.toLowerCase().includes(q));
  }, [sources, search]);

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) {
      void onUpload(Array.from(e.dataTransfer.files));
    }
  }

  return (
    <section aria-label="Sources" className="flex h-full min-h-0 flex-col bg-white dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Sources</h2>
          <p className="text-[11px] text-stone-500 dark:text-slate-400">
            {selectedSourceIds.length} of {readyIds.length} ready selected
          </p>
        </div>
        {readyIds.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectAll(readyIds, !allSelected)}
            className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      <div className="border-b border-slate-200 p-3.5 dark:border-slate-800">
        <label
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-4 text-center transition ${
            dragging
              ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/30"
              : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-700 dark:hover:bg-slate-900"
          }`}
        >
          <input
            aria-label="Upload sources"
            type="file"
            accept=".pdf,.txt,.docx"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) {
                void onUpload(Array.from(e.target.files));
                e.target.value = "";
              }
            }}
          />
          <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span className="mt-1.5 text-xs font-medium">Drop or click to upload</span>
          <span className="mt-0.5 text-[11px] text-stone-500 dark:text-slate-400">
            PDF, DOCX, or TXT (max 25 MB)
          </span>
        </label>

        {uploadProgress !== null && (
          <div className="mt-2.5 space-y-1">
            <div className="flex justify-between text-[11px] font-medium">
              <span>Uploading…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {sources.length > 0 && (
          <div className="relative mt-2.5">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
            <input
              type="search"
              aria-label="Filter sources"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter sources..."
              className="nb-field w-full rounded-lg py-1.5 pl-8 pr-2.5 text-xs"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-stone-200 bg-stone-50 dark:border-slate-800 dark:bg-slate-900"
              />
            ))}
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="py-10 text-center text-xs text-stone-500 dark:text-slate-400">
            <FileText className="mx-auto h-7 w-7 opacity-40" />
            <p className="mt-2 font-medium">
              {sources.length === 0 ? "No sources uploaded yet" : "No sources match your filter"}
            </p>
            <p className="mt-1">Upload documents above to ground chat & Studio.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredSources.map((source) => {
              const checked = selectedSourceIds.includes(source.id);
              return (
                <li
                  key={source.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-xs shadow-[0_1px_1px_rgba(60,64,67,0.05)] dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex items-start gap-2">
                    <input
                      aria-label={`Use ${source.filename}`}
                      type="checkbox"
                      checked={checked}
                      disabled={source.status !== "ready"}
                      onChange={() => onToggleSource(source.id)}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-stone-900 dark:text-stone-100" title={source.filename}>
                        {source.filename}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {source.status === "ready" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            ready
                          </span>
                        )}
                        {source.status === "processing" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            processing
                          </span>
                        )}
                        {source.status === "failed" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
                            <XCircle className="h-3 w-3" />
                            failed
                          </span>
                        )}
                        <span className="uppercase text-[10px] text-stone-500 dark:text-slate-400">
                          {source.file_type} · {formatSize(source.size_bytes)}
                          {source.page_count ? ` · ${source.page_count}p` : ""}
                        </span>
                      </div>
                      {source.warning_message && (
                        <p className="mt-1.5 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{source.warning_message}</span>
                        </p>
                      )}
                      {source.error_message && (
                        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                          {source.error_message}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete source ${source.filename}`}
                      onClick={() => setConfirmDelete(source)}
                      className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete source?"
        description={`Remove "${confirmDelete?.filename ?? ""}" and its vector embeddings from this notebook?`}
        confirmLabel="Delete source"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            const target = confirmDelete;
            setConfirmDelete(null);
            void onDeleteSource(target.id);
          }
        }}
      />
    </section>
  );
}
