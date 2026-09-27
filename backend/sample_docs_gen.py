"""Generate sample Daily Drilling Report PDFs from the seeded database.

- 5 text DDRs in a realistic layout (reportlab / platypus) whose "DRILLING EVENTS / REMARKS" section
  is built from the *actual* seeded events for that well/date → extraction results match the Knowledge Base.
- 1 image-only "scanned" DDR (rendered with Pillow, embedded as a picture) so the OCR step is visibly
  exercised. A bundled transcript (.txt) sits next to it so the demo flow still completes when tesseract
  is not installed (clearly labelled as such by the API).
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app.config import SAMPLE_DOCS_DIR  # noqa: E402
from app.db import engine  # noqa: E402
from app.models import CasingString, DrillingEvent, Well  # noqa: E402

SAMPLE_DDRS = [
    # filename, well, date, report number, scanned?
    ("DDR_DLJ-12_2019-03-14.pdf", "DLJ-12", "2019-03-14", 114, False),
    ("DDR_NHK-07_2016-11-02.pdf", "NHK-07", "2016-11-02", 117, False),
    ("DDR_DLJ-07_2021-06-18.pdf", "DLJ-07", "2021-06-18", 127, False),
    ("DDR_DLJ-21_2018-09-05.pdf", "DLJ-21", "2018-09-05", 98, False),
    ("DDR_HGJ-02_2014-02-22.pdf", "HGJ-02", "2014-02-22", 174, False),
    ("DDR_DLJ-18_2020-01-27_SCANNED.pdf", "DLJ-18", "2020-01-27", 117, True),
]


def _events_for(session: Session, filename: str) -> list[DrillingEvent]:
    return session.exec(select(DrillingEvent).where(DrillingEvent.source_doc == filename).order_by(DrillingEvent.depth_m)).all()


def _fmt(d: float) -> str:
    return f"{d:,.0f}"


def _ops_rows(events: list[DrillingEvent], depth_start: float, depth_end: float) -> list[list[str]]:
    """24-hour operations summary built around the day's events."""
    rows = [["From", "To", "Depth (m)", "Operation"]]
    primary = events[0] if events else None
    rows.append(["00:00", "03:30", _fmt(depth_start), "Drilled ahead 12-1/4\" hole, parameters steady, monitored returns."])
    rows.append(["03:30", "04:15", _fmt(depth_start + 22), "Connection, survey, circulated bottoms-up."])
    if primary:
        rows.append(["04:15", "09:45", _fmt(primary.depth_m), f"{primary.event_type} — see remarks. NPT {primary.npt_hours:.1f} hrs."])
        rows.append(["09:45", "13:00", _fmt(primary.depth_m), "Conditioned hole, reamed interval, circulated hi-vis sweep."])
    rows.append(["13:00", "18:30", _fmt(depth_end - 15), "Drilled ahead at controlled parameters."])
    rows.append(["18:30", "19:15", _fmt(depth_end - 15), "Connection, flow-check, mud properties checked."])
    rows.append(["19:15", "24:00", _fmt(depth_end), "Drilled ahead; depth at 24:00 hrs as reported."])
    return rows


def _event_block_lines(i: int, e: DrillingEvent) -> list[str]:
    head = (f"{i}. {e.event_type.upper()} at {_fmt(e.depth_m)} m MD ({e.formation.upper()}) | Severity: {e.severity.upper()} "
            f"| NPT: {e.npt_hours:.1f} hrs | MW: {e.mud_weight_ppg:.1f} ppg")
    return [head, f"   {e.description}", f"   Mitigation: {e.mitigation}", f"   Lesson: {e.lesson_learned}"]


