"""Ask NWIS — retrieval-augmented answers over events / lessons (/api/assistant/chat).

Retrieval: TF-IDF top-k (+ vocabulary boosts) with intent-aware filters. Generation: LLM with citations when a
key is configured; otherwise a STRUCTURED offline response (title, summary, sections, evidence chips).
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any

from sqlmodel import Session, select

from ..config import ACTIVE_WELL_ID, DEFAULT_RADIUS_KM
from ..models import CasingString, FormationTop, PressurePoint, Well
from .geo import haversine_km
from .llm import llm
from .reference import EVENT_INDICATORS, FORMATION_BY_NAME, FORMATION_NAMES, RECOMMENDED_ACTIONS, SEVERITY_RANK
from .search import KnowledgeIndex, mentioned_event_types, mentioned_fields, mentioned_formations, mentioned_severities, mentioned_wells
from .serializers import citation_label

SUGGESTED_PROMPTS = [
    "What problems did offset wells face in the Barail formation?",
    "Recommended mud weight for Kopili in Baghjan area?",
    "Which offset wells had stuck pipe and how was it freed?",
    "Show lessons learned for mud losses in Tipam sands.",
    "What happened on DLJ-12 while drilling Barail?",
    "What casing programme did nearby wells use through Tipam?",
]

CITE_RE = re.compile(r"\[([A-Z]{3}-(?:ACT-)?\d{2,3})\s*·\s*([\d,]+)\s*m\]")


def _intent(message: str) -> str:
    low = message.lower()
    if any(k in low for k in ("mud weight", "mud-weight", " mw", "ppg", "weight up", "density")):
        return "mud_weight"
    if any(k in low for k in ("casing", "shoe", "cement programme", "cement program", "casing programme")):
        return "casing"
    if any(k in low for k in ("lesson", "learn", "recommend", "best practice", "how was", "how were", "mitigat", "freed")):
        return "lessons"
    if mentioned_wells(message) and not mentioned_formations(message):
        return "well"
    return "experience"


def _shorten(s: str, n: int = 140) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def _primary_label(types: Counter) -> str:
    if not types:
        return "No dominant risk"
    top = [t for t, _ in types.most_common(2)]
    if len(top) == 2 and {top[0], top[1]} <= {"Stuck Pipe", "Tight Hole", "Torque Spike"}:
        return f"{top[0]} / {top[1]}"  # same mechanical family → present together
    return top[0]


def _citations(hits: list[dict], limit: int = 8) -> list[dict[str, Any]]:
    out, seen = [], set()
    for h in sorted(hits, key=lambda r: (-SEVERITY_RANK[r["severity"]], -r.get("score", 0)))[:limit]:
        key = (h["well_id"], h["depth_m"])
        if key in seen:
            continue
        seen.add(key)
        out.append({"label": h["citation"], "well_id": h["well_id"], "depth_m": h["depth_m"], "event_id": h["id"],
                    "event_type": h["event_type"], "severity": h["severity"], "formation": h["formation"]})
    return out


def _render_text(resp: dict[str, Any]) -> str:
    lines = [resp["title"], resp["summary"], ""]
    for sec in resp["sections"]:
        lines.append(sec["heading"])
        if sec.get("text"):
            lines.append(sec["text"])
        for it in sec.get("items", []):
            lines.append(f"• {it}")
        lines.append("")
    if resp["citations"]:
        lines.append("EVIDENCE")
        lines.append(" ".join(f"[{c['label']}]" for c in resp["citations"]))
    return "\n".join(lines).strip()


def answer(session: Session, index: KnowledgeIndex, message: str, well_id: str | None = None, radius_km: float | None = None) -> dict[str, Any]:
    message = (message or "").strip()
    radius_km = radius_km or DEFAULT_RADIUS_KM
    center = session.get(Well, well_id or ACTIVE_WELL_ID) or session.get(Well, ACTIVE_WELL_ID)
    wells = {w.id: w for w in session.exec(select(Well)).all()}
    nearby_ids = {w.id for w in wells.values() if center and w.id != center.id and haversine_km(center.lat, center.lon, w.lat, w.lon) <= radius_km}

    forms = mentioned_formations(message)
    types = mentioned_event_types(message)
    wids = [w for w in mentioned_wells(message) if w in wells]
    fields = mentioned_fields(message)
    sevs = mentioned_severities(message)
    intent = _intent(message)

    filters: dict[str, Any] = {}
    if forms:
        filters["formation"] = forms[0]
    if len(types) == 1 and intent != "mud_weight":
        filters["event_type"] = types[0]
    if wids:
        filters["well_id"] = wids[0]
    if fields:
        filters["field"] = fields[0]
    if sevs and len(sevs) == 1:
        filters["severity"] = sevs[0]

    hits = index.search(message, top_k=40, **filters)
    if not hits and filters:  # relax progressively
        for k in ("severity", "event_type", "field"):
            filters.pop(k, None)
            hits = index.search(message, top_k=40, **filters)
            if hits:
                break
    if not hits:
        hits = index.search(None, top_k=40, **{k: v for k, v in filters.items() if k in ("formation", "well_id")})
    # prefer nearby wells, then the most severe / costly incidents, then textual relevance
    hits.sort(key=lambda r: (0 if r["well_id"] in nearby_ids or r["well_id"] in wids else 1, -SEVERITY_RANK[r["severity"]], -r.get("score", 0), -r["npt_hours"]))
    hits = hits[:12]

    scope_note = f"within {radius_km:.0f} km of {center.id}" if center else ""

    if llm.available() and hits:
        ctx = "\n".join(f"[{h['citation']}] {h['event_type']} · {h['formation']} · {h['severity']} · NPT {h['npt_hours']} h · MW {h['mud_weight_ppg']} ppg: "
                        f"{h['description']} Mitigation: {h['mitigation']} Lesson: {h['lesson_learned']}" for h in hits)
        system = ("You are NWIS, a drilling knowledge assistant for Oil India's Upper Assam operations. Answer concisely for a drilling "
                  "engineer using ONLY the evidence provided. Cite evidence inline with the exact bracket labels given, e.g. [DLJ-12 · 2,940 m]. "
                  "Structure: a one-line headline, then short sections (PRIMARY RISK, COMMON INDICATORS, HISTORICAL MITIGATION, RECOMMENDATION). "
                  "State clearly that the data is synthetic demonstration data if asked about provenance.")
        text = llm.complete(system, f"Question: {message}\nContext ({scope_note}):\n{ctx}")
        if text:
            cited = set((m.group(1), float(m.group(2).replace(",", ""))) for m in CITE_RE.finditer(text))
            cites = [c for c in _citations(hits, 12) if (c["well_id"], c["depth_m"]) in cited] or _citations(hits)
            return {"mode": "llm", "provider": llm.describe(), "title": "NWIS ANSWER", "summary": "", "sections": [{"heading": "", "text": text}],
                    "citations": cites, "answer_text": text, "intent": intent, "retrieved": len(hits), "data_label": "SYNTHETIC DEMONSTRATION DATA"}

    # ------------------------------------------------------------------ offline structured answer
    type_counts = Counter(h["event_type"] for h in hits)
    well_count = len({h["well_id"] for h in hits})
    if wids and forms:
        title = f"{wids[0]} · {forms[0].upper()} EXPERIENCE"
    elif forms:
        title = f"{forms[0].upper()} OFFSET EXPERIENCE"
    elif wids:
        title = f"{wids[0]} WELL SUMMARY"
    elif types:
        title = f"{types[0].upper()} OFFSET EXPERIENCE"
    else:
        title = "OFFSET EXPERIENCE"
    if wids:
        summary = f"{len(hits)} incident{'s' if len(hits) != 1 else ''} recorded on {wids[0]}" + (f" in {forms[0]}" if forms else "") + "."
    else:
        summary = f"{len(hits)} relevant incident{'s' if len(hits) != 1 else ''} identified across {well_count} nearby well{'s' if well_count != 1 else ''}" \
                  + (f" ({scope_note})." if scope_note and not fields else ".")
    sections: list[dict[str, Any]] = []

    if intent == "mud_weight":
        form = forms[0] if forms else "Kopili"
        title = f"{form.upper()} MUD WEIGHT GUIDANCE" + (f" · {fields[0].upper()}" if fields else "")
        scope_wells = [w for w in wells.values() if (not fields or w.field == fields[0])]
        ids = [w.id for w in scope_wells]
        tops = session.exec(select(FormationTop).where(FormationTop.name == form)).all()
        ranges = {t.well_id: (t.top_m, t.base_m) for t in tops if t.well_id in ids}
        pps = session.exec(select(PressurePoint)).all()
        pairs = [(p.pore_pressure_ppg, p.fracture_gradient_ppg) for p in pps
                 if p.well_id in ranges and ranges[p.well_id][0] <= p.depth_m < ranges[p.well_id][1]]
        ev_form = [h for h in index.search(None, formation=form) if h["well_id"] in ids]
        mws = [h["mud_weight_ppg"] for h in ev_form if h["mud_weight_ppg"] > 0]
        kicks = [h for h in ev_form if h["event_type"] == "Kick"]
        losses = [h for h in ev_form if h["event_type"] == "Mud Loss"]
        pp_max = max((pp for pp, _ in pairs), default=FORMATION_BY_NAME[form]["mw"][0] - 0.4)
        # the window that matters is the one at the pore-pressure peak, not the widest point of the formation
        fg_at_peak = min((fg for pp, fg in pairs if pp >= pp_max - 0.5), default=pp_max + 2.0)
        rec_lo = round(pp_max + 0.3, 1)
        rec_hi = round(max(rec_lo + 0.2, min(pp_max + 0.7, fg_at_peak - 0.4)), 1)
        summary = f"Recommended {rec_lo:.1f}–{rec_hi:.1f} ppg entering {form}" + (f" in the {fields[0]} area" if fields else "") + \
                  f", based on {len(ranges)} wells with {form} penetration."
        sections.append({"heading": "RECOMMENDED MUD WEIGHT", "items": [
            f"{rec_lo:.1f}–{rec_hi:.1f} ppg before entering {form}; raise before the transition, not after the first kick sign",
            f"Pore pressure up to {pp_max:.1f} ppg · fracture gradient {fg_at_peak:.1f} ppg at the pressure peak → usable window ≈ {max(0.0, fg_at_peak - pp_max):.1f} ppg",
            f"Offset wells drilled {form} with {min(mws):.1f}–{max(mws):.1f} ppg" if mws else "No offset mud weights recorded",
        ]})
        if kicks:
            sections.append({"heading": "WELL-CONTROL HISTORY", "items": [
                f"{h['citation']}: {h['severity']} kick with {h['mud_weight_ppg']:.1f} ppg — {_shorten(h['mitigation'], 110)}" for h in kicks[:3]]})
        if losses:
            sections.append({"heading": "LOSS SENSITIVITY", "items": [f"{h['citation']}: losses with {h['mud_weight_ppg']:.1f} ppg — keep ECD below {fg_at_peak - 0.3:.1f} ppg" for h in losses[:2]]})
        sections.append({"heading": "RECOMMENDED ACTION", "text": RECOMMENDED_ACTIONS["Kick"] if form in ("Kopili", "Sylhet") else RECOMMENDED_ACTIONS["Mud Loss"]})
        hits = (kicks + losses + ev_form)[:8]

    elif intent == "casing":
        ids = list(nearby_ids) if not fields else [w.id for w in wells.values() if w.field == fields[0]]
        if wids:
            ids = wids
        cas = session.exec(select(CasingString)).all()
        rows = [c for c in cas if c.well_id in ids]
        by_type: dict[str, list[CasingString]] = {}
        for c in rows:
            by_type.setdefault(c.string_type, []).append(c)
        title = "OFFSET CASING PROGRAMME"
        summary = f"Casing programmes of {len({c.well_id for c in rows})} wells {scope_note if not wids else ', '.join(wids)}."
        sections.append({"heading": "TYPICAL PROGRAMME", "items": [
            f"{st}: {by_type[st][0].size_in} in {by_type[st][0].hole_size_in} hole · shoe {min(c.shoe_depth_m for c in by_type[st]):,.0f}–{max(c.shoe_depth_m for c in by_type[st]):,.0f} m"
            for st in ("Conductor", "Surface", "Intermediate", "Production") if st in by_type]})
        cem = [h for h in index.search(None, event_type="Cementing Issue") if h["well_id"] in ids]
        if cem:
            sections.append({"heading": "CEMENTING ISSUES", "items": [f"{h['citation']}: {_shorten(h['description'], 120)}" for h in cem[:4]]})
        sections.append({"heading": "RECOMMENDED ACTION", "text": RECOMMENDED_ACTIONS["Cementing Issue"]})
        hits = cem[:6]

    else:
        primary = _primary_label(type_counts)
        primary_type = type_counts.most_common(1)[0][0] if type_counts else None
        sections.append({"heading": "PRIMARY RISK", "text": primary + (f" — {type_counts[primary_type]} of {len(hits)} incidents" if primary_type else "")})
        if primary_type:
            sections.append({"heading": "COMMON INDICATORS", "items": EVENT_INDICATORS[primary_type][:3]})
        mits: list[str] = []
        for h in sorted(hits, key=lambda r: 0 if r["event_type"] == primary_type else 1):  # primary-risk mitigations first
            m = _shorten(h["mitigation"], 120)
            if m and m not in mits:
                mits.append(m)
        if mits:
            sections.append({"heading": "HISTORICAL MITIGATION", "items": mits[:3]})
        if intent in ("lessons", "well") or not mits:
            lessons: list[str] = []
            for h in hits:
                l = _shorten(h["lesson_learned"], 120)
                if l and l not in lessons:
                    lessons.append(l)
            if lessons:
                sections.append({"heading": "LESSONS LEARNED", "items": lessons[:3]})
        if wids:
            w = wells[wids[0]]
            npt = sum(h["npt_hours"] for h in hits)
            sections.insert(0, {"heading": "WELL", "text": f"{w.id} · {w.field} · TD {w.total_depth_m:,.0f} m · {w.status} · {len(hits)} incidents · {npt:.0f} hrs NPT"})
        if primary_type:
            sections.append({"heading": "RECOMMENDED ACTION", "text": RECOMMENDED_ACTIONS[primary_type]})

    resp = {"mode": "offline_structured", "provider": llm.describe(), "title": title, "summary": summary, "sections": sections,
            "citations": _citations(hits), "intent": intent, "retrieved": len(hits), "data_label": "SYNTHETIC DEMONSTRATION DATA"}
    resp["answer_text"] = _render_text(resp)
    return resp
