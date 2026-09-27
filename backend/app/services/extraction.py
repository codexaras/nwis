"""Document intelligence: PDF text → (OCR fallback) → structured events (LLM or rules) with confidence.

Tuned so the bundled sample DDRs extract cleanly offline. Generalised extraction is a best effort
sentence scan. If tesseract is missing we return a clean `ocr_status = "not_installed"` — never a 500.
"""
from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

from ..config import SAMPLE_DOCS_DIR
from .llm import llm
from .reference import EVENT_TYPES, FORMATION_NAMES, SEVERITIES, formation_at
from .search import EVENT_SYNONYMS

_TYPE_ALT = "|".join(re.escape(t) for t in EVENT_TYPES)
STRUCTURED_RE = re.compile(
    rf"(?P<n>\d+)\.\s*(?P<type>{_TYPE_ALT})\s+at\s+(?P<depth>[\d,]+(?:\.\d+)?)\s*m(?:\s*MD)?\s*\((?P<formation>[A-Za-z]+)\)"
    rf"\s*\|\s*Severity:\s*(?P<sev>[A-Za-z]+)\s*\|\s*NPT:\s*(?P<npt>[\d.]+)\s*hrs?\s*\|\s*MW:\s*(?P<mw>[\d.]+)\s*ppg",
    re.I,
)
WELL_RE = re.compile(r"\bWell\b[:\s]+([A-Z]{3}-(?:ACT-)?\d{2,3})", re.I)
DATE_RE = re.compile(r"Report Date[:\s]+(\d{4}-\d{2}-\d{2})", re.I)
DEPTH_RE = re.compile(r"(\d{1,2}[,\d]{2,5}(?:\.\d+)?)\s*m\b(?:\s*MD)?", re.I)
NPT_RE = re.compile(r"NPT[:\s]+([\d.]+)\s*hrs?", re.I)
MW_RE = re.compile(r"([\d]{1,2}\.\d)\s*ppg", re.I)
SECTION_STOP_RE = re.compile(r"\n\s*\d\.\s+(?:LESSONS LEARNED|CASING|MUD PROPERTIES|OPERATIONS)", re.I)


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def _norm_type(s: str) -> str | None:
    s = s.strip().lower()
    for t in EVENT_TYPES:
        if t.lower() == s:
            return t
    return None


def _norm_sev(s: str) -> str:
    s = s.strip().capitalize()
    return s if s in SEVERITIES else "Medium"


def _norm_formation(s: str | None) -> str | None:
    if not s:
        return None
    for f in FORMATION_NAMES:
        if f.lower() == s.strip().lower():
            return f
    return None


# ------------------------------------------------------------------------------------------------
# text extraction
# ------------------------------------------------------------------------------------------------
def extract_text(path: Path) -> dict[str, Any]:
    """Returns {text, pages, text_source, ocr_status, ocr_detail}."""
    text, pages = "", 0
    try:
        import pdfplumber

        with pdfplumber.open(str(path)) as pdf:
            pages = len(pdf.pages)
            text = "\n".join((pg.extract_text() or "") for pg in pdf.pages)
    except Exception as exc:  # noqa: BLE001
        return {"text": "", "pages": 0, "text_source": "none", "ocr_status": "not_needed", "ocr_detail": f"PDF could not be parsed: {exc.__class__.__name__}"}

    if len(text.strip()) >= 80:
        return {"text": text, "pages": pages, "text_source": "pdf_text", "ocr_status": "not_needed", "ocr_detail": "Text layer present"}

    # image-only → OCR
    ocr_status, ocr_detail, ocr_text = "failed", "", ""
    try:
        import pytesseract  # type: ignore
        import pdfplumber

        with pdfplumber.open(str(path)) as pdf:
            parts = []
            for pg in pdf.pages:
                img = pg.to_image(resolution=200).original
                parts.append(pytesseract.image_to_string(img))
        ocr_text = "\n".join(parts)
        ocr_status, ocr_detail = "ok", f"tesseract OCR on {pages} page(s)"
    except ImportError:
        ocr_status, ocr_detail = "not_installed", "OCR engine not installed (pytesseract missing)"
    except Exception as exc:  # noqa: BLE001
        name = exc.__class__.__name__
        if "TesseractNotFound" in name or "tesseract is not installed" in str(exc).lower():
            ocr_status, ocr_detail = "not_installed", "OCR engine not installed (tesseract binary not found)"
        else:
            ocr_status, ocr_detail = "failed", f"OCR failed: {name}"

    if ocr_status == "ok" and len(ocr_text.strip()) >= 80:
        return {"text": ocr_text, "pages": pages, "text_source": "ocr", "ocr_status": "ok", "ocr_detail": ocr_detail}

    transcript = SAMPLE_DOCS_DIR / (path.stem + ".transcript.txt")
    if transcript.exists():
        t = transcript.read_text(encoding="utf-8")
        t = "\n".join(l for l in t.splitlines() if not l.startswith("#"))
        return {"text": t, "pages": pages, "text_source": "bundled_transcript", "ocr_status": ocr_status,
                "ocr_detail": f"{ocr_detail}; using bundled transcript of the sample scan"}
    return {"text": ocr_text, "pages": pages, "text_source": "none", "ocr_status": ocr_status, "ocr_detail": ocr_detail}


