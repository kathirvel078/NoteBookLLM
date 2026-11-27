import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getHealth: vi.fn(),
  listNotebooks: vi.fn(),
  createNotebook: vi.fn(),
  renameNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
  listSources: vi.fn(),
  uploadSources: vi.fn(),
  deleteSource: vi.fn(),
  getChatHistory: vi.fn(),
  clearChat: vi.fn(),
  listStudioSaved: vi.fn(),
  generateStudio: vi.fn(),
}));

vi.mock("./api/client", () => ({
  api: apiMocks,
  apiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {
    code: string;
    hint?: string | null;
    status: number;
    constructor(status: number, code: string, message: string, hint?: string | null) {
      super(message);
      this.status = status;
      this.code = code;
      this.hint = hint;
    }
  },
}));

vi.mock("./hooks/useStreamingChat", () => ({
  useStreamingChat: () => ({
    isStreaming: false,
    pendingUserMessage: null,
    streamingText: "",
    streamingCitations: [],
    error: null,
    sendMessage: vi.fn(),
    stopStreaming: vi.fn(),
    clearError: vi.fn(),
  }),
}));

import App from "./App";
import { useAppStore } from "./store/useAppStore";

const healthOk = {
  status: "ok" as const,
  ollama: {
    base_url: "http://localhost:11434",
    model: "llama3.2",
    reachable: true,
    model_available: true,
    available_models: ["llama3.2"],
    hint: null,
  },
  embeddings: { model: "test", loaded: false },
  tts: { available: false, engine: null },
  message: "Ready",
  hint: null,
};

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      activeNotebookId: null,
      activeCitation: null,
      activeStudioFeature: null,
      deselectedSourcesByNb: {},
      theme: "light",
      toast: null,
    });
    apiMocks.getHealth.mockResolvedValue(healthOk);
    apiMocks.listNotebooks.mockResolvedValue([]);
    apiMocks.listSources.mockResolvedValue([]);
    apiMocks.getChatHistory.mockResolvedValue([]);
    apiMocks.listStudioSaved.mockResolvedValue([]);
  });

  it("creates a notebook, opens workspace, and navigates back to home", async () => {
    const user = userEvent.setup();
    const nb = {
      id: "nb-1",
      title: "Physics",
      source_count: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    apiMocks.createNotebook.mockResolvedValue(nb);
    apiMocks.listNotebooks.mockResolvedValue([nb]);

    render(<App />);
    await user.type(screen.getByLabelText("Create a new notebook"), "Physics");
    await user.click(screen.getByRole("button", { name: "Create notebook" }));

    await waitFor(() => expect(apiMocks.createNotebook).toHaveBeenCalledWith("Physics"));
    expect(await screen.findByRole("heading", { name: "Physics" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Studio" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to notebooks" }));
    expect(await screen.findByText(/Your notebooks/)).toBeInTheDocument();
  });

  it("shows validation feedback instead of submitting a blank notebook title", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Create notebook" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a notebook title.");
    expect(apiMocks.createNotebook).not.toHaveBeenCalled();
  });

  it("displays persistent degraded banner with exact command when Ollama is down", async () => {
    apiMocks.getHealth.mockResolvedValue({
      ...healthOk,
      status: "degraded",
      ollama: {
        ...healthOk.ollama,
        reachable: false,
        model_available: false,
        hint: "Run: ollama serve",
      },
      message: "Ollama server is not reachable.",
      hint: "Run: ollama serve",
    });

    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ollama server is not reachable.");
    expect(alert).toHaveTextContent("Run: ollama serve");
  });
});
