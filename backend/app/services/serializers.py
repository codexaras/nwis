"""Row → JSON helpers shared by all routers (single formatting convention across the API)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from ..models import CasingString, DepthLog, DrillingEvent, FormationTop, PressurePoint, Well
from .reference import FORMATION_BY_NAME, SEVERITY_RANK

IST = timezone(timedelta(hours=5, minutes=30), name="IST")


def now_ist() -> datetime:
    return datetime.now(IST)


def iso_ist(dt: datetime | None = None) -> str:
    return (dt or now_ist()).astimezone(IST).isoformat(timespec="seconds")


def citation_label(well_id: str, depth_m: float) -> str:
    return f"{well_id} · {depth_m:,.0f} m"


def _d(v: date | None) -> str | None:
    return v.isoformat() if v else None


def event_to_dict(e: DrillingEvent, well: Well | None = None, distance_km: float | None = None, score: float | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": e.id,
        "well_id": e.well_id,
        "depth_m": e.depth_m,
        "formation": e.formation,
        "event_type": e.event_type,
        "severity": e.severity,
        "severity_rank": SEVERITY_RANK.get(e.severity, 0),
        "npt_hours": e.npt_hours,
        "mud_weight_ppg": e.mud_weight_ppg,
        "description": e.description,
        "mitigation": e.mitigation,
        "lesson_learned": e.lesson_learned,
        "source_doc": e.source_doc,
        "event_date": _d(e.event_date),
        "origin": e.origin,
        "document_id": e.document_id,
        "citation": citation_label(e.well_id, e.depth_m),
    }
    if well is not None:
        out["well"] = {"id": well.id, "name": well.name, "field": well.field, "lat": well.lat, "lon": well.lon, "is_active": well.is_active}
    if distance_km is not None:
        out["distance_km"] = round(distance_km, 1)
    if score is not None:
        out["score"] = round(float(score), 4)
    return out


def well_to_dict(w: Well, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": w.id,
        "name": w.name,
        "field": w.field,
        "lat": w.lat,
        "lon": w.lon,
        "spud_date": _d(w.spud_date),
        "completion_date": _d(w.completion_date),
        "total_depth_m": w.total_depth_m,
        "status": w.status,
        "well_type": w.well_type,
        "rig": w.rig,
        "notes": w.notes,
        "is_active": w.is_active,
        "operator": w.operator,
    }
    out.update(extra)
    return out


def formation_to_dict(f: FormationTop) -> dict[str, Any]:
    ref = FORMATION_BY_NAME.get(f.name, {})
    return {
        "id": f.id,
        "well_id": f.well_id,
        "name": f.name,
        "order_index": f.order_index,
        "top_m": f.top_m,
        "base_m": f.base_m,
        "thickness_m": round(f.base_m - f.top_m, 1),
        "lithology": f.lithology,
        "lithology_desc": f.lithology_desc,
        "color": ref.get("color"),
        "risk_tendency": ref.get("risk"),
    }


def casing_to_dict(c: CasingString) -> dict[str, Any]:
    return {
        "id": c.id,
        "well_id": c.well_id,
        "string_type": c.string_type,
        "size_in": c.size_in,
        "hole_size_in": c.hole_size_in,
        "shoe_depth_m": c.shoe_depth_m,
        "cement_top_m": c.cement_top_m,
        "cementing_notes": c.cementing_notes,
        "order_index": c.order_index,
    }


def log_to_dict(l: DepthLog) -> dict[str, Any]:
    return {
        "depth_m": l.depth_m,
        "formation": l.formation,
        "rop": l.rop,
        "wob": l.wob,
        "rpm": l.rpm,
        "torque": l.torque,
        "spp": l.spp,
        "mud_weight": l.mud_weight,
        "ecd": l.ecd,
        "gas_units": l.gas_units,
    }


def pressure_to_dict(p: PressurePoint) -> dict[str, Any]:
    return {
        "depth_m": p.depth_m,
        "pore_pressure_ppg": p.pore_pressure_ppg,
        "fracture_gradient_ppg": p.fracture_gradient_ppg,
        "window_ppg": round(p.fracture_gradient_ppg - p.pore_pressure_ppg, 2),
    }


def max_severity(events: list[DrillingEvent] | list[dict]) -> str | None:
    best, best_rank = None, -1
    for e in events:
        sev = e["severity"] if isinstance(e, dict) else e.severity
        r = SEVERITY_RANK.get(sev, 0)
        if r > best_rank:
            best, best_rank = sev, r
    return best
