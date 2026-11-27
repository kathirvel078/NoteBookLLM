import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "./api/client";
import { CitationDrawer } from "./components/CitationDrawer";
import { Header } from "./components/Header";
import { HomeView } from "./components/HomeView";
import { NotebookWorkspace } from "./components/NotebookWorkspace";
import { Toast } from "./components/Toast";
import { useStreamingChat } from "./hooks/useStreamingChat";
import { useAppStore } from "./store/useAppStore";
import type {
  ChatMessageRead,
  HealthResponse,
  NotebookRead,
  SourceRead,
  StudioFeature,
} from "./types/api";

function parseApiError(error: unknown): { message: string; hint?: string | null } {
  if (error instanceof ApiError) {
    return { message: error.message, hint: error.hint };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: "An unexpected error occurred." };
}

export default function App() {
  const activeNotebookId = useAppStore((s) => s.activeNotebookId);
  const setActiveNotebookId = useAppStore((s) => s.setActiveNotebookId);
  const deselectedSourcesByNb = useAppStore((s) => s.deselectedSourcesByNb);
  const toggleSourceSelected = useAppStore((s) => s.toggleSourceSelected);
  const setAllSourcesSelected = useAppStore((s) => s.setAllSourcesSelected);
  const activeCitation = useAppStore((s) => s.activeCitation);
  const setActiveCitation = useAppStore((s) => s.setActiveCitation);
  const activeStudioFeature = useAppStore((s) => s.activeStudioFeature);
  const setActiveStudioFeature = useAppStore((s) => s.setActiveStudioFeature);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const showToast = useAppStore((s) => s.showToast);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [notebooks, setNotebooks] = useState<NotebookRead[]>([]);
  const [loadingNotebooks, setLoadingNotebooks] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [sources, setSources] = useState<SourceRead[]>([]);
  const [messages, setMessages] = useState<ChatMessageRead[]>([]);
  const [studioOutputs, setStudioOutputs] = useState<Partial<Record<StudioFeature, unknown>>>({});
  const [loadingStudioFeature, setLoadingStudioFeature] = useState<StudioFeature | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const streaming = useStreamingChat();

  const checkHealth = useCallback(async () => {
    try {
      const h = await api.getHealth();
      setHealth(h);
      setHealthError(false);
    } catch {
      setHealth(null);
      setHealthError(true);
    }
  }, []);

  const refreshNotebooks = useCallback(async () => {
    try {
      const list = await api.listNotebooks();
      setNotebooks(list);
    } catch (caught) {
      const parsed = parseApiError(caught);
      showToast("error", parsed.message, parsed.hint);
    } finally {
      setLoadingNotebooks(false);
    }
  }, [showToast]);

  const refreshWorkspace = useCallback(
    async (notebookId: string, showSkeleton = false) => {
      if (showSkeleton) setLoadingWorkspace(true);
      try {
        const [loadedSources, history, savedStudio] = await Promise.all([
          api.listSources(notebookId),
          api.getChatHistory(notebookId),
          api.listStudioSaved(notebookId),
        ]);
        setSources(loadedSources);
        setMessages(history);
        const map: Partial<Record<StudioFeature, unknown>> = {};
        for (const item of savedStudio) {
          map[item.feature as StudioFeature] = item.payload;
        }
        setStudioOutputs(map);
      } catch (caught) {
        const parsed = parseApiError(caught);
        showToast("error", parsed.message, parsed.hint);
      } finally {
        if (showSkeleton) setLoadingWorkspace(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    void refreshNotebooks();
    void checkHealth();
    const poller = window.setInterval(() => {
      void checkHealth();
    }, 15_000);
    return () => window.clearInterval(poller);
  }, [checkHealth, refreshNotebooks]);

  useEffect(() => {
    if (!activeNotebookId) {
      setSources([]);
      setMessages([]);
      setStudioOutputs({});
      return;
    }
    void refreshWorkspace(activeNotebookId, true);
  }, [activeNotebookId, refreshWorkspace]);

  // Poll source ingestion status while any source is processing
  useEffect(() => {
    if (!activeNotebookId || !sources.some((s) => s.status === "processing")) {
      return;
    }
    const poller = window.setInterval(() => {
      void api
        .listSources(activeNotebookId)
        .then(setSources)
        .catch((caught: unknown) => {
          const parsed = parseApiError(caught);
          showToast("error", parsed.message, parsed.hint);
        });
    }, 2_000);
    return () => window.clearInterval(poller);
  }, [activeNotebookId, sources, showToast]);

  const activeNotebook = useMemo(
    () => notebooks.find((n) => n.id === activeNotebookId) ?? null,
    [notebooks, activeNotebookId],
  );

  const selectedSourceIds = useMemo(() => {
    const deselected = new Set(deselectedSourcesByNb[activeNotebookId ?? ""] ?? []);
    return sources
      .filter((s) => s.status === "ready" && !deselected.has(s.id))
      .map((s) => s.id);
  }, [activeNotebookId, deselectedSourcesByNb, sources]);

  async function handleCreateNotebook(title: string) {
    setBusy(true);
    try {
      const created = await api.createNotebook(title);
      await refreshNotebooks();
      setActiveNotebookId(created.id);
      showToast("success", `Created "${created.title}"`);
    } catch (caught) {
      const parsed = parseApiError(caught);
      showToast("error", parsed.message, parsed.hint);
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameNotebook(id: string, title: string) {
    try {
      await api.renameNotebook(id, title);
      await refreshNotebooks();
      showToast("success", "Notebook renamed");
    } catch (caught) {
      const parsed = parseApiError(caught);
      showToast("error", parsed.message, parsed.hint);
    }
  }

  async function handleDeleteNotebook(id: string) {
    try {
      await api.deleteNotebook(id);
      if (activeNotebookId === id) setActiveNotebookId(null);
      await refreshNotebooks();
      showToast("info", "Notebook deleted");
    } catch (caught) {
      const parsed = parseApiError(caught);
      showToast("error", parsed.message, parsed.hint);
    }
  }

  async function handleUploadSources(files: File[]) {
    if (!activeNotebookId || files.length === 0) return;
    setUploadProgress(0);
    try {
      const res = await api.uploadSources(activeNotebookId, files, setUploadProgress);
      await refreshWorkspace(activeNotebookId);
      await refreshNotebooks();
      showToast("success", `Uploaded ${res.uploaded.length} file(s) for indexing`);
    } catch (caught) {
      const parsed = parseApiError(caught);
      showToast("error", parsed.message, parsed.hint);
    } finally {
      setUploadProgress(null);
    }
  }

  async function handleDeleteSource(sourceId: string) {
    if (!activeNotebookId) return;
    try {
      await api.deleteSource(sourceId);
      await refreshWorkspace(activeNotebookId);
      await refreshNotebooks();
      showToast("info", "Source deleted");
    } catch (caught) {
      const parsed = parseApiError(caught);
      showToast("error", parsed.message, parsed.hint);
    }
  }

  async function handleSendMessage(question: string) {
    if (!activeNotebookId) return;
    await streaming.sendMessage({
      notebookId: activeNotebookId,
      message: question,
      sourceIds: selectedSourceIds,
      onComplete: () => {
        void refreshWorkspace(activeNotebookId);
      },
    });
  }

  async function handleClearChat() {
    if (!activeNotebookId) return;
    try {
      await api.clearChat(activeNotebookId);
      setMessages([]);
      setActiveCitation(null);
      showToast("info", "Chat history cleared");
    } catch (caught) {
      const parsed = parseApiError(caught);
      showToast("error", parsed.message, parsed.hint);
    }
  }

  async function handleGenerateStudio(
    feature: StudioFeature,
    options?: Record<string, unknown>,
  ) {
    if (!activeNotebookId) return;
    setActiveStudioFeature(feature);
    setLoadingStudioFeature(feature);
    try {
      const result = await api.generateStudio(feature, {
        notebook_id: activeNotebookId,
        source_ids: selectedSourceIds,
        options,
      });
      setStudioOutputs((prev) => ({ ...prev, [feature]: result }));
    } catch (caught) {
      const parsed = parseApiError(caught);
      showToast("error", parsed.message, parsed.hint);
    } finally {
      setLoadingStudioFeature(null);
    }
  }

  return (
    <div className="nb-shell flex h-screen flex-col text-stone-900 dark:text-stone-100">
      <Header
        health={health}
        healthError={healthError}
        onRetryHealth={() => void checkHealth()}
        theme={theme}
        onToggleTheme={toggleTheme}
        activeNotebookTitle={activeNotebook?.title ?? null}
        onBackHome={() => {
          streaming.stopStreaming();
          setActiveNotebookId(null);
        }}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!activeNotebookId ? (
          <HomeView
            notebooks={notebooks}
            loading={loadingNotebooks}
            busy={busy}
            onCreate={handleCreateNotebook}
            onRename={handleRenameNotebook}
            onDelete={handleDeleteNotebook}
            onOpen={(id) => setActiveNotebookId(id)}
          />
        ) : (
          <NotebookWorkspace
            notebookId={activeNotebookId}
            sources={sources}
            loadingWorkspace={loadingWorkspace}
            selectedSourceIds={selectedSourceIds}
            uploadProgress={uploadProgress}
            onUpload={handleUploadSources}
            onToggleSource={(sid) => toggleSourceSelected(activeNotebookId, sid)}
            onSelectAllSources={(allIds, selected) =>
              setAllSourcesSelected(activeNotebookId, allIds, selected)
            }
            onDeleteSource={handleDeleteSource}
            messages={messages}
            isStreaming={streaming.isStreaming}
            pendingUserMessage={streaming.pendingUserMessage}
            streamingText={streaming.streamingText}
            streamingCitations={streaming.streamingCitations}
            streamingError={streaming.error}
            onSendMessage={handleSendMessage}
            onStopStreaming={streaming.stopStreaming}
            onClearChat={handleClearChat}
            onSelectCitation={setActiveCitation}
            studioOutputs={studioOutputs}
            activeStudioFeature={activeStudioFeature}
            loadingStudioFeature={loadingStudioFeature}
            onSelectStudioFeature={setActiveStudioFeature}
            onGenerateStudio={handleGenerateStudio}
          />
        )}
      </main>

      <CitationDrawer citation={activeCitation} onClose={() => setActiveCitation(null)} />
      <Toast />
    </div>
  );
}
