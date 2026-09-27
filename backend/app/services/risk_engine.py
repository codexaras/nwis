"""Forward risk engine (/api/risk/profile).

Score (0–100) per 50 m bin per event type =
    0.70 × inverse-distance-weighted frequency of offset events in the SAME formation
           (severity-weighted, with a relative-depth kernel so risk concentrates where offsets had trouble)
  + 0.30 × RandomForest probability (depth-log parameters + formation + relative depth → event type)

Deterministic (fixed seed, sorted inputs) and explainable: every zone carries its evidence.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sqlmodel import Session, col, select

from ..config import ACTIVE_WELL_ID
from ..models import DepthLog, DrillingEvent, FormationTop, PressurePoint, Well
from .geo import bearing_deg, compass, haversine_km
from .reference import (
    EVENT_INDICATORS,
    EVENT_TYPES,
    FORMATION_BY_NAME,
    FORMATION_INDEX,
    PARAM_BASELINE,
    RECOMMENDED_ACTIONS,
    SEVERITY_WEIGHT,
    formation_at,
)
from .serializers import citation_label, iso_ist

IDW_K = 0.8  # saturation constant → ~4 High events at ~5 km ≈ 75–80
REL_KERNEL = 0.35
ZONE_THRESHOLD = 40
SAFE_THRESHOLD = 25
FEATURES = ["rop", "wob", "rpm", "torque", "spp", "mud_weight", "ecd", "gas_units", "formation_index", "rel_pos"]


def level_for(score: float) -> str:
    if score >= 80:
        return "Critical"
    if score >= 60:
        return "High"
    if score >= 40:
        return "Medium"
    if score >= SAFE_THRESHOLD:
        return "Low"
    return "Safe"


def _tops_map(session: Session, well_ids: list[str]) -> dict[str, list[dict]]:
    rows = session.exec(select(FormationTop).where(col(FormationTop.well_id).in_(well_ids)).order_by(FormationTop.well_id, FormationTop.top_m)).all()
    out: dict[str, list[dict]] = {}
    for t in rows:
        out.setdefault(t.well_id, []).append({"name": t.name, "top_m": t.top_m, "base_m": t.base_m, "order_index": t.order_index})
    return out


def _rel_pos(tops: list[dict], depth: float) -> tuple[str | None, float]:
    f = formation_at(tops, depth)
    if not f:
        return None, 0.0
    return f["name"], max(0.0, min(1.0, (depth - f["top_m"]) / max(1.0, f["base_m"] - f["top_m"])))


def compute_risk_profile(session: Session, well_id: str, radius_km: float, bin_m: int = 50, current_depth_m: float | None = None) -> dict[str, Any]:
    target = session.get(Well, well_id)
    if target is None:
        raise KeyError(well_id)
    all_wells = session.exec(select(Well)).all()
    offsets = sorted(
        [(w, haversine_km(target.lat, target.lon, w.lat, w.lon)) for w in all_wells if w.id != target.id and haversine_km(target.lat, target.lon, w.lat, w.lon) <= radius_km],
        key=lambda wd: (wd[1], wd[0].id),
    )
    offset_ids = [w.id for w, _ in offsets]
    dist_by_id = {w.id: d for w, d in offsets}
    well_by_id = {w.id: w for w, _ in offsets}
    tops_map = _tops_map(session, offset_ids + [target.id])
    target_tops = tops_map.get(target.id, [])
    td = float(target.total_depth_m)

    events = session.exec(select(DrillingEvent).where(col(DrillingEvent.well_id).in_(offset_ids)).order_by(DrillingEvent.id)).all() if offset_ids else []
    logs = session.exec(select(DepthLog).where(col(DepthLog.well_id).in_(offset_ids)).order_by(DepthLog.well_id, DepthLog.depth_m)).all() if offset_ids else []
    target_logs = session.exec(select(DepthLog).where(DepthLog.well_id == target.id).order_by(DepthLog.depth_m)).all()
    pressure = session.exec(select(PressurePoint).where(PressurePoint.well_id == target.id).order_by(PressurePoint.depth_m)).all()

    # offset events with relative position inside their own formation
    ev_rows: list[dict] = []
    for e in events:
        fname, rel = _rel_pos(tops_map.get(e.well_id, []), e.depth_m)
        ev_rows.append({"e": e, "rel": rel, "dist": dist_by_id[e.well_id], "w": SEVERITY_WEIGHT[e.severity] / (1.0 + dist_by_id[e.well_id])})

    # ---- RandomForest on offset depth logs ---------------------------------------------------
    events_by_well: dict[str, list[DrillingEvent]] = {}
    for e in events:
        events_by_well.setdefault(e.well_id, []).append(e)
    X, y = [], []
    for l in logs:
        _, rel = _rel_pos(tops_map.get(l.well_id, []), l.depth_m)
        label = "None"
        best = 31.0
        for e in events_by_well.get(l.well_id, []):
            d = abs(e.depth_m - l.depth_m)
            if d < best:
                best, label = d, e.event_type
        X.append([l.rop, l.wob, l.rpm, l.torque, l.spp, l.mud_weight, l.ecd, l.gas_units, FORMATION_INDEX.get(l.formation, 0), rel])
        y.append(label)
    rf: RandomForestClassifier | None = None
    classes: list[str] = []
    if len(set(y)) >= 2 and len(X) >= 50:
        rf = RandomForestClassifier(n_estimators=80, max_depth=10, min_samples_leaf=2, random_state=42, n_jobs=1, class_weight="balanced_subsample")
        rf.fit(np.array(X, dtype=float), np.array(y))
        classes = list(rf.classes_)

    # feature vectors for prediction: target's own logs where available, else offset formation means near same rel pos
    logs_by_form: dict[str, list[tuple[float, list[float]]]] = {}
    for row, l in zip(X, logs):
        logs_by_form.setdefault(l.formation, []).append((row[-1], row))
    target_log_by_depth = {l.depth_m: l for l in target_logs}

    def feature_for(depth: float, fname: str, rel: float) -> list[float]:
        near = [target_log_by_depth[d] for d in target_log_by_depth if abs(d - depth) <= 13]
        if near:
            l = near[0]
            return [l.rop, l.wob, l.rpm, l.torque, l.spp, l.mud_weight, l.ecd, l.gas_units, FORMATION_INDEX.get(fname, 0), rel]
        cands = [row for r, row in logs_by_form.get(fname, []) if abs(r - rel) <= 0.15] or [row for _, row in logs_by_form.get(fname, [])]
        if cands:
            arr = np.array(cands, dtype=float).mean(axis=0)
            arr[-2], arr[-1] = FORMATION_INDEX.get(fname, 0), rel
            return arr.tolist()
        b = PARAM_BASELINE.get(fname, PARAM_BASELINE["Tipam"])
        mw = FORMATION_BY_NAME[fname]["mw"][0] if fname in FORMATION_BY_NAME else 9.8
        return [b["rop"], b["wob"], b["rpm"], b["torque"], b["spp"], mw, mw + 0.3, b["gas"], FORMATION_INDEX.get(fname, 0), rel]

    # ---- bins ---------------------------------------------------------------------------------
    depths = [float(d) for d in range(bin_m, int(td) + 1, bin_m)]
    feats, metas = [], []
    for d in depths:
        fname, rel = _rel_pos(target_tops, d)
        metas.append((d, fname or "Alluvium", rel))
        feats.append(feature_for(d, fname or "Alluvium", rel))
    rf_probs = rf.predict_proba(np.array(feats, dtype=float)) if rf is not None else None

    bins: list[dict[str, Any]] = []
    for i, (d, fname, rel) in enumerate(metas):
        scores: dict[str, float] = {}
        for et in EVENT_TYPES:
            raw = 0.0
            for r in ev_rows:
                e = r["e"]
                if e.event_type != et or e.formation != fname:
                    continue
                raw += r["w"] * math.exp(-(((r["rel"] - rel) / REL_KERNEL) ** 2))
            idw = 100.0 * (1.0 - math.exp(-raw / IDW_K))
            rfp = float(rf_probs[i][classes.index(et)]) if rf_probs is not None and et in classes else 0.0
            scores[et] = round(0.70 * idw + 0.30 * 100.0 * rfp, 1)
        top_type = max(scores, key=scores.get)
        bins.append({"depth_m": d, "formation": fname, "rel_pos": round(rel, 3), "scores": scores, "top_type": top_type,
                     "top_score": scores[top_type], "level": level_for(scores[top_type])})

    # ---- zones (contiguous bins ≥ threshold per type) ---------------------------------------
    zones: list[dict[str, Any]] = []

    def flush(et: str, run: list[dict]) -> None:
        if not run:
            return
        peak = max(run, key=lambda x: x["scores"][et])
        zones.append({"event_type": et, "formation": peak["formation"], "depth_from_m": run[0]["depth_m"] - bin_m / 2,
                      "depth_to_m": run[-1]["depth_m"] + bin_m / 2, "depth_m": peak["depth_m"], "score": peak["scores"][et],
                      "level": level_for(peak["scores"][et]),
                      "rel_from": min(b["rel_pos"] for b in run), "rel_to": max(b["rel_pos"] for b in run),
                      "bins": [{"depth_m": b["depth_m"], "score": b["scores"][et]} for b in run]})

    for et in EVENT_TYPES:
        run: list[dict] = []
        for b in bins:
            hot = b["scores"][et] >= ZONE_THRESHOLD
            if hot and (not run or run[-1]["formation"] == b["formation"]):
                run.append(b)
                continue
            flush(et, run)  # run ends: cold bin or formation boundary
            run = [b] if hot else []
        flush(et, run)
    zones.sort(key=lambda z: (-z["score"], z["depth_m"]))

    pp_max_by_form: dict[str, float] = {}
    for p in pressure:
        fname, _ = _rel_pos(target_tops, p.depth_m)
        if fname:
            pp_max_by_form[fname] = max(pp_max_by_form.get(fname, 0.0), p.pore_pressure_ppg)

    def torque_trend() -> str | None:
        if len(target_logs) < 8:
            return None
        recent = np.mean([l.torque for l in target_logs[-4:]])
        prev = np.mean([l.torque for l in target_logs[-8:-4]])
        if prev > 0 and recent / prev - 1 >= 0.06:
            return f"Increasing torque trend (+{(recent / prev - 1) * 100:.0f}% over last 100 m)"
        return None

    top_risks: list[dict[str, Any]] = []
    for z in zones[:8]:
        zf_rel_from, zf_rel_to = z["rel_from"] - 0.12, z["rel_to"] + 0.12
        evidence = [r for r in ev_rows if r["e"].event_type == z["event_type"] and r["e"].formation == z["formation"] and zf_rel_from <= r["rel"] <= zf_rel_to]
        if not evidence:
            evidence = [r for r in ev_rows if r["e"].event_type == z["event_type"] and r["e"].formation == z["formation"]]
        by_well: dict[str, dict] = {}
        for r in evidence:
            e = r["e"]
            w = well_by_id[e.well_id]
            entry = by_well.setdefault(e.well_id, {"well_id": e.well_id, "distance_km": round(r["dist"], 1),
                                                   "bearing": compass(bearing_deg(target.lat, target.lon, w.lat, w.lon)),
                                                   "events": []})
            entry["events"].append({"event_id": e.id, "depth_m": e.depth_m, "severity": e.severity, "npt_hours": e.npt_hours,
                                    "citation": citation_label(e.well_id, e.depth_m)})
        contributing = sorted(by_well.values(), key=lambda x: x["distance_km"])
        high_count = sum(1 for r in evidence if r["e"].severity in ("High", "Critical"))
        indicators = list(EVENT_INDICATORS.get(z["event_type"], []))[:3]
        tt = torque_trend() if z["event_type"] in ("Stuck Pipe", "Torque Spike", "Tight Hole") else None
        if tt:
            indicators.append(tt)
        action = RECOMMENDED_ACTIONS[z["event_type"]]
        rec_mw = None
        if z["event_type"] == "Kick" and z["formation"] in pp_max_by_form:
            rec_mw = round(pp_max_by_form[z["formation"]] + 0.4, 1)
            action = f"{action} Recommended mud weight before {z['formation']}: {rec_mw:.1f} ppg (pore pressure up to {pp_max_by_form[z['formation']]:.1f} ppg)."
        why = [f"{len(evidence)} analogous offset event{'s' if len(evidence) != 1 else ''} in {z['formation']}",
               f"nearest offset {contributing[0]['distance_km']:.1f} km" if contributing else "no offset within radius",
               f"{high_count} high-severity case{'s' if high_count != 1 else ''}",
               "similar formation and relative depth"] + ([tt] if tt else [])
        top_risks.append({**z, "label": f"{z['event_type'].upper()} RISK", "evidence_count": len(evidence), "high_severity_count": high_count,
                          "nearest_offset_km": contributing[0]["distance_km"] if contributing else None,
                          "contributing_wells": contributing, "indicators": indicators, "why": why,
                          "recommended_action": action, "recommended_mud_weight_ppg": rec_mw,
                          "ahead": current_depth_m is None or z["depth_to_m"] > current_depth_m})

    safe: list[dict[str, Any]] = []
    run = []
    for b in bins + [None]:
        if b is not None and b["top_score"] < SAFE_THRESHOLD:
            run.append(b)
            continue
        if run and (run[-1]["depth_m"] - run[0]["depth_m"] + bin_m) >= 100:
            safe.append({"depth_from_m": run[0]["depth_m"] - bin_m / 2, "depth_to_m": run[-1]["depth_m"] + bin_m / 2, "formation": run[0]["formation"]})
        run = []

    return {
        "well_id": target.id,
        "well_name": target.name,
        "is_active": target.is_active,
        "current_depth_m": current_depth_m,
        "planned_td_m": td,
        "radius_km": radius_km,
        "bin_m": bin_m,
        "generated_at": iso_ist(),
        "offset_wells": [{"well_id": w.id, "distance_km": round(d, 1), "events": len(events_by_well.get(w.id, []))} for w, d in offsets],
        "formations": [{"name": t["name"], "top_m": t["top_m"], "base_m": t["base_m"], "color": FORMATION_BY_NAME[t["name"]]["color"]} for t in target_tops],
        "bins": bins,
        "top_risks": top_risks,
        "safe_intervals": safe,
        "heatmap": {"depths": depths, "event_types": list(EVENT_TYPES), "values": [[b["scores"][et] for et in EVENT_TYPES] for b in bins]},
        "model": {
            "method": "Inverse-distance-weighted offset event frequency (same formation, relative-depth kernel) blended 70/30 with a RandomForest on depth-log parameters",
            "features": FEATURES,
            "training_rows": len(X),
            "trees": 80 if rf is not None else 0,
            "seed": 42,
            "deterministic": True,
            "levels": {"Critical": ">= 80", "High": ">= 60", "Medium": ">= 40", "Low": ">= 25", "Safe": "< 25"},
        },
        "data_label": "SYNTHETIC DEMONSTRATION DATA",
    }
