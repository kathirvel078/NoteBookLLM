import { expect, test } from "@playwright/test";

function createPdf(text: string): Buffer {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT\n/F1 14 Tf\n72 720 Td\n(${escaped}) Tj\nET\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

test("creates a notebook, uploads a PDF, chats with real Ollama, and shows citations", async ({ page }, testInfo) => {
  const notebookTitle = `Playwright Atlas QA ${Date.now()}`;
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LocalLM Notebook" })).toBeVisible();
  await expect(page.getByText("100% local document research powered by Ollama")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("homepage-1440.png"), fullPage: true });

  await page.getByLabel("Create a new notebook").fill(notebookTitle);
  await page.getByRole("button", { name: "Create notebook" }).click();
  await expect(page.getByRole("heading", { name: notebookTitle })).toBeVisible();

  await page.getByLabel("Upload sources").setInputFiles({
    name: "atlas.pdf",
    mimeType: "application/pdf",
    buffer: createPdf("Project Atlas launched on 14 June 2025 and produced 18 research reports."),
  });
  const source = page.locator("li").filter({ hasText: "atlas.pdf" });
  await expect(source).toContainText("ready");
  await page.screenshot({ path: testInfo.outputPath("pdf-upload-1440.png"), fullPage: true });

  await page.getByLabel("Question").fill("When did Project Atlas launch and how many reports did it produce?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/14 June 2025/).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  const citation = page.getByRole("button", { name: /\[1\]/ }).first();
  await expect(citation).toBeVisible();
  await citation.click();
  await expect(page.getByRole("complementary", { name: "Citation details" })).toContainText(/Project Atlas launched on 14 June 2025/);
  await page.screenshot({ path: testInfo.outputPath("chat-with-citation-1440.png"), fullPage: true });
  await page.getByRole("button", { name: "Close citation drawer" }).click();
  await expect(page.getByRole("complementary", { name: "Citation details" })).toBeHidden();

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole("button", { name: /Sources/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workspace-tablet-768.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: notebookTitle })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workspace-mobile-390.png"), fullPage: true });

  await testInfo.attach("console-errors.txt", { body: consoleErrors.join("\n"), contentType: "text/plain" });
  await testInfo.attach("failed-responses.txt", { body: failedResponses.join("\n"), contentType: "text/plain" });
  expect(consoleErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});
