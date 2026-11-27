import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessageRead, Citation } from "../../types/api";
import { ChatPanel } from "../ChatPanel";
import { CitationDrawer } from "../CitationDrawer";

const sampleCitation: Citation = {
  index: 1,
  source_id: "src-1",
  filename: "architecture.pdf",
  page_start: 4,
  page_end: 4,
  section: "Page 4",
  snippet: "Raft elects a single leader per term using randomized election timeouts.",
  score: 0.91,
};

const sampleMessages: ChatMessageRead[] = [
  {
    id: "m1",
    notebook_id: "nb1",
    role: "user",
    content: "How does Raft elect leaders?",
    citations: [],
    suggested_questions: [],
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "m2",
    notebook_id: "nb1",
    role: "assistant",
    content: "Raft elects one leader per term via randomized timeouts [1].",
    citations: [sampleCitation],
    suggested_questions: ["What happens during a split vote?"],
    created_at: "2026-01-01T00:00:01Z",
  },
];

function ChatWithDrawerHarness() {
  const [selected, setSelected] = useState<Citation | null>(null);
  return (
    <div>
      <ChatPanel
        messages={sampleMessages}
        loadingHistory={false}
        readySourceCount={1}
        selectedSourceCount={1}
        isStreaming={false}
        pendingUserMessage={null}
        streamingText=""
        streamingCitations={[]}
        streamingError={null}
        onSendMessage={vi.fn()}
        onStopStreaming={vi.fn()}
        onClearChat={vi.fn()}
        onSelectCitation={setSelected}
      />
      <CitationDrawer citation={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

describe("Citation chip and CitationDrawer", () => {
  it("opens the citation drawer with filename, page, and snippet when clicking [1]", async () => {
    const user = userEvent.setup();
    render(<ChatWithDrawerHarness />);

    const inlineChip = screen.getByRole("button", { name: "[1]" });
    await user.click(inlineChip);

    const drawer = screen.getByRole("complementary", { name: "Citation details" });
    expect(drawer).toHaveTextContent("architecture.pdf");
    expect(drawer).toHaveTextContent("Page 4");
    expect(drawer).toHaveTextContent("Raft elects a single leader per term");

    await user.click(screen.getByRole("button", { name: "Close citation drawer" }));
    expect(screen.queryByRole("complementary", { name: "Citation details" })).not.toBeInTheDocument();
  });
});
