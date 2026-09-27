"""/api/stats — dashboard KPIs · /api/formations — reference stratigraphy · /api/health."""
from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from .. import state
from ..config import ACTIVE_WELL_ID, DEFAULT_RADIUS_KM
from ..db import get_session
from ..models import Document, DrillingEvent, Well
from ..services.geo import haversine_km
from ..services.llm import llm
from ..services.reference import EVENT_TYPES, FORMATIONS, SEVERITIES
from ..services.serializers import iso_ist

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/stats")
def stats(well_id: str = Query(ACTIVE_WELL_ID), radius_km: float = Query(DEFAULT_RADIUS_KM, ge=0.5, le=100), session: Session = Depends(get_session)) -> dict:
    wells = session.exec(select(Well)).all()
    events = session.exec(select(DrillingEvent)).all()
    docs = session.exec(select(Document)).all()
    center = session.get(Well, well_id) or next((w for w in wells if w.is_active), None)
    within = {w.id for w in wells if center and w.id != center.id and haversine_km(center.lat, center.lon, w.lat, w.lon) <= radius_km}
    offset_events = [e for e in events if e.well_id in within]
    indexed_reports = len({e.source_doc for e in events if e.source_doc}) + len([d for d in docs if d.status == "confirmed"])
    try:
        snap = state.sim.snapshot(session)
        active_alerts, depth, formation = snap["active_alert_count"], snap["depth_m"], snap["formation"]
    except Exception:  # noqa: BLE001
        active_alerts, depth, formation = 0, None, None
    return {
        "generated_at": iso_ist(),
        "center_well_id": center.id if center else None,
        "radius_km": radius_km,
        "wells_total": len(wells),
        "wells_historical": sum(1 for w in wells if not w.is_active),
        "fields": sorted({w.field for w in wells}),
        "offset_wells_in_radius": len(within),
        "offset_events": len(offset_events),
        "offset_npt_hours": round(sum(e.npt_hours for e in offset_events), 1),
        "offset_high_critical": sum(1 for e in offset_events if e.severity in ("High", "Critical")),
        "events_total": len(events),
        "events_by_type": {t: c for t, c in Counter(e.event_type for e in events).items()},
        "events_by_severity": {s: sum(1 for e in events if e.severity == s) for s in SEVERITIES},
        "events_by_formation": dict(Counter(e.formation for e in events).most_common()),
        "npt_hours_total": round(sum(e.npt_hours for e in events), 1),
        "indexed_reports": indexed_reports,
        "documents_ingested": len(docs),
        "documents_confirmed": sum(1 for d in docs if d.status == "confirmed"),
        "uploaded_events": sum(1 for e in events if e.origin == "upload"),
        "active_alerts": active_alerts,
        "active_well": {"id": center.id if center else None, "depth_m": depth, "formation": formation},
        "deepest_well_m": max((w.total_depth_m for w in wells), default=0),
        "llm": llm.describe(),
        "data_label": "SYNTHETIC DEMONSTRATION DATA",
    }


@router.get("/formations")
def formations() -> dict:
    return {"formations": [{"name": f["name"], "order_index": i, "lithology": f["lithology"], "lithology_desc": f["lithology_desc"],
                            "color": f["color"], "risk_tendency": f["risk"], "mud_weight_range_ppg": list(f["mw"]),
                            "regional_top_m": f["base_top_m"]} for i, f in enumerate(FORMATIONS)],
            "event_types": list(EVENT_TYPES), "severities": list(SEVERITIES)}


@router.get("/health")
def health(session: Session = Depends(get_session)) -> dict:
    n = len(session.exec(select(Well)).all())
    return {"status": "ok", "system": "NWIS-RT", "wells": n, "llm": llm.describe(), "time": iso_ist()}
