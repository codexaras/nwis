"""Export deterministic JSON snapshots of every endpoint into frontend/public/demo-data (SPEC §8 offline fallback).

Run after seeding:  python export_demo_data.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import DEMO_DATA_DIR  # noqa: E402
from app.main import app  # noqa: E402
from app.services.rag import SUGGESTED_PROMPTS  # noqa: E402


def dump(name: str, payload) -> None:
    path = DEMO_DATA_DIR / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  {name:48s} {path.stat().st_size // 1024:5d} KB")


def main() -> None:
    DEMO_DATA_DIR.mkdir(parents=True, exist_ok=True)
    with TestClient(app) as c:
        c.get("/api/live", params={"reset": "true"})
        print(f"exporting demo snapshots → {DEMO_DATA_DIR}")
        dump("stats.json", c.get("/api/stats").json())
        dump("formations.json", c.get("/api/formations").json())
        wells = c.get("/api/wells").json()
        dump("wells.json", wells)
        for w in wells["wells"]:
            dump(f"wells/{w['id']}.json", c.get(f"/api/wells/{w['id']}").json())
        for r in (5, 10, 15, 25):
            dump(f"nearby-{r}.json", c.get("/api/wells/nearby", params={"radius_km": r}).json())
        dump("events.json", c.get("/api/events", params={"limit": 500}).json())
        dump("correlation-default.json", c.get("/api/correlation").json())
        dump("risk-profile-15.json", c.get("/api/risk/profile", params={"radius_km": 15}).json())
        dump("risk-profile-25.json", c.get("/api/risk/profile", params={"radius_km": 25}).json())
        dump("live.json", c.get("/api/live").json())
        dump("documents-samples.json", c.get("/api/documents/samples").json())
        dump("ingest-sample-ddr.json", c.post("/api/documents/sample", params={"name": "DDR_DLJ-12_2019-03-14.pdf"}).json())
        dump("ingest-sample-scanned.json", c.post("/api/documents/sample", params={"name": "DDR_DLJ-18_2020-01-27_SCANNED.pdf"}).json())
        answers = {p: c.post("/api/assistant/chat", json={"message": p}).json() for p in SUGGESTED_PROMPTS}
        dump("assistant-samples.json", {"prompts": SUGGESTED_PROMPTS, "answers": answers})
    print("done")


if __name__ == "__main__":
    main()
