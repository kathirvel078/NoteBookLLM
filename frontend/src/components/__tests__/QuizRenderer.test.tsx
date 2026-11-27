import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QuizRenderer } from "../studio/QuizRenderer";

describe("QuizRenderer", () => {
  it("grades selected answers, computes score, and reveals explanations", async () => {
    const user = userEvent.setup();
    render(
      <QuizRenderer
        data={{
          questions: [
            {
              question: "Which year did Apollo 11 land on the Moon?",
              options: ["1965", "1969", "1972", "1975"],
              correct_index: 1,
              explanation: "Apollo 11 landed on July 20, 1969.",
              source_ref: "space.pdf (p.2)",
            },
            {
              question: "What was the first artificial satellite?",
              options: ["Sputnik 1", "Voyager 1", "Explorer 1", "Hubble"],
              correct_index: 0,
              explanation: "Sputnik 1 launched in 1957.",
              source_ref: "space.pdf (p.1)",
            },
          ],
        }}
      />,
    );

    const checkBtn = screen.getByRole("button", { name: /Check answers/i });
    expect(checkBtn).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "1969" }));
    await user.click(screen.getByRole("button", { name: "Voyager 1" }));

    expect(checkBtn).toBeEnabled();
    await user.click(checkBtn);

    expect(screen.getByRole("status")).toHaveTextContent("Score: 1 / 2 (50%)");
    expect(screen.getByText(/Apollo 11 landed on July 20, 1969/)).toBeInTheDocument();
    expect(screen.getByText(/Sputnik 1 launched in 1957/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Retry/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
