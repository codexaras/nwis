"""/api/live — simulated active-well feed with demo controls."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session

from .. import state
from ..db import get_session

router = APIRouter(prefix="/api/live", tags=["live"])


class ControlIn(BaseModel):
    speed: float | None = None
    jump_to_depth: float | None = None
    reset: bool = False
    trigger_alert: bool = False
    radius_km: float | None = None


@router.get("")
def live(speed: float | None = Query(None, description="simulation speed multiplier (1, 5, 20)"),
         jump_to_depth: float | None = Query(None), reset: bool = Query(False), trigger_alert: bool = Query(False),
         radius_km: float | None = Query(None, ge=0.5, le=100), session: Session = Depends(get_session)) -> dict:
    state.sim.ensure(session, radius_km)
    applied = {}
    if speed is not None or jump_to_depth is not None or reset or trigger_alert:
        applied = state.sim.apply_controls(speed=speed, jump_to_depth=jump_to_depth, reset=reset, trigger_alert=trigger_alert)
    snap = state.sim.snapshot(session, radius_km)
    if applied:
        snap["applied"] = applied
    return snap


@router.post("/control")
def control(body: ControlIn, session: Session = Depends(get_session)) -> dict:
    state.sim.ensure(session, body.radius_km)
    applied = state.sim.apply_controls(speed=body.speed, jump_to_depth=body.jump_to_depth, reset=body.reset, trigger_alert=body.trigger_alert)
    snap = state.sim.snapshot(session, body.radius_km)
    snap["applied"] = applied
    return snap
