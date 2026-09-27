"""/api/wells — list, nearby (haversine), detail."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, select

from .. import state
from ..config import ACTIVE_WELL_ID, DEFAULT_RADIUS_KM
from ..db import get_session
from ..models import CasingString, DepthLog, DrillingEvent, FormationTop, PressurePoint, Well
from ..services.geo import bearing_deg, compass, haversine_km
from ..services.reference import EVENT_TYPES, SEVERITY_RANK
from ..services.serializers import casing_to_dict, event_to_dict, formation_to_dict, log_to_dict, max_severity, pressure_to_dict, well_to_dict

router = APIRouter(prefix="/api/wells", tags=["wells"])


def _event_stats(events: list[DrillingEvent]) -> dict:
    by_type = {t: 0 for t in EVENT_TYPES}
    for e in events:
        by_type[e.event_type] = by_type.get(e.event_type, 0) + 1
    return {
        "event_count": len(events),
        "npt_hours": round(sum(e.npt_hours for e in events), 1),
        "max_severity": max_severity(events),
        "high_critical_count": sum(1 for e in events if e.severity in ("High", "Critical")),
        "events_by_type": {k: v for k, v in by_type.items() if v},
    }


@router.get("")
def list_wells(field: str | None = None, status: str | None = None, session: Session = Depends(get_session)) -> dict:
    wells = session.exec(select(Well).order_by(Well.field, Well.id)).all()
    active = next((w for w in wells if w.is_active), None)
    events = session.exec(select(DrillingEvent)).all()
    tops = session.exec(select(FormationTop)).all()
    ev_by_well: dict[str, list[DrillingEvent]] = {}
    for e in events:
        ev_by_well.setdefault(e.well_id, []).append(e)
    deepest: dict[str, str] = {}
    for t in sorted(tops, key=lambda t: t.top_m):
        deepest[t.well_id] = t.name
    out = []
    for w in wells:
        if field and w.field.lower() != field.lower():
            continue
        if status and w.status.lower() != status.lower():
            continue
        extra = _event_stats(ev_by_well.get(w.id, []))
        if active and w.id != active.id:
            extra["distance_km"] = round(haversine_km(active.lat, active.lon, w.lat, w.lon), 1)
            extra["bearing"] = compass(bearing_deg(active.lat, active.lon, w.lat, w.lon))
        else:
            extra["distance_km"] = 0.0
            extra["bearing"] = None
        extra["deepest_formation"] = deepest.get(w.id)
        out.append(well_to_dict(w, **extra))
    return {"count": len(out), "active_well_id": active.id if active else None, "wells": out, "data_label": "SYNTHETIC DEMONSTRATION DATA"}


@router.get("/nearby")
def nearby_wells(well_id: str = Query(ACTIVE_WELL_ID), radius_km: float = Query(DEFAULT_RADIUS_KM, ge=0.5, le=100),
                 event_type: str | None = Query(None, alias="type"), formation: str | None = None,
                 session: Session = Depends(get_session)) -> dict:
    center = session.get(Well, well_id)
    if center is None:
        raise HTTPException(404, f"well {well_id} not found")
    wells = session.exec(select(Well)).all()
    within = [(w, haversine_km(center.lat, center.lon, w.lat, w.lon)) for w in wells if w.id != center.id]
    within = sorted([(w, d) for w, d in within if d <= radius_km], key=lambda wd: wd[1])
    ids = [w.id for w, _ in within]
    events = session.exec(select(DrillingEvent).where(col(DrillingEvent.well_id).in_(ids))).all() if ids else []
    tops = session.exec(select(FormationTop).where(col(FormationTop.well_id).in_(ids)).order_by(FormationTop.top_m)).all() if ids else []
    ev_by_well: dict[str, list[DrillingEvent]] = {}
    for e in events:
        if event_type and e.event_type.lower() != event_type.lower():
            continue
        if formation and e.formation.lower() != formation.lower():
            continue
        ev_by_well.setdefault(e.well_id, []).append(e)
    tops_by_well: dict[str, list[FormationTop]] = {}
    for t in tops:
        tops_by_well.setdefault(t.well_id, []).append(t)

    out = []
    for w, d in within:
        evs = ev_by_well.get(w.id, [])
        if (event_type or formation) and not evs:
            continue
        key = sorted(evs, key=lambda e: (-SEVERITY_RANK[e.severity], -e.npt_hours))[:3]
        out.append(well_to_dict(
            w, distance_km=round(d, 1), bearing=compass(bearing_deg(center.lat, center.lon, w.lat, w.lon)),
            bearing_deg=round(bearing_deg(center.lat, center.lon, w.lat, w.lon), 1),
            key_events=[event_to_dict(e) for e in key],
            formation_tops=[{"name": t.name, "top_m": t.top_m} for t in tops_by_well.get(w.id, [])],
            **_event_stats(evs),
        ))
    return {
        "center": well_to_dict(center),
        "radius_km": radius_km,
        "count": len(out),
        "total_events": sum(w["event_count"] for w in out),
        "total_npt_hours": round(sum(w["npt_hours"] for w in out), 1),
        "wells": out,
        "data_label": "SYNTHETIC DEMONSTRATION DATA",
    }


@router.get("/{well_id}")
def well_detail(well_id: str, session: Session = Depends(get_session)) -> dict:
    w = session.get(Well, well_id)
    if w is None:
        raise HTTPException(404, f"well {well_id} not found")
    tops = session.exec(select(FormationTop).where(FormationTop.well_id == w.id).order_by(FormationTop.top_m)).all()
    casing = session.exec(select(CasingString).where(CasingString.well_id == w.id).order_by(CasingString.order_index)).all()
    events = session.exec(select(DrillingEvent).where(DrillingEvent.well_id == w.id).order_by(DrillingEvent.depth_m)).all()
    logs = session.exec(select(DepthLog).where(DepthLog.well_id == w.id).order_by(DepthLog.depth_m)).all()
    pressure = session.exec(select(PressurePoint).where(PressurePoint.well_id == w.id).order_by(PressurePoint.depth_m)).all()
    active = session.get(Well, ACTIVE_WELL_ID)
    extra = _event_stats(events)
    if active and w.id != active.id:
        extra["distance_km"] = round(haversine_km(active.lat, active.lon, w.lat, w.lon), 1)
        extra["bearing"] = compass(bearing_deg(active.lat, active.lon, w.lat, w.lon))
    if w.is_active:
        try:
            snap = state.sim.snapshot(session)
            extra["current_depth_m"] = snap["depth_m"]
            extra["current_formation"] = snap["formation"]
        except Exception:  # noqa: BLE001
            pass
    return {
        **well_to_dict(w, **extra),
        "formations": [formation_to_dict(t) for t in tops],
        "casing": [casing_to_dict(c) for c in casing],
        "events": [event_to_dict(e) for e in events],
        "logs": [log_to_dict(l) for l in logs],
        "pressure_window": [pressure_to_dict(p) for p in pressure],
        "lessons": [{"event_id": e.id, "depth_m": e.depth_m, "formation": e.formation, "event_type": e.event_type, "severity": e.severity,
                     "lesson_learned": e.lesson_learned, "citation": f"{e.well_id} · {e.depth_m:,.0f} m"} for e in events if e.lesson_learned],
        "data_label": "SYNTHETIC DEMONSTRATION DATA",
    }
