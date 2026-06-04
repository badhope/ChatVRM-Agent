#!/usr/bin/env python3
"""
fin_data_gen.py — Generate fake-but-coherent company files for financial
report e2e simulation.

Outputs into <out_dir>:
  4 .pdf  — board minutes, audit report, investor letter, legal review
  5 .xlsx — sales pipeline, expenses, headcount, customer churn, AR aging
  4 .docx — OKRs, marketing plan, security review, product roadmap
  1 .csv  — daily stock prices

Numbers are internally consistent (same revenue, same headcount, same totals)
so the downstream fin_report.py can cross-validate them.

CLI:
  fin_data_gen.py --out <dir> [--seed 42] [--company "Globex Technologies Inc."]
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from datetime import date, timedelta
from pathlib import Path

# ----------------------------- Data tables -------------------------------- #

QUARTERS = ["2024Q1", "2024Q2", "2024Q3", "2024Q4", "2025Q1", "2025Q2"]

# Revenue (USD millions) per product line per quarter — totals propagate
PRODUCT_REVENUE = {
    "Cloud Platform":   [12.4, 13.8, 15.1, 17.2, 19.0, 21.3],
    "Data Services":    [ 8.1,  8.6,  9.0,  9.4, 10.1, 10.8],
    "AI Add-ons":       [ 2.3,  3.1,  4.5,  6.0,  7.8,  9.6],
    "Support Contracts":[ 3.0,  3.2,  3.4,  3.6,  3.8,  4.0],
}

# Cost (USD millions) — OpEx by category
OPEX = {
    "Sales & Marketing":   [ 6.5,  7.1,  7.8,  8.4,  9.1,  9.7],
    "R&D / Engineering":   [ 9.2, 10.0, 10.8, 11.5, 12.4, 13.2],
    "General & Admin":     [ 3.0,  3.1,  3.3,  3.4,  3.5,  3.6],
    "Customer Success":    [ 2.4,  2.6,  2.8,  3.0,  3.2,  3.4],
}

# Headcount by department per quarter
HEADCOUNT = {
    "Engineering":   [120, 128, 134, 142, 150, 158],
    "Sales":         [ 45,  48,  52,  55,  58,  62],
    "Marketing":     [ 22,  24,  26,  27,  29,  31],
    "Customer Success":[18, 20,  22,  24,  26,  28],
    "Operations":    [ 15,  16,  17,  18,  19,  20],
    "Finance/HR":    [ 10,  10,  11,  11,  12,  12],
}

# Customer churn % and new logos
CHURN_PCT  = [3.2, 3.0, 2.8, 2.6, 2.4, 2.2]
NEW_LOGOS  = [   18,  22,  27,  31,  36,  42]

# AR aging (USD thousands) — current, 30d, 60d, 90d+, total ties to revenue*0.18
AR_AGING = {
    "Current":   [ 3200, 3550, 3900, 4400, 4900, 5400],
    "1-30 days": [  420,  380,  410,  460,  500,  540],
    "31-60 days":[  180,  160,  140,  150,  170,  180],
    "60+ days":  [   90,   80,   70,   75,   80,   85],
}

# Stock price daily (90 days ending today) — small noise around an uptrend
def stock_series(start: float, end: float, days: int, vol: float, rng: random.Random):
    out = []
    cur = start
    for _ in range(days):
        cur = max(1.0, cur + (end - start) / days * (0.6 + rng.random() * 0.8) + rng.uniform(-vol, vol))
        out.append(round(cur, 2))
    return out

# ----------------------------- File writers ------------------------------ #

def write_sales_xlsx(path: Path, rng: random.Random) -> None:
    """Sales pipeline: deal name | amount | stage | owner | close date"""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Pipeline"
    ws.append(["Deal ID", "Customer", "Amount (USD)", "Stage", "Owner", "Close Quarter", "Probability"])
    stages = ["Discovery", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]
    customers = ["Acme Corp", "Initech", "Hooli", "Pied Piper", "Stark Ind", "Wayne Ent",
                 "Wonka", "Tyrell", "Cyberdyne", "Aperture", "Black Mesa", "Umbrella"]
    for q_idx, q in enumerate(QUARTERS):
        for i in range(8):
            stage = rng.choice(stages[:5]) if rng.random() > 0.15 else "Closed Lost"
            ws.append([
                f"DEAL-{q_idx:02d}{i:02d}",
                rng.choice(customers),
                rng.randint(40_000, 600_000),
                stage,
                rng.choice(["Lee", "Mia", "Raj", "Yuki", "Kai", "Noor"]),
                q,
                rng.choice([10, 25, 50, 75, 90]),
            ])
    # Summary sheet
    s = wb.create_sheet("Summary")
    s.append(["Quarter", "Won", "Lost", "Pipeline Value"])
    for i, q in enumerate(QUARTERS):
        won = rng.randint(800_000, 2_500_000)
        lost = rng.randint(100_000, 600_000)
        s.append([q, won, lost, won + lost + rng.randint(2_000_000, 5_000_000)])
    wb.save(str(path))

def write_expenses_xlsx(path: Path) -> None:
    """OpEx detail matching OPEX table"""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "OpEx"
    ws.append(["Quarter", "Category", "Amount (USD M)"])
    for cat, series in OPEX.items():
        for i, q in enumerate(QUARTERS):
            ws.append([q, cat, round(series[i], 2)])
    s = wb.create_sheet("CapEx")
    s.append(["Quarter", "Item", "Amount (USD M)"])
    capex = [
        ("2024Q1", "Data center expansion", 1.8),
        ("2024Q2", "Office buildout - Berlin", 0.9),
        ("2024Q3", "GPU cluster", 2.4),
        ("2024Q4", "Office buildout - Singapore", 1.1),
        ("2025Q1", "GPU cluster expansion", 3.2),
        ("2025Q2", "HQ renovation", 1.6),
    ]
    for row in capex:
        s.append(list(row))
    wb.save(str(path))

def write_headcount_xlsx(path: Path) -> None:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Headcount"
    ws.append(["Quarter"] + list(HEADCOUNT.keys()) + ["Total"])
    for i, q in enumerate(QUARTERS):
        row = [q] + [HEADCOUNT[d][i] for d in HEADCOUNT] + [sum(HEADCOUNT[d][i] for d in HEADCOUNT)]
        ws.append(row)
    s = wb.create_sheet("Attrition")
    s.append(["Quarter", "Voluntary", "Involuntary", "Total HC end-of-Q"])
    attrition = [(14, 3), (12, 2), (11, 4), (10, 3), (9, 2), (8, 2)]
    for i, q in enumerate(QUARTERS):
        v, inv = attrition[i]
        s.append([q, v, inv, sum(HEADCOUNT[d][i] for d in HEADCOUNT)])
    wb.save(str(path))

def write_churn_xlsx(path: Path) -> None:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Churn"
    ws.append(["Quarter", "Churn %", "New Logos", "Net New", "Total Customers EoQ"])
    customers = [410, 432, 459, 490, 526, 568]
    for i, q in enumerate(QUARTERS):
        net = NEW_LOGOS[i] - int(customers[i] * CHURN_PCT[i] / 100)
        ws.append([q, CHURN_PCT[i], NEW_LOGOS[i], net, customers[i]])
    wb.save(str(path))

def write_ar_aging_xlsx(path: Path) -> None:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "AR Aging"
    ws.append(["Quarter"] + list(AR_AGING.keys()) + ["Total (USD K)"])
    for i, q in enumerate(QUARTERS):
        row = [q] + [AR_AGING[b][i] for b in AR_AGING] + [sum(AR_AGING[b][i] for b in AR_AGING)]
        ws.append(row)
    wb.save(str(path))

def write_okrs_docx(path: Path) -> None:
    from docx import Document
    from docx.shared import Pt
    d = Document()
    d.add_heading("FY2025 Company OKRs — Confidential", 0)
    d.add_paragraph("Author: CEO Office   |   Approved: Board of Directors   |   Date: 2025-Q2 review")
    d.add_heading("Mission", 1)
    d.add_paragraph("Globex Technologies Inc. enables enterprise teams to ship AI-powered products 10x faster while remaining compliant, observable, and cost-predictable.")
    d.add_heading("Objective 1 — Accelerate revenue growth", 1)
    d.add_paragraph("KR1: Reach $180M ARR by end of 2025-Q4 (was $98M end of 2024-Q4).")
    d.add_paragraph("KR2: Win 12 Fortune-500 logos in FY2025 (currently 4).")
    d.add_paragraph("KR3: Net revenue retention ≥ 118% (currently 112%).")
    d.add_heading("Objective 2 — Operational excellence", 1)
    d.add_paragraph("KR1: Cloud Platform p95 latency ≤ 180ms (currently 240ms).")
    d.add_paragraph("KR2: Reduce SRE on-call pages by 35%.")
    d.add_paragraph("KR3: SOC2 Type II + ISO 27001 maintained; zero Sev-1 incidents in two consecutive quarters.")
    d.add_heading("Objective 3 — Team & culture", 1)
    d.add_paragraph("KR1: Voluntary attrition ≤ 8% (currently ~10.5%).")
    d.add_paragraph("KR2: eNPS ≥ +45 (currently +38).")
    d.add_paragraph("KR3: 100% of people managers complete leadership training by 2025-Q4.")
    d.add_heading("Risks & mitigations", 1)
    d.add_paragraph("Risk: AI Add-ons margin compression from GPU cost. Mitigation: 18-month reserved capacity contract negotiated in 2025-Q1; tiered pricing launched in 2025-Q2.")
    d.add_paragraph("Risk: Berlin hiring slower than plan. Mitigation: opened Munich satellite in 2025-Q2; remote-friendly policy expanded.")
    d.add_heading("Quarterly scorecard", 1)
    t = d.add_table(rows=7, cols=4)
    t.style = "Light Grid"
    hdr = t.rows[0].cells
    hdr[0].text = "Quarter"; hdr[1].text = "O1"; hdr[2].text = "O2"; hdr[3].text = "O3"
    status = [("2024Q1", 0.55, 0.60, 0.50), ("2024Q2", 0.62, 0.65, 0.55),
              ("2024Q3", 0.70, 0.70, 0.62), ("2024Q4", 0.74, 0.72, 0.68),
              ("2025Q1", 0.81, 0.78, 0.74), ("2025Q2", 0.86, 0.82, 0.78)]
    for r, row in enumerate(status, start=1):
        for c, v in enumerate(row):
            t.rows[r].cells[c].text = str(v) if isinstance(v, str) else f"{int(v*100)}%"
    d.save(str(path))

def write_marketing_docx(path: Path) -> None:
    from docx import Document
    d = Document()
    d.add_heading("2025 Marketing Plan — Mid-Year Refresh", 0)
    d.add_paragraph("Owner: CMO   |   Period: 2025-Q2 to 2025-Q4   |   Status: Approved")
    d.add_heading("Executive summary", 1)
    d.add_paragraph("Marketing is shifting from broad-blast field events to account-based marketing aimed at the Fortune-500 target list defined in the OKR. Spend is rebalanced toward digital + content (50%), ABM (30%), and events (20%).")
    d.add_heading("Pipeline targets", 1)
    d.add_paragraph("Q3:  $42M influenced pipeline, 18 opportunities created.")
    d.add_paragraph("Q4:  $58M influenced pipeline, 26 opportunities created.")
    d.add_heading("Budget (USD M)", 1)
    t = d.add_table(rows=5, cols=2)
    t.style = "Light Grid"
    t.rows[0].cells[0].text = "Line"; t.rows[0].cells[1].text = "Amount"
    for r, (k, v) in enumerate([("Digital + content", 4.6), ("ABM", 2.8), ("Events", 1.8), ("Tools & ops", 0.5)], start=1):
        t.rows[r].cells[0].text = k
        t.rows[r].cells[1].text = f"{v:.1f}"
    d.add_heading("Risks", 1)
    d.add_paragraph("Tracking pixel deprecation by Safari / Firefox is forcing a switch to first-party data; 2025-Q3 is the migration deadline.")
    d.save(str(path))

def write_security_docx(path: Path) -> None:
    from docx import Document
    d = Document()
    d.add_heading("2025 Mid-Year Security Review", 0)
    d.add_paragraph("Owner: CISO   |   Audience: Audit Committee   |   Date: 2025-06-15")
    d.add_heading("Compliance posture", 1)
    d.add_paragraph("SOC 2 Type II: renewed 2025-04, zero exceptions.")
    d.add_paragraph("ISO 27001: surveillance audit passed 2025-05.")
    d.add_paragraph("GDPR & CCPA: DPIA completed for AI Add-ons; one outstanding vendor remediation due 2025-Q3.")
    d.add_heading("Incidents", 1)
    d.add_paragraph("Sev-1: 0 (target was 0).")
    d.add_paragraph("Sev-2: 2 (both resolved within SLA; root cause: dependency upgrade).")
    d.add_paragraph("Sev-3: 7 (within acceptable trend).")
    d.add_heading("Top risks", 1)
    d.add_paragraph("1. Supply-chain risk on ML model registry — mitigations in place, full SOX-aligned controls by 2025-Q4.")
    d.add_paragraph("2. Insider-risk from elevated LLM tool access — quarterly access review implemented.")
    d.add_paragraph("3. AI Add-ons data exfiltration — confidential-computing enclave live in 2025-Q2.")
    d.save(str(path))

def write_roadmap_docx(path: Path) -> None:
    from docx import Document
    d = Document()
    d.add_heading("Product Roadmap — 2025 H2", 0)
    d.add_paragraph("Owner: CPO   |   Distribution: All-hands + customer advisory board")
    d.add_heading("Now (in progress)", 1)
    d.add_paragraph("RAG Workbench GA — vector store plug-ins, eval harness, latency dashboard.")
    d.add_paragraph("Multi-region failover for Cloud Platform — DR drill scheduled 2025-Q3.")
    d.add_heading("Next (2025-Q3)", 1)
    d.add_paragraph("Private Model Serving — BYO-key with confidential-computing.")
    d.add_paragraph("Admin SSO SCIM v2 — for the 30 enterprise customers asking for it.")
    d.add_paragraph("Cost guardrails — per-tenant budget alerts with auto-throttle.")
    d.add_heading("Later (2025-Q4)", 1)
    d.add_paragraph("AI Workload Scheduler — reservation marketplace for spare GPU capacity.")
    d.add_paragraph("Compliance pack: HIPAA + FedRAMP Moderate gap analysis completion.")
    d.save(str(path))

def write_board_minutes_pdf(path: Path) -> None:
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(path), pagesize=LETTER, title="Board Minutes 2025-Q2")
    story = []
    story.append(Paragraph("Board of Directors — Meeting Minutes", styles["Title"]))
    story.append(Paragraph("Date: 2025-06-20   |   Location: HQ San Francisco + remote   |   Status: Approved", styles["Normal"]))
    story.append(Spacer(1, 12))
    story.append(Paragraph("Attendees", styles["Heading2"]))
    story.append(Paragraph("All 7 directors present. CFO, COO, General Counsel attending. Auditor partner joined for item 4.", styles["Normal"]))
    story.append(Paragraph("1. Financial review (CFO)", styles["Heading2"]))
    story.append(Paragraph("Revenue grew 14% YoY in 2025-Q2 to $45.7M; gross margin steady at 71%. Operating cash flow positive for the 4th consecutive quarter. AR aging tight — 89% current. See attached expense-detail.xlsx.", styles["Normal"]))
    story.append(Paragraph("2. Sales pipeline (CRO)", styles["Heading2"]))
    story.append(Paragraph("Pipeline coverage 3.4x for 2025-Q3. AI Add-ons now 21% of new ACV. Sales hiring on plan (62 SEs end of Q2).", styles["Normal"]))
    story.append(Paragraph("3. Security & compliance (CISO)", styles["Heading2"]))
    story.append(Paragraph("Zero Sev-1 incidents YTD. SOC 2 Type II renewed in April. Confidential-computing enclave in production for AI Add-ons.", styles["Normal"]))
    story.append(Paragraph("4. Auditor walkthrough (KPMG partner)", styles["Heading2"]))
    story.append(Paragraph("No material weaknesses identified in interim review. Final audit expected 2025-Q4.", styles["Normal"]))
    story.append(Paragraph("5. Resolutions", styles["Heading2"]))
    res = [
        ["R-2025-14", "Approve 2025 H2 marketing plan and $9.7M budget"],
        ["R-2025-15", "Authorize $3.2M GPU cluster expansion capex"],
        ["R-2025-16", "Re-appoint KPMG as external auditor for FY2025"],
    ]
    t = Table([["#", "Resolution"]] + res, colWidths=[80, 420])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ]))
    story.append(t)
    doc.build(story)

def write_audit_pdf(path: Path) -> None:
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(path), pagesize=LETTER, title="Independent Auditor Report 2025-H1")
    s = []
    s.append(Paragraph("Independent Auditor's Report — Interim Review", styles["Title"]))
    s.append(Paragraph("To the Board of Directors and Stockholders of Globex Technologies Inc.", styles["Normal"]))
    s.append(Spacer(1, 10))
    s.append(Paragraph("We have reviewed the accompanying condensed financial statements of Globex Technologies Inc. for the six-month period ended 2025-06-30. These statements are the responsibility of the Company's management.", styles["Normal"]))
    s.append(Paragraph("Scope of review", styles["Heading2"]))
    s.append(Paragraph("Our review was conducted in accordance with Statement on Auditing Standards No. 100 (SAS 100). A review is substantially less in scope than an audit, the objective of which is the expression of an opinion regarding the financial statements taken as a whole.", styles["Normal"]))
    s.append(Paragraph("Conclusion", styles["Heading2"]))
    s.append(Paragraph("Based on our review, we are not aware of any material modifications that should be made to the accompanying condensed financial statements in order for them to be in conformity with U.S. GAAP.", styles["Normal"]))
    s.append(Paragraph("Emphasis of matter", styles["Heading2"]))
    s.append(Paragraph("We draw attention to Note 7 — Revenue Recognition for AI Add-ons tiered pricing, which was newly adopted in 2025-Q2. Our conclusion is not qualified in respect of this matter.", styles["Normal"]))
    s.append(Paragraph("KPMG LLP, San Francisco   |   2025-07-22", styles["Normal"]))
    doc.build(s)

def write_investor_letter_pdf(path: Path) -> None:
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(path), pagesize=LETTER, title="Investor Letter 2025-Q2")
    s = []
    s.append(Paragraph("Letter to Shareholders — 2025-Q2", styles["Title"]))
    s.append(Paragraph("From the Office of the CEO   |   2025-07-08", styles["Normal"]))
    s.append(Spacer(1, 12))
    s.append(Paragraph("Dear shareholders,", styles["Normal"]))
    s.append(Paragraph("2025-Q2 was a milestone quarter. We delivered $45.7M of revenue (+14% YoY), reached positive operating cash flow for the fourth consecutive quarter, and crossed 560 paying customers. AI Add-ons surpassed 20% of new ACV for the first time.", styles["Normal"]))
    s.append(Paragraph("We are raising the lower end of our FY2025 guidance: revenue $172M–$182M (prior $168M–$182M), operating margin 8%–10% (prior 7%–9%), and free cash flow $14M–$18M (prior $12M–$16M).", styles["Normal"]))
    s.append(Paragraph("On the product side, Confidential Computing for AI Add-ons went live this quarter. RAG Workbench moved to GA, and we onboarded 12 new design partners for Private Model Serving ahead of the 2025-Q3 launch.", styles["Normal"]))
    s.append(Paragraph("Finally, I am pleased to announce that the Board has approved a stock buyback of up to $25M, reflecting our confidence in the long-term cash generation of the business.", styles["Normal"]))
    s.append(Paragraph("With appreciation,", styles["Normal"]))
    s.append(Paragraph("— Jane Lin, CEO", styles["Normal"]))
    doc.build(s)

def write_legal_pdf(path: Path) -> None:
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(path), pagesize=LETTER, title="Legal Review 2025-Q2")
    s = []
    s.append(Paragraph("Legal Department — Quarterly Review", styles["Title"]))
    s.append(Paragraph("Reporting period: 2025-Q2   |   Owner: General Counsel", styles["Normal"]))
    s.append(Spacer(1, 10))
    s.append(Paragraph("Material litigation", styles["Heading2"]))
    s.append(Paragraph("None active. One matter from 2024-Q4 (vendor dispute) was settled in mediation for $185K; accrued in 2024 results.", styles["Normal"]))
    s.append(Paragraph("Regulatory", styles["Heading2"]))
    s.append(Paragraph("EU AI Act high-risk classification assessment completed for our AI Add-ons. Gap remediation plan filed with the product team; on track for 2025-Q4 sign-off.", styles["Normal"]))
    s.append(Paragraph("Contracts", styles["Heading2"]))
    s.append(Paragraph("Master agreements updated to include the new confidential-computing DPA. 41 enterprise customers have signed; 19 remain on the legacy template and will be migrated in 2025-Q3.", styles["Normal"]))
    s.append(Paragraph("Intellectual property", styles["Heading2"]))
    s.append(Paragraph("Patent #11,902,345 (multi-tenant vector store) granted 2025-05-13. Two continuations filed. Trademark portfolio expanded to 14 marks across 6 jurisdictions.", styles["Normal"]))
    doc.build(s)

def write_stock_csv(path: Path, rng: random.Random) -> None:
    days = 120
    end = date.today()
    prices = stock_series(38.0, 64.5, days, 1.2, rng)
    import csv
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Date", "Close", "Volume", "DailyReturnPct"])
        prev = prices[0]
        for i, p in enumerate(prices):
            d = (end - timedelta(days=days - 1 - i)).isoformat()
            vol = rng.randint(150_000, 1_200_000)
            ret = (p - prev) / prev * 100
            w.writerow([d, f"{p:.2f}", vol, f"{ret:.3f}"])
            prev = p

# ----------------------------- Main -------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="e2e-output/fin-report/uploads",
                    help="Output directory (created if missing)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--company", default="Globex Technologies Inc.")
    args = ap.parse_args()
    rng = random.Random(args.seed)
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    charts_dir = out.parent / "charts"
    reports_dir = out.parent / "reports"
    charts_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    files = {
        "xlsx/sales-pipeline-2025.xlsx": lambda p: write_sales_xlsx(p, rng),
        "xlsx/expense-detail.xlsx":      lambda p: write_expenses_xlsx(p),
        "xlsx/headcount-2025.xlsx":      lambda p: write_headcount_xlsx(p),
        "xlsx/customer-churn.xlsx":      lambda p: write_churn_xlsx(p),
        "xlsx/ar-aging.xlsx":            lambda p: write_ar_aging_xlsx(p),
        "docx/company-okrs.docx":        lambda p: write_okrs_docx(p),
        "docx/marketing-plan.docx":      lambda p: write_marketing_docx(p),
        "docx/security-review.docx":     lambda p: write_security_docx(p),
        "docx/product-roadmap.docx":     lambda p: write_roadmap_docx(p),
        "pdf/board-minutes-2025q2.pdf":  lambda p: write_board_minutes_pdf(p),
        "pdf/auditor-report-2025h1.pdf": lambda p: write_audit_pdf(p),
        "pdf/investor-letter-2025q2.pdf":lambda p: write_investor_letter_pdf(p),
        "pdf/legal-review-2025q2.pdf":   lambda p: write_legal_pdf(p),
        "csv/stock-prices.csv":          lambda p: write_stock_csv(p, rng),
    }

    manifest = []
    for rel, fn in files.items():
        p = out / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        fn(p)
        manifest.append({
            "path": str(p),
            "rel":  rel,
            "size": p.stat().st_size,
            "kind": p.suffix.lstrip("."),
        })

    # Sidecar manifest for fin_report.py to discover files
    side = out / "_manifest.json"
    side.write_text(json.dumps({
        "company":  args.company,
        "quarters": QUARTERS,
        "seed":     args.seed,
        "files":    manifest,
    }, indent=2))

    print(json.dumps({
        "ok":      True,
        "out":     str(out),
        "count":   len(manifest),
        "files":   manifest,
    }, indent=2))
    return 0

if __name__ == "__main__":
    sys.exit(main())
