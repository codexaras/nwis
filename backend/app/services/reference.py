"""Reference knowledge shared by the seed generator, the risk engine and the assistant.

Upper Assam stratigraphy (top -> bottom), formation risk tendencies, mud programme,
event vocabularies and engineer-style text templates. Everything here is deterministic.
"""
from __future__ import annotations

FORMATIONS: list[dict] = [
    # name, base top (m) around the active well, lithology code, description, colour, risk tendency,
    # mud weight range (ppg), mean events per well
    {"name": "Alluvium", "base_top_m": 0, "lithology": "sand", "lithology_desc": "Unconsolidated sand, gravel and clay",
     "color": "#7C8A6B", "risk": "Shallow washouts, minor seepage losses", "mw": (8.6, 8.9), "mean_events": 0.15},
    {"name": "Namsang", "base_top_m": 180, "lithology": "sand", "lithology_desc": "Coarse sandstone with clay bands and pebbles",
     "color": "#9A8B5A", "risk": "Seepage losses, soft-formation washout", "mw": (8.8, 9.1), "mean_events": 0.2},
    {"name": "Dhekiajuli", "base_top_m": 620, "lithology": "sand", "lithology_desc": "Sandstone with mottled clay interbeds",
     "color": "#B59A5B", "risk": "Tight hole across clay interbeds, surface-casing cement quality", "mw": (9.0, 9.3), "mean_events": 0.35},
    {"name": "Girujan", "base_top_m": 1250, "lithology": "clay", "lithology_desc": "Mottled sticky clays, reactive claystone",
     "color": "#8E6E4E", "risk": "Sticky clays, tight hole, bit balling, differential sticking", "mw": (9.4, 9.8), "mean_events": 1.3},
    {"name": "Tipam", "base_top_m": 2050, "lithology": "sand", "lithology_desc": "Coarse, poorly consolidated sandstone (primary reservoir)",
     "color": "#C9A45C", "risk": "Mud losses in unconsolidated reservoir sands, cement channelling", "mw": (9.6, 10.2), "mean_events": 1.6},
    {"name": "Barail", "base_top_m": 2900, "lithology": "coal", "lithology_desc": "Alternating shale, coal seams and sandstone",
     "color": "#4F5B63", "risk": "Coal and shale instability, torque spikes, stuck pipe", "mw": (10.4, 11.1), "mean_events": 1.9},
    {"name": "Kopili", "base_top_m": 3350, "lithology": "shale", "lithology_desc": "Grey shale with thin limestone; overpressured",
     "color": "#6B5B7A", "risk": "Overpressure transition, kicks, narrow mud-weight window", "mw": (12.2, 13.4), "mean_events": 1.5},
    {"name": "Sylhet", "base_top_m": 3700, "lithology": "limestone", "lithology_desc": "Fractured limestone",
     "color": "#5F8A8B", "risk": "Severe to total losses into fractured limestone", "mw": (11.6, 12.6), "mean_events": 1.2},
    {"name": "Langpar", "base_top_m": 3950, "lithology": "shale", "lithology_desc": "Calcareous shale and siltstone",
     "color": "#7A7F86", "risk": "Minor instability, hard stringers", "mw": (11.4, 12.0), "mean_events": 0.3},
    {"name": "Basement", "base_top_m": 4150, "lithology": "basement", "lithology_desc": "Granitic gneiss (crystalline basement)",
     "color": "#3A3F47", "risk": "Very low ROP, torque, bit damage", "mw": (11.0, 11.6), "mean_events": 0.2},
]
FORMATION_NAMES = [f["name"] for f in FORMATIONS]
FORMATION_INDEX = {f["name"]: i for i, f in enumerate(FORMATIONS)}
FORMATION_BY_NAME = {f["name"]: f for f in FORMATIONS}

EVENT_TYPES = ["Mud Loss", "Kick", "Stuck Pipe", "Torque Spike", "Tight Hole", "Cementing Issue", "Fishing", "Wellbore Instability"]
SEVERITIES = ["Low", "Medium", "High", "Critical"]
SEVERITY_WEIGHT = {"Low": 1.0, "Medium": 2.0, "High": 3.5, "Critical": 5.0}
SEVERITY_RANK = {s: i for i, s in enumerate(SEVERITIES)}

