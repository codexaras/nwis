"""/api/events — knowledge search (keyword + TF-IDF) with filters and facets."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from .. import state
from ..config import ACTIVE_WELL_ID
from ..db import get_session
from ..models import Well
from ..services.geo import haversine_km

router = APIRouter(prefix="/api/events", tags=["knowledge"])


@router.get("")
def search_events(search: str | None = Query(None, description="free text; keyword + TF-IDF ranking"),
                  event_type: str | None = Query(None, alias="type"), formation: str | None = None, severity: str | None = None,
                  well_id: str | None = None, field: str | None = None, origin: str | None = None,
                  radius_km: float | None = Query(None, description="restrict to wells within radius of the active well"),
                  limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                  session: Session = Depends(get_session)) -> dict:
    index = state.get_index(session)
    well_ids = None
    if radius_km is not None:
        center = session.get(Well, ACTIVE_WELL_ID)
        if center:
            well_ids = {w.id for w in index.wells.values() if haversine_km(center.lat, center.lon, w.lat, w.lon) <= radius_km}
    results = index.search(search, event_type=event_type, formation=formation, severity=severity, well_id=well_id, field=field,
                           well_ids=well_ids, origin=origin)
    page = results[offset: offset + limit]
    return {
        "query": search or "",
        "filters": {"type": event_type, "formation": formation, "severity": severity, "well_id": well_id, "field": field, "origin": origin, "radius_km": radius_km},
        "total": len(results),
        "limit": limit,
        "offset": offset,
        "facets": index.facets(results),
        "items": page,
        "ranking": "keyword boosts + TF-IDF cosine" if search else "severity, NPT",
        "data_label": "SYNTHETIC DEMONSTRATION DATA",
    }


@router.get("/{event_id}")
def get_event(event_id: int, session: Session = Depends(get_session)) -> dict:
    index = state.get_index(session)
    rec = index.get(event_id)
    if rec is None:
        raise HTTPException(404, f"event {event_id} not found")
    return rec
