import { MouseEvent, useRef, useState } from "react";
import { FileText, MessageSquare, Sparkles } from "lucide-react";
import type { ChatMessageRead, Citation, SourceRead, StudioFeature } from "../types/api";
import { ChatPanel } from "./ChatPanel";
import { SourcesPanel } from "./SourcesPanel";
import { StudioPanel } from "./StudioPanel";

interface NotebookWorkspaceProps {
  notebookId: string;
  sources: SourceRead[];
  loadingWorkspace: boolean;
  selectedSourceIds: string[];
  uploadProgress: number | null;
  onUpload: (files: File[]) => Promise<void>;
  onToggleSource: (sourceId: string) => void;
  onSelectAllSources: (allIds: string[], selected: boolean) => void;
  onDeleteSource: (sourceId: string) => Promise<void>;
  messages: ChatMessageRead[];
  isStreaming: boolean;
  pendingUserMessage: string | null;
  streamingText: string;
  streamingCitations: Citation[];
  streamingError: { message: string; hint?: string | null } | null;
  onSendMessage: (question: string) => Promise<void>;
  onStopStreaming: () => void;
  onClearChat: () => Promise<void>;
  onSelectCitation: (citation: Citation) => void;
  studioOutputs: Partial<Record<StudioFeature, unknown>>;
  activeStudioFeature: StudioFeature | null;
  loadingStudioFeature: StudioFeature | null;
  onSelectStudioFeature: (feature: StudioFeature | null) => void;
  onGenerateStudio: (feature: StudioFeature, options?: Record<string, unknown>) => Promise<void>;
}

export function NotebookWorkspace(props: NotebookWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(370);
  const [mobileTab, setMobileTab] = useState<"sources" | "chat" | "studio">("chat");

  const readySourceCount = props.sources.filter((s) => s.status === "ready").length;

  function startDrag(side: "left" | "right", e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startLeft = leftWidth;
    const startRight = rightWidth;

    const onMove = (moveEv: globalThis.MouseEvent) => {
      const dx = moveEv.clientX - startX;
      const total = containerRef.current?.clientWidth ?? 1200;
      if (side === "left") {
        const next = Math.max(220, Math.min(440, startLeft + dx));
        if (total - next - rightWidth >= 320) setLeftWidth(next);
      } else {
        const next = Math.max(280, Math.min(540, startRight - dx));
        if (total - leftWidth - next >= 320) setRightWidth(next);
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mobile / Tablet tab switcher (< lg) */}
      <div className="grid grid-cols-3 border-b border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("sources")}
          className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${
            mobileTab === "sources"
              ? "border-b-2 border-blue-600 text-blue-700 dark:text-blue-400"
              : "text-stone-500 dark:text-slate-400"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Sources ({props.sources.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${
            mobileTab === "chat"
              ? "border-b-2 border-blue-600 text-blue-700 dark:text-blue-400"
              : "text-stone-500 dark:text-slate-400"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("studio")}
          className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${
            mobileTab === "studio"
              ? "border-b-2 border-blue-600 text-blue-700 dark:text-blue-400"
              : "text-stone-500 dark:text-slate-400"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Studio
        </button>
      </div>

      {/* Desktop 3 resizable panels (lg+) & single active tab below lg */}
      <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden bg-slate-100/70 dark:bg-[#10131a]">
        <div
          style={{ width: `${leftWidth}px` }}
          className={`bg-white ${
            mobileTab === "sources" ? "flex w-full!" : "hidden"
          } min-h-0 shrink-0 flex-col border-r border-stone-200 dark:border-slate-800 lg:flex`}
        >
          <SourcesPanel
            notebookId={props.notebookId}
            sources={props.sources}
            loading={props.loadingWorkspace}
            selectedSourceIds={props.selectedSourceIds}
            uploadProgress={props.uploadProgress}
            onUpload={props.onUpload}
            onToggleSource={props.onToggleSource}
            onSelectAll={props.onSelectAllSources}
            onDeleteSource={props.onDeleteSource}
          />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sources panel"
          tabIndex={0}
          onMouseDown={(e) => startDrag("left", e)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setLeftWidth((w) => Math.max(220, w - 20));
            if (e.key === "ArrowRight") setLeftWidth((w) => Math.min(440, w + 20));
          }}
          className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200/80 transition hover:bg-blue-400 dark:bg-slate-800 dark:hover:bg-blue-600 lg:block"
        />

        <div
          className={`bg-white ${
            mobileTab === "chat" ? "flex" : "hidden"
          } min-h-0 min-w-0 flex-1 flex-col lg:flex`}
        >
          <ChatPanel
            messages={props.messages}
            loadingHistory={props.loadingWorkspace}
            readySourceCount={readySourceCount}
            selectedSourceCount={props.selectedSourceIds.length}
            isStreaming={props.isStreaming}
            pendingUserMessage={props.pendingUserMessage}
            streamingText={props.streamingText}
            streamingCitations={props.streamingCitations}
            streamingError={props.streamingError}
            onSendMessage={props.onSendMessage}
            onStopStreaming={props.onStopStreaming}
            onClearChat={props.onClearChat}
            onSelectCitation={props.onSelectCitation}
          />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize studio panel"
          tabIndex={0}
          onMouseDown={(e) => startDrag("right", e)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setRightWidth((w) => Math.min(540, w + 20));
            if (e.key === "ArrowRight") setRightWidth((w) => Math.max(280, w - 20));
          }}
          className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200/80 transition hover:bg-blue-400 dark:bg-slate-800 dark:hover:bg-blue-600 lg:block"
        />

        <div
          style={{ width: `${rightWidth}px` }}
          className={`bg-white ${
            mobileTab === "studio" ? "flex w-full!" : "hidden"
          } min-h-0 shrink-0 flex-col border-l border-stone-200 dark:border-slate-800 lg:flex`}
        >
          <StudioPanel
            outputs={props.studioOutputs}
            activeFeature={props.activeStudioFeature}
            loadingFeature={props.loadingStudioFeature}
            readySourceCount={readySourceCount}
            selectedSourceCount={props.selectedSourceIds.length}
            onSelectFeature={props.onSelectStudioFeature}
            onGenerate={props.onGenerateStudio}
          />
        </div>
      </div>
    </div>
  );
}
