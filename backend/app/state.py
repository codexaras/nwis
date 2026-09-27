"""Process-wide singletons: knowledge index, live simulator, risk cache."""
from __future__ import annotations

from typing import Any

from sqlmodel import Session

from .services.search import KnowledgeIndex
from .services.simulation import LiveSimulator

index = KnowledgeIndex()
sim = LiveSimulator()
risk_cache: dict[tuple, dict[str, Any]] = {}


def get_index(session: Session) -> KnowledgeIndex:
    if not index.ready:
        index.refresh(session)
    return index


def invalidate(session: Session | None = None) -> None:
    """Call after events change (document confirm): rebuild search, drop risk cache, reload sim offsets."""
    risk_cache.clear()
    sim.invalidate()
    if session is not None:
        index.refresh(session)
    else:
        index.ready = False
