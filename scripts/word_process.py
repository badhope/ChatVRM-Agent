#!/usr/bin/env python3
"""Word document processor — the core engine for read/create/append/replace
operations on .docx files. Used by:

  * scripts/word-cli.mjs         — Node CLI wrapper
  * scripts/word.ps1             — PowerShell wrapper
  * server wordProcess tool      — Agent runtime tool

Exit code: 0 on success, non-zero on error. Output is JSON on stdout.
"""
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH


def err(code: int, msg: str, **extra) -> None:
    payload = {"ok": False, "error": msg, **extra}
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(code)


def ok(**payload) -> None:
    print(json.dumps({"ok": True, **payload}, ensure_ascii=False))
    sys.exit(0)


def require_file(path: str) -> None:
    if not os.path.isfile(path):
        err(2, f"file not found: {path}")


def cmd_read(args) -> None:
    require_file(args.path)
    doc = Document(args.path)
    paragraphs = []
    for p in doc.paragraphs:
        style = p.style.name if p.style else "Normal"
        paragraphs.append({"style": style, "text": p.text})
    tables = []
    for t in doc.tables:
        rows = [[c.text for c in r.cells] for r in t.rows]
        tables.append({"rows": len(rows), "cols": len(rows[0]) if rows else 0, "data": rows})
    sections = []
    for s in doc.sections:
        sections.append({
            "page_width_emu": s.page_width,
            "page_height_emu": s.page_height,
            "top_margin_emu": s.top_margin,
            "left_margin_emu": s.left_margin,
        })
    ok(
        path=os.path.abspath(args.path),
        paragraphs=paragraphs,
        paragraph_count=len(paragraphs),
        tables=tables,
        table_count=len(tables),
        sections=sections,
    )


def cmd_create(args) -> None:
    out = args.output
    if not out:
        err(2, "--output is required for create")
    doc = Document()
    if args.title:
        h = doc.add_heading(args.title, level=1)
    if args.body:
        for line in args.body.split("\\n"):
            doc.add_paragraph(line)
    if args.heading:
        doc.add_heading(args.heading, level=2)
    if args.content:
        doc.add_paragraph(args.content)
    if args.table:
        # --table is "rows=3,cols=4" then --cell "r0c0=hi|r0c1=yo|r1c0=foo|..."
        rows_n, cols_n = (int(x) for x in args.table.split(","))
        table = doc.add_table(rows=rows_n, cols=cols_n)
        table.style = "Table Grid"
        if args.cell:
            for spec in args.cell.split("|"):
                m = re.match(r"r(\d+)c(\d+)=(.*)", spec, re.DOTALL)
                if not m:
                    continue
                r, c = int(m.group(1)), int(m.group(2))
                if 0 <= r < rows_n and 0 <= c < cols_n:
                    table.cell(r, c).text = m.group(3)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    doc.save(out)
    ok(path=os.path.abspath(out), size_bytes=os.path.getsize(out))


def cmd_append(args) -> None:
    require_file(args.path)
    doc = Document(args.path)
    if args.heading:
        doc.add_heading(args.heading, level=2 if not args.heading_level else int(args.heading_level))
    if args.text:
        for line in args.text.split("\\n"):
            doc.add_paragraph(line)
    if args.paragraph and args.paragraph_count:
        for _ in range(int(args.paragraph_count)):
            doc.add_paragraph(args.paragraph)
    doc.save(args.path)
    ok(path=os.path.abspath(args.path), size_bytes=os.path.getsize(args.path), appended=True)


def cmd_replace(args) -> None:
    require_file(args.path)
    if args.find is None or args.replace_with is None:
        err(2, "--find and --replace-with are required for replace")
    doc = Document(args.path)
    hits = 0
    # Walk paragraphs (body, headers, footers, tables) and replace in runs
    def replace_in_paragraphs(paragraphs):
        nonlocal hits
        for p in paragraphs:
            full_text = "".join(r.text for r in p.runs)
            if args.find in full_text:
                count = full_text.count(args.find)
                hits += count
                # Replace: clear all runs, put the new text in the first run
                new_full = full_text.replace(args.find, args.replace_with)
                for r in p.runs:
                    r.text = ""
                if p.runs:
                    p.runs[0].text = new_full
                else:
                    p.add_run(new_full)
    replace_in_paragraphs(doc.paragraphs)
    for tbl in doc.tables:
        for row in tbl.rows:
            for cell in row.cells:
                replace_in_paragraphs(cell.paragraphs)
    for section in doc.sections:
        replace_in_paragraphs(section.header.paragraphs)
        replace_in_paragraphs(section.footer.paragraphs)
    doc.save(args.path)
    ok(path=os.path.abspath(args.path), replacements=hits)


