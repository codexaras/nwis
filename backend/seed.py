"""Deterministic synthetic dataset for eRTMAC-NWIS.

SYNTHETIC DEMONSTRATION DATA — Upper Assam fields operated by Oil India (Duliajan, Naharkatiya,
Moran, Baghjan, Hugrijan). Fixed random seed → identical data on every machine, so every page,
the risk engine, the assistant and the sample DDR PDFs all agree with each other.

Run:  python seed.py            (recreates nwis.db + sample_docs)
      python seed.py --verify   (only print counts of the existing DB)
"""
from __future__ import annotations

import math
import random
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from sqlmodel import Session, SQLModel, select  # noqa: E402

from app.config import ACTIVE_WELL_ID, DB_PATH, DEFAULT_RADIUS_KM, SAMPLE_DOCS_DIR, SEED, SIM_START_DEPTH_M  # noqa: E402
from app.db import create_db_and_tables, engine  # noqa: E402
from app.models import CasingString, DepthLog, DrillingEvent, FormationTop, PressurePoint, Well  # noqa: E402
from app.services.geo import haversine_km, offset_km_to_latlon  # noqa: E402
from app.services.reference import (  # noqa: E402
    CASING_PROGRAM,
    DESCRIPTIONS,
    EVENT_ANOMALY,
    EVENT_BIAS,
    FIELDS,
    FORMATIONS,
    FORMATION_BY_NAME,
    LESSONS,
    MITIGATIONS,
    NPT_RANGE,
    PARAM_BASELINE,
    RIGS,
    SEVERITIES,
    SEVERITY_DIST,
    formation_at,
    mud_weight_for,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252

rng = random.Random(SEED)

ACTIVE_LAT, ACTIVE_LON = FIELDS["Duliajan"]["center"]

WELL_NUMBERS = {
    "Duliajan": [3, 7, 12, 18, 21, 24, 29, 33, 36, 41, 45, 52],
    "Naharkatiya": [2, 7, 11, 15, 19, 23, 28],
    "Hugrijan": [2, 5, 9, 13],
    "Baghjan": [5, 8, 12, 16, 21],
    "Moran": [3, 6, 9, 14, 17],
}

# Pinned positions (km north, km east of the active well) so the demo's example citations are geographically real
PINNED_POSITIONS = {
    "DLJ-12": (3.44, 2.41),    # 4.2 km NE  → "nearest offset 4.2 km"
    "DLJ-18": (-2.33, -6.39),  # 6.8 km WSW
    "DLJ-07": (2.80, -4.85),   # 5.6 km WNW
    "DLJ-21": (-2.91, 1.06),   # 3.1 km SSE
    "NHK-07": (-9.0, 7.6),     # 11.8 km SE (inside the 15 km default window)
}

# Pinned formation tops (m) for canonical wells so planted events sit in the right formation
PINNED_TOPS = {
    ACTIVE_WELL_ID: {"Namsang": 176, "Dhekiajuli": 612, "Girujan": 1238, "Tipam": 2041, "Barail": 2928,
                     "Kopili": 3372, "Sylhet": 3718, "Langpar": 3968, "Basement": 4168},
    "DLJ-12": {"Barail": 2896, "Kopili": 3341},
    "NHK-07": {"Barail": 2978, "Kopili": 3418},
    "DLJ-18": {"Barail": 2894, "Kopili": 3336},
    "DLJ-07": {"Barail": 2860, "Kopili": 3078, "Sylhet": 3428},
    "DLJ-21": {"Tipam": 2032, "Barail": 2915},
    "HGJ-02": {"Barail": 2952, "Kopili": 3396, "Sylhet": 3742, "Langpar": 3990},
}
PINNED_TD = {"DLJ-12": 3480, "NHK-07": 3640, "DLJ-18": 3210, "DLJ-07": 3560, "DLJ-21": 2980, "HGJ-02": 4120,
             ACTIVE_WELL_ID: 3650}
PINNED_SPUD = {"DLJ-12": date(2018, 11, 20), "NHK-07": date(2016, 7, 8), "DLJ-18": date(2019, 10, 2),
               "DLJ-07": date(2021, 2, 11), "DLJ-21": date(2018, 5, 30), "HGJ-02": date(2013, 9, 1)}

# Planted events → make the documented example citations literally true and give each sample DDR real content
CANONICAL_EVENTS: list[dict] = [
    dict(well_id="DLJ-12", depth_m=2940.0, formation="Barail", event_type="Stuck Pipe", severity="High", npt_hours=18.5,
         mud_weight_ppg=10.6, event_date=date(2019, 3, 14), source_doc="DDR_DLJ-12_2019-03-14.pdf",
         description="Pipe became stuck while making connection at 2,940 m MD in Barail shale/coal sequence. Overpull to 85 klbs, no rotation. Worked pipe with jarring for 4.5 hrs; freed after spotting 30 bbl lubricant pill. Torque had risen from 9 to 14 kft-lb over the preceding 60 m.",
         mitigation="Increased circulation before connections; short reaming intervals; improved hole conditioning with hi-vis sweeps.",
         lesson_learned="Rising torque trend in upper Barail is a precursor to stuck pipe; ream every stand and keep jars armed below 2,900 m."),
    dict(well_id="DLJ-12", depth_m=2912.0, formation="Barail", event_type="Torque Spike", severity="Medium", npt_hours=3.0,
         mud_weight_ppg=10.5, event_date=date(2019, 3, 14), source_doc="DDR_DLJ-12_2019-03-14.pdf",
         description="Torque increased from 9 to 13 kft-lb at 2,912 m MD on entering Barail coal seams; stick-slip observed and ROP dropped from 9 to 4 m/hr.",
         mitigation="Reduced WOB/RPM, circulated bottoms-up and added lubricant to the mud system.",
         lesson_learned="Upper Barail coal seams produce torque spikes 20-40 m below the top; pre-condition the mud before entering."),
    dict(well_id="NHK-07", depth_m=3012.0, formation="Barail", event_type="Stuck Pipe", severity="High", npt_hours=22.0,
         mud_weight_ppg=10.8, event_date=date(2016, 11, 2), source_doc="DDR_NHK-07_2016-11-02.pdf",
         description="String stuck at 3,012 m MD in Barail after 35 min static during survey. Overpull 110 klbs, no rotation. Freed after 9 hrs of jarring and a 40 bbl pipe-freeing pill.",
         mitigation="Applied controlled overpull to 110 klbs, spotted pipe-freeing agent and regained rotation after 9 hrs; reamed interval twice.",
         lesson_learned="Avoid static pipe across Barail coal seams; keep pipe moving during surveys and connections."),
    dict(well_id="NHK-07", depth_m=2988.0, formation="Barail", event_type="Torque Spike", severity="Medium", npt_hours=2.5,
         mud_weight_ppg=10.7, event_date=date(2016, 11, 2), source_doc="DDR_NHK-07_2016-11-02.pdf",
         description="Erratic torque (10-16 kft-lb) with pack-off tendency at 2,988 m MD in Barail coal/shale.",
         mitigation="Lowered RPM, added lubricant to mud system and reamed the interval before drilling ahead.",
         lesson_learned="Monitor the torque trend, not the absolute value, when drilling Barail."),
    dict(well_id="DLJ-18", depth_m=2975.0, formation="Barail", event_type="Tight Hole", severity="High", npt_hours=9.5,
         mud_weight_ppg=10.5, event_date=date(2020, 1, 27), source_doc="DDR_DLJ-18_2020-01-27_SCANNED.pdf",
         description="Tight hole at 2,975 m MD in Barail; overpull 70 klbs on trip out, reaming required through 45 m interval. Restricted movement after each connection.",
         mitigation="Back-reamed interval, pumped hi-vis sweeps and raised mud inhibition (KCl) to reduce clay swelling.",
         lesson_learned="Ream on connections through Barail; do not wait for drag to increase."),
    dict(well_id="DLJ-18", depth_m=2951.0, formation="Barail", event_type="Torque Spike", severity="Low", npt_hours=1.0,
         mud_weight_ppg=10.4, event_date=date(2020, 1, 27), source_doc="DDR_DLJ-18_2020-01-27_SCANNED.pdf",
         description="Torque spike to 15 kft-lb at 2,951 m MD (Barail); string stalled once before parameters were reduced.",
         mitigation="Reduced WOB/RPM and circulated bottoms-up.",
         lesson_learned="Expect torque increase in Barail coal seams; pre-empt with lubricant and a stabilised BHA."),
    dict(well_id="DLJ-07", depth_m=3112.0, formation="Kopili", event_type="Kick", severity="Critical", npt_hours=46.0,
         mud_weight_ppg=12.1, event_date=date(2021, 6, 18), source_doc="DDR_DLJ-07_2021-06-18.pdf",
         description="Well kicked at 3,112 m MD on entering Kopili shale; pit gain 18 bbl, SIDPP 620 psi, SICP 780 psi. Gas units peaked at 1,450. Influx circulated out via driller's method.",
         mitigation="Shut in well on annular preventer, circulated kick out via driller's method and raised MW from 12.1 to 13.0 ppg.",
         lesson_learned="Raise MW before the Kopili transition; overpressure onset is sharp in this field."),
    dict(well_id="DLJ-07", depth_m=3094.0, formation="Kopili", event_type="Wellbore Instability", severity="Medium", npt_hours=5.5,
         mud_weight_ppg=12.1, event_date=date(2021, 6, 18), source_doc="DDR_DLJ-07_2021-06-18.pdf",
         description="Large cavings at shakers while drilling Kopili at 3,094 m MD; erratic torque and 3 m fill on bottom after trip.",
         mitigation="Raised MW by 0.3 ppg, minimised open-hole time and controlled tripping speeds.",
         lesson_learned="Minimise open-hole time in Kopili; shale destabilises within days."),
    dict(well_id="DLJ-21", depth_m=2456.0, formation="Tipam", event_type="Mud Loss", severity="High", npt_hours=14.0,
         mud_weight_ppg=9.9, event_date=date(2018, 9, 5), source_doc="DDR_DLJ-21_2018-09-05.pdf",
         description="Partial losses of 18 bbl/hr observed while drilling Tipam sands at 2,456 m MD with 9.9 ppg mud. Pit volume decreased 140 bbl before losses were controlled.",
         mitigation="Pumped 40 ppb LCM pill (fine/medium) and reduced flow rate to lower ECD; losses cured after 6 hrs.",
         lesson_learned="Pre-treat mud with LCM before entering Tipam sands; keep pills staged on surface."),
    dict(well_id="DLJ-21", depth_m=2431.0, formation="Tipam", event_type="Mud Loss", severity="Low", npt_hours=1.5,
         mud_weight_ppg=9.8, event_date=date(2018, 9, 5), source_doc="DDR_DLJ-21_2018-09-05.pdf",
         description="Seepage losses (4 bbl/hr) encountered in Tipam sands at 2,431 m MD; total loss 22 bbl.",
         mitigation="Added fine LCM to the active system and monitored pit volume.",
         lesson_learned="Seepage in upper Tipam precedes larger losses deeper in the sand package."),
    dict(well_id="HGJ-02", depth_m=3790.0, formation="Sylhet", event_type="Mud Loss", severity="Critical", npt_hours=52.0,
         mud_weight_ppg=11.9, event_date=date(2014, 2, 22), source_doc="DDR_HGJ-02_2014-02-22.pdf",
         description="Total loss of returns at 3,790 m MD in fractured Sylhet limestone; loss rate exceeded 120 bbl/hr. Standpipe pressure dropped 380 psi. Well kept full with water while LCM was mixed.",
         mitigation="Reduced mud weight by 0.3 ppg and spotted a cross-linked LCM pill across the loss zone; cured after two attempts.",
         lesson_learned="Reduce ECD (lower flow, controlled ROP) when approaching the Sylhet loss zone; stage cross-linked pills before drilling into the limestone."),
    dict(well_id="HGJ-02", depth_m=3804.0, formation="Sylhet", event_type="Kick", severity="High", npt_hours=16.0,
         mud_weight_ppg=12.3, event_date=date(2014, 2, 22), source_doc="DDR_HGJ-02_2014-02-22.pdf",
         description="Flow observed on connection at 3,804 m MD (Sylhet) after losses reduced hydrostatic head; 9 bbl gain. Well shut in with SIDPP 310 psi.",
         mitigation="Flow-checked, closed BOP, circulated influx out and increased MW to 12.6 ppg with kill-line monitoring.",
         lesson_learned="Narrow window in Sylhet: manage ECD carefully to avoid losses while holding the kick off."),
    # Active well — incidents already logged while drilling the current section (eRTMAC stream)
    dict(well_id=ACTIVE_WELL_ID, depth_m=1642.0, formation="Girujan", event_type="Tight Hole", severity="Low", npt_hours=2.5,
         mud_weight_ppg=9.6, event_date=date(2026, 8, 31), source_doc="eRTMAC-RT stream",
         description="Tight hole at 1,642 m MD in Girujan clays; overpull 35 klbs on connection, reamed stand twice.",
         mitigation="Reamed on connections and raised KCl concentration.",
         lesson_learned="Girujan clays respond well to increased inhibition; ream early."),
    dict(well_id=ACTIVE_WELL_ID, depth_m=2418.0, formation="Tipam", event_type="Mud Loss", severity="Medium", npt_hours=6.0,
         mud_weight_ppg=9.8, event_date=date(2026, 9, 15), source_doc="eRTMAC-RT stream",
         description="Partial losses of 12 bbl/hr while drilling Tipam sands at 2,418 m MD with 9.8 ppg mud; 65 bbl lost before cure.",
         mitigation="Pumped 35 ppb LCM pill and reduced flow rate; losses cured after 4 hrs.",
         lesson_learned="Tipam losses in this well match DLJ-21 experience at similar depth."),
]


# ----------------------------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------------------------
def poisson(lam: float) -> int:
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def weighted_choice(weights: dict[str, float]) -> str:
    keys = list(weights.keys())
    return rng.choices(keys, weights=[weights[k] for k in keys], k=1)[0]


def pick_severity(event_type: str) -> str:
    return rng.choices(SEVERITIES, weights=SEVERITY_DIST[event_type], k=1)[0]


def fmt_depth(d: float) -> str:
    return f"{d:,.0f}"


def km_offsets(lat: float, lon: float) -> tuple[float, float]:
    km_north = (lat - ACTIVE_LAT) * 111.32
    km_east = (lon - ACTIVE_LON) * 111.32 * math.cos(math.radians(lat))
    return km_north, km_east


# ----------------------------------------------------------------------------------------------
# wells
# ----------------------------------------------------------------------------------------------
def place_wells() -> list[dict]:
    wells: list[dict] = []
    placed: list[tuple[float, float]] = [(ACTIVE_LAT, ACTIVE_LON)]

    for field, meta in FIELDS.items():
        code = meta["code"]
        c_lat, c_lon = meta["center"]
        numbers = WELL_NUMBERS[field]
        n = len(numbers)
        for rank, num in enumerate(numbers):
            wid = f"{code}-{num:02d}"
            if wid in PINNED_POSITIONS:
                kn, ke = PINNED_POSITIONS[wid]
                lat, lon = offset_km_to_latlon(ACTIVE_LAT, ACTIVE_LON, kn, ke)
            else:
                for _ in range(200):
                    kn = rng.gauss(0, meta["spread_km"] * 0.55)
                    ke = rng.gauss(0, meta["spread_km"] * 0.55)
                    lat, lon = offset_km_to_latlon(c_lat, c_lon, kn, ke)
                    if all(haversine_km(lat, lon, plat, plon) >= 0.7 for plat, plon in placed):
                        break
            placed.append((lat, lon))
            spud = PINNED_SPUD.get(wid) or date(2003 + int(round(20 * rank / max(1, n - 1))) + rng.choice([0, 0, 1]),
                                                 rng.randint(1, 12), rng.randint(1, 28))
            if spud.year > 2024:
                spud = spud.replace(year=2024)
            wells.append({
                "id": wid, "name": wid, "field": field, "lat": round(lat, 5), "lon": round(lon, 5), "spud_date": spud,
                "well_type": rng.choices(["vertical", "deviated"], weights=[0.6, 0.4])[0], "rig": rng.choice(RIGS),
                "is_active": False,
            })

    wells.append({
        "id": ACTIVE_WELL_ID, "name": ACTIVE_WELL_ID, "field": "Duliajan", "lat": ACTIVE_LAT, "lon": ACTIVE_LON,
        "spud_date": date(2026, 8, 14), "well_type": "vertical", "rig": "OIL-E1400", "is_active": True,
    })
    return wells


def compute_tops(w: dict, td: float) -> list[dict]:
    kn, ke = km_offsets(w["lat"], w["lon"])
    regional = 8.0 * ke - 6.0 * kn  # structure deepens to the south-east
    field_off = FIELDS[w["field"]]["depth_offset"]
    well_noise = rng.gauss(0, 18)
    pins = PINNED_TOPS.get(w["id"], {})

    raw: list[float] = []
    for f in FORMATIONS:
        base = f["base_top_m"]
        if base == 0:
            raw.append(0.0)
            continue
        scale = base / 2900.0
        top = base + (regional + field_off + well_noise) * scale + rng.gauss(0, 7)
        if f["name"] in pins:
            top = float(pins[f["name"]])
        raw.append(top)

    # enforce monotonic tops with a minimum thickness
    tops: list[float] = [0.0]
    for i in range(1, len(raw)):
        tops.append(max(raw[i], tops[-1] + 60.0))

    result: list[dict] = []
    for i, f in enumerate(FORMATIONS):
        top = round(tops[i], 1)
        if top >= td:
            break
        base = round(min(tops[i + 1], td) if i + 1 < len(tops) else td, 1)
        result.append({"name": f["name"], "order_index": i, "top_m": top, "base_m": base,
                       "lithology": f["lithology"], "lithology_desc": f["lithology_desc"]})
    return result


def choose_td(w: dict, barail_top_estimate: float) -> float:
    if w["id"] in PINNED_TD:
        return float(PINNED_TD[w["id"]])
    bucket = rng.choices(["shallow", "medium", "deep", "vdeep"], weights=[0.30, 0.35, 0.25, 0.10])[0]
    extra = {"shallow": rng.uniform(150, 400), "medium": rng.uniform(450, 800),
             "deep": rng.uniform(850, 1150), "vdeep": rng.uniform(1200, 1500)}[bucket]
    if w["field"] == "Baghjan":
        extra += 150
    td = barail_top_estimate + extra
    return float(round(max(2800.0, min(4500.0, td)) / 5) * 5)


def estimate_barail_top(w: dict) -> float:
    kn, ke = km_offsets(w["lat"], w["lon"])
    return 2900 + 8.0 * ke - 6.0 * kn + FIELDS[w["field"]]["depth_offset"]


# ----------------------------------------------------------------------------------------------
# casing
# ----------------------------------------------------------------------------------------------
def build_casing(wid: str, tops: list[dict], td: float) -> list[dict]:
    by_name = {t["name"]: t for t in tops}
    strings: list[dict] = []

    conductor_shoe = round(rng.uniform(60, 110), 1)
    strings.append({"string_type": "Conductor", "shoe_depth_m": conductor_shoe, "cement_top_m": 0.0,
                    "cementing_notes": "Cemented to surface; returns observed at cellar."})

    dhk = by_name.get("Dhekiajuli")
    if dhk:
        surf_shoe = dhk["top_m"] + (dhk["base_m"] - dhk["top_m"]) * rng.uniform(0.55, 0.8)
    else:
        surf_shoe = min(td - 100, 900)
    surf_shoe = round(surf_shoe, 1)
    strings.append({"string_type": "Surface", "shoe_depth_m": surf_shoe, "cement_top_m": 0.0,
                    "cementing_notes": rng.choice([
                        "Single-stage job, cement to surface; good returns throughout.",
                        "Cemented to surface with lead/tail slurry; top job not required.",
                        "Cement to surface; minor losses during displacement, cured with LCM in spacer."])})

    brl = by_name.get("Barail")
    tpm = by_name.get("Tipam")
    if brl and td > brl["top_m"] + 250:
        int_shoe = brl["top_m"] + rng.uniform(20, 60)
    elif tpm:
        int_shoe = min(tpm["top_m"] + rng.uniform(30, 80), td - 150)
    else:
        int_shoe = td - 300
    int_shoe = round(min(int_shoe, td - 120), 1)
    int_toc = round(max(surf_shoe - 50, int_shoe - rng.uniform(500, 900)), 1)
    strings.append({"string_type": "Intermediate", "shoe_depth_m": int_shoe, "cement_top_m": int_toc,
                    "cementing_notes": rng.choice([
                        "Two-stage cementation; CBL indicated good bond across Tipam sands.",
                        "Single-stage job with 600 m cement column; lift pressure achieved.",
                        "Cemented with spacer and low-density lead; bond acceptable on CBL."])})

    prod_shoe = round(td - rng.uniform(10, 40), 1)
    prod_toc = round(max(int_shoe - 100, prod_shoe - rng.uniform(350, 700)), 1)
    strings.append({"string_type": "Production", "shoe_depth_m": prod_shoe, "cement_top_m": prod_toc,
                    "cementing_notes": rng.choice([
                        "Production casing cemented across reservoir; pressure test to 3,500 psi OK.",
                        "Cemented with 15.8 ppg tail slurry; CBL good bond across pay zone.",
                        "Liner-style tail slurry; top of cement confirmed by temperature survey."])})

    for i, s in enumerate(strings):
        prog = CASING_PROGRAM[i]
        s.update({"well_id": wid, "size_in": prog["size_in"], "hole_size_in": prog["hole_size_in"], "order_index": i})
    return strings


# ----------------------------------------------------------------------------------------------
# events
# ----------------------------------------------------------------------------------------------
def render_text(template: str, ctx: dict) -> str:
    class _Safe(dict):
        def __missing__(self, key):
            return "{" + key + "}"

    return template.format_map(_Safe(ctx))


def event_context(event_type: str, severity: str, depth: float, formation: str, mw: float, casing: list[dict]) -> dict:
    sev_i = SEVERITIES.index(severity)
    base = PARAM_BASELINE[formation]
    t1 = round(base["torque"] * rng.uniform(0.85, 1.05), 1)
    t2 = round(t1 * rng.uniform(1.35, 1.9), 1)
    shoe = None
    for s in casing:
        if s["shoe_depth_m"] >= depth - 80:
            shoe = s
            break
    size = (shoe or casing[-1])["size_in"]
    top = fmt_depth(max(0.0, depth - rng.uniform(80, 400)))
    return {
        "depth": fmt_depth(depth), "formation": formation, "mw": f"{mw:.1f}", "mw2": f"{mw + rng.uniform(0.4, 0.9):.1f}",
        "rate": int(rng.uniform(4, 12) * (1 + sev_i * 1.6)), "pit": int(rng.uniform(10, 40) * (1 + sev_i * 2.2)),
        "dspp": int(rng.uniform(80, 120) * (1 + sev_i * 0.7)), "sidpp": int(rng.uniform(150, 260) * (1 + sev_i * 0.8)),
        "sicp": int(rng.uniform(220, 340) * (1 + sev_i * 0.8)), "gas": int(rng.uniform(200, 400) * (1 + sev_i * 1.1)),
        "overpull": int(rng.uniform(35, 55) * (1 + sev_i * 0.5)), "t1": t1, "t2": t2, "mins": rng.randint(15, 60),
        "len": rng.randint(12, 90), "size": size, "top": top, "short": rng.randint(60, 250),
        "hrs": round(rng.uniform(2, 6) * (1 + sev_i), 1), "pill": rng.randint(20, 60), "lcm": rng.randint(30, 60),
        "psi": rng.choice([2500, 3000, 3500, 4000]),
    }


def build_events(w: dict, tops: list[dict], td: float, casing: list[dict], drilling_days: int) -> list[dict]:
    events: list[dict] = []
    spud: date = w["spud_date"]
    for t in tops:
        thickness = t["base_m"] - t["top_m"]
        if thickness < 40:
            continue
        f = FORMATION_BY_NAME[t["name"]]
        expected = (FORMATIONS[t["order_index"] + 1]["base_top_m"] - f["base_top_m"]) if t["order_index"] + 1 < len(FORMATIONS) else 300
        lam = f["mean_events"] * min(1.0, thickness / max(1.0, expected))
        n = poisson(lam)
        bias = {k: v for k, v in EVENT_BIAS[t["name"]].items() if k != "Cementing Issue"}
        for _ in range(n):
            etype = weighted_choice(bias)
            severity = pick_severity(etype)
            if etype == "Kick" and t["name"] == "Kopili":
                rel = rng.betavariate(1.5, 4.0)
            elif etype == "Stuck Pipe":
                rel = rng.betavariate(2.0, 2.0)
            else:
                rel = rng.betavariate(1.5, 1.5)
            depth = round(t["top_m"] + 15 + rel * (thickness - 30), 0)
            if depth >= td - 5:
                depth = round(td - rng.uniform(10, 40), 0)
            mw = mud_weight_for(t["name"], rel) + round(rng.uniform(-0.1, 0.1), 1)
            lo, hi = NPT_RANGE[severity]
            npt = round(rng.uniform(lo, hi) * (1.4 if etype == "Fishing" else 1.0), 1)
            ctx = event_context(etype, severity, depth, t["name"], mw, casing)
            ev_date = spud + timedelta(days=int(drilling_days * (depth / td) ** 1.15))
            events.append({
                "well_id": w["id"], "depth_m": depth, "formation": t["name"], "event_type": etype, "severity": severity,
                "npt_hours": npt, "mud_weight_ppg": round(mw, 1),
                "description": render_text(rng.choice(DESCRIPTIONS[etype]), ctx),
                "mitigation": render_text(rng.choice(MITIGATIONS[etype]), ctx),
                "lesson_learned": render_text(rng.choice(LESSONS[etype]), ctx),
                "source_doc": (f"DDR {w['id']} · {ev_date.isoformat()}" if rng.random() < 0.7 else f"WCR {w['id']}"),
                "event_date": ev_date, "origin": "seed",
            })

    # cementing issues tied to actual casing shoes → casing tab and events agree
    probs = {"Surface": 0.12, "Intermediate": 0.22, "Production": 0.28}
    for s in casing:
        p = probs.get(s["string_type"])
        if not p or rng.random() >= p:
            continue
        depth = round(s["shoe_depth_m"] - rng.uniform(5, 60), 0)
        form = formation_at(tops, depth)
        if not form:
            continue
        severity = pick_severity("Cementing Issue")
        mw = mud_weight_for(form["name"], 0.5)
        ctx = event_context("Cementing Issue", severity, depth, form["name"], mw, casing)
        ctx["size"] = s["size_in"]
        ctx["top"] = fmt_depth(s["cement_top_m"])
        lo, hi = NPT_RANGE[severity]
        ev_date = spud + timedelta(days=int(drilling_days * (depth / td) ** 1.15) + 2)
        events.append({
            "well_id": w["id"], "depth_m": depth, "formation": form["name"], "event_type": "Cementing Issue", "severity": severity,
            "npt_hours": round(rng.uniform(lo, hi), 1), "mud_weight_ppg": mw,
            "description": render_text(rng.choice(DESCRIPTIONS["Cementing Issue"]), ctx),
            "mitigation": render_text(rng.choice(MITIGATIONS["Cementing Issue"]), ctx),
            "lesson_learned": render_text(rng.choice(LESSONS["Cementing Issue"]), ctx),
            "source_doc": f"WCR {w['id']}", "event_date": ev_date, "origin": "seed",
        })
        s["cementing_notes"] = f"{s['cementing_notes']} Cementing issue recorded at {fmt_depth(depth)} m ({severity}); see events."
    return events


# ----------------------------------------------------------------------------------------------
# depth logs + pressure window
# ----------------------------------------------------------------------------------------------
def build_logs(wid: str, tops: list[dict], td: float, events: list[dict], max_depth: float | None = None) -> list[dict]:
    phase = rng.uniform(0, 6.28)
    logs: list[dict] = []
    last = max_depth if max_depth is not None else td
    d = 25.0
    while d <= last:
        form = formation_at(tops, d)
        if form is None:
            break
        base = PARAM_BASELINE[form["name"]]
        rel = (d - form["top_m"]) / max(1.0, form["base_m"] - form["top_m"])
        wave = 1 + 0.08 * math.sin(d / 37.0 + phase) + 0.05 * math.sin(d / 11.0 + 2 * phase)
        vals = {k: base[k] * wave * rng.uniform(0.96, 1.04) for k in ("rop", "wob", "rpm", "torque", "spp", "gas")}
        mw = mud_weight_for(form["name"], rel)
        ecd_plus = 0.0
        for e in events:
            dist = abs(d - e["depth_m"])
            if dist < 45:
                wgt = math.exp(-((dist / 22.0) ** 2))
                for k, factor in EVENT_ANOMALY.get(e["event_type"], {}).items():
                    if k == "ecd_plus":
                        ecd_plus += factor * wgt
                    elif k in vals:
                        vals[k] *= factor ** wgt
        logs.append({
            "well_id": wid, "depth_m": d, "formation": form["name"],
            "rop": round(max(0.2, vals["rop"]), 1), "wob": round(vals["wob"], 1), "rpm": round(vals["rpm"], 0),
            "torque": round(vals["torque"], 1), "spp": round(vals["spp"], 0), "mud_weight": round(mw, 2),
            "ecd": round(mw + 0.22 + 0.00004 * d + ecd_plus, 2), "gas_units": round(max(1.0, vals["gas"]), 0),
        })
        d += 25.0
    return logs


def build_pressure(wid: str, tops: list[dict], td: float) -> list[dict]:
    pts: list[dict] = []
    kop = next((t for t in tops if t["name"] == "Kopili"), None)
    d = 0.0
    while d <= td + 1e-6:
        form = formation_at(tops, d)
        name = form["name"] if form else "Alluvium"
        pp = 8.45 + 0.00012 * d
        if name == "Kopili" and kop:
            into = d - kop["top_m"]
            pp = 10.8 + min(1.0, into / 150.0) * 2.1 + 0.00004 * max(0.0, into - 150)
        elif name == "Sylhet":
            pp = 12.2
        elif name in ("Langpar", "Basement"):
            pp = 11.6
        fg = min(16.2, 12.4 + 0.00075 * d)
        if name == "Kopili":
            fg -= 0.5  # weaker shale → window narrows to ~1.5 ppg as pore pressure ramps up
        pp += 0.05 * math.sin(d / 90.0)
        pts.append({"well_id": wid, "depth_m": d, "pore_pressure_ppg": round(pp, 2), "fracture_gradient_ppg": round(fg, 2)})
        d += 50.0
    return pts


# ----------------------------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------------------------
def build_dataset() -> dict:
    wells = place_wells()
    formations: list[dict] = []
    casing_all: list[dict] = []
    events_all: list[dict] = []
    logs_all: list[dict] = []
    pressure_all: list[dict] = []

    canonical_by_well: dict[str, list[dict]] = {}
    for ce in CANONICAL_EVENTS:
        canonical_by_well.setdefault(ce["well_id"], []).append(ce)

    for w in wells:
        td = choose_td(w, estimate_barail_top(w))
        tops = compute_tops(w, td)
        casing = build_casing(w["id"], tops, td)
        drilling_days = int(45 + td / 28 + rng.uniform(-10, 25))

        if w["is_active"]:
            events = [dict(e) for e in canonical_by_well.get(w["id"], [])]
            logs = build_logs(w["id"], tops, td, events, max_depth=math.floor(SIM_START_DEPTH_M / 25) * 25)
            w.update({"total_depth_m": td, "status": "Drilling", "completion_date": None})
        else:
            events = build_events(w, tops, td, casing, drilling_days)
            for ce in canonical_by_well.get(w["id"], []):
                # replace any generated event of the same type in the same formation to keep counts sane
                events = [e for e in events if not (e["event_type"] == ce["event_type"] and e["formation"] == ce["formation"]
                                                    and abs(e["depth_m"] - ce["depth_m"]) < 120)]
                events.append(dict(ce, origin="seed"))
            logs = build_logs(w["id"], tops, td, events)
            completion = w["spud_date"] + timedelta(days=drilling_days)
            age = 2026 - w["spud_date"].year
            status = rng.choices(["Producing", "Completed", "Suspended", "Abandoned"],
                                 weights=[0.55 if age < 15 else 0.3, 0.15, 0.15, 0.1 if age < 15 else 0.3])[0]
            w.update({"total_depth_m": td, "status": status, "completion_date": completion})

        # Demo-flow tuning: no High/Critical offset event should already be inside the first alert window
        # (2,784 → 2,940 m) for wells within the default radius, so the first alert visibly *arrives*.
        if not w["is_active"] and haversine_km(w["lat"], w["lon"], ACTIVE_LAT, ACTIVE_LON) <= DEFAULT_RADIUS_KM:
            for e in events:
                if e["severity"] in ("High", "Critical") and 2700 <= e["depth_m"] < 2940 and e["source_doc"].startswith(("DDR ", "WCR ")):
                    e["severity"] = "Medium"
                    e["npt_hours"] = round(min(e["npt_hours"], 12.0), 1)

        events.sort(key=lambda e: e["depth_m"])
        deepest = tops[-1]["name"] if tops else "Alluvium"
        total_npt = sum(e["npt_hours"] for e in events)
        notable = max(events, key=lambda e: (SEVERITIES.index(e["severity"]), e["npt_hours"]), default=None)
        if w["is_active"]:
            w["notes"] = (f"Active well currently drilling 12-1/4\" hole in Tipam; planned TD {td:,.0f} m in Kopili. "
                          f"{len(events)} incidents logged so far ({total_npt:.1f} hrs NPT).")
        else:
            w["notes"] = (f"{w['well_type'].capitalize()} well drilled to {td:,.0f} m TD ({deepest}); {len(events)} recorded incidents, "
                          f"{total_npt:.0f} hrs NPT." + (f" Notable: {notable['severity']} {notable['event_type'].lower()} at {fmt_depth(notable['depth_m'])} m in {notable['formation']}." if notable else ""))

        for t in tops:
            formations.append(dict(t, well_id=w["id"]))
        casing_all.extend(casing)
        events_all.extend(events)
        logs_all.extend(logs)
        pressure_all.extend(build_pressure(w["id"], tops, td))

    return {"wells": wells, "formations": formations, "casing": casing_all, "events": events_all,
            "logs": logs_all, "pressure": pressure_all}


def write_db(data: dict) -> None:
    engine.dispose()  # release pooled connections so the file can be replaced (Windows holds open handles)
    if DB_PATH.exists():
        try:
            DB_PATH.unlink()
        except PermissionError:  # file still held by a live app process → wipe tables instead
            SQLModel.metadata.drop_all(engine)
    create_db_and_tables()
    with Session(engine) as s:
        s.add_all([Well(**w) for w in data["wells"]])
        s.add_all([FormationTop(**f) for f in data["formations"]])
        s.add_all([CasingString(**c) for c in data["casing"]])
        s.add_all([DrillingEvent(**e) for e in data["events"]])
        s.add_all([DepthLog(**l) for l in data["logs"]])
        s.add_all([PressurePoint(**p) for p in data["pressure"]])
        s.commit()


def verify() -> dict:
    with Session(engine) as s:
        wells = s.exec(select(Well)).all()
        events = s.exec(select(DrillingEvent)).all()
        n_form = len(s.exec(select(FormationTop)).all())
        n_casing = len(s.exec(select(CasingString)).all())
        n_logs = len(s.exec(select(DepthLog)).all())
        n_pp = len(s.exec(select(PressurePoint)).all())

    active = next(w for w in wells if w.is_active)
    within = [w for w in wells if not w.is_active and haversine_km(w.lat, w.lon, active.lat, active.lon) <= DEFAULT_RADIUS_KM]
    by_type = Counter(e.event_type for e in events)
    by_sev = Counter(e.severity for e in events)
    by_form = Counter(e.formation for e in events)
    by_field = Counter(w.field for w in wells if not w.is_active)
    docs = sorted(p.name for p in SAMPLE_DOCS_DIR.glob("*.pdf")) if SAMPLE_DOCS_DIR.exists() else []

    print("=" * 72)
    print("eRTMAC-NWIS SEED VERIFICATION  (SYNTHETIC DEMONSTRATION DATA)")
    print("=" * 72)
    print(f"wells               : {len(wells)}  (historical {len(wells) - 1} + active {active.id})")
    print(f"wells by field      : {dict(sorted(by_field.items()))}")
    print(f"offsets within {DEFAULT_RADIUS_KM:.0f} km : {len(within)}  → {', '.join(sorted(w.id for w in within))}")
    print(f"formation tops      : {n_form}")
    print(f"casing strings      : {n_casing}")
    print(f"drilling events     : {len(events)}   (target 150–300)")
    print(f"  by type           : {dict(sorted(by_type.items()))}")
    print(f"  by severity       : {dict((k, by_sev[k]) for k in SEVERITIES)}")
    print(f"  by formation      : {dict(sorted(by_form.items(), key=lambda kv: -kv[1]))}")
    print(f"depth log rows      : {n_logs}   (every 25 m)")
    print(f"pressure points     : {n_pp}   (every 50 m)")
    print(f"sample documents    : {len(docs)}   → {docs}")
    td = [w.total_depth_m for w in wells]
    print(f"TD range            : {min(td):,.0f} – {max(td):,.0f} m")
    canon = [(e.well_id, e.depth_m, e.event_type, e.severity) for e in events if e.well_id in ("DLJ-12", "NHK-07", "DLJ-18") and e.formation == "Barail" and e.severity == "High"]
    print(f"canonical citations : {canon}")

    ok = 25 <= len(wells) - 1 <= 40 and 150 <= len(events) <= 300 and all(by_type[t] > 0 for t in by_type) and len(by_type) == 8
    print("STATUS              :", "OK" if ok else "CHECK RANGES")
    return {"wells": len(wells), "events": len(events), "ok": ok}


if __name__ == "__main__":
    if "--verify" in sys.argv:
        verify()
        sys.exit(0)
    data = build_dataset()
    write_db(data)
    print(f"database written → {DB_PATH}")
    from sample_docs_gen import generate_all  # noqa: E402

    made = generate_all()
    print(f"sample documents → {len(made)} files in {SAMPLE_DOCS_DIR}")
    result = verify()
    sys.exit(0 if result["ok"] else 1)
