import { Children, FormEvent, ReactNode, isValidElement, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eraser, Loader2, MessageSquare, Send, Sparkles, Square } from "lucide-react";
import type { ChatMessageRead, Citation } from "../types/api";
import { ConfirmDialog } from "./ConfirmDialog";

interface ChatPanelProps {
  messages: ChatMessageRead[];
  loadingHistory: boolean;
  readySourceCount: number;
  selectedSourceCount: number;
  isStreaming: boolean;
  pendingUserMessage: string | null;
  streamingText: string;
  streamingCitations: Citation[];
  streamingError: { message: string; hint?: string | null } | null;
  onSendMessage: (question: string) => Promise<void>;
  onStopStreaming: () => void;
  onClearChat: () => Promise<void>;
  onSelectCitation: (citation: Citation) => void;
}

const CITATION_REGEX = /\[(\d+)\]/g;

function renderTextWithCitations(
  text: string,
  citations: Citation[],
  onSelectCitation: (citation: Citation) => void,
): ReactNode {
  const byIdx = new Map(citations.map((c) => [c.index, c]));
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CITATION_REGEX)) {
    const idx = Number(match[1]);
    const matchStart = match.index ?? 0;
    if (matchStart > lastIndex) {
      parts.push(text.slice(lastIndex, matchStart));
    }
    const cit = byIdx.get(idx);
    if (cit) {
      parts.push(
        <button
          key={`cit-${matchStart}-${idx}`}
          type="button"
          onClick={() => onSelectCitation(cit)}
          title={`${cit.filename}${cit.page_start ? ` (p.${cit.page_start})` : ""}`}
          className="mx-0.5 inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
        >
          [{idx}]
        </button>,
      );
    } else {
      parts.push(match[0]);
    }
    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

function processMarkdownChildren(
  children: ReactNode,
  citations: Citation[],
  onSelectCitation: (citation: Citation) => void,
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return renderTextWithCitations(child, citations, onSelectCitation);
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      return {
        ...child,
        props: {
          ...child.props,
          children: processMarkdownChildren(child.props.children, citations, onSelectCitation),
        },
      };
    }
    return child;
  });
}

