import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStreamingChat } from "../../hooks/useStreamingChat";

function sseStream(events: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder();
  const payload = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

describe("useStreamingChat", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("processes sources, token deltas, and done event from SSE stream", async () => {
    const citation = {
      index: 1,
      source_id: "src-1",
      filename: "notes.pdf",
      page_start: 2,
      page_end: 2,
      section: "Page 2",
      snippet: "Mars has Olympus Mons.",
      score: 0.89,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          sseStream([
            { event: "sources", data: { citations: [citation] } },
            { event: "token", data: { delta: "Olympus Mons " } },
            { event: "token", data: { delta: "is on Mars [1]." } },
            {
              event: "done",
              data: {
                message_id: "m-1",
                answer: "Olympus Mons is on Mars [1].",
                citations: [citation],
                suggested_questions: ["How tall is it?"],
              },
            },
          ]),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    );

    const onComplete = vi.fn();
    const { result } = renderHook(() => useStreamingChat());

    await act(async () => {
      await result.current.sendMessage({
        notebookId: "nb-1",
        message: "What is Olympus Mons?",
        sourceIds: ["src-1"],
        onComplete,
      });
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("captures stream error events cleanly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          sseStream([
            {
              event: "error",
              data: {
                code: "OLLAMA_UNAVAILABLE",
                message: "Local Ollama server is unreachable.",
                hint: "Run: ollama serve",
              },
            },
          ]),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    );

    const { result } = renderHook(() => useStreamingChat());
    await act(async () => {
      await result.current.sendMessage({
        notebookId: "nb-1",
        message: "Test question",
      });
    });

    expect(result.current.error).toEqual({
      message: "Local Ollama server is unreachable.",
      hint: "Run: ollama serve",
    });
    expect(result.current.isStreaming).toBe(false);
  });
});
