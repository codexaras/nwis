"""/api/risk/profile — deterministic, explainable depth-wise risk."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from .. import state
from ..config import ACTIVE_WELL_ID, DEFAULT_RADIUS_KM
from ..db import get_session
from ..services.risk_engine import compute_risk_profile, level_for

router = APIRouter(prefix="/api/risk", tags=["risk"])


def _clip_ahead(z: dict, current: float, bin_m: int) -> dict | None:
    """Zone restricted to the part still ahead of the bit (peak re-evaluated on the remaining bins)."""
    ahead_bins = [b for b in z["bins"] if b["depth_m"] + bin_m / 2 > current]
    if not ahead_bins:
        return None
    peak = max(ahead_bins, key=lambda b: b["score"])
    return dict(z, ahead=True, depth_from_m=max(z["depth_from_m"], current), depth_m=peak["depth_m"], score=peak["score"],
                level=level_for(peak["score"]), distance_ahead_m=round(max(0.0, max(z["depth_from_m"], current) - current), 1))


@router.get("/profile")
def risk_profile(well_id: str = Query(ACTIVE_WELL_ID), radius_km: float = Query(DEFAULT_RADIUS_KM, ge=0.5, le=100),
                 bin_m: int = Query(50, ge=25, le=200), session: Session = Depends(get_session)) -> dict:
    key = (well_id.upper(), round(radius_km, 2), bin_m)
    cached = state.risk_cache.get(key)
    current = None
    if well_id.upper() == ACTIVE_WELL_ID:
        try:
            current = state.sim.snapshot(session)["depth_m"]
        except Exception:  # noqa: BLE001
            current = None
    if cached is None:
        try:
            cached = compute_risk_profile(session, well_id.upper(), radius_km, bin_m=bin_m, current_depth_m=current)
        except KeyError:
            raise HTTPException(404, f"well {well_id} not found")
        state.risk_cache[key] = cached
    out = dict(cached)
    if current is not None:
        out["current_depth_m"] = current
        out["top_risks"] = [dict(z, ahead=z["depth_to_m"] > current) for z in cached["top_risks"]]
        clipped = [c for c in (_clip_ahead(z, current, bin_m) for z in cached["top_risks"]) if c]
        out["risks_ahead"] = sorted(clipped, key=lambda z: (-z["score"], z["depth_m"]))
    return out