function MarkdownWithCitations({
  content,
  citations,
  onSelectCitation,
}: {
  content: string;
  citations: Citation[];
  onSelectCitation: (citation: Citation) => void;
}) {
  return (
    <div className="prose prose-sm prose-stone max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{processMarkdownChildren(children, citations, onSelectCitation)}</p>,
          li: ({ children }) => <li>{processMarkdownChildren(children, citations, onSelectCitation)}</li>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function ChatPanel({
  messages,
  loadingHistory,
  readySourceCount,
  selectedSourceCount,
  isStreaming,
  pendingUserMessage,
  streamingText,
  streamingCitations,
  streamingError,
  onSendMessage,
  onStopStreaming,
  onClearChat,
  onSelectCitation,
}: ChatPanelProps) {
  const [question, setQuestion] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText, isStreaming]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) {
      setValidationError("Enter a question.");
      return;
    }
    setValidationError(null);
    setQuestion("");
    await onSendMessage(trimmed);
  }

  return (
    <section
      aria-label="Chat"
      className="flex h-full min-h-0 flex-col bg-[#f8fafd] dark:bg-slate-950/60"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Chat</h2>
          <p className="text-[11px] text-stone-500 dark:text-slate-400">
            {readySourceCount === 0
              ? "Upload a document to begin"
              : `Using ${selectedSourceCount} selected ${selectedSourceCount === 1 ? "source" : "sources"}`}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={isStreaming}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear chat
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {loadingHistory ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              />
            ))}
          </div>
        ) : messages.length === 0 && !pendingUserMessage ? (
          <div className="mx-auto max-w-md py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Ask questions about your sources</h3>
            <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
              Every answer is grounded strictly in the checked sources with clickable page or section citations.
            </p>
            {readySourceCount > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {[
                  "Summarize the main findings",
                  "What are the key concepts?",
                  "List any dates or milestones",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void onSendMessage(prompt)}
                    className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium hover:border-indigo-300 hover:bg-indigo-50/60 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isLatestAssistant =
                msg.role === "assistant" && idx === messages.length - 1 && !isStreaming;
              return (
                <article
                  key={msg.id}
                  className={`rounded-2xl p-4 ${
                    msg.role === "user"
                      ? "ml-auto max-w-2xl bg-indigo-600 text-white shadow-sm"
                      : "border border-stone-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  }`}
                >
                  <p
                    className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${
                      msg.role === "user" ? "text-indigo-100" : "text-stone-400 dark:text-slate-500"
                    }`}
                  >
                    {msg.role === "user" ? "You" : "LocalLM Assistant"}
                  </p>

                  {msg.role === "assistant" ? (
                    <MarkdownWithCitations
                      content={msg.content}
                      citations={msg.citations}
                      onSelectCitation={onSelectCitation}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  )}

                  {msg.role === "assistant" && msg.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2.5 dark:border-slate-800">
                      {msg.citations.map((cit) => (
                        <button
                          key={`${msg.id}-${cit.index}`}
                          type="button"
                          onClick={() => onSelectCitation(cit)}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium text-stone-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-stone-200 dark:hover:border-indigo-600"
                        >
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">
                            [{cit.index}]
                          </span>
                          <span className="max-w-[160px] truncate">{cit.filename}</span>
                          {cit.page_start && (
                            <span className="text-[10px] text-stone-500 dark:text-slate-400">
                              p.{cit.page_start}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {isLatestAssistant && msg.suggested_questions.length > 0 && (
                    <div className="mt-3 border-t border-stone-100 pt-2.5 dark:border-slate-800">
                      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-stone-500 dark:text-slate-400">
                        <Sparkles className="h-3 w-3" />
                        Suggested follow-ups
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggested_questions.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => void onSendMessage(q)}
                            className="rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1 text-left text-xs font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200 dark:hover:bg-indigo-900/60"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {pendingUserMessage && (
              <article className="ml-auto max-w-2xl rounded-2xl bg-indigo-600 p-4 text-white shadow-sm">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-100">
                  You
                </p>
                <p className="whitespace-pre-wrap text-sm">{pendingUserMessage}</p>
              </article>
            )}

            {isStreaming && (
              <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Generating grounded answer…</span>
                </div>
                {streamingText ? (
                  <MarkdownWithCitations
                    content={streamingText}
                    citations={streamingCitations}
                    onSelectCitation={onSelectCitation}
                  />
                ) : (
                  <p className="text-sm text-stone-500 dark:text-slate-400">Thinking…</p>
                )}
                {streamingCitations.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2.5 dark:border-slate-800">
                    {streamingCitations.map((cit) => (
                      <button
                        key={`stream-${cit.index}`}
                        type="button"
                        onClick={() => onSelectCitation(cit)}
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                      >
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          [{cit.index}]
                        </span>
                        <span className="max-w-[140px] truncate">{cit.filename}</span>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            )}

            {streamingError && (
              <div
                role="alert"
                className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/70 dark:text-red-100"
              >
                <p className="font-semibold">{streamingError.message}</p>
                {streamingError.hint && <p className="mt-0.5 opacity-85">{streamingError.hint}</p>}
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950"
      >
        {validationError && (
          <p role="alert" className="mb-1.5 text-xs font-medium text-red-600 dark:text-red-400">
            {validationError}
          </p>
        )}
        <div className="flex gap-2">
          <input
            aria-label="Question"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder={
              readySourceCount === 0
                ? "Upload and index a document first…"
                : "Ask a question about your selected sources…"
            }
            className="nb-field min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-sm"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStopStreaming}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={readySourceCount === 0}
              className="nb-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirmClear}
        title="Clear chat history?"
        description="Delete all messages and citations in this notebook's chat history? Your uploaded documents and Studio outputs will stay intact."
        confirmLabel="Clear chat"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void onClearChat();
        }}
      />
    </section>
  );
}