# Relative weights of event types by formation (biases synthetic generation + prior for the risk engine)
EVENT_BIAS: dict[str, dict[str, float]] = {
    "Alluvium": {"Mud Loss": 3, "Tight Hole": 2, "Wellbore Instability": 1},
    "Namsang": {"Mud Loss": 3, "Tight Hole": 2, "Cementing Issue": 1},
    "Dhekiajuli": {"Mud Loss": 2, "Tight Hole": 3, "Cementing Issue": 2, "Wellbore Instability": 1},
    "Girujan": {"Tight Hole": 6, "Stuck Pipe": 4, "Wellbore Instability": 3, "Torque Spike": 2, "Fishing": 1},
    "Tipam": {"Mud Loss": 8, "Cementing Issue": 3, "Tight Hole": 1, "Fishing": 1, "Kick": 1},
    "Barail": {"Torque Spike": 6, "Stuck Pipe": 5, "Wellbore Instability": 4, "Tight Hole": 3, "Fishing": 2, "Cementing Issue": 1},
    "Kopili": {"Kick": 7, "Wellbore Instability": 3, "Mud Loss": 2, "Cementing Issue": 2, "Torque Spike": 1},
    "Sylhet": {"Mud Loss": 7, "Kick": 3, "Cementing Issue": 1},
    "Langpar": {"Wellbore Instability": 2, "Torque Spike": 1, "Mud Loss": 1},
    "Basement": {"Torque Spike": 2, "Fishing": 1},
}

# Severity distribution per event type (Low, Medium, High, Critical)
SEVERITY_DIST: dict[str, tuple[float, float, float, float]] = {
    "Kick": (0.05, 0.25, 0.40, 0.30),
    "Stuck Pipe": (0.10, 0.35, 0.40, 0.15),
    "Mud Loss": (0.30, 0.40, 0.22, 0.08),
    "Torque Spike": (0.35, 0.40, 0.20, 0.05),
    "Tight Hole": (0.45, 0.40, 0.13, 0.02),
    "Cementing Issue": (0.25, 0.45, 0.25, 0.05),
    "Fishing": (0.05, 0.30, 0.45, 0.20),
    "Wellbore Instability": (0.20, 0.45, 0.28, 0.07),
}

NPT_RANGE = {"Low": (0.5, 4.0), "Medium": (4.0, 14.0), "High": (12.0, 40.0), "Critical": (30.0, 120.0)}

# Baseline drilling parameters by formation: rop m/hr, wob klbs, rpm, torque kft-lb, spp psi, gas units
PARAM_BASELINE: dict[str, dict[str, float]] = {
    "Alluvium": {"rop": 36, "wob": 8, "rpm": 120, "torque": 4.0, "spp": 1200, "gas": 6},
    "Namsang": {"rop": 31, "wob": 10, "rpm": 120, "torque": 5.0, "spp": 1500, "gas": 8},
    "Dhekiajuli": {"rop": 25, "wob": 12, "rpm": 110, "torque": 6.0, "spp": 1800, "gas": 9},
    "Girujan": {"rop": 12, "wob": 15, "rpm": 90, "torque": 8.5, "spp": 2100, "gas": 12},
    "Tipam": {"rop": 18, "wob": 15, "rpm": 100, "torque": 8.0, "spp": 2300, "gas": 45},
    "Barail": {"rop": 8, "wob": 18, "rpm": 80, "torque": 12.0, "spp": 2600, "gas": 28},
    "Kopili": {"rop": 6, "wob": 20, "rpm": 70, "torque": 13.0, "spp": 2950, "gas": 70},
    "Sylhet": {"rop": 4, "wob": 22, "rpm": 60, "torque": 14.0, "spp": 3050, "gas": 35},
    "Langpar": {"rop": 5, "wob": 22, "rpm": 60, "torque": 14.0, "spp": 3100, "gas": 20},
    "Basement": {"rop": 2, "wob": 25, "rpm": 50, "torque": 16.0, "spp": 3200, "gas": 10},
}

# Which parameters deviate around an event (multiplicative factors; ecd_plus is additive ppg)
EVENT_ANOMALY: dict[str, dict[str, float]] = {
    "Torque Spike": {"torque": 1.55, "rop": 0.7, "rpm": 0.9},
    "Stuck Pipe": {"torque": 1.45, "rop": 0.35, "wob": 1.2},
    "Tight Hole": {"torque": 1.3, "rop": 0.6},
    "Mud Loss": {"spp": 0.82, "rop": 0.85},
    "Kick": {"gas": 3.2, "spp": 1.08, "ecd_plus": 0.25},
    "Wellbore Instability": {"torque": 1.25, "spp": 1.06, "rop": 0.7},
    "Cementing Issue": {"spp": 0.95},
    "Fishing": {"rop": 0.05, "torque": 1.3},
}