# ------------------------------------------------------------------------------------------------
# metadata
# ------------------------------------------------------------------------------------------------
def detect_metadata(text: str) -> dict[str, Any]:
    well = WELL_RE.search(text)
    date = DATE_RE.search(text)
    return {"well_id": well.group(1).upper() if well else None, "report_date": date.group(1) if date else None,
            "formations_mentioned": [f for f in FORMATION_NAMES if f.lower() in text.lower()]}


# ------------------------------------------------------------------------------------------------
# rule-based structuring
# ------------------------------------------------------------------------------------------------
def _join_wrapped(block: str) -> str:
    return re.sub(r"\s*\n\s*", " ", block).strip()


def extract_events_rules(text: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    matches = list(STRUCTURED_RE.finditer(text))
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.end():end]
        stop = SECTION_STOP_RE.search(body)
        if stop:
            body = body[:stop.start()]
        body = _join_wrapped(body)
        desc, mit, les = body, "", ""
        mm = re.search(r"Mitigation:\s*(.*?)(?=\s*Lesson:|$)", body, re.I | re.S)
        lm = re.search(r"Lesson:\s*(.*)$", body, re.I | re.S)
        if mm:
            mit = mm.group(1).strip()
            desc = body[:mm.start()].strip()
        if lm:
            les = lm.group(1).strip()
            if not mm:
                desc = body[:lm.start()].strip()
        conf = 0.94 - (0.08 if not mit else 0.0) - (0.05 if not les else 0.0)
        events.append({
            "event_type": _norm_type(m.group("type")) or "Wellbore Instability",
            "depth_m": _num(m.group("depth")),
            "formation": _norm_formation(m.group("formation")),
            "severity": _norm_sev(m.group("sev")),
            "npt_hours": float(m.group("npt")),
            "mud_weight_ppg": float(m.group("mw")),
            "description": desc or f"{m.group('type').title()} at {m.group('depth')} m MD.",
            "mitigation": mit,
            "lesson_learned": les,
            "confidence": round(conf, 2),
            "method": "rules:structured",
        })

    # secondary: free-text sentence scan (generalised documents)
    covered = [(e["event_type"], e["depth_m"]) for e in events]
    sentences = re.split(r"(?<=[.!?])\s+|\n{2,}", _join_wrapped(text) if not matches else text[: matches[0].start()])
    for s in sentences:
        s_clean = _join_wrapped(s)
        if len(s_clean) < 25:
            continue
        low = s_clean.lower()
        etype = next((t for t, syns in EVENT_SYNONYMS.items() if any(k in low for k in syns)), None)
        dm = DEPTH_RE.search(s_clean)
        if not etype or not dm:
            continue
        depth = _num(dm.group(1))
        if depth < 30 or depth > 7000 or any(t == etype and abs(d - depth) < 6 for t, d in covered):
            continue
        sev = "Critical" if any(k in low for k in ("total loss", "critical", "blowout")) else \
            "High" if any(k in low for k in ("severe", "high", "stuck", "kicked")) else "Medium"
        npt = NPT_RE.search(s_clean)
        mw = MW_RE.search(s_clean)
        form = next((f for f in FORMATION_NAMES if f.lower() in low), None)
        events.append({
            "event_type": etype, "depth_m": depth, "formation": form, "severity": sev,
            "npt_hours": float(npt.group(1)) if npt else 0.0, "mud_weight_ppg": float(mw.group(1)) if mw else 0.0,
            "description": s_clean[:400], "mitigation": "", "lesson_learned": "",
            "confidence": round(0.52 + (0.08 if form else 0) + (0.06 if npt else 0) + (0.04 if mw else 0), 2),
            "method": "rules:sentence",
        })
        covered.append((etype, depth))
    events.sort(key=lambda e: e["depth_m"])
    return events


