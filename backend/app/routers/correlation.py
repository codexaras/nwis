"""/api/correlation — formation tops, casing shoes, cement tops and events aligned by formation across wells."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, select

from ..db import get_session
from ..models import CasingString, DrillingEvent, FormationTop, Well
from ..services.reference import FORMATION_BY_NAME, FORMATION_NAMES
from ..services.serializers import casing_to_dict, event_to_dict, formation_to_dict, well_to_dict

router = APIRouter(prefix="/api/correlation", tags=["correlation"])

DEFAULT_WELLS = "DLJ-ACT-01,DLJ-12,DLJ-18,NHK-07"


@router.get("")
def correlation(well_ids: str = Query(DEFAULT_WELLS, description="comma-separated, 2–6 wells"), session: Session = Depends(get_session)) -> dict:
    ids = [w.strip().upper() for w in well_ids.split(",") if w.strip()]
    ids = list(dict.fromkeys(ids))
    if not 1 <= len(ids) <= 6:
        raise HTTPException(422, "provide between 1 and 6 well ids")
    wells = {w.id: w for w in session.exec(select(Well).where(col(Well.id).in_(ids))).all()}
    missing = [i for i in ids if i not in wells]
    if missing:
        raise HTTPException(404, f"unknown well id(s): {', '.join(missing)}")
    tops = session.exec(select(FormationTop).where(col(FormationTop.well_id).in_(ids)).order_by(FormationTop.top_m)).all()
    casing = session.exec(select(CasingString).where(col(CasingString.well_id).in_(ids)).order_by(CasingString.order_index)).all()
    events = session.exec(select(DrillingEvent).where(col(DrillingEvent.well_id).in_(ids)).order_by(DrillingEvent.depth_m)).all()

    per_well = []
    for wid in ids:
        w = wells[wid]
        per_well.append({
            **well_to_dict(w),
            "formations": [formation_to_dict(t) for t in tops if t.well_id == wid],
            "casing": [casing_to_dict(c) for c in casing if c.well_id == wid],
            "events": [event_to_dict(e) for e in events if e.well_id == wid],
        })

    links = []
    for name in FORMATION_NAMES:
        pts = [{"well_id": t.well_id, "top_m": t.top_m, "base_m": t.base_m} for t in tops if t.name == name]
        pts.sort(key=lambda p: ids.index(p["well_id"]))
        if len(pts) >= 2:
            links.append({"formation": name, "color": FORMATION_BY_NAME[name]["color"], "points": pts})

    return {
        "well_ids": ids,
        "wells": per_well,
        "formation_order": FORMATION_NAMES,
        "links": links,
        "depth_max_m": max((w.total_depth_m for w in wells.values()), default=0),
        "event_count": len(events),
        "data_label": "SYNTHETIC DEMONSTRATION DATA",
    }
