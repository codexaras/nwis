"""SQLModel tables. Every page reads from these same rows → cross-page consistency."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Well(SQLModel, table=True):
    __tablename__ = "wells"

    id: str = Field(primary_key=True)  # e.g. "DLJ-12"
    name: str
    field: str  # Duliajan / Naharkatiya / Moran / Baghjan / Hugrijan
    lat: float
    lon: float
    spud_date: date
    completion_date: Optional[date] = None
    total_depth_m: float  # planned TD for the active well
    status: str  # Producing / Completed / Suspended / Abandoned / Drilling
    well_type: str  # vertical / deviated
    rig: str
    notes: str = ""
    is_active: bool = False
    operator: str = "Oil India Limited"


class FormationTop(SQLModel, table=True):
    __tablename__ = "formation_tops"

    id: Optional[int] = Field(default=None, primary_key=True)
    well_id: str = Field(foreign_key="wells.id", index=True)
    name: str  # Alluvium … Basement
    order_index: int
    top_m: float
    base_m: float
    lithology: str  # sand / clay / shale / coal / limestone / basement
    lithology_desc: str = ""


class DrillingEvent(SQLModel, table=True):
    __tablename__ = "drilling_events"

    id: Optional[int] = Field(default=None, primary_key=True)
    well_id: str = Field(foreign_key="wells.id", index=True)
    depth_m: float
    formation: str = Field(index=True)
    event_type: str = Field(index=True)
    severity: str = Field(index=True)  # Low / Medium / High / Critical
    npt_hours: float = 0.0
    mud_weight_ppg: float = 0.0
    description: str
    mitigation: str = ""
    lesson_learned: str = ""
    source_doc: str = ""
    event_date: Optional[date] = None
    origin: str = "seed"  # seed / upload
    document_id: Optional[int] = None


class CasingString(SQLModel, table=True):
    __tablename__ = "casing_strings"

    id: Optional[int] = Field(default=None, primary_key=True)
    well_id: str = Field(foreign_key="wells.id", index=True)
    string_type: str  # Conductor / Surface / Intermediate / Production
    size_in: str  # e.g. 13-3/8"
    hole_size_in: str
    shoe_depth_m: float
    cement_top_m: float
    cementing_notes: str = ""
    order_index: int = 0


class DepthLog(SQLModel, table=True):
    __tablename__ = "depth_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    well_id: str = Field(foreign_key="wells.id", index=True)
    depth_m: float
    formation: str
    rop: float  # m/hr
    wob: float  # klbs
    rpm: float
    torque: float  # kft-lb
    spp: float  # psi
    mud_weight: float  # ppg
    ecd: float  # ppg
    gas_units: float


class PressurePoint(SQLModel, table=True):
    __tablename__ = "pressure_window"

    id: Optional[int] = Field(default=None, primary_key=True)
    well_id: str = Field(foreign_key="wells.id", index=True)
    depth_m: float
    pore_pressure_ppg: float
    fracture_gradient_ppg: float


class Document(SQLModel, table=True):
    __tablename__ = "documents"

    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    stored_path: str = ""
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    page_count: int = 0
    text_chars: int = 0
    text_source: str = ""  # pdf_text / ocr / bundled_transcript / none
    ocr_status: str = ""  # not_needed / ok / not_installed / failed
    extraction_method: str = ""  # llm / rules
    well_id: Optional[str] = None
    status: str = "extracted"  # extracted / confirmed
    event_count: int = 0
    is_sample: bool = False
