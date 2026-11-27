"""Document validation (extension + magic bytes) and text extraction for PDF, DOCX, and TXT."""

from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pymupdf as fitz
from charset_normalizer import from_bytes
from docx import Document as DocxDocument
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx"}


@dataclass(slots=True)
class ExtractedSegment:
    """A single page (PDF) or logical section (DOCX/TXT) with provenance."""

    text: str
    page_start: int | None
    page_end: int | None
    section: str


@dataclass(slots=True)
class ExtractionResult:
    """Extraction output including segments, page count, and warnings."""

    segments: list[ExtractedSegment]
    page_count: int | None
    warning: str | None = None


def sanitize_filename(filename: str) -> str:
    """Strip directory components and unsafe characters while keeping extension."""
    base = Path(filename).name.strip()
    if not base:
        base = "document"
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base)
    cleaned = cleaned.lstrip(".") or "document"
    return cleaned[:180]


def detect_and_validate_file(filename: str, content: bytes) -> str:
    """Validate both extension and magic bytes. Returns normalized type: pdf|docx|txt."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file extension '{ext or 'none'}'. Allowed: PDF, TXT, DOCX."
        )
    if not content:
        raise ValueError("Uploaded file is empty.")

    if ext == ".pdf":
        if not content.lstrip()[:8].startswith(b"%PDF-"):
            raise ValueError("File extension is .pdf but magic bytes do not match a PDF header.")
        return "pdf"

    if ext == ".docx":
        if not content.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
            raise ValueError("File extension is .docx but magic bytes do not match a ZIP/DOCX archive.")
        import io

        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                names = set(zf.namelist())
                if "word/document.xml" not in names:
                    raise ValueError("Invalid DOCX archive: missing word/document.xml.")
        except zipfile.BadZipFile as exc:
            raise ValueError("Corrupted DOCX archive.") from exc
        return "docx"

    # TXT validation: reject obvious binary payloads
    sample = content[:8192]
    if b"\x00" in sample:
        raise ValueError("File extension is .txt but content appears to be binary.")
    if sample.lstrip().startswith(b"%PDF-") or sample.startswith(b"PK\x03\x04"):
        raise ValueError("File extension is .txt but magic bytes match a binary archive/PDF.")
    return "txt"


def extract_pdf(path: Path) -> ExtractionResult:
    """Extract PDF text page-by-page using PyMuPDF, detecting scanned PDFs."""
    segments: list[ExtractedSegment] = []
    empty_pages = 0
    total_chars = 0

    with fitz.open(path) as doc:
        page_count = len(doc)
        for idx, page in enumerate(doc, start=1):
            raw = page.get_text("text") or ""
            cleaned = re.sub(r"[ \t]+\n", "\n", raw).strip()
            total_chars += len(cleaned)
            if len(cleaned) < 15:
                empty_pages += 1
            if cleaned:
                segments.append(
                    ExtractedSegment(
                        text=cleaned,
                        page_start=idx,
                        page_end=idx,
                        section=f"Page {idx}",
                    )
                )

    if page_count == 0 or total_chars < 30:
        raise ValueError("no extractable text (scanned PDF)")

    warning: str | None = None
    if empty_pages > 0 and empty_pages >= max(1, page_count // 2):
        warning = (
            f"Some pages ({empty_pages}/{page_count}) had little or no extractable text "
            "(possibly scanned images)."
        )

    return ExtractionResult(segments=segments, page_count=page_count, warning=warning)


def extract_docx(path: Path) -> ExtractionResult:
    """Extract DOCX paragraphs and tables in reading order, preserving heading sections."""
    doc = DocxDocument(str(path))
    current_section = "Section: Document Start"
    buckets: list[tuple[str, list[str]]] = [(current_section, [])]

    for child in doc.element.body.iterchildren():
        if isinstance(child, CT_P):
            para = Paragraph(child, doc)
            text = para.text.strip()
            if not text:
                continue
            style_name = (para.style.name if para.style and para.style.name else "").lower()
            if style_name.startswith("heading"):
                current_section = f"Section: {text[:120]}"
                buckets.append((current_section, [text]))
            else:
                buckets[-1][1].append(text)
        elif isinstance(child, CT_Tbl):
            table = Table(child, doc)
            rows_txt: list[str] = []
            for row in table.rows:
                cells = [re.sub(r"\s+", " ", cell.text).strip() for cell in row.cells]
                if any(cells):
                    rows_txt.append(" | ".join(cells))
            if rows_txt:
                buckets[-1][1].append("\n".join(rows_txt))

    segments: list[ExtractedSegment] = []
    for section, parts in buckets:
        joined = "\n\n".join(parts).strip()
        if joined:
            segments.append(
                ExtractedSegment(
                    text=joined,
                    page_start=None,
                    page_end=None,
                    section=section,
                )
            )

    if not segments:
        raise ValueError("DOCX file contains no extractable text.")

    return ExtractionResult(
        segments=segments,
        page_count=None,
        warning="DOCX files do not have fixed pages; citations reference section headings.",
    )


def extract_txt(path: Path) -> ExtractionResult:
    """Extract plain text with automatic encoding detection."""
    raw = path.read_bytes()
    best = from_bytes(raw).best()
    text = str(best) if best is not None else raw.decode("utf-8", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        raise ValueError("Text file contains no extractable text.")

    return ExtractionResult(
        segments=[
            ExtractedSegment(
                text=text,
                page_start=None,
                page_end=None,
                section="Text Document",
            )
        ],
        page_count=None,
        warning=None,
    )


def extract_document(path: Path, file_type: str) -> ExtractionResult:
    """Dispatch document extraction by validated file_type."""
    if file_type == "pdf":
        return extract_pdf(path)
    if file_type == "docx":
        return extract_docx(path)
    if file_type == "txt":
        return extract_txt(path)
    raise ValueError(f"Unsupported file type: {file_type}")