def build_text_ddr(path: Path, well: Well, events: list[DrillingEvent], report_date: str, report_no: int, casing: list[CasingString]) -> None:
    styles = getSampleStyleSheet()
    mono = ParagraphStyle("mono", parent=styles["Normal"], fontName="Courier", fontSize=8.2, leading=10.2)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8.5, leading=11)
    head = ParagraphStyle("head", parent=styles["Heading2"], fontSize=12, spaceAfter=2, textColor=colors.HexColor("#1F2A37"))
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#555555"))
    sec = ParagraphStyle("sec", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, spaceBefore=6, spaceAfter=2,
                         textColor=colors.HexColor("#1F2A37"))

    depth_end = max(e.depth_m for e in events) + 18 if events else 2500
    depth_start = depth_end - 64

    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title=f"Daily Drilling Report {well.id} {report_date}", author="Drilling Department (synthetic)",
                            invariant=1)  # deterministic bytes (no timestamps / random IDs) → stable in git
    story = []
    story.append(Paragraph("OIL INDIA LIMITED — DRILLING DEPARTMENT", head))
    story.append(Paragraph("DAILY DRILLING REPORT (DDR) · SYNTHETIC DEMONSTRATION DOCUMENT · eRTMAC-NWIS sample", sub))
    story.append(Spacer(1, 6))

    meta = [
        ["Well", well.id, "Field", well.field],
        ["Rig", well.rig, "Report No.", str(report_no)],
        ["Report Date", report_date, "Spud Date", well.spud_date.isoformat()],
        ["Depth @ 24:00 (m MD)", _fmt(depth_end), "Progress (m)", _fmt(depth_end - depth_start)],
        ["Latitude", f"{well.lat:.4f}", "Longitude", f"{well.lon:.4f}"],
        ["Hole Size", '12-1/4"', "Well Type", well.well_type],
    ]
    t = Table(meta, colWidths=[38 * mm, 50 * mm, 34 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 8), ("FONT", (2, 0), (2, -1), "Helvetica-Bold", 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9AA5B1")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EEF1F4")), ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#EEF1F4")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)

    story.append(Paragraph("1. OPERATIONS SUMMARY (00:00 – 24:00 hrs)", sec))
    ops = Table(_ops_rows(events, depth_start, depth_end), colWidths=[16 * mm, 16 * mm, 22 * mm, 118 * mm])
    ops.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 7.8), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.8),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#B4BDC7")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDE3EA")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(ops)

    mw = events[0].mud_weight_ppg if events else 9.8
    story.append(Paragraph("2. MUD PROPERTIES", sec))
    mud = Table([
        ["MW (ppg)", "FV (s)", "PV (cP)", "YP (lb/100ft²)", "pH", "Solids (%)", "Type"],
        [f"{mw:.1f}", str(52 + int(mw * 2)), str(18 + int(mw)), str(20 + int(mw)), "9.5", f"{6 + mw / 2:.1f}", "KCl-Polymer"],
    ], colWidths=[24 * mm] * 6 + [28 * mm])
    mud.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 7.8), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.8),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#B4BDC7")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDE3EA")),
    ]))
    story.append(mud)

    story.append(Paragraph("3. CASING STATUS", sec))
    cas_rows = [["String", "Size", "Shoe (m MD)", "TOC (m)"]] + [
        [c.string_type, c.size_in, _fmt(c.shoe_depth_m), _fmt(c.cement_top_m)] for c in casing if c.shoe_depth_m <= depth_end]
    cas = Table(cas_rows, colWidths=[36 * mm, 30 * mm, 36 * mm, 36 * mm])
    cas.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 7.8), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 7.8),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#B4BDC7")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDE3EA")),
    ]))
    story.append(cas)

    story.append(Paragraph("4. DRILLING EVENTS / REMARKS", sec))
    for i, e in enumerate(events, start=1):
        for line in _event_block_lines(i, e):
            story.append(Paragraph(line.replace("&", "&amp;"), mono))
        story.append(Spacer(1, 3))

    story.append(Paragraph("5. LESSONS LEARNED", sec))
    for e in events:
        story.append(Paragraph(f"• {e.lesson_learned}", small))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Prepared by: Drilling Engineer (synthetic) · Reviewed by: Drilling Superintendent (synthetic) · "
                           "This document was generated for the eRTMAC-NWIS demonstration and does not describe a real operation.", sub))
    doc.build(story)


def _find_font(size: int) -> ImageFont.ImageFont:
    for cand in ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
                 "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf", "/System/Library/Fonts/Menlo.ttc"]:
        try:
            return ImageFont.truetype(cand, size)
        except OSError:
            continue
    return ImageFont.load_default()


