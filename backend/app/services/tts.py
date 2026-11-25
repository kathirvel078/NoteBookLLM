"""Optional local TTS synthesis (Piper preferred with alternating voices, falling back to pyttsx3)."""

from __future__ import annotations

import asyncio
import importlib.util
import shutil
import subprocess
import tempfile
import uuid
import wave
from pathlib import Path

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.schemas.studio import AudioTurn

logger = get_logger(__name__)


def _resolve_piper(settings: Settings) -> tuple[str | None, str | None, str | None]:
    piper_bin = settings.piper_bin.strip() or shutil.which("piper")
    voice_a = settings.piper_voice_a.strip() or None
    voice_b = settings.piper_voice_b.strip() or voice_a
    if piper_bin and voice_a and Path(voice_a).exists():
        return piper_bin, voice_a, voice_b if (voice_b and Path(voice_b).exists()) else voice_a
    return None, None, None


def detect_tts_engine(settings: Settings | None = None) -> str | None:
    """Return 'piper', 'pyttsx3', or None depending on locally installed TTS engines."""
    cfg = settings or get_settings()
    piper_bin, voice_a, _ = _resolve_piper(cfg)
    if piper_bin and voice_a:
        return "piper"
    if importlib.util.find_spec("pyttsx3") is not None:
        return "pyttsx3"
    return None


def _concat_wavs(wav_paths: list[Path], out_path: Path) -> None:
    if not wav_paths:
        raise ValueError("No WAV segments generated.")
    with wave.open(str(wav_paths[0]), "rb") as first:
        params = first.getparams()
        frames = [first.readframes(first.getnframes())]

    for p in wav_paths[1:]:
        with wave.open(str(p), "rb") as nxt:
            if nxt.getparams()[:3] == params[:3]:
                frames.append(nxt.readframes(nxt.getnframes()))

    with wave.open(str(out_path), "wb") as out:
        out.setparams(params)
        for chunk in frames:
            out.writeframes(chunk)


def _synth_piper(
    turns: list[AudioTurn],
    out_path: Path,
    piper_bin: str,
    voice_a: str,
    voice_b: str,
) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        seg_paths: list[Path] = []
        for idx, turn in enumerate(turns):
            model = voice_a if turn.speaker == "Host A" else voice_b
            seg_path = Path(tmp) / f"turn_{idx}.wav"
            subprocess.run(
                [piper_bin, "--model", model, "--output_file", str(seg_path)],
                input=turn.text,
                text=True,
                check=True,
                capture_output=True,
                timeout=60,
            )
            if seg_path.exists() and seg_path.stat().st_size > 44:
                seg_paths.append(seg_path)
        _concat_wavs(seg_paths, out_path)


def _synth_pyttsx3(turns: list[AudioTurn], out_path: Path) -> None:
    try:
        import pythoncom  # type: ignore[import-untyped]

        pythoncom.CoInitialize()
    except Exception:
        pythoncom = None  # type: ignore[assignment]

    try:
        import pyttsx3

        engine = pyttsx3.init()
        voices = engine.getProperty("voices") or []
        voice_a = voices[0].id if len(voices) >= 1 else None
        voice_b = voices[1].id if len(voices) >= 2 else voice_a

        with tempfile.TemporaryDirectory() as tmp:
            seg_paths: list[Path] = []
            for idx, turn in enumerate(turns):
                seg_path = Path(tmp) / f"turn_{idx}.wav"
                chosen = voice_a if turn.speaker == "Host A" else voice_b
                if chosen:
                    engine.setProperty("voice", chosen)
                engine.save_to_file(turn.text, str(seg_path))
                engine.runAndWait()
                if seg_path.exists() and seg_path.stat().st_size > 44:
                    seg_paths.append(seg_path)
            _concat_wavs(seg_paths, out_path)
    finally:
        if pythoncom is not None:
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass


async def synthesize_audio_overview(
    notebook_id: str,
    turns: list[AudioTurn],
    settings: Settings | None = None,
) -> tuple[str | None, bool, str | None, str | None]:
    """Attempt local TTS synthesis. Returns (filename, tts_available, engine, message)."""
    cfg = settings or get_settings()
    cfg.ensure_data_dirs()
    engine = detect_tts_engine(cfg)
    if engine is None:
        return (
            None,
            False,
            None,
            "No local TTS engine (Piper or pyttsx3) is configured; returning script only.",
        )

    filename = f"{notebook_id}_{uuid.uuid4().hex[:10]}.wav"
    out_path = cfg.audio_dir / filename
    try:
        if engine == "piper":
            piper_bin, voice_a, voice_b = _resolve_piper(cfg)
            assert piper_bin and voice_a and voice_b
            await asyncio.to_thread(_synth_piper, turns, out_path, piper_bin, voice_a, voice_b)
        else:
            await asyncio.to_thread(_synth_pyttsx3, turns, out_path)

        if out_path.exists() and out_path.stat().st_size > 44:
            return filename, True, engine, f"Audio synthesized locally via {engine}."
        return (
            None,
            False,
            engine,
            f"Local TTS engine '{engine}' produced no audio; returning script only.",
        )
    except Exception as exc:
        logger.warning("Local TTS (%s) failed, returning script only: %s", engine, exc)
        if out_path.exists():
            out_path.unlink(missing_ok=True)
        return (
            None,
            False,
            engine,
            f"Local TTS ({engine}) unavailable in this environment ({exc}); returning script only.",
        )
