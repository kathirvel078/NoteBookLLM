import { useCallback, useRef, useState } from "react";
import { ApiError, streamChatSSE } from "../api/client";
import type { Citation } from "../types/api";

export interface StreamingState {
  isStreaming: boolean;
  pendingUserMessage: string | null;
  streamingText: string;
  streamingCitations: Citation[];
  error: { message: string; hint?: string | null } | null;
  sendMessage: (params: {
    notebookId: string;
    message: string;
    sourceIds?: string[];
    onComplete?: () => void;
  }) => Promise<void>;
  stopStreaming: () => void;
  clearError: () => void;
}

export function useStreamingChat(): StreamingState {
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<{ message: string; hint?: string | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(
    async ({
      notebookId,
      message,
      sourceIds,
      onComplete,
    }: {
      notebookId: string;
      message: string;
      sourceIds?: string[];
      onComplete?: () => void;
    }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setIsStreaming(true);
      setPendingUserMessage(message);
      setStreamingText("");
      setStreamingCitations([]);

      try {
        await streamChatSSE(
          { notebook_id: notebookId, message, source_ids: sourceIds },
          {
            onSources: (citations) => setStreamingCitations(citations),
            onToken: (delta) => setStreamingText((prev) => prev + delta),
            onDone: () => {
              setIsStreaming(false);
              setPendingUserMessage(null);
              setStreamingText("");
              setStreamingCitations([]);
              onComplete?.();
            },
            onError: (err) => {
              setIsStreaming(false);
              setPendingUserMessage(null);
              setError({ message: err.message, hint: err.hint });
            },
          },
          controller.signal,
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setIsStreaming(false);
          setPendingUserMessage(null);
          onComplete?.();
          return;
        }
        setIsStreaming(false);
        setPendingUserMessage(null);
        if (err instanceof ApiError) {
          setError({ message: err.message, hint: err.hint });
        } else {
          setError({ message: (err as Error).message || "Failed to stream answer." });
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [],
  );

  return {
    isStreaming,
    pendingUserMessage,
    streamingText,
    streamingCitations,
    error,
    sendMessage,
    stopStreaming,
    clearError,
  };
}
