"""/api/documents — upload → extract → review → confirm (Document Intelligence)."""
from __future__ import annotations

import re
import shutil
import uuid
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .. import state
from ..config import SAMPLE_DOCS_DIR, UPLOAD_DIR
from ..db import get_session
from ..models import Document, DrillingEvent, FormationTop, Well
from ..services.extraction import process_pdf
from ..services.reference import EVENT_TYPES, SEVERITIES, formation_at
from ..services.serializers import event_to_dict, iso_ist

router = APIRouter(prefix="/api/documents", tags=["documents"])

SAMPLES = [
    {"name": "DDR_DLJ-12_2019-03-14.pdf", "label": "Sample DDR · DLJ-12 · Barail stuck pipe", "kind": "text", "well_id": "DLJ-12"},
    {"name": "DDR_DLJ-18_2020-01-27_SCANNED.pdf", "label": "Scanned report · DLJ-18 · image-only (OCR path)", "kind": "scanned", "well_id": "DLJ-18"},
    {"name": "DDR_DLJ-07_2021-06-18.pdf", "label": "Sample DDR · DLJ-07 · Kopili kick", "kind": "text", "well_id": "DLJ-07"},
    {"name": "DDR_DLJ-21_2018-09-05.pdf", "label": "Sample DDR · DLJ-21 · Tipam losses", "kind": "text", "well_id": "DLJ-21"},
    {"name": "DDR_NHK-07_2016-11-02.pdf", "label": "Sample DDR · NHK-07 · Barail stuck pipe", "kind": "text", "well_id": "NHK-07"},
    {"name": "DDR_HGJ-02_2014-02-22.pdf", "label": "Sample DDR · HGJ-02 · Sylhet total losses", "kind": "text", "well_id": "HGJ-02"},
]


def _doc_to_dict(d: Document) -> dict:
    return {"id": d.id, "filename": d.filename, "uploaded_at": d.uploaded_at.isoformat(), "page_count": d.page_count, "text_chars": d.text_chars,
            "text_source": d.text_source, "ocr_status": d.ocr_status, "extraction_method": d.extraction_method, "well_id": d.well_id,
            "status": d.status, "event_count": d.event_count, "is_sample": d.is_sample}


def _tops_lookup(session: Session):
    def lookup(well_id: str | None) -> list[dict]:
        if not well_id:
            return []
        rows = session.exec(select(FormationTop).where(FormationTop.well_id == well_id).order_by(FormationTop.top_m)).all()
        return [{"name": t.name, "top_m": t.top_m, "base_m": t.base_m} for t in rows]
    return lookup


def _process(session: Session, path: Path, original_name: str, is_sample: bool) -> dict:
    result = process_pdf(path, _tops_lookup(session))
    result["filename"] = original_name
    well_id = result["detected"]["well_id"]
    if well_id and session.get(Well, well_id) is None:
        result["detected"]["well_known"] = False
    else:
        result["detected"]["well_known"] = bool(well_id)
    doc = Document(filename=original_name, stored_path=str(path), page_count=result["pages"], text_chars=result["text_chars"],
                   text_source=result["text_source"], ocr_status=result["ocr_status"], extraction_method=result["extraction_method"],
                   well_id=well_id, status="extracted", event_count=len(result["events"]), is_sample=is_sample)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    result["document_id"] = doc.id
    result["document"] = _doc_to_dict(doc)
    result["processed_at"] = iso_ist()
    result["data_label"] = "SYNTHETIC DEMONSTRATION DATA"
    return result