EVENT_INDICATORS: dict[str, list[str]] = {
    "Stuck Pipe": ["Increasing rotary torque", "Restricted movement after connections", "Reaming requirement", "Overpull on connections"],
    "Torque Spike": ["Erratic / rising torque", "Stick-slip signature", "Pack-off tendency while drilling coal seams"],
    "Tight Hole": ["Drag on trips", "Overpull while pulling out", "Back-reaming required on connections"],
    "Mud Loss": ["Pit volume decrease", "Standpipe pressure drop", "Reduced returns at flowline"],
    "Kick": ["Pit gain", "Increase in return flow", "Rising connection gas", "Drilling break on entering Kopili"],
    "Cementing Issue": ["Poor CBL / VDL bond", "Lift pressure not achieved", "Losses during displacement"],
    "Fishing": ["Sudden torque increase then loss", "Drop in weight indicator", "No rotation transmitted"],
    "Wellbore Instability": ["Cavings at shakers", "Erratic torque", "Fill on bottom after trips"],
}

RECOMMENDED_ACTIONS: dict[str, str] = {
    "Stuck Pipe": "Increase circulation before connections, ream every stand through the interval, keep jars armed and spot a lubricant pill on any torque rise.",
    "Torque Spike": "Step WOB and RPM down before the interval, run a wiper trip to condition the hole and raise the lubricity of the mud system.",
    "Tight Hole": "Improve hole cleaning with hi-vis sweeps, back-ream on trips and switch to an inhibitive mud system across reactive clays.",
    "Mud Loss": "Pre-treat mud with fine/medium LCM, reduce ECD by lowering flow rate and keep LCM pills staged before entering the interval.",
    "Kick": "Raise mud weight to the recommended value before the transition, flow-check every connection, slow-drill the top 30 m and confirm BOP test status.",
    "Cementing Issue": "Centralise casing, condition mud to low gels before the job, use adequate spacer and consider two-stage cementing across loss zones.",
    "Fishing": "Verify fishing tools on location, limit overpull to string design and avoid dry drilling through hard stringers.",
    "Wellbore Instability": "Raise mud weight modestly, minimise open-hole exposure time and control tripping speeds through the interval.",
}

MITIGATIONS: dict[str, list[str]] = {
    "Mud Loss": [
        "Pumped {lcm} ppb LCM pill (fine/medium) and reduced flow rate to lower ECD; losses cured after {hrs} hrs.",
        "Reduced mud weight by 0.2 ppg and spotted a cross-linked LCM pill across the loss zone.",
        "Staged LCM (calcium carbonate + fibre) and drilled ahead at reduced pump rate with continuous pit monitoring.",
    ],
    "Kick": [
        "Shut in well on annular preventer, circulated kick out via driller's method and raised MW from {mw} to {mw2} ppg.",
        "Well shut in; recorded SIDPP {sidpp} psi. Weighted up to {mw2} ppg using wait-and-weight method before resuming drilling.",
        "Flow-checked, closed BOP, circulated influx out and increased MW to {mw2} ppg with kill-line monitoring.",
    ],
    "Stuck Pipe": [
        "Worked pipe with jars for {hrs} hrs, spotted {pill} bbl lubricant pill and freed string; reamed interval twice.",
        "Applied controlled overpull to {overpull} klbs, spotted pipe-freeing agent and regained rotation after {hrs} hrs.",
        "Reduced MW slightly to lower differential pressure, worked pipe free and conditioned hole with hi-vis sweeps.",
    ],
    "Torque Spike": [
        "Reduced WOB/RPM, circulated bottoms-up and performed wiper trip to condition the hole.",
        "Lowered RPM, added lubricant to mud system and reamed the interval before drilling ahead.",
        "Pulled to shoe, changed to a stabilised BHA and resumed drilling at controlled parameters.",
    ],
    "Tight Hole": [
        "Back-reamed interval, pumped hi-vis sweeps and raised mud inhibition (KCl) to reduce clay swelling.",
        "Reamed on every connection and improved hole cleaning with higher flow rate.",
        "Performed wiper trip to shoe and drilled ahead with increased YP mud.",
    ],
    "Cementing Issue": [
        "Remedial squeeze cement job performed after CBL; confirmed bond on repeat log.",
        "Top job carried out through annulus; casing pressure-tested to {psi} psi.",
        "Re-cemented interval with two-stage job and improved centralisation.",
    ],
    "Fishing": [
        "Ran overshot and recovered fish after {hrs} hrs; inspected BHA components.",
        "Fishing assembly run with jar and bumper sub; fish recovered on second attempt.",
        "Milled over fish, recovered with spear and resumed drilling with new bit.",
    ],
    "Wellbore Instability": [
        "Raised MW by 0.3 ppg, minimised open-hole time and controlled tripping speeds.",
        "Increased mud inhibition and reduced surge/swab by slower trips; cavings reduced within 12 hrs.",
        "Circulated at higher rate to clear cavings and drilled ahead with improved rheology.",
    ],
}

