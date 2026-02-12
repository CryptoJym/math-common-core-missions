#!/usr/bin/env python3
"""
OCR + extract "ready to DEVELOP" skill targets from an NWEA Student Profile PDF.

This repo's PDF is mostly image-based, so normal text extraction is empty.
This script renders pages to images and runs tesseract OCR, then parses out:
  - standard code lines like "6.EE.3:" or "11-12.R.8:"
  - the band line like "Hyro is ready to DEVELOP these skills (201-210):"
  - the bullet skills (lines starting with an em dash)

Privacy:
  - The output intentionally omits student name/ID and most header text.
  - Only standards + skill bullets are captured.

Example:
  python3 scripts/ocr_student_profile.py \\
    --pdf /Users/jamesbrady/Downloads/Hyro_Brady_2549137_StudentProfile_20260211.pdf \\
    --out /tmp/student_profile_extracted.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from dataclasses import dataclass, asdict
from typing import Optional, List

import fitz  # PyMuPDF


STD_RE = re.compile(
    r"^([0-9]{1,2}(?:-[0-9]{1,2})?\.[A-Za-z0-9]{1,4}\.[0-9]+(?:\.[A-Za-z0-9]+)*)\s*:"
)
CONCEPT_RE = re.compile(r"^([A-Za-z][A-Za-z0-9 ,:/()&'\-]+)\s+(\d{3})\s*$")
BAND_RE = re.compile(r"ready to DEVELOP these skills\s*\((\d{3}-\d{3})\)\s*:", re.IGNORECASE)
BULLET_RE = re.compile(r"^\s*[—\-]\s*(.+?)\s*$")


@dataclass
class ExtractedStandard:
    code: str
    concept: Optional[str]
    band: Optional[str]
    skills: List[str]


def render_pages(pdf_path: str, out_dir: str, scale: float) -> List[str]:
    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    mat = fitz.Matrix(scale, scale)
    png_paths = []
    for i in range(doc.page_count):
        out = os.path.join(out_dir, f"page_{i+1:03d}.png")
        if not os.path.exists(out):
            pix = doc.load_page(i).get_pixmap(matrix=mat, alpha=False)
            pix.save(out)
        png_paths.append(out)
    return png_paths


def tesseract_ocr(png_path: str) -> str:
    # Output to stdout so we don't have to manage .txt files.
    cmd = ["tesseract", png_path, "stdout", "-l", "eng", "--psm", "6"]
    try:
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True)
    except FileNotFoundError as e:
        raise SystemExit("tesseract not found. Install it first (brew install tesseract).") from e


def extract(text: str) -> List[ExtractedStandard]:
    lines = [ln.rstrip() for ln in text.splitlines()]
    out: List[ExtractedStandard] = []

    current_concept: Optional[str] = None
    current_std: Optional[ExtractedStandard] = None
    current_band: Optional[str] = None

    in_instructional_block = False

    def flush():
        nonlocal current_std
        if current_std and current_std.skills:
            out.append(current_std)
        current_std = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if "INSTRUCTIONAL AREAS" in line.upper():
            in_instructional_block = True
            continue
        if "CONFIDENTIALITY NOTICE" in line.upper():
            in_instructional_block = False

        # Concept lines usually appear in instructional areas sections (but not always).
        m_concept = CONCEPT_RE.match(line)
        if m_concept and in_instructional_block:
            current_concept = m_concept.group(1).strip()
            continue

        m_std = STD_RE.match(line)
        if m_std:
            flush()
            code = m_std.group(1)
            current_std = ExtractedStandard(code=code, concept=current_concept, band=None, skills=[])
            current_band = None
            continue

        m_band = BAND_RE.search(line)
        if m_band:
            current_band = m_band.group(1)
            if current_std:
                current_std.band = current_band
            continue

        m_bullet = BULLET_RE.match(line)
        if m_bullet and current_std:
            skill = m_bullet.group(1).strip()
            # Skip obvious OCR junk
            if len(skill) >= 3:
                current_std.skills.append(skill)
            continue

    flush()
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, help="Path to the Student Profile PDF")
    ap.add_argument("--out", required=True, help="Where to write extracted JSON")
    ap.add_argument("--scale", type=float, default=2.0, help="Render scale (2.0 is a good default)")
    ap.add_argument("--cache-dir", default=".cache/student_profile_ocr/pages", help="Where to cache rendered PNGs")
    args = ap.parse_args()

    pngs = render_pages(args.pdf, args.cache_dir, args.scale)

    all_standards: List[ExtractedStandard] = []
    for png in pngs:
        text = tesseract_ocr(png)
        all_standards.extend(extract(text))

    # De-dup exact repeats (OCR can repeat across pages).
    seen = set()
    deduped: List[ExtractedStandard] = []
    for st in all_standards:
        key = (st.code, st.concept or "", st.band or "", tuple(st.skills))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(st)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump([asdict(s) for s in deduped], f, indent=2)

    print(f"Wrote {len(deduped)} extracted standards to {args.out}")


if __name__ == "__main__":
    main()

