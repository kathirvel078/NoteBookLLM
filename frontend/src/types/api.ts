export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    hint?: string | null;
    request_id?: string;
  };
}

export interface HealthResponse {
  status: "ok" | "degraded";
  ollama: {
    base_url: string;
    model: string;
    reachable: boolean;
    model_available: boolean;
    available_models: string[];
    hint: string | null;
  };
  embeddings: {
    model: string;
    loaded: boolean;
  };
  tts: {
    available: boolean;
    engine: string | null;
  };
  message: string;
  hint: string | null;
}

export interface NotebookRead {
  id: string;
  title: string;
  source_count: number;
  created_at: string;
  updated_at: string;
}

export interface SourceRead {
  id: string;
  notebook_id: string;
  filename: string;
  file_type: "pdf" | "txt" | "docx" | string;
  size_bytes: number;
  sha256: string;
  status: "processing" | "ready" | "failed";
  error_message: string | null;
  warning_message: string | null;
  page_count: number | null;
  chunk_count: number;
  created_at: string;
}

export interface Citation {
  index: number;
  source_id: string;
  filename: string;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  snippet: string;
  score: number;
}

export interface ChatMessageRead {
  id: string;
  notebook_id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  suggested_questions: string[];
  created_at: string;
}

export interface SummaryOutput {
  title: string;
  overview: string;
  key_points: string[];
  conclusion: string;
}

export interface StudyGuideOutput {
  summary: string;
  key_concepts: Array<{ term: string; definition: string }>;
  important_questions: string[];
  further_study: string[];
}

export interface FlashcardsOutput {
  cards: Array<{ front: string; back: string; source_ref: string }>;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  source_ref: string;
}

export interface QuizOutput {
  questions: QuizQuestion[];
}

export interface MindMapNode {
  id: string;
  label: string;
  children: MindMapNode[];
}

export interface MindMapOutput {
  root: MindMapNode;
}

export interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  source_ref: string;
}

export interface TimelineOutput {
  events: TimelineEvent[];
}

export interface ReportOutput {
  title: string;
  executive_summary: string;
  sections: Array<{ heading: string; content: string }>;
  conclusion: string;
}

export interface AudioTurn {
  speaker: "Host A" | "Host B";
  text: string;
}

export interface AudioOverviewResponse {
  title: string;
  turns: AudioTurn[];
  audio_url: string | null;
  tts_available: boolean;
  tts_engine: string | null;
  tts_message: string | null;
}

export type StudioFeature =
  | "summary"
  | "study_guide"
  | "flashcards"
  | "quiz"
  | "mindmap"
  | "timeline"
  | "report"
  | "audio_overview";

export interface StudioSavedItem {
  feature: StudioFeature | string;
  payload: Record<string, unknown>;
  source_ids: string[] | null;
  updated_at: string;
}
