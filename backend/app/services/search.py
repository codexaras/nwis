"""Knowledge search: keyword + TF-IDF ranking over drilling events / lessons (/api/events)."""
from __future__ import annotations

import re
import threading
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sqlmodel import Session, select

from ..models import DrillingEvent, Well
from .geo import haversine_km
from .reference import EVENT_TYPES, FIELDS, FORMATION_NAMES, SEVERITIES, SEVERITY_RANK
from .serializers import event_to_dict

_WELL_RE = re.compile(r"\b([A-Z]{3}-(?:ACT-)?\d{2,3})\b", re.I)

EVENT_SYNONYMS: dict[str, list[str]] = {
    "Mud Loss": ["mud loss", "losses", "loss of returns", "lost circulation", "seepage", "lcm"],
    "Kick": ["kick", "influx", "pit gain", "well control", "overpressure", "blowout"],
    "Stuck Pipe": ["stuck pipe", "stuck", "differential sticking", "pipe stuck"],
    "Torque Spike": ["torque", "stick-slip", "stick slip", "pack-off", "packoff"],
    "Tight Hole": ["tight hole", "drag", "overpull", "reaming", "swelling"],
    "Cementing Issue": ["cement", "cementing", "cbl", "bond", "channelling", "channeling", "squeeze"],
    "Fishing": ["fishing", "fish", "twist-off", "twist off", "parted", "junk"],
    "Wellbore Instability": ["instability", "cavings", "caving", "hole enlargement", "collapse", "unstable"],
}


def mentioned_formations(text: str) -> list[str]:
    low = text.lower()
    return [f for f in FORMATION_NAMES if f.lower() in low]


def mentioned_wells(text: str) -> list[str]:
    return [m.upper() for m in _WELL_RE.findall(text)]


def mentioned_event_types(text: str) -> list[str]:
    low = text.lower()
    hits = []
    for etype, syns in EVENT_SYNONYMS.items():
        if any(s in low for s in syns):
            hits.append(etype)
    return hits


def mentioned_fields(text: str) -> list[str]:
    low = text.lower()
    return [f for f in FIELDS if f.lower() in low]


def mentioned_severities(text: str) -> list[str]:
    low = text.lower()
    return [s for s in SEVERITIES if s.lower() in low]


class KnowledgeIndex:
    """In-memory TF-IDF index over all events. Rebuilt whenever events change (document confirm)."""

    def __init__(self) -> None:
        self.ready = False
        self._lock = threading.Lock()
        self.records: list[dict[str, Any]] = []
        self.wells: dict[str, Well] = {}
        self._vectorizer: TfidfVectorizer | None = None
        self._matrix = None

    def refresh(self, session: Session) -> None:
        with self._lock:
            wells = {w.id: w for w in session.exec(select(Well)).all()}
            active = next((w for w in wells.values() if w.is_active), None)
            events = session.exec(select(DrillingEvent).order_by(DrillingEvent.well_id, DrillingEvent.depth_m)).all()
            records = []
            docs = []
            for e in events:
                w = wells.get(e.well_id)
                rec = event_to_dict(e, w)
                rec["field"] = w.field if w else None
                rec["distance_km"] = round(haversine_km(active.lat, active.lon, w.lat, w.lon), 1) if (active and w) else None
                records.append(rec)
                docs.append(self._doc_text(rec))
            vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english", min_df=1)
            matrix = vec.fit_transform(docs) if docs else None
            self.records, self.wells, self._vectorizer, self._matrix = records, wells, vec, matrix
            self.ready = True

    @staticmethod
    def _doc_text(r: dict[str, Any]) -> str:
        return " ".join([
            r["event_type"], r["event_type"], r["formation"], r["formation"], r["well_id"], r.get("field") or "",
            r["severity"], r["description"], r["mitigation"], r["lesson_learned"], r["source_doc"],
        ])

    def search(self, query: str | None = None, *, event_type: str | None = None, formation: str | None = None,
               severity: str | None = None, well_id: str | None = None, field: str | None = None,
               well_ids: set[str] | None = None, origin: str | None = None, top_k: int | None = None) -> list[dict[str, Any]]:
        """Returns matching event dicts (copies) with a `score` key, best first."""
        if not self.ready:
            return []
        q = (query or "").strip()
        base_scores: np.ndarray
        if q and self._matrix is not None:
            qv = self._vectorizer.transform([q])
            base_scores = np.asarray((self._matrix @ qv.T).todense()).ravel()
        else:
            base_scores = np.zeros(len(self.records))

        q_low = q.lower()
        q_types = mentioned_event_types(q) if q else []
        q_forms = mentioned_formations(q) if q else []
        q_wells = mentioned_wells(q) if q else []

        results: list[dict[str, Any]] = []
        for i, r in enumerate(self.records):
            if event_type and r["event_type"].lower() != event_type.lower():
                continue
            if formation and r["formation"].lower() != formation.lower():
                continue
            if severity and r["severity"].lower() != severity.lower():
                continue
            if well_id and r["well_id"].upper() != well_id.upper():
                continue
            if field and (r.get("field") or "").lower() != field.lower():
                continue
            if well_ids is not None and r["well_id"] not in well_ids:
                continue
            if origin and r["origin"] != origin:
                continue
            score = float(base_scores[i])
            if q:
                # keyword boosts: exact vocabulary hits outrank fuzzy text similarity
                if r["event_type"] in q_types:
                    score += 0.35
                if r["formation"] in q_forms:
                    score += 0.30
                if r["well_id"] in q_wells:
                    score += 0.50
                if q_low and q_low in r["description"].lower():
                    score += 0.10
                if score <= 0.02:
                    continue  # no relevance at all
                # proximity tie-break: nearer offsets outrank distant ones with equal textual relevance
                dist = r.get("distance_km")
                if dist is not None:
                    score += 0.10 * (1.0 - min(dist, 40.0) / 40.0)
            out = dict(r)
            out["score"] = round(score, 4)
            results.append(out)

        if q:
            results.sort(key=lambda r: (-r["score"], -SEVERITY_RANK[r["severity"]], -r["npt_hours"]))
        else:
            results.sort(key=lambda r: (-SEVERITY_RANK[r["severity"]], -r["npt_hours"], r.get("distance_km") or 0, r["well_id"], r["depth_m"]))
        return results[:top_k] if top_k else results

    def facets(self, records: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
        types = {t: 0 for t in EVENT_TYPES}
        forms = {f: 0 for f in FORMATION_NAMES}
        sevs = {s: 0 for s in SEVERITIES}
        for r in records:
            types[r["event_type"]] = types.get(r["event_type"], 0) + 1
            forms[r["formation"]] = forms.get(r["formation"], 0) + 1
            sevs[r["severity"]] = sevs.get(r["severity"], 0) + 1
        return {"event_types": types, "formations": {k: v for k, v in forms.items() if v}, "severities": sevs}

    def get(self, event_id: int) -> dict[str, Any] | None:
        for r in self.records:
            if r["id"] == event_id:
                return dict(r)
        return None