# ------------------------------------------------------------------------------------------------
# LLM structuring (optional)
# ------------------------------------------------------------------------------------------------
LLM_SYSTEM = (
    "You are a drilling engineer structuring Daily Drilling Reports for a nearby-wells knowledge base. "
    "Extract every operational event as strict JSON: {\"events\": [{\"event_type\": one of "
    + ", ".join(EVENT_TYPES) + "; \"depth_m\": number (metres MD); \"formation\": one of "
    + ", ".join(FORMATION_NAMES) + " or null; \"severity\": Low|Medium|High|Critical; \"npt_hours\": number; "
    "\"mud_weight_ppg\": number; \"description\": string; \"mitigation\": string; \"lesson_learned\": string; "
    "\"confidence\": 0-1}]}. Only include events that are clearly described. Return JSON only."
)


def extract_events(text: str) -> tuple[list[dict[str, Any]], str]:
    if llm.available():
        data = llm.complete_json(LLM_SYSTEM, text[:12000])
        if isinstance(data, dict) and isinstance(data.get("events"), list) and data["events"]:
            out = []
            for ev in data["events"]:
                try:
                    out.append({
                        "event_type": _norm_type(str(ev.get("event_type", ""))) or "Wellbore Instability",
                        "depth_m": float(ev.get("depth_m") or 0),
                        "formation": _norm_formation(ev.get("formation")),
                        "severity": _norm_sev(str(ev.get("severity", "Medium"))),
                        "npt_hours": float(ev.get("npt_hours") or 0),
                        "mud_weight_ppg": float(ev.get("mud_weight_ppg") or 0),
                        "description": str(ev.get("description", ""))[:600],
                        "mitigation": str(ev.get("mitigation", ""))[:400],
                        "lesson_learned": str(ev.get("lesson_learned", ""))[:400],
                        "confidence": round(float(ev.get("confidence") or 0.8), 2),
                        "method": "llm",
                    })
                except (TypeError, ValueError):
                    continue
            if out:
                return sorted(out, key=lambda e: e["depth_m"]), "llm"
    return extract_events_rules(text), "rules"


def fill_formations(events: list[dict[str, Any]], tops: list[dict]) -> None:
    for e in events:
        if not e.get("formation") and tops:
            f = formation_at(tops, e["depth_m"])
            if f:
                e["formation"] = f["name"]
                e["confidence"] = round(max(0.3, e["confidence"] - 0.04), 2)


def process_pdf(path: Path, tops_lookup) -> dict[str, Any]:
    """Full pipeline with timed steps for the UI stepper. tops_lookup(well_id) → tops list or []."""
    steps: list[dict[str, Any]] = []
    t = time.perf_counter()

    def step(key: str, label: str, status: str, detail: str) -> None:
        nonlocal t
        now = time.perf_counter()
        steps.append({"key": key, "label": label, "status": status, "detail": detail, "ms": int((now - t) * 1000)})
        t = now

    size_kb = path.stat().st_size // 1024
    step("upload", "Uploading", "done", f"{path.name} · {size_kb} KB")
    tx = extract_text(path)
    chars = len(tx["text"].strip())
    step("text", "Extracting text", "done" if tx["text_source"] == "pdf_text" else ("skipped" if chars == 0 else "done"),
         f"{chars:,} characters from {tx['pages']} page(s)" if tx["text_source"] == "pdf_text" else "No text layer found — image-only document")
    if tx["text_source"] == "pdf_text":
        step("ocr", "OCR", "skipped", "Not required (text layer present)")
    elif tx["ocr_status"] == "ok":
        step("ocr", "OCR", "done", tx["ocr_detail"])
    elif tx["ocr_status"] == "not_installed":
        step("ocr", "OCR", "unavailable", "OCR engine not installed" + (" — bundled transcript used for this sample scan" if tx["text_source"] == "bundled_transcript" else ""))
    else:
        step("ocr", "OCR", "failed", tx["ocr_detail"])

    meta = detect_metadata(tx["text"])
    events, method = extract_events(tx["text"]) if tx["text"].strip() else ([], "rules")
    fill_formations(events, tops_lookup(meta["well_id"]) if meta["well_id"] else [])
    for e in events:
        e["well_id"] = meta["well_id"]
    step("structure", "AI structuring", "done" if events else "empty",
         f"{'LLM' if method == 'llm' else 'Rule-based (offline)'} · {len(events)} event{'s' if len(events) != 1 else ''} extracted")
    step("review", "Review", "ready", "Edit, then Confirm & Save to add to the knowledge base")
    return {
        "filename": path.name, "pages": tx["pages"], "text_chars": chars, "text_source": tx["text_source"], "ocr_status": tx["ocr_status"],
        "ocr_detail": tx["ocr_detail"], "ocr_message": "OCR engine not installed" if tx["ocr_status"] == "not_installed" else None,
        "extraction_method": method, "detected": meta, "events": events, "steps": steps, "preview_text": tx["text"][:1800],
    }