def build_scanned_ddr(path: Path, well: Well, events: list[DrillingEvent], report_date: str, report_no: int) -> str:
    """Render the DDR as an image and embed it → image-only PDF. Returns the transcript text."""
    depth_end = max(e.depth_m for e in events) + 18 if events else 2500
    lines = [
        "OIL INDIA LIMITED - DRILLING DEPARTMENT",
        "DAILY DRILLING REPORT (DDR)  -  SCANNED COPY  -  SYNTHETIC DEMONSTRATION DOCUMENT",
        "",
        f"Well: {well.id}            Field: {well.field}            Rig: {well.rig}",
        f"Report No.: {report_no}         Report Date: {report_date}   Spud Date: {well.spud_date.isoformat()}",
        f"Depth @ 24:00: {_fmt(depth_end)} m MD     Hole Size: 12-1/4\"     Well Type: {well.well_type}",
        f"Latitude: {well.lat:.4f}    Longitude: {well.lon:.4f}",
        "",
        "1. OPERATIONS SUMMARY",
        f"00:00-03:30  Drilled ahead 12-1/4\" hole from {_fmt(depth_end - 64)} m; parameters steady.",
        "03:30-04:15  Connection, survey, circulated bottoms-up.",
    ]
    if events:
        p = events[0]
        lines += [f"04:15-09:45  {p.event_type} at {_fmt(p.depth_m)} m - see remarks. NPT {p.npt_hours:.1f} hrs.",
                  "09:45-13:00  Conditioned hole, reamed interval, circulated hi-vis sweep."]
    lines += ["13:00-24:00  Drilled ahead at controlled parameters.", "",
              "2. MUD PROPERTIES", f"MW {events[0].mud_weight_ppg if events else 9.8:.1f} ppg  FV 58 s  PV 26 cP  YP 24 lb/100ft2  pH 9.5  KCl-Polymer", "",
              "3. DRILLING EVENTS / REMARKS"]
    for i, e in enumerate(events, start=1):
        for l in _event_block_lines(i, e):
            # wrap long lines for the image
            while len(l) > 108:
                cut = l.rfind(" ", 0, 108)
                cut = cut if cut > 40 else 108
                lines.append(l[:cut])
                l = "   " + l[cut:].lstrip()
            lines.append(l)
        lines.append("")
    lines += ["4. LESSONS LEARNED"] + [f"- {e.lesson_learned}" for e in events]
    lines += ["", "Prepared by: Drilling Engineer (synthetic)   Reviewed by: Drilling Superintendent (synthetic)"]

    W, H = 1654, 2339  # A4 @ 200 dpi
    img = Image.new("L", (W, H), 236)
    draw = ImageDraw.Draw(img)
    font = _find_font(22)
    y = 110
    for l in lines:
        draw.text((120, y), l, fill=38, font=font)
        y += 30
    # scanner artefacts: slight rotation, blur, noise, a fold shadow
    img = img.rotate(0.6, resample=Image.BICUBIC, fillcolor=228)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    import random as _r

    noise_rng = _r.Random(7)
    px = img.load()
    for _ in range(9000):
        x, yy = noise_rng.randrange(W), noise_rng.randrange(H)
        px[x, yy] = max(0, px[x, yy] - noise_rng.randrange(20, 90))
    shade = ImageDraw.Draw(img)
    for i in range(60):
        shade.line([(0, 1400 + i), (W, 1420 + i)], fill=236 - int(20 * (1 - abs(i - 30) / 30)))

    tmp_png = path.with_suffix(".png")
    img.convert("RGB").save(tmp_png, "PNG", optimize=True)
    c = canvas.Canvas(str(path), pagesize=A4, invariant=1)
    c.setTitle(f"Scanned DDR {well.id} {report_date} (synthetic)")
    c.drawImage(str(tmp_png), 0, 0, width=A4[0], height=A4[1])
    c.showPage()
    c.save()
    tmp_png.unlink(missing_ok=True)
    return "\n".join(lines)


def generate_all() -> list[Path]:
    SAMPLE_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    made: list[Path] = []
    with Session(engine) as s:
        for filename, wid, rdate, rno, scanned in SAMPLE_DDRS:
            well = s.get(Well, wid)
            events = _events_for(s, filename)
            casing = s.exec(select(CasingString).where(CasingString.well_id == wid).order_by(CasingString.order_index)).all()
            if well is None or not events:
                raise RuntimeError(f"sample doc {filename}: well/events missing in DB")
            path = SAMPLE_DOCS_DIR / filename
            if scanned:
                transcript = build_scanned_ddr(path, well, events, rdate, rno)
                (SAMPLE_DOCS_DIR / (path.stem + ".transcript.txt")).write_text(
                    "# Bundled transcript of the scanned sample DDR (used only when no OCR engine is installed)\n" + transcript,
                    encoding="utf-8")
            else:
                build_text_ddr(path, well, events, rdate, rno, casing)
            made.append(path)
    return made


if __name__ == "__main__":
    for p in generate_all():
        print("wrote", p)
