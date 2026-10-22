"""Generate FAKE sample rental applications for the AI Application Reader demo.

    python scripts/make_samples.py

Writes to backend/assets/samples/ (read by the API) and copies to frontend/public/samples/:
  - application-typed.pdf      clean, typed form (complete)
  - application-scanned.jpg    the same kind of form, "scanned": tilted, grey, noisy,
                               handwriting-style font, with a couple of blanks
All names, numbers and addresses are invented.
"""

import random
from pathlib import Path

from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "backend" / "assets" / "samples"          # read by the API
PUBLIC = ROOT / "frontend" / "public" / "samples"     # "view" links in the app
for d in (OUT, PUBLIC):
    d.mkdir(parents=True, exist_ok=True)

TYPED = {
    "Full name": "Priya Raman",
    "Email": "priya.raman@example.com",
    "Phone": "(403) 555-0148",
    "Current address": "88 Example Rd NW, Calgary, AB",
    "Current landlord / phone": "Bowview Rentals, (403) 555-0199",
    "Time at current address": "3 years",
    "Employer": "Foothills Medical Labs",
    "Job title": "Lab Technologist",
    "Time with employer": "4 years",
    "Gross income": "$78,000 per year",
    "Number of occupants": "2",
    "Pets": "1 cat (indoor, spayed)",
    "Desired move-in date": "December 1, 2026",
    "Reference 1": "Daniel Okafor, former supervisor, (403) 555-0123",
    "Reference 2": "Marta Silva, previous landlord, (403) 555-0177",
}

SCANNED = {
    "Full name": "Kevin Tran",
    "Email": "k.tran.ab@example.com",
    "Phone": "(780) 555-0162",
    "Current address": "1204 Sample Ave, Edmonton AB",
    "Current landlord / phone": "",
    "Time at current address": "1.5 yrs",
    "Employer": "Prairie Logistics",
    "Job title": "Warehouse lead",
    "Time with employer": "2 yrs",
    "Gross income": "$27/hr, 40 hrs/week",
    "Number of occupants": "1",
    "Pets": "none",
    "Desired move-in date": "Dec 15 2026",
    "Reference 1": "Sam Patel - coworker - (780) 555-0110",
    "Reference 2": "",
}


def typed_pdf(path: Path):
    pdf = FPDF(format="Letter")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Rental Application", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, "SAMPLE FORM - all information is fictional", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    for label, value in TYPED.items():
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(62, 9, label, border="B")
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 9, value, border="B", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 6, "I confirm the information above is true and consent to a credit and "
                         "reference check for this application.")
    pdf.ln(6)
    pdf.cell(80, 8, "Signature:  Priya Raman", border="B")
    pdf.cell(20)
    pdf.cell(0, 8, "Date:  2026-10-20", border="B")
    pdf.output(str(path))


def _font(size: int, hand: bool):
    candidates = (["C:/Windows/Fonts/segoepr.ttf", "C:/Windows/Fonts/Inkfree.ttf"] if hand else [])
    candidates += ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    for c in candidates:
        if Path(c).exists():
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def scanned_jpg(path: Path):
    random.seed(7)
    W, H = 1700, 2200
    img = Image.new("L", (W, H), 245)
    d = ImageDraw.Draw(img)
    d.text((120, 110), "RENTAL APPLICATION", font=_font(56, False), fill=30)
    d.text((120, 185), "Sample form - all information is fictional", font=_font(26, False), fill=80)
    y = 290
    for label, value in SCANNED.items():
        d.text((120, y), label, font=_font(30, False), fill=40)
        d.line((640, y + 46, W - 120, y + 46), fill=90, width=2)
        if value:
            d.text((660 + random.randint(-6, 6), y - 4 + random.randint(-3, 3)), value,
                   font=_font(40, True), fill=random.randint(15, 45))
        y += 100
    d.text((120, y + 40), "Signature", font=_font(30, False), fill=40)
    d.line((640, y + 86, 1150, y + 86), fill=90, width=2)
    d.text((680, y + 20), "K. Tran", font=_font(54, True), fill=25)
    # make it look scanned: noise, slight blur, tilt, uneven exposure
    noise = Image.effect_noise((W, H), 18).point(lambda p: p // 6)
    img = Image.blend(img, noise.convert("L"), 0.08)
    img = img.filter(ImageFilter.GaussianBlur(0.8)).rotate(-1.7, expand=True, fillcolor=225)
    img = img.resize((img.width * 3 // 5, img.height * 3 // 5))
    img.convert("RGB").save(path, "JPEG", quality=70)


if __name__ == "__main__":
    typed_pdf(OUT / "application-typed.pdf")
    scanned_jpg(OUT / "application-scanned.jpg")
    import shutil
    for p in sorted(OUT.iterdir()):
        shutil.copy(p, PUBLIC / p.name)
        print(p.name, p.stat().st_size // 1024, "KB")
