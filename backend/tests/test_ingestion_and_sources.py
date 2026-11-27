"""Tests for document extractors, chunking, upload validation, ingestion, and delete cascades."""

from __future__ import annotations

import io
from pathlib import Path

import pymupdf as fitz
from docx import Document as DocxDocument
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.services.chunking import chunk_segments
from app.services.extractors import (
    ExtractedSegment,
    detect_and_validate_file,
    extract_docx,
    extract_pdf,
    extract_txt,
)
from app.services.vectorstore import get_vector_store


def _make_pdf_bytes(pages: list[str]) -> bytes:
    doc = fitz.open()
    for text in pages:
        page = doc.new_page()
        if text:
            page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def _make_docx_bytes() -> bytes:
    doc = DocxDocument()
    doc.add_heading("Methods", level=1)
    doc.add_paragraph("We trained a local model on three datasets with cosine similarity.")
    tbl = doc.add_table(rows=2, cols=2)
    tbl.cell(0, 0).text = "Metric"
    tbl.cell(0, 1).text = "Score"
    tbl.cell(1, 0).text = "F1"
    tbl.cell(1, 1).text = "0.91"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_extractors_pdf_docx_txt(tmp_path: Path) -> None:
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(
        _make_pdf_bytes(
            [
                "Page one explains the solar system and Mars exploration.",
                "Page two covers Europa ice oceans and tidal heating.",
            ]
        )
    )
    pdf_res = extract_pdf(pdf_path)
    assert pdf_res.page_count == 2
    assert len(pdf_res.segments) == 2
    assert pdf_res.segments[0].page_start == 1
    assert pdf_res.segments[1].page_start == 2

    docx_path = tmp_path / "notes.docx"
    docx_path.write_bytes(_make_docx_bytes())
    docx_res = extract_docx(docx_path)
    assert docx_res.page_count is None
    assert any("Section: Methods" in s.section for s in docx_res.segments)
    assert any("F1 | 0.91" in s.text for s in docx_res.segments)

    txt_path = tmp_path / "plain.txt"
    txt_path.write_bytes("Café résumé notes on local RAG.".encode("latin-1"))
    txt_res = extract_txt(txt_path)
    assert "local RAG" in txt_res.segments[0].text


def test_chunking_preserves_page_boundaries_and_dedups() -> None:
    seg1 = ExtractedSegment(
        text="Alpha sentence one. " * 60,
        page_start=1,
        page_end=1,
        section="Page 1",
    )
    seg2 = ExtractedSegment(
        text="Beta sentence two. " * 20,
        page_start=2,
        page_end=2,
        section="Page 2",
    )
    chunks = chunk_segments([seg1, seg2], chunk_size=300, chunk_overlap=50)
    assert len(chunks) >= 3
    # No chunk may span page 1 and page 2
    for ch in chunks:
        assert ch.page_start == ch.page_end
        if ch.page_start == 1:
            assert "Beta" not in ch.text
        if ch.page_start == 2:
            assert "Alpha" not in ch.text


def test_magic_byte_validation() -> None:
    assert detect_and_validate_file("a.pdf", _make_pdf_bytes(["Hello world"])) == "pdf"
    assert detect_and_validate_file("b.docx", _make_docx_bytes()) == "docx"
    assert detect_and_validate_file("c.txt", b"Hello plain text") == "txt"

    try:
        detect_and_validate_file("fake.pdf", b"Not actually a PDF header")
        raise AssertionError("Expected ValueError for spoofed PDF")
    except ValueError:
        pass

    try:
        detect_and_validate_file("script.exe", b"MZ...")
        raise AssertionError("Expected ValueError for unsupported extension")
    except ValueError:
        pass


def test_upload_ingest_duplicate_scanned_and_delete_cascade(client: TestClient) -> None:
    # Create notebook
    nb_resp = client.post("/api/notebooks", json={"title": "Space Research"})
    assert nb_resp.status_code == 201
    nb_id = nb_resp.json()["id"]

    # Upload real PDF
    pdf_bytes = _make_pdf_bytes(
        [
            "Mars has the tallest volcano Olympus Mons in the solar system.",
            "Saturn rings are composed mostly of water ice particles.",
        ]
    )
    up = client.post(
        "/api/sources/upload",
        data={"notebook_id": nb_id},
        files=[("files", ("mars.pdf", pdf_bytes, "application/pdf"))],
    )
    assert up.status_code == 202
    src_id = up.json()["uploaded"][0]["id"]

    # Duplicate upload in same notebook must be rejected (409)
    dup = client.post(
        "/api/sources/upload",
        data={"notebook_id": nb_id},
        files=[("files", ("mars_copy.pdf", pdf_bytes, "application/pdf"))],
    )
    assert dup.status_code == 409

    # Background task ran synchronously in TestClient; verify source ready & Chroma vectors stored
    sources = client.get(f"/api/sources/{nb_id}").json()
    assert len(sources) == 1
    assert sources[0]["status"] == "ready"
    assert sources[0]["page_count"] == 2
    assert sources[0]["chunk_count"] >= 2

    vs = get_vector_store()
    assert vs.count_source_chunks(nb_id, src_id) >= 2

    # Scanned PDF (blank page) should mark failed with scanned warning
    scanned_bytes = _make_pdf_bytes([""])
    scan_up = client.post(
        "/api/sources/upload",
        data={"notebook_id": nb_id},
        files=[("files", ("scanned.pdf", scanned_bytes, "application/pdf"))],
    )
    assert scan_up.status_code == 202
    scan_id = scan_up.json()["uploaded"][0]["id"]
    sources_after = {s["id"]: s for s in client.get(f"/api/sources/{nb_id}").json()}
    assert sources_after[scan_id]["status"] == "failed"
    assert "scanned PDF" in (sources_after[scan_id]["warning_message"] or "")

    # Delete source removes vectors, file on disk, and DB row
    upload_dir = get_settings().uploads_dir / nb_id
    assert any(p.name.startswith(src_id) for p in upload_dir.iterdir())
    del_src = client.delete(f"/api/sources/{src_id}")
    assert del_src.status_code == 204
    assert vs.count_source_chunks(nb_id, src_id) == 0
    assert not any(p.name.startswith(src_id) for p in upload_dir.iterdir())

    # Delete notebook removes upload directory, Chroma collection, and DB rows
    del_nb = client.delete(f"/api/notebooks/{nb_id}")
    assert del_nb.status_code == 204
    assert not upload_dir.exists()
    assert vs.get_notebook_chunks(nb_id) == []
