import type {
  ApiErrorEnvelope,
  AudioOverviewResponse,
  ChatMessageRead,
  Citation,
  FlashcardsOutput,
  HealthResponse,
  MindMapOutput,
  NotebookRead,
  QuizOutput,
  ReportOutput,
  SourceRead,
  StudioFeature,
  StudioSavedItem,
  StudyGuideOutput,
  SummaryOutput,
  TimelineOutput,
} from "../types/api";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  code: string;
  hint?: string | null;
  status: number;

  constructor(status: number, code: string, message: string, hint?: string | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as Partial<ApiErrorEnvelope>;
    if (data?.error?.message) {
      return new ApiError(
        res.status,
        data.error.code || `HTTP_${res.status}`,
        data.error.message,
        data.error.hint,
      );
    }
  } catch {
    // Non-JSON error body
  }
  return new ApiError(res.status, `HTTP_${res.status}`, res.statusText || "Request failed");
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  getHealth: () => apiFetch<HealthResponse>("/api/health"),

  listNotebooks: () => apiFetch<NotebookRead[]>("/api/notebooks"),
  createNotebook: (title: string) =>
    apiFetch<NotebookRead>("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  renameNotebook: (id: string, title: string) =>
    apiFetch<NotebookRead>(`/api/notebooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  deleteNotebook: (id: string) =>
    apiFetch<void>(`/api/notebooks/${id}`, { method: "DELETE" }),

  listSources: (notebookId: string) =>
    apiFetch<SourceRead[]>(`/api/sources/${notebookId}`),
  uploadSources: (
    notebookId: string,
    files: File[],
    onProgress?: (pct: number) => void,
  ): Promise<{ uploaded: SourceRead[] }> =>
    new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("notebook_id", notebookId);
      for (const f of files) {
        form.append("files", f);
      }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", apiUrl("/api/sources/upload"));
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) {
          onProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as { uploaded: SourceRead[] });
        } else {
          try {
            const parsed = JSON.parse(xhr.responseText) as Partial<ApiErrorEnvelope>;
            reject(
              new ApiError(
                xhr.status,
                parsed.error?.code || `HTTP_${xhr.status}`,
                parsed.error?.message || "Upload failed",
                parsed.error?.hint,
              ),
            );
          } catch {
            reject(new ApiError(xhr.status, `HTTP_${xhr.status}`, "Upload failed"));
          }
        }
      };
      xhr.onerror = () => reject(new ApiError(0, "NETWORK_ERROR", "Network error during upload"));
      xhr.send(form);
    }),
  deleteSource: (sourceId: string) =>
    apiFetch<void>(`/api/sources/${sourceId}`, { method: "DELETE" }),

  getChatHistory: (notebookId: string) =>
    apiFetch<ChatMessageRead[]>(`/api/chat/history/${notebookId}`),
  clearChat: (notebookId: string) =>
    apiFetch<void>(`/api/chat/${notebookId}`, { method: "DELETE" }),

  listStudioSaved: (notebookId: string) =>
    apiFetch<StudioSavedItem[]>(`/api/studio/${notebookId}`),
  generateStudio: async (
    feature: StudioFeature,
    body: { notebook_id: string; source_ids?: string[]; options?: Record<string, unknown> },
  ): Promise<
    | SummaryOutput
    | StudyGuideOutput
    | FlashcardsOutput
    | QuizOutput
    | MindMapOutput
    | TimelineOutput
    | ReportOutput
    | AudioOverviewResponse
  > => {
    const endpointMap: Record<StudioFeature, string> = {
      summary: "/api/studio/summary",
      study_guide: "/api/studio/study-guide",
      flashcards: "/api/studio/flashcards",
      quiz: "/api/studio/quiz",
      mindmap: "/api/studio/mindmap",
      timeline: "/api/studio/timeline",
      report: "/api/studio/report",
      audio_overview: "/api/studio/audio-overview",
    };
    return apiFetch(endpointMap[feature], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
};

export interface SseStreamCallbacks {
  onSources: (citations: Citation[]) => void;
  onToken: (delta: string) => void;
  onDone: (payload: {
    message_id: string;
    answer: string;
    citations: Citation[];
    suggested_questions: string[];
  }) => void;
  onError: (err: { code: string; message: string; hint?: string | null }) => void;
}

export async function streamChatSSE(
  body: { notebook_id: string; message: string; source_ids?: string[] },
  callbacks: SseStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(apiUrl("/api/chat/stream"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  if (!res.body) {
    throw new ApiError(500, "EMPTY_STREAM", "Response body missing from stream endpoint.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const processFrame = (frame: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const rawLine of frame.split(/\r?\n/)) {
      if (rawLine.startsWith("event:")) {
        eventName = rawLine.slice(6).trim();
      } else if (rawLine.startsWith("data:")) {
        dataLines.push(rawLine.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;
    const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    if (eventName === "sources") {
      callbacks.onSources((payload.citations as Citation[]) || []);
    } else if (eventName === "token") {
      callbacks.onToken((payload.delta as string) || "");
    } else if (eventName === "done") {
      callbacks.onDone({
        message_id: String(payload.message_id || ""),
        answer: String(payload.answer || ""),
        citations: (payload.citations as Citation[]) || [],
        suggested_questions: (payload.suggested_questions as string[]) || [],
      });
    } else if (eventName === "error") {
      callbacks.onError({
        code: String(payload.code || "STREAM_ERROR"),
        message: String(payload.message || "Streaming error"),
        hint: (payload.hint as string | null) ?? null,
      });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      if (frame.trim()) processFrame(frame);
    }
  }
  if (buffer.trim()) {
    processFrame(buffer);
  }
}