@router.get("/samples")
def list_samples() -> dict:
    out = []
    for s in SAMPLES:
        p = SAMPLE_DOCS_DIR / s["name"]
        out.append({**s, "available": p.exists(), "size_kb": (p.stat().st_size // 1024) if p.exists() else None, "url": f"/api/documents/samples/{s['name']}"})
    return {"samples": out}


@router.get("/samples/{name}")
def get_sample(name: str):
    if not re.fullmatch(r"[A-Za-z0-9_.\-]+\.pdf", name):
        raise HTTPException(400, "invalid sample name")
    p = SAMPLE_DOCS_DIR / name
    if not p.exists():
        raise HTTPException(404, "sample not found")
    return FileResponse(str(p), media_type="application/pdf", filename=name)


@router.post("/sample")
def process_sample(name: str = Query(..., description="one of /api/documents/samples"), session: Session = Depends(get_session)) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_.\-]+\.pdf", name):
        raise HTTPException(400, "invalid sample name")
    src = SAMPLE_DOCS_DIR / name
    if not src.exists():
        raise HTTPException(404, "sample not found")
    return _process(session, src, name, is_sample=True)


@router.post("/upload")
async def upload(file: UploadFile = File(...), session: Session = Depends(get_session)) -> dict:
    name = Path(file.filename or "upload.pdf").name
    if not name.lower().endswith(".pdf"):
        raise HTTPException(415, "only PDF documents are supported")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored = UPLOAD_DIR / f"{uuid.uuid4().hex[:8]}_{name}"
    with stored.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)
    if stored.stat().st_size == 0:
        stored.unlink(missing_ok=True)
        raise HTTPException(400, "empty file")
    return _process(session, stored, name, is_sample=False)


class EventIn(BaseModel):
    well_id: str
    depth_m: float = Field(ge=0)
    formation: str | None = None
    event_type: str
    severity: str = "Medium"
    npt_hours: float = 0.0
    mud_weight_ppg: float = 0.0
    description: str
    mitigation: str = ""
    lesson_learned: str = ""
    event_date: date | None = None
    confidence: float | None = None


class ConfirmIn(BaseModel):
    document_id: int
    events: list[EventIn]


def _norm(value: str, allowed: list[str], what: str) -> str:
    for a in allowed:
        if a.lower() == value.strip().lower():
            return a
    raise HTTPException(422, f"invalid {what} '{value}'; expected one of {', '.join(allowed)}")


@router.post("/confirm")
def confirm(body: ConfirmIn, session: Session = Depends(get_session)) -> dict:
    doc = session.get(Document, body.document_id)
    if doc is None:
        raise HTTPException(404, "document not found")
    if not body.events:
        raise HTTPException(422, "no events to save")
    saved: list[DrillingEvent] = []
    for ev in body.events:
        wid = ev.well_id.strip().upper()
        well = session.get(Well, wid)
        if well is None:
            raise HTTPException(422, f"unknown well id '{ev.well_id}' — choose an existing well")
        etype = _norm(ev.event_type, list(EVENT_TYPES), "event_type")
        sev = _norm(ev.severity, list(SEVERITIES), "severity")
        formation = ev.formation
        if not formation:
            tops = _tops_lookup(session)(wid)
            f = formation_at(tops, ev.depth_m) if tops else None
            formation = f["name"] if f else "Unknown"
        saved.append(DrillingEvent(
            well_id=wid, depth_m=round(ev.depth_m, 1), formation=formation, event_type=etype, severity=sev, npt_hours=ev.npt_hours,
            mud_weight_ppg=ev.mud_weight_ppg, description=ev.description.strip(), mitigation=ev.mitigation.strip(),
            lesson_learned=ev.lesson_learned.strip(), source_doc=doc.filename, event_date=ev.event_date, origin="upload", document_id=doc.id,
        ))
    session.add_all(saved)
    doc.status = "confirmed"
    doc.event_count = len(saved)
    doc.well_id = doc.well_id or saved[0].well_id
    session.add(doc)
    session.commit()
    for e in saved:
        session.refresh(e)
    state.invalidate(session)  # searchable immediately in Knowledge Base / Ask NWIS / risk / alerts
    return {"document": _doc_to_dict(doc), "saved": [event_to_dict(e) for e in saved], "count": len(saved),
            "message": f"{len(saved)} event{'s' if len(saved) != 1 else ''} added to the knowledge base from {doc.filename}"}


@router.get("")
def list_documents(session: Session = Depends(get_session)) -> dict:
    docs = session.exec(select(Document).order_by(Document.uploaded_at.desc())).all()  # type: ignore[attr-defined]
    return {"count": len(docs), "documents": [_doc_to_dict(d) for d in docs]}


@router.get("/{document_id}")
def get_document(document_id: int, session: Session = Depends(get_session)) -> dict:
    doc = session.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "document not found")
    events = session.exec(select(DrillingEvent).where(DrillingEvent.document_id == doc.id).order_by(DrillingEvent.depth_m)).all()
    return {**_doc_to_dict(doc), "events": [event_to_dict(e) for e in events]}