LESSONS: dict[str, list[str]] = {
    "Mud Loss": [
        "Pre-treat mud with LCM before entering {formation} sands; keep pills staged on surface.",
        "Reduce ECD (lower flow, controlled ROP) when approaching the {formation} loss zone.",
        "Loss zones in {formation} correlate across the field; anticipate them at similar depth.",
    ],
    "Kick": [
        "Raise MW before the {formation} transition; overpressure onset is sharp in this field.",
        "Flow-check every connection in {formation}; connection gas trends precede kicks.",
        "Narrow window in {formation}: manage ECD carefully to avoid losses while holding the kick off.",
    ],
    "Stuck Pipe": [
        "Rising torque trend in upper {formation} is a precursor to stuck pipe; ream every stand and keep jars armed.",
        "Avoid static pipe across {formation} coal seams; keep pipe moving during connections.",
        "Improve lubricity before entering {formation}; differential sticking risk is high.",
    ],
    "Torque Spike": [
        "Expect torque increase in {formation} coal seams; pre-empt with lubricant and a stabilised BHA.",
        "Wiper trips every 150 m in {formation} reduce pack-off and torque spikes.",
        "Monitor the torque trend, not the absolute value, when drilling {formation}.",
    ],
    "Tight Hole": [
        "Inhibitive mud is mandatory across {formation} reactive clays.",
        "Ream on connections through {formation}; do not wait for drag to increase.",
        "Hole cleaning limits ROP in {formation}; drill at a controlled rate.",
    ],
    "Cementing Issue": [
        "Centralise casing and condition mud before cementing across {formation}.",
        "Run CBL after every {formation} cement job; remedial squeeze if bond is poor.",
        "Two-stage cementing recommended where {formation} losses occur.",
    ],
    "Fishing": [
        "Inspect BHA connections before running through hard {formation} stringers.",
        "Keep fishing tools on location when drilling {formation}.",
        "Avoid excessive overpull in {formation}; string failures occurred at connections.",
    ],
    "Wellbore Instability": [
        "Minimise open-hole time in {formation}; shale destabilises within days.",
        "Slightly higher MW in {formation} reduces cavings without inducing losses.",
        "Control trip speeds to reduce surge/swab in {formation}.",
    ],
}

