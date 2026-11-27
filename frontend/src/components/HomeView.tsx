import { FormEvent, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Check, FileText, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { NotebookRead } from "../types/api";
import { ConfirmDialog } from "./ConfirmDialog";

interface HomeViewProps {
  notebooks: NotebookRead[];
  loading: boolean;
  busy: boolean;
  onCreate: (title: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpen: (id: string) => void;
}

export function HomeView({
  notebooks,
  loading,
  busy,
  onCreate,
  onRename,
  onDelete,
  onOpen,
}: HomeViewProps) {
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<NotebookRead | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notebooks;
    return notebooks.filter((nb) => nb.title.toLowerCase().includes(q));
  }, [notebooks, search]);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setValidationError("Enter a notebook title.");
      return;
    }
    setValidationError(null);
    await onCreate(trimmed);
    setTitle("");
  }

  async function handleRenameSubmit(id: string) {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setValidationError("Notebook title cannot be empty.");
      return;
    }
    setValidationError(null);
    await onRename(id, trimmed);
    setEditingId(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
      <div className="mb-6 max-w-2xl">
        <p className="mb-1 text-sm font-medium text-blue-700 dark:text-blue-300">Notebook workspace</p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Your notebooks</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">Create a focused workspace, add trusted sources, and ask grounded questions locally.</p>
      </div>
      <div className="nb-panel flex flex-col justify-between gap-4 rounded-3xl p-5 sm:flex-row sm:items-end">
        <form onSubmit={handleCreate} className="flex-1 space-y-2">
          <label htmlFor="notebook-title" className="block text-sm font-semibold">
            Create a new notebook
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="notebook-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (validationError) setValidationError(null);
              }}
              maxLength={200}
              placeholder="e.g., Distributed Systems Notes"
              className="nb-field min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="nb-primary inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Create notebook
            </button>
          </div>
          {validationError && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {validationError}
            </p>
          )}
        </form>

        <div className="w-full sm:w-64">
          <label htmlFor="notebook-search" className="sr-only">
            Search notebooks
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input
              id="notebook-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notebooks..."
              className="nb-field w-full rounded-xl py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">All notebooks <span className="ml-1 text-sm font-normal text-slate-500">({filtered.length})</span></h3>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="nb-panel h-36 animate-pulse rounded-2xl p-5"
              >
                <div className="h-5 w-2/3 rounded bg-stone-200 dark:bg-slate-800" />
                <div className="mt-4 h-4 w-1/3 rounded bg-stone-100 dark:bg-slate-800/70" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <BookOpen className="mx-auto h-10 w-10 text-stone-400" />
            <h3 className="mt-3 text-base font-semibold">
              {notebooks.length === 0 ? "No notebooks yet" : "No matching notebooks"}
            </h3>
            <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
              {notebooks.length === 0
                ? "Create your first notebook above to upload PDF, DOCX, or TXT files and chat locally."
                : "Try a different search query or create a new notebook."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((notebook) => {
              const isEditing = editingId === notebook.id;
              return (
                <motion.article
                  key={notebook.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                  className="group flex min-h-40 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(60,64,67,0.08)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_4px_12px_rgba(60,64,67,0.15)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
                >
                  <div>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          aria-label={`Rename ${notebook.title}`}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRenameSubmit(notebook.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          maxLength={200}
                          className="min-w-0 flex-1 rounded-lg border border-indigo-400 bg-transparent px-2.5 py-1 text-sm font-semibold focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Save notebook title"
                          onClick={() => void handleRenameSubmit(notebook.id)}
                          className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel rename"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-stone-300 p-1.5 hover:bg-stone-100 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpen(notebook.id)}
                        className="block w-full text-left"
                      >
                        <h3 className="line-clamp-2 text-base font-semibold text-slate-900 group-hover:text-blue-700 dark:text-stone-100 dark:group-hover:text-blue-400">
                          {notebook.title}
                        </h3>
                      </button>
                    )}

                    <div className="mt-3 flex items-center gap-2 text-xs text-stone-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                        <FileText className="h-3 w-3" />
                        {notebook.source_count} {notebook.source_count === 1 ? "source" : "sources"}
                      </span>
                      <span>Updated {new Date(notebook.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => onOpen(notebook.id)}
                      className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Open notebook →
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Rename ${notebook.title}`}
                        onClick={() => {
                          setEditingId(notebook.id);
                          setEditTitle(notebook.title);
                        }}
                        className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-stone-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${notebook.title}`}
                        onClick={() => setConfirmDelete(notebook)}
                        className="rounded-lg p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete notebook?"
        description={`Delete "${confirmDelete?.title ?? ""}" and all of its uploaded documents, vector embeddings, chat history, and studio outputs? This cannot be undone.`}
        confirmLabel="Delete notebook"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            const target = confirmDelete;
            setConfirmDelete(null);
            void onDelete(target.id);
          }
        }}
      />
    </div>
  );
}
