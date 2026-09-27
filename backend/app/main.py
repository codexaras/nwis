"""eRTMAC-NWIS backend — FastAPI application."""
from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from . import state
from .config import BACKEND_DIR, DB_PATH
from .db import create_db_and_tables, engine
from .models import Well
from .routers import assistant, correlation, documents, events, live, risk, stats, wells


def _ensure_seeded() -> None:
    create_db_and_tables()
    with Session(engine) as s:
        if s.exec(select(Well)).first() is not None:
            return
    # No data → build the deterministic dataset in-process so `uvicorn app.main:app` alone always works.
    sys.path.insert(0, str(BACKEND_DIR))
    import seed  # noqa: WPS433

    data = seed.build_dataset()
    seed.write_db(data)
    from sample_docs_gen import generate_all

    generate_all()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_seeded()
    with Session(engine) as s:
        state.get_index(s)
        state.sim.ensure(s)
    yield


app = FastAPI(
    title="eRTMAC-NWIS API",
    version="0.2.0",
    description="Nearby Wells Intelligence System — synthetic demonstration backend (SIH 2026 · PS SIH26121). "
                "All data is SYNTHETIC DEMONSTRATION DATA; the live feed is SIMULATED.",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

app.include_router(wells.router)
app.include_router(events.router)
app.include_router(correlation.router)
app.include_router(risk.router)
app.include_router(live.router)
app.include_router(documents.router)
app.include_router(assistant.router)
app.include_router(stats.router)


@app.get("/")
def root() -> dict:
    return {"name": "eRTMAC-NWIS API", "docs": "/docs", "health": "/api/health", "db": str(DB_PATH.name)}
