"""Runtime configuration loaded from environment / .env (all optional)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

SEED = 26121  # SIH problem statement number → deterministic dataset

LLM_PROVIDER = (os.getenv("LLM_PROVIDER") or "").strip().lower()
LLM_API_KEY = (os.getenv("LLM_API_KEY") or "").strip()
LLM_MODEL = (os.getenv("LLM_MODEL") or "").strip()

DB_PATH = BACKEND_DIR / (os.getenv("NWIS_DB_PATH") or "nwis.db")
SAMPLE_DOCS_DIR = BACKEND_DIR / "sample_docs"
UPLOAD_DIR = BACKEND_DIR / "uploads"
DEMO_DATA_DIR = BACKEND_DIR.parent / "frontend" / "public" / "demo-data"

DEFAULT_RADIUS_KM = float(os.getenv("NWIS_DEFAULT_RADIUS_KM") or 15)
ACTIVE_WELL_ID = "DLJ-ACT-01"

# Live simulation defaults: ~2 m every 3 s at 1x
SIM_START_DEPTH_M = 2784.4
SIM_METERS_PER_TICK = 2.0
SIM_TICK_SECONDS = 3.0
ALERT_LOOKAHEAD_M = 150.0

IST_UTC_OFFSET_HOURS = 5.5


def llm_enabled() -> bool:
    return bool(LLM_PROVIDER in {"gemini", "openai"} and LLM_API_KEY)