DESCRIPTIONS: dict[str, list[str]] = {
    "Mud Loss": [
        "Partial losses of {rate} bbl/hr observed while drilling {formation} at {depth} m MD with {mw} ppg mud. Pit volume decreased {pit} bbl before losses were controlled.",
        "Sudden loss of returns at {depth} m MD in {formation}; loss rate {rate} bbl/hr. Standpipe pressure dropped {dspp} psi.",
        "Seepage to partial losses ({rate} bbl/hr) encountered in {formation} sands at {depth} m MD; total loss {pit} bbl.",
    ],
    "Kick": [
        "Well kicked at {depth} m MD on entering {formation}; pit gain {pit} bbl, SIDPP {sidpp} psi, SICP {sicp} psi. Gas units peaked at {gas}.",
        "Flow observed on connection at {depth} m MD ({formation}); {pit} bbl gain. Well shut in with SIDPP {sidpp} psi.",
        "Drilling break followed by {pit} bbl pit gain at {depth} m MD in {formation}. Influx circulated out; MW raised to {mw2} ppg.",
    ],
    "Stuck Pipe": [
        "Pipe became stuck while making connection at {depth} m MD in {formation}. Overpull to {overpull} klbs, no rotation. Torque had risen from {t1} to {t2} kft-lb over the preceding 60 m.",
        "String stuck at {depth} m MD ({formation}) after {mins} min static during survey. Overpull {overpull} klbs.",
        "Differential sticking at {depth} m MD across {formation}; unable to rotate or reciprocate. MW {mw} ppg.",
    ],
    "Torque Spike": [
        "Torque increased sharply from {t1} to {t2} kft-lb at {depth} m MD while drilling {formation}; ROP dropped and stick-slip observed.",
        "Erratic torque ({t1}-{t2} kft-lb) with pack-off tendency at {depth} m MD in {formation} coal/shale.",
        "Torque spike to {t2} kft-lb at {depth} m MD ({formation}); string stalled twice before parameters were reduced.",
    ],
    "Tight Hole": [
        "Tight hole at {depth} m MD in {formation}; overpull {overpull} klbs on trip out, reaming required through {len} m interval.",
        "Drag increased to {overpull} klbs at {depth} m MD across {formation} clays; back-reamed to shoe.",
        "Restricted movement after connection at {depth} m MD ({formation}); reamed stand three times.",
    ],
    "Cementing Issue": [
        "CBL/VDL indicated poor cement bond behind {size} casing from {top} to {depth} m MD across {formation}; channelling suspected.",
        "Lift pressure not achieved during {size} casing cement job; losses of {pit} bbl during displacement at {depth} m MD ({formation}).",
        "Cement top found {short} m below plan behind {size} casing at {depth} m MD ({formation}).",
    ],
    "Fishing": [
        "Twist-off at {depth} m MD in {formation}; fish length {len} m left in hole. Fishing operations {hrs} hrs.",
        "Bit cone lost at {depth} m MD ({formation}); junk basket and magnet runs required.",
        "BHA parted at connection while drilling {formation} at {depth} m MD; overshot run to recover.",
    ],
    "Wellbore Instability": [
        "Large cavings at shakers while drilling {formation} at {depth} m MD; erratic torque and fill on bottom after trip.",
        "Hole enlargement indicated by caliper across {formation} at {depth} m MD; MW {mw} ppg considered marginal.",
        "Shale instability at {depth} m MD in {formation}; {pit} bbl of cavings circulated out over 24 hrs.",
    ],
}

# Casing programme reference
CASING_PROGRAM = [
    {"string_type": "Conductor", "size_in": '20"', "hole_size_in": '26"'},
    {"string_type": "Surface", "size_in": '13-3/8"', "hole_size_in": '17-1/2"'},
    {"string_type": "Intermediate", "size_in": '9-5/8"', "hole_size_in": '12-1/4"'},
    {"string_type": "Production", "size_in": '7"', "hole_size_in": '8-1/2"'},
]

FIELDS: dict[str, dict] = {
    # code, cluster centre, spread (km), regional depth offset (m at Barail level), number of historical wells
    "Duliajan": {"code": "DLJ", "center": (27.4821, 95.1242), "spread_km": 7.5, "depth_offset": 0, "n": 12},
    "Naharkatiya": {"code": "NHK", "center": (27.3650, 95.2350), "spread_km": 4.5, "depth_offset": 90, "n": 7},
    "Hugrijan": {"code": "HGJ", "center": (27.4280, 95.3650), "spread_km": 3.5, "depth_offset": 40, "n": 4},
    "Baghjan": {"code": "BGJ", "center": (27.5750, 95.3300), "spread_km": 4.0, "depth_offset": 260, "n": 5},
    "Moran": {"code": "MRN", "center": (27.2700, 94.9600), "spread_km": 5.0, "depth_offset": -160, "n": 5},
}

RIGS = ["OIL-E760", "OIL-E1400", "OIL-R11", "OIL-R18", "OIL-R24", "CTR-JE9", "CTR-Q16", "CTR-SV2"]

FORMATION_ABBREV = {"Alluvium": "ALV", "Namsang": "NMS", "Dhekiajuli": "DHK", "Girujan": "GRJ", "Tipam": "TPM",
                    "Barail": "BRL", "Kopili": "KPL", "Sylhet": "SYL", "Langpar": "LNP", "Basement": "BSM"}


def formation_at(tops: list[dict], depth: float) -> dict | None:
    """tops: list of dicts with name/top_m/base_m sorted by top; returns the formation containing depth."""
    for t in tops:
        if t["top_m"] <= depth < t["base_m"]:
            return t
    if tops and depth >= tops[-1]["top_m"]:
        return tops[-1]
    return tops[0] if tops else None


def mud_weight_for(formation: str, rel_pos: float = 0.5) -> float:
    lo, hi = FORMATION_BY_NAME[formation]["mw"]
    return round(lo + (hi - lo) * max(0.0, min(1.0, rel_pos)), 1)
