import { create } from "zustand";
import type { Citation, StudioFeature } from "../types/api";

type Theme = "light" | "dark";

interface AppState {
  theme: Theme;
  toggleTheme: () => void;

  activeNotebookId: string | null;
  setActiveNotebookId: (id: string | null) => void;

  /** Tracks unchecked source IDs per notebook so new ready sources are auto-selected by default */
  deselectedSourcesByNb: Record<string, string[]>;
  toggleSourceSelected: (notebookId: string, sourceId: string) => void;
  setAllSourcesSelected: (notebookId: string, allIds: string[], selected: boolean) => void;

  activeCitation: Citation | null;
  setActiveCitation: (c: Citation | null) => void;

  activeStudioFeature: StudioFeature | null;
  setActiveStudioFeature: (f: StudioFeature | null) => void;

  toast: { id: number; type: "error" | "info" | "success"; message: string; hint?: string | null } | null;
  showToast: (type: "error" | "info" | "success", message: string, hint?: string | null) => void;
  clearToast: () => void;
}

const initialTheme: Theme =
  typeof window !== "undefined" && localStorage.getItem("locallm_theme") === "dark"
    ? "dark"
    : "light";

export const useAppStore = create<AppState>((set) => ({
  theme: initialTheme,
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === "light" ? "dark" : "light";
      if (typeof window !== "undefined") {
        localStorage.setItem("locallm_theme", next);
      }
      return { theme: next };
    }),

  activeNotebookId: null,
  setActiveNotebookId: (id) =>
    set({ activeNotebookId: id, activeCitation: null, activeStudioFeature: null }),

  deselectedSourcesByNb: {},
  toggleSourceSelected: (notebookId, sourceId) =>
    set((state) => {
      const prev = state.deselectedSourcesByNb[notebookId] || [];
      const next = prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId];
      return {
        deselectedSourcesByNb: { ...state.deselectedSourcesByNb, [notebookId]: next },
      };
    }),
  setAllSourcesSelected: (notebookId, allIds, selected) =>
    set((state) => ({
      deselectedSourcesByNb: {
        ...state.deselectedSourcesByNb,
        [notebookId]: selected ? [] : allIds,
      },
    })),

  activeCitation: null,
  setActiveCitation: (c) => set({ activeCitation: c }),

  activeStudioFeature: null,
  setActiveStudioFeature: (f) => set({ activeStudioFeature: f }),

  toast: null,
  showToast: (type, message, hint) =>
    set({ toast: { id: Date.now(), type, message, hint } }),
  clearToast: () => set({ toast: null }),
}));
