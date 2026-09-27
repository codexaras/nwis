"""/api/assistant — Ask NWIS (RAG with citations; structured offline fallback)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from .. import state
from ..db import get_session
from ..services.llm import llm
from ..services.rag import SUGGESTED_PROMPTS, answer

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    well_id: str | None = None
    radius_km: float | None = Field(None, ge=0.5, le=100)


@router.post("/chat")
def chat(body: ChatIn, session: Session = Depends(get_session)) -> dict:
    index = state.get_index(session)
    try:
        return answer(session, index, body.message, body.well_id, body.radius_km)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — never break the demo flow
        return {"mode": "offline_structured", "provider": llm.describe(), "title": "NWIS", "summary": "I could not build a structured answer for that question.",
                "sections": [{"heading": "TRY", "items": SUGGESTED_PROMPTS[:3]}], "citations": [], "answer_text": f"Unable to answer: {exc.__class__.__name__}",
                "intent": "error", "retrieved": 0, "data_label": "SYNTHETIC DEMONSTRATION DATA"}


@router.get("/suggestions")
def suggestions() -> dict:
    return {"prompts": SUGGESTED_PROMPTS, "llm": llm.describe()}
