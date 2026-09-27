"""Simulated active-well drilling feed (/api/live, demo controls).

Depth advances ~2 m every 3 s at 1x. Parameters are a deterministic function of depth (so polling
rate does not matter) with a tiny seeded jitter for life. Alerts fire when the bit is within 150 m
above a depth where offset wells within the radius recorded High/Critical events.
"""
from __future__ import annotations

import math
import random
import threading
import time
from typing import Any

from sqlmodel import Session, col, select

from ..config import ACTIVE_WELL_ID, ALERT_LOOKAHEAD_M, DEFAULT_RADIUS_KM, SIM_METERS_PER_TICK, SIM_START_DEPTH_M, SIM_TICK_SECONDS
from ..models import DrillingEvent, FormationTop, Well
from .geo import bearing_deg, compass, haversine_km
from .reference import FORMATION_BY_NAME, FORMATIONS, PARAM_BASELINE, RECOMMENDED_ACTIONS, SEVERITY_RANK, formation_at, mud_weight_for
from .serializers import citation_label, iso_ist, now_ist

SPEEDS = (1, 5, 20)
TORQUE_FAMILY = ("Stuck Pipe", "Torque Spike", "Tight Hole")


class LiveSimulator:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self.radius_km = DEFAULT_RADIUS_KM
        self.speed = 1.0
        self.start_depth = SIM_START_DEPTH_M
        self.depth_at_t0 = SIM_START_DEPTH_M
        self.t0 = time.monotonic()
        self.first_seen: dict[str, str] = {}
        self.injected: list[dict[str, Any]] = []
        self.well: Well | None = None
        self.tops: list[dict] = []
        self.offset_events: list[dict[str, Any]] = []
        self.offset_count = 0

    # ---- data -------------------------------------------------------------------------------
    def invalidate(self) -> None:
        self._loaded = False

    def ensure(self, session: Session, radius_km: float | None = None) -> None:
        if radius_km is not None and abs(radius_km - self.radius_km) > 1e-9:
            self.radius_km = radius_km
            self._loaded = False
        if self._loaded:
            return
        with self._lock:
            well = session.get(Well, ACTIVE_WELL_ID)
            if well is None:
                raise RuntimeError("active well missing — run seed.py")
            tops = session.exec(select(FormationTop).where(FormationTop.well_id == well.id).order_by(FormationTop.top_m)).all()
            wells = session.exec(select(Well)).all()
            offsets = {w.id: (w, haversine_km(well.lat, well.lon, w.lat, w.lon)) for w in wells
                       if w.id != well.id and haversine_km(well.lat, well.lon, w.lat, w.lon) <= self.radius_km}
            evs = session.exec(select(DrillingEvent).where(col(DrillingEvent.well_id).in_(list(offsets))).where(col(DrillingEvent.severity).in_(["High", "Critical"]))).all() if offsets else []
            self.offset_events = sorted([
                {"event_id": e.id, "well_id": e.well_id, "depth_m": e.depth_m, "event_type": e.event_type, "severity": e.severity,
                 "formation": e.formation, "npt_hours": e.npt_hours, "description": e.description, "mitigation": e.mitigation,
                 "distance_km": round(offsets[e.well_id][1], 1),
                 "bearing": compass(bearing_deg(well.lat, well.lon, offsets[e.well_id][0].lat, offsets[e.well_id][0].lon))}
                for e in evs], key=lambda x: (x["depth_m"], x["well_id"]))
            self.offset_count = len(offsets)
            self.well = well
            self.tops = [{"name": t.name, "top_m": t.top_m, "base_m": t.base_m, "order_index": t.order_index} for t in tops]
            self._loaded = True

    # ---- controls ---------------------------------------------------------------------------
    def current_depth(self) -> float:
        elapsed = time.monotonic() - self.t0
        d = self.depth_at_t0 + elapsed * (SIM_METERS_PER_TICK / SIM_TICK_SECONDS) * self.speed
        td = self.well.total_depth_m if self.well else 3650.0
        return round(min(d, td), 1)

    def apply_controls(self, *, speed: float | None = None, jump_to_depth: float | None = None, reset: bool = False,
                       trigger_alert: bool = False) -> dict[str, Any]:
        applied: dict[str, Any] = {}
        with self._lock:
            if reset:
                self.depth_at_t0, self.t0, self.speed = self.start_depth, time.monotonic(), 1.0
                self.first_seen.clear()
                self.injected.clear()
                applied["reset"] = True
            if speed is not None:
                now_d = self.current_depth()
                self.speed = float(max(0.0, min(50.0, speed)))
                self.depth_at_t0, self.t0 = now_d, time.monotonic()
                applied["speed"] = self.speed
            if jump_to_depth is not None:
                td = self.well.total_depth_m if self.well else 3650.0
                self.depth_at_t0, self.t0 = float(max(50.0, min(td, jump_to_depth))), time.monotonic()
                self.first_seen.clear()
                applied["jump_to_depth"] = self.depth_at_t0
            if trigger_alert:
                applied["trigger_alert"] = self._inject_alert()
        return applied

    def _inject_alert(self) -> dict[str, Any] | None:
        depth = self.current_depth()
        ahead = [e for e in self.offset_events if e["depth_m"] - depth > ALERT_LOOKAHEAD_M]
        ahead.sort(key=lambda e: (-SEVERITY_RANK[e["severity"]], e["depth_m"]))
        pick = next((e for e in ahead if e["severity"] == "Critical"), None) or (ahead[0] if ahead else None)
        if pick is None:
            return None
        inj = dict(pick, is_demo=True, expires_at=time.monotonic() + 90.0)
        self.injected = [i for i in self.injected if i["event_id"] != pick["event_id"]] + [inj]
        return {"event_id": pick["event_id"], "well_id": pick["well_id"], "depth_m": pick["depth_m"], "event_type": pick["event_type"]}

    # ---- physics-ish ------------------------------------------------------------------------
    def params_at(self, depth: float) -> dict[str, float]:
        form = formation_at(self.tops, depth) or self.tops[0]
        base = PARAM_BASELINE[form["name"]]
        rel = max(0.0, min(1.0, (depth - form["top_m"]) / max(1.0, form["base_m"] - form["top_m"])))
        wave = 1 + 0.06 * math.sin(depth / 23.0) + 0.04 * math.sin(depth / 7.3) + 0.03 * math.sin(depth / 2.1)
        jr = random.Random(int(round(depth * 10)))
        j = lambda: 1 + jr.uniform(-0.02, 0.02)  # noqa: E731
        torque_f, rop_f, gas_f, ecd_plus = 1.0, 1.0, 1.0, 0.0
        for e in self.offset_events:
            ahead = e["depth_m"] - depth
            if 0 <= ahead <= 120 and e["event_type"] in TORQUE_FAMILY:
                k = 1 - ahead / 120.0
                torque_f = max(torque_f, 1 + 0.22 * k)
                rop_f = min(rop_f, 1 - 0.15 * k)
        for t in self.tops:
            if t["name"] == "Kopili" and 0 <= t["top_m"] - depth <= 100:
                k = 1 - (t["top_m"] - depth) / 100.0
                gas_f = 1 + 1.6 * k
                ecd_plus = 0.12 * k
        mw = mud_weight_for(form["name"], rel)
        return {
            "rop": round(base["rop"] * wave * rop_f * j(), 1),
            "wob": round(base["wob"] * (1 + 0.03 * math.sin(depth / 13.0)) * j(), 1),
            "rpm": round(base["rpm"] * (1 + 0.02 * math.sin(depth / 5.0)) * j(), 0),
            "torque": round(base["torque"] * wave * torque_f * j(), 1),
            "spp": round(base["spp"] * (1 + 0.03 * math.sin(depth / 17.0)) * j(), 0),
            "mud_weight": round(mw, 2),
            "ecd": round(mw + 0.24 + 0.00004 * depth + ecd_plus, 2),
            "gas_units": round(base["gas"] * wave * gas_f * j(), 0),
            "hookload": round(165 + depth * 0.032 + 3 * math.sin(depth / 9.0), 0),
            "flow_rate": round(640 + 12 * math.sin(depth / 31.0), 0),
        }

    # ---- snapshot ---------------------------------------------------------------------------
    def snapshot(self, session: Session, radius_km: float | None = None) -> dict[str, Any]:
        self.ensure(session, radius_km)
        assert self.well is not None
        depth = self.current_depth()
        td = self.well.total_depth_m
        form = formation_at(self.tops, depth) or self.tops[0]
        rel = max(0.0, min(1.0, (depth - form["top_m"]) / max(1.0, form["base_m"] - form["top_m"])))
        nxt = next((t for t in self.tops if t["top_m"] > depth), None)
        if nxt is None:  # beyond last known top → project the next regional formation
            last_idx = self.tops[-1]["order_index"] if self.tops else 0
            if last_idx + 1 < len(FORMATIONS):
                nxt = {"name": FORMATIONS[last_idx + 1]["name"], "top_m": td, "base_m": td + 300, "projected": True}
        params = self.params_at(depth)
        history = []
        for i in range(30):
            d = depth - (29 - i) * SIM_METERS_PER_TICK
            if d <= 0:
                continue
            history.append({"depth_m": round(d, 1), **self.params_at(d)})

        now_iso = iso_ist()
        alerts: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        live_ev = [e for e in self.offset_events if 0 <= e["depth_m"] - depth <= ALERT_LOOKAHEAD_M]
        self.injected = [i for i in self.injected if i["expires_at"] > time.monotonic() and i["depth_m"] > depth]
        for e in live_ev + [i for i in self.injected if i["event_id"] not in {x["event_id"] for x in live_ev}]:
            aid = f"ev-{e['event_id']}"
            seen_ids.add(aid)
            first = self.first_seen.setdefault(aid, now_iso)
            related = [x for x in live_ev if x["event_type"] == e["event_type"] and x["event_id"] != e["event_id"]]
            ahead = round(e["depth_m"] - depth, 1)
            alerts.append({
                "id": aid, "event_id": e["event_id"], "well_id": e["well_id"], "depth_m": e["depth_m"], "distance_ahead_m": ahead,
                "event_type": e["event_type"], "severity": e["severity"], "formation": e["formation"], "distance_km": e["distance_km"],
                "bearing": e["bearing"], "npt_hours": e["npt_hours"], "citation": citation_label(e["well_id"], e["depth_m"]),
                "title": f"{e['event_type'].upper()} RISK · {e['formation'].upper()}",
                "message": (f"{e['well_id']} reported {e['severity'].lower()} {e['event_type'].lower()} at {e['depth_m']:,.0f} m in {e['formation']}, "
                            f"{e['distance_km']:.1f} km {e['bearing']} — {ahead:,.0f} m ahead of the bit."
                            + (f" {len(related)} further {e['event_type'].lower()} case{'s' if len(related) != 1 else ''} in window." if related else "")),
                "recommendation": RECOMMENDED_ACTIONS[e["event_type"]],
                "evidence": e["description"], "mitigation": e["mitigation"],
                "first_seen": first, "is_demo": bool(e.get("is_demo", False)),
            })
        for aid in list(self.first_seen):
            if aid not in seen_ids:
                self.first_seen.pop(aid, None)
        alerts.sort(key=lambda a: (-SEVERITY_RANK[a["severity"]], a["distance_ahead_m"]))

        upcoming = [{"name": t["name"], "top_m": t["top_m"], "distance_m": round(t["top_m"] - depth, 1),
                     "risk_tendency": FORMATION_BY_NAME[t["name"]]["risk"], "color": FORMATION_BY_NAME[t["name"]]["color"]}
                    for t in self.tops if t["top_m"] > depth]
        if not upcoming and nxt and nxt.get("projected"):
            upcoming.append({"name": nxt["name"], "top_m": nxt["top_m"], "distance_m": round(nxt["top_m"] - depth, 1),
                             "risk_tendency": FORMATION_BY_NAME[nxt["name"]]["risk"], "color": FORMATION_BY_NAME[nxt["name"]]["color"], "projected": True})

        status = "TD REACHED" if depth >= td else "DRILLING"
        return {
            "feed": "SIMULATED",
            "data_label": "SYNTHETIC DEMONSTRATION DATA",
            "well_id": self.well.id,
            "well_name": self.well.name,
            "field": self.well.field,
            "rig": self.well.rig,
            "lat": self.well.lat,
            "lon": self.well.lon,
            "timestamp": now_iso,
            "clock_ist": now_ist().strftime("%H:%M:%S IST"),
            "status": status,
            "speed": self.speed,
            "radius_km": self.radius_km,
            "offset_wells_in_radius": self.offset_count,
            "depth_m": depth,
            "start_depth_m": self.start_depth,
            "planned_td_m": td,
            "progress_pct": round(100.0 * depth / td, 1),
            "formation": form["name"],
            "formation_color": FORMATION_BY_NAME[form["name"]]["color"],
            "formation_top_m": form["top_m"],
            "formation_base_m": form["base_m"],
            "formation_rel_pos": round(rel, 3),
            "next_formation": nxt["name"] if nxt else None,
            "next_formation_top_m": nxt["top_m"] if nxt else None,
            "distance_to_next_m": round(nxt["top_m"] - depth, 1) if nxt else None,
            "params": params,
            "history": history,
            "alerts": alerts,
            "active_alert_count": len(alerts),
            "top_alert": alerts[0] if alerts else None,
            "upcoming_formations": upcoming,
            "system": {"nwis_rt": "CONNECTED", "risk_engine": "READY", "feed": "SIMULATED"},
            "controls": {"speeds": list(SPEEDS), "presets": self.presets()},
        }

    def presets(self) -> list[dict[str, Any]]:
        out = []
        for name in ("Barail", "Kopili"):
            t = next((t for t in self.tops if t["name"] == name), None)
            if t:
                out.append({"label": f"Before {name}", "depth_m": round(t["top_m"] - 120.0, 1)})
        out.append({"label": "Start", "depth_m": self.start_depth})
        return out