def cmd_info(args) -> None:
    require_file(args.path)
    doc = Document(args.path)
    stat = os.stat(args.path)
    paragraphs = [p.text for p in doc.paragraphs]
    full_text = "\n".join(paragraphs)
    ok(
        path=os.path.abspath(args.path),
        size_bytes=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
        paragraph_count=len(paragraphs),
        table_count=len(doc.tables),
        section_count=len(doc.sections),
        total_chars=len(full_text),
        total_lines=full_text.count("\n") + (0 if not full_text else 1),
        core_props={
            "author": doc.core_properties.author,
            "title": doc.core_properties.title,
            "subject": doc.core_properties.subject,
            "created": str(doc.core_properties.created) if doc.core_properties.created else None,
            "modified": str(doc.core_properties.modified) if doc.core_properties.modified else None,
        },
    )


def cmd_search(args) -> None:
    require_file(args.path)
    if not args.query:
        err(2, "--query is required for search")
    doc = Document(args.path)
    matches = []
    pattern = re.compile(args.query)
    use_regex = bool(args.regex)
    for i, p in enumerate(doc.paragraphs):
        text = p.text
        if (use_regex and pattern.search(text)) or (not use_regex and args.query in text):
            matches.append({"paragraph_index": i, "style": p.style.name if p.style else "Normal", "text": text})
    for ti, t in enumerate(doc.tables):
        for ri, row in enumerate(t.rows):
            for ci, cell in enumerate(row.cells):
                if (use_regex and pattern.search(cell.text)) or (not use_regex and args.query in cell.text):
                    matches.append({"table_index": ti, "row": ri, "col": ci, "text": cell.text})
    ok(query=args.query, match_count=len(matches), matches=matches[:50])


def cmd_to_text(args) -> None:
    """Dump full text to a .txt file alongside the .docx — useful for indexing."""
    require_file(args.path)
    doc = Document(args.path)
    lines = [p.text for p in doc.paragraphs]
    out = args.output or (re.sub(r"\.docx?$", ".txt", args.path, flags=re.IGNORECASE) or args.path + ".txt")
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    ok(path=os.path.abspath(out), line_count=len(lines), char_count=sum(len(l) for l in lines))


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Word document processor")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("read", help="Read paragraphs, tables, sections from a .docx")
    p.add_argument("path")
    p.set_defaults(func=cmd_read)

    p = sub.add_parser("create", help="Create a new .docx with optional title/heading/content/table")
    p.add_argument("--output", required=True)
    p.add_argument("--title", default="")
    p.add_argument("--body", default="")
    p.add_argument("--heading", default="")
    p.add_argument("--content", default="")
    p.add_argument("--table", default="", help="rows,cols e.g. 3,4")
    p.add_argument("--cell", default="", help="r0c0=hi|r0c1=yo|...")
    p.set_defaults(func=cmd_create)

    p = sub.add_parser("append", help="Append headings/paragraphs to an existing .docx")
    p.add_argument("path")
    p.add_argument("--heading", default="")
    p.add_argument("--heading-level", default="2")
    p.add_argument("--text", default="")
    p.add_argument("--paragraph", default="")
    p.add_argument("--paragraph-count", default="0")
    p.set_defaults(func=cmd_append)

    p = sub.add_parser("replace", help="Find and replace text in a .docx (paragraphs, tables, headers, footers)")
    p.add_argument("path")
    p.add_argument("--find", required=True)
    p.add_argument("--replace-with", required=True)
    p.set_defaults(func=cmd_replace)

    p = sub.add_parser("info", help="Get file stats + document metadata")
    p.add_argument("path")
    p.set_defaults(func=cmd_info)

    p = sub.add_parser("search", help="Search paragraphs/table cells for a substring or regex")
    p.add_argument("path")
    p.add_argument("--query", required=True)
    p.add_argument("--regex", action="store_true")
    p.set_defaults(func=cmd_search)

    p = sub.add_parser("to-text", help="Export all paragraphs to a .txt file")
    p.add_argument("path")
    p.add_argument("--output", default="")
    p.set_defaults(func=cmd_to_text)

    args = ap.parse_args()
    try:
        args.func(args)
    except Exception as e:
        err(1, f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
