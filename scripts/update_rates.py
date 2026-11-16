#!/usr/bin/env python3
"""Denní aktualizace veřejných sazeb pro sazby-dashboard.

Když zdroj selže, soubor se nepřepisuje a skript skončí kódem 0.
Nevymýšlí hodnoty: do CSV se dostane jen to, co se opravdu stáhlo,
plus ruční řady a výslovně označený přibližný odečet 3Y IRS z grafu.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import ssl
import sys
import traceback
import urllib.request
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
UA = "sazby-dashboard/1.0 (+https://github.com/zabranda/sazby-dashboard)"
CTX = ssl.create_default_context()
TODAY = datetime.now(timezone.utc).date()

# Přibližný odečet 3Y CZK IRS z grafu Patria, tolerance autora ±3 bp.
SEED_IRS_3Y = (
    "2024-01-01,3.88;2024-01-08,3.93;2024-01-15,3.87;2024-01-22,3.93;2024-01-29,3.86;"
    "2024-02-05,3.77;2024-02-13,3.58;2024-02-20,3.46;2024-02-27,3.55;2024-03-05,3.5;"
    "2024-03-12,3.44;2024-03-19,3.66;2024-03-26,3.67;2024-04-02,3.81;2024-04-10,3.9;"
    "2024-04-17,4.23;2024-04-24,4.16;2024-05-01,4.25;2024-05-08,4.04;2024-05-16,4.06;"
    "2024-05-23,4.06;2024-05-30,4.25;2024-06-06,4.11;2024-06-13,4.15;2024-06-21,4.01;"
    "2024-06-28,4.01;2024-07-05,3.96;2024-07-12,3.75;2024-07-19,3.57;2024-07-27,3.53;"
    "2024-08-03,3.4;2024-08-10,3.25;2024-08-17,3.3;2024-08-24,3.33;2024-09-01,3.4;"
    "2024-09-08,3.32;2024-09-15,3.19;2024-09-22,3.16;2024-09-29,3.16;2024-10-06,3.17;"
    "2024-10-13,3.4;2024-10-20,3.42;2024-10-28,3.51;2024-11-04,3.48;2024-11-11,3.58;"
    "2024-11-18,3.52;2024-11-25,3.45;2024-12-03,3.43;2024-12-10,3.47;2024-12-17,3.58;"
    "2024-12-24,3.6;2025-01-01,3.63;2025-01-08,3.68;2025-01-15,3.59;2025-01-22,3.55;"
    "2025-01-29,3.51;2025-02-05,3.46;2025-02-12,3.52;2025-02-19,3.5;2025-02-26,3.48;"
    "2025-03-05,3.53;2025-03-12,3.53;2025-03-19,3.47;2025-03-26,3.54;2025-04-02,3.37;"
    "2025-04-10,3.15;2025-04-17,3.15;2025-04-24,3.17;2025-05-01,3.24;2025-05-08,3.28;"
    "2025-05-15,3.34;2025-05-22,3.3;2025-05-29,3.23;2025-06-05,3.46;2025-06-13,3.49;"
    "2025-06-20,3.5;2025-06-27,3.54;2025-07-04,3.53;2025-07-11,3.56;2025-07-18,3.61;"
    "2025-07-25,3.63;2025-08-01,3.66;2025-08-08,3.64;2025-08-15,3.63;2025-08-22,3.57;"
    "2025-08-29,3.62;2025-09-05,3.65;2025-09-13,3.68;2025-09-20,3.75;2025-09-27,3.79;"
    "2025-10-04,3.77;2025-10-11,3.7;2025-10-18,3.62;2025-10-25,3.71;2025-11-01,3.74;"
    "2025-11-08,3.81;2025-11-15,3.88;2025-11-22,3.89;2025-11-29,3.85;2025-12-06,3.81;"
    "2025-12-13,3.92;2025-12-20,3.77;2025-12-27,3.71;2026-01-03,3.67;2026-01-10,3.55;"
    "2026-01-17,3.59;2026-01-24,3.54;2026-01-31,3.46;2026-02-07,3.53;2026-02-14,3.44;"
    "2026-02-21,3.48;2026-02-28,3.5;2026-03-07,4.08;2026-03-14,4.23;2026-03-21,4.27;"
    "2026-03-28,4.36;2026-04-04,4.2;2026-04-11,4.09;2026-04-18,3.97;2026-04-25,4.19;"
    "2026-05-02,4.31;2026-05-09,4.24;2026-05-16,4.49;2026-05-23,4.41;2026-05-30,4.2;"
    "2026-06-06,4.43;2026-06-13,4.28;2026-06-20,4.2;2026-06-27,4.1;2026-07-05,4.08;"
    "2026-07-12,4.26;2026-07-19,4.49;2026-07-26,4.5;2026-08-02,4.34;2026-08-09,4.38;"
    "2026-08-16,4.46;2026-08-23,4.55;2026-08-30,4.67;2026-09-06,4.66;2026-09-13,4.88;"
    "2026-09-20,4.78;2026-09-27,4.96;2026-10-01,4.82;2026-10-02,4.81;2026-10-05,4.88;"
    "2026-10-06,4.89;2026-10-07,4.91;2026-10-08,4.92;2026-10-09,4.92;2026-10-12,4.89;"
    "2026-10-13,4.87;2026-10-14,4.85;2026-10-15,4.84;2026-10-16,4.85;2026-10-19,4.88;"
    "2026-10-20,4.91;2026-10-21,4.9;2026-10-22,4.89;2026-10-23,4.89;2026-10-26,4.9;"
    "2026-10-27,4.9;2026-10-28,4.89;2026-10-29,4.89;2026-10-30,4.88;2026-11-02,4.75;"
    "2026-11-03,4.69;2026-11-04,4.61;2026-11-05,4.57;2026-11-06,4.59;2026-11-09,4.68;"
    "2026-11-10,4.73;2026-11-11,4.75;2026-11-12,4.77;2026-11-13,4.78"
)

MONTHS_EN = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
    "January": 1, "February": 2, "March": 3, "April": 4, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12,
}

# Specifikace pro výpočet vlivu. impact_per je jednotka, na kterou se beta přepočte.
DRIVERS = [
    {"id": "cnb_repo", "file": "cnb_repo.csv", "kind": "step", "impact_per": 0.10, "impact_name": "+10 bp"},
    {"id": "cz_cpi", "file": "cz_cpi.csv", "kind": "monthly", "impact_per": 1.0, "impact_name": "+1 p. b."},
    {"id": "cz_bond_3y", "file": "cz_bond_3y.csv", "kind": "daily", "impact_per": 0.10, "impact_name": "+10 bp"},
    {"id": "eur_czk", "file": "cnb_fx.csv", "column": "eur_czk", "kind": "daily", "impact_per": 0.10, "impact_name": "+0,10 Kč"},
    {"id": "pribor_3m", "file": "pribor_3m.csv", "kind": "daily", "impact_per": 0.10, "impact_name": "+10 bp"},
    {"id": "ecb_deposit", "file": "ecb_deposit.csv", "kind": "step", "impact_per": 0.10, "impact_name": "+10 bp"},
    {"id": "hicp_ea", "file": "hicp_ea.csv", "kind": "monthly", "impact_per": 1.0, "impact_name": "+1 p. b."},
    {"id": "eur_2y", "file": "eur_2y.csv", "kind": "daily", "impact_per": 0.10, "impact_name": "+10 bp"},
    {"id": "fed_funds", "file": "fed_funds.csv", "kind": "step", "impact_per": 0.10, "impact_name": "+10 bp"},
    {"id": "us_cpi", "file": "us_cpi.csv", "kind": "monthly", "impact_per": 1.0, "impact_name": "+1 p. b."},
    {"id": "ust_2y", "file": "ust_2y.csv", "kind": "daily", "impact_per": 0.10, "impact_name": "+10 bp"},
    {"id": "ust_10y", "file": "ust_10y.csv", "kind": "daily", "impact_per": 0.10, "impact_name": "+10 bp"},
    {"id": "eur_usd", "file": "eurusd.csv", "kind": "daily", "impact_per": 0.01, "impact_name": "+0,01"},
    {"id": "brent", "file": "brent.csv", "kind": "daily", "impact_per": 1.0, "impact_name": "+1 USD"},
]


def fetch(url: str, timeout: int = 30, data: bytes | None = None, headers: dict | None = None) -> bytes:
    hdrs = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as response:
        return response.read()


def try_fetch(url: str, timeout: int = 30, data: bytes | None = None, headers: dict | None = None) -> bytes | None:
    try:
        return fetch(url, timeout=timeout, data=data, headers=headers)
    except Exception as exc:  # noqa: BLE001 - zdroj nesmí shodit běh
        print(f"  zdroj selhal: {url[:90]} ({exc})", file=sys.stderr)
        return None


def decode(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1250", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def fnum(value: str) -> float | None:
    text = value.strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    if text in {"", "-", ".", "N/A", "NA", "null"}:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if not math.isfinite(number):
        return None
    return number


def parse_iso(value: str) -> date | None:
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%m/%d/%Y", "%d %b %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    match = re.match(r"^(\d{4})-(\d{2})$", value)
    if match:
        year, month = int(match.group(1)), int(match.group(2))
        return date(year, month, monthrange(year, month)[1])
    return None


def month_end(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def fmt_num(value: float) -> str:
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text if text else "0"


def load_rows(name: str) -> list[dict]:
    path = DATA / name
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_series(name: str, rows: list[dict], fields: list[str]) -> bool:
    path = DATA / name
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in fields})
    text = buffer.getvalue()
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old == text:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def points_to_rows(points: list[tuple[date, float]], quality: str, source: str) -> list[dict]:
    clean = []
    seen = set()
    for day, value in sorted(points):
        if day in seen or day > TODAY + timedelta(days=2):
            continue
        seen.add(day)
        clean.append({
            "date": day.isoformat(),
            "value": fmt_num(value),
            "quality": quality,
            "source": source,
        })
    return clean


def rows_to_points(rows: list[dict], column: str = "value") -> list[tuple[date, float]]:
    points = []
    for row in rows:
        day = parse_iso(row.get("date") or row.get("date_effective") or "")
        value = fnum(row.get(column) or "")
        if day and value is not None:
            points.append((day, value))
    points.sort()
    return points


def merge_series(name: str, fresh: list[dict], fields: list[str] | None = None) -> bool:
    fields = fields or ["date", "value", "quality", "source"]
    current = {row["date"]: row for row in load_rows(name) if row.get("date")}
    for row in fresh:
        previous = current.get(row["date"])
        if previous and previous.get("quality") == "official" and row.get("quality") != "official":
            continue
        current[row["date"]] = row
    rows = [current[key] for key in sorted(current)]
    return write_series(name, rows, fields)


def replace_series(name: str, rows: list[dict]) -> bool:
    return write_series(name, rows, ["date", "value", "quality", "source"])


def status_from(rows: list[dict], refreshed: bool, error: str | None, label: str, url: str, auto: bool = True) -> dict:
    last = rows[-1] if rows else {}
    return {
        "ok": error is None and bool(rows),
        "refreshed": refreshed,
        "error": error,
        "rows": len(rows),
        "last_date": last.get("date", ""),
        "last_value": last.get("value", last.get("eur_czk", "")),
        "source_label": label,
        "source_url": url,
        "auto": auto,
        "quality": last.get("quality", ""),
    }


def kept(name: str, error: str, label: str, url: str, auto: bool = True) -> dict:
    rows = load_rows(name)
    info = status_from(rows, False, error, label, url, auto)
    info["ok"] = bool(rows)
    return info


def sane(points: list[tuple[date, float]], low: float, high: float) -> list[tuple[date, float]]:
    return [(day, value) for day, value in points if low < value < high and day >= date(1990, 1, 1)]


def seed_pairs(blob: str, quality: str, source: str) -> list[dict]:
    rows = []
    for item in blob.split(";"):
        day_text, value_text = item.split(",")
        rows.append({
            "date": day_text,
            "value": fmt_num(float(value_text)),
            "quality": quality,
            "source": source,
        })
    return rows


def parse_patria_history(html: str) -> tuple[date | None, dict[str, float]]:
    marker = html.find("IRS sazby historie - CZK")
    if marker < 0:
        return None, {}
    chunk = html[marker:marker + 120000]
    date_match = re.search(r'value="(\d{4}-\d{2}-\d{2})"', chunk)
    day = parse_iso(date_match.group(1)) if date_match else None
    rates = {}
    pattern = re.compile(
        r'/kurzy/CZK/(1Y|3Y|5Y)/irs/graf\.html"[^<]*</a></td>'
        r'<td class="number">([0-9]+,[0-9]+)</td><td class="number">([0-9]+,[0-9]+)</td>'
    )
    for tenor, bid_text, ask_text in pattern.findall(chunk):
        bid, ask = fnum(bid_text), fnum(ask_text)
        if bid is None or ask is None:
            continue
        rates[tenor] = round((bid + ask) / 2, 4)
    return day, rates


def parse_patria_detail(html: str) -> tuple[date | None, float | None]:
    match = re.search(r'panelcaptiontitle">czk\s*-\s*\d+\s*y', html, re.I)
    if not match:
        return None, None
    window = html[max(0, match.start() - 900):match.start() + 2200]
    date_match = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", window)
    quote = re.search(r'<tr class="data">\s*<td>([\d,]+)</td>\s*<td>([\d,]+)</td>', window)
    if not date_match or not quote:
        return None, None
    day = date(int(date_match.group(3)), int(date_match.group(2)), int(date_match.group(1)))
    bid, ask = fnum(quote.group(1)), fnum(quote.group(2))
    if bid is None or ask is None:
        return day, None
    return day, round((bid + ask) / 2, 4)


def update_irs() -> dict:
    label = "Patria, střed nákup/prodej"
    url = "https://www.patria.cz/kurzy/historie/sazby.html"
    if not (DATA / "irs_3y.csv").exists():
        write_series("irs_3y.csv", seed_pairs(SEED_IRS_3Y, "approximate", "patria-graf-odect"), ["date", "value", "quality", "source"])
    if not (DATA / "irs_1y.csv").exists():
        write_series("irs_1y.csv", [{"date": "2026-11-13", "value": "4.50", "quality": "approximate", "source": "patria-graf-odect"}], ["date", "value", "quality", "source"])
    if not (DATA / "irs_5y.csv").exists():
        write_series("irs_5y.csv", [{"date": "2026-11-13", "value": "4.80", "quality": "approximate", "source": "patria-graf-odect"}], ["date", "value", "quality", "source"])

    fresh: dict[str, list[dict]] = {"1Y": [], "3Y": [], "5Y": []}
    errors = []
    history = try_fetch(url, timeout=30)
    if history:
        day, rates = parse_patria_history(decode(history))
        if day and rates:
            for tenor, value in rates.items():
                fresh[tenor].append({"date": day.isoformat(), "value": fmt_num(value), "quality": "official", "source": "patria-stred"})
        else:
            errors.append("historie Patria bez tabulky IRS")
    else:
        errors.append("historie Patria nedostupná")

    for tenor, page in (("1Y", "1y"), ("3Y", "3y"), ("5Y", "5y")):
        detail_url = f"https://www.patria.cz/kurzy/czk/{page}/irsdetail.html"
        raw = try_fetch(detail_url, timeout=30)
        if not raw:
            errors.append(f"detail {tenor} nedostupný")
            continue
        day, value = parse_patria_detail(decode(raw))
        if day and value is not None and 0 < value < 20:
            fresh[tenor].append({"date": day.isoformat(), "value": fmt_num(value), "quality": "official", "source": "patria-stred"})
        else:
            errors.append(f"detail {tenor} bez závěrky")

    changed = False
    for tenor, filename in (("1Y", "irs_1y.csv"), ("3Y", "irs_3y.csv"), ("5Y", "irs_5y.csv")):
        if fresh[tenor]:
            changed = merge_series(filename, fresh[tenor]) or changed
    rows = load_rows("irs_3y.csv")
    error = None if fresh["3Y"] else "; ".join(errors) or "Patria nevrátila 3Y IRS"
    info = status_from(rows, bool(fresh["3Y"]), error if not fresh["3Y"] else None, label, url)
    info["detail"] = "; ".join(errors)
    info["changed"] = changed
    return info


def update_fx() -> dict:
    label = "ČNB, denní fixing"
    url = "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/vybrane.txt"
    start = date(2023, 1, 1).strftime("%d.%m.%Y")
    end = TODAY.strftime("%d.%m.%Y")
    series = {}
    errors = []
    for code, key in (("EUR", "eur_czk"), ("USD", "usd_czk")):
        raw = try_fetch(f"{url}?mena={code}&od={start}&do={end}", timeout=40)
        if not raw:
            errors.append(code)
            continue
        for line in decode(raw).splitlines():
            parts = [part.strip() for part in line.split("|")]
            if len(parts) != 2:
                continue
            day = parse_iso(parts[0])
            value = fnum(parts[1])
            if not day or value is None:
                continue
            if code == "EUR" and not 15 < value < 40:
                continue
            if code == "USD" and not 10 < value < 40:
                continue
            series.setdefault(day, {})[key] = value
    if not series:
        return kept("cnb_fx.csv", "fixing ČNB se nepodařilo stáhnout", label, url)
    rows = []
    for day in sorted(series):
        item = series[day]
        if "eur_czk" not in item or "usd_czk" not in item:
            continue
        rows.append({
            "date": day.isoformat(),
            "eur_czk": fmt_num(item["eur_czk"]),
            "usd_czk": fmt_num(item["usd_czk"]),
            "quality": "official",
            "source": "cnb-fixing",
        })
    changed = write_series("cnb_fx.csv", rows, ["date", "eur_czk", "usd_czk", "quality", "source"])
    info = status_from(rows, True, None, label, url)
    info["last_value"] = rows[-1]["eur_czk"] if rows else ""
    info["changed"] = changed
    if errors:
        info["detail"] = "chybí " + ",".join(errors)
    return info


def update_repo() -> dict:
    label = "ČNB, 2T repo sazba"
    url = "https://www.cnb.cz/cs/casto-kladene-dotazy/.galleries/vyvoj_repo_historie.txt"
    raw = try_fetch(url, timeout=30)
    if not raw:
        return kept("cnb_repo.csv", "historie repo sazby ČNB nedostupná", label, url)
    points = []
    for line in decode(raw).splitlines():
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 2 or not parts[0][:4].isdigit():
            continue
        day = datetime.strptime(parts[0][:8], "%Y%m%d").date()
        value = fnum(parts[1])
        if value is None:
            continue
        points.append((day, value))
    points = [(day, value) for day, value in sane(points, -0.01, 40) if day >= date(2020, 1, 1)]
    rows = points_to_rows(points, "official", "cnb-repo")
    if not rows:
        return kept("cnb_repo.csv", "historie repo sazby ČNB bez platných řádků", label, url)
    changed = replace_series("cnb_repo.csv", rows)
    info = status_from(rows, True, None, label, url)
    info["changed"] = changed
    return info


def parse_pribor_text(text: str) -> list[tuple[date, float]]:
    points = []
    for line in text.splitlines():
        if "|" not in line or line.lower().startswith("datum") or line.lower().startswith("date") or line.startswith("|"):
            continue
        parts = line.split("|")
        if len(parts) < 13:
            continue
        day = parse_iso(parts[0].strip())
        value = fnum(parts[12])
        if day and value is not None:
            points.append((day, value))
    return points


def update_pribor() -> dict:
    label = "ČNB, PRIBOR 3M"
    url = "https://www.cnb.cz/cs/financni-trhy/penezni-trh/pribor/fixing-urokovych-sazeb-na-mezibankovnim-trhu-depozit-pribor/rok.txt?year={year}"
    points = []
    got = 0
    for year in range(2023, TODAY.year + 1):
        raw = try_fetch(url.format(year=year), timeout=30)
        if not raw:
            continue
        got += 1
        points.extend(parse_pribor_text(decode(raw)))
    points = sane(points, 0, 25)
    if got == 0 or not points:
        return kept("pribor_3m.csv", "PRIBOR 3M se nepodařilo stáhnout", label, url.format(year=TODAY.year))
    rows = points_to_rows(points, "official", "cnb-pribor")
    changed = replace_series("pribor_3m.csv", rows)
    info = status_from(rows, True, None, label, url.format(year=TODAY.year))
    info["changed"] = changed
    return info


def update_cpi() -> dict:
    label = "ČSÚ, meziroční růst indexu spotřebitelských cen"
    url = "https://data.csu.gov.cz/opendata/sady/CEN0101E/distribuce/csv"
    raw = try_fetch(url, timeout=120)
    if not raw:
        return kept("cz_cpi.csv", "otevřená data ČSÚ se nepodařilo stáhnout", label, url)
    points = []
    reader = csv.reader(io.StringIO(decode(raw)))
    next(reader, None)
    for row in reader:
        if len(row) < 15:
            continue
        # Oficiální meziroční růst úhrnu, ne bazický index (ten má v souboru víc variant).
        if row[1] != "6134" or row[3] != "RR" or row[5] != "0" or row[7] != "" or row[9] != "0":
            continue
        if not re.fullmatch(r"\d{4}-\d{2}", row[13]):
            continue
        value = fnum(row[14])
        if value is None:
            continue
        year, month = int(row[13][:4]), int(row[13][5:7])
        day = month_end(year, month)
        if day >= date(2023, 1, 1):
            points.append((day, value))
    points = sane(points, -5, 40)
    if not points:
        return kept("cz_cpi.csv", "z CSV ČSÚ nešla spočítat meziroční inflace", label, url)
    rows = points_to_rows(points, "official", "csu-cpi-rr")
    changed = replace_series("cz_cpi.csv", rows)
    info = status_from(rows, True, None, label, url)
    info["changed"] = changed
    return info


def update_hicp() -> dict:
    label = "Eurostat, HICP eurozóna, meziročně"
    url = "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/prc_hicp_manr/M.RCH_A.CP00.EA?format=SDMX-CSV&startPeriod=2023-01"
    raw = try_fetch(url, timeout=40)
    if not raw:
        return kept("hicp_ea.csv", "Eurostat HICP se nepodařilo stáhnout", label, url)
    points = []
    reader = csv.DictReader(io.StringIO(decode(raw)))
    for row in reader:
        day = parse_iso(row.get("TIME_PERIOD") or "")
        value = fnum(row.get("OBS_VALUE") or "")
        if day and value is not None:
            points.append((day, value))
    points = sane(points, -5, 30)
    if not points:
        return kept("hicp_ea.csv", "Eurostat HICP bez hodnot", label, url)
    rows = points_to_rows(points, "official", "eurostat-hicp")
    changed = replace_series("hicp_ea.csv", rows)
    info = status_from(rows, True, None, label, url)
    info["changed"] = changed
    return info


def update_ecb_csv(name: str, url: str, label: str, low: float, high: float, source: str, thin: bool = False) -> dict:
    raw = try_fetch(url, timeout=50)
    if not raw:
        return kept(name, f"{label} se nepodařilo stáhnout", label, url.split("?")[0])
    points = []
    reader = csv.DictReader(io.StringIO(decode(raw)))
    for row in reader:
        day = parse_iso(row.get("TIME_PERIOD") or "")
        value = fnum(row.get("OBS_VALUE") or "")
        if day and value is not None and day >= date(2023, 1, 1):
            points.append((day, value))
    points = sane(points, low, high)
    if thin:
        points = thin_steps(points)
    if not points:
        return kept(name, f"{label} bez hodnot", label, url.split("?")[0])
    rows = points_to_rows(points, "official", source)
    changed = replace_series(name, rows)
    info = status_from(rows, True, None, label, url.split("?")[0])
    info["changed"] = changed
    return info


def thin_steps(points: list[tuple[date, float]]) -> list[tuple[date, float]]:
    points = sorted(points)
    if not points:
        return []
    kept_points = [points[0]]
    for day, value in points[1:]:
        if abs(value - kept_points[-1][1]) > 1e-9:
            kept_points.append((day, value))
    if kept_points[-1][0] != points[-1][0]:
        kept_points.append(points[-1])
    return kept_points


def update_eur_2y() -> dict:
    return update_ecb_csv(
        "eur_2y.csv",
        "https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?format=csvdata&startPeriod=2023-01-01",
        "ECB, 2Y spot sazba AAA výnosové křivky eurozóny",
        -3, 15, "ecb-aaa-2y",
    )


def update_ecb_deposit() -> dict:
    fred = try_fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=ECBDFR&cosd=2022-01-01", timeout=12)
    if fred:
        points = parse_fred(decode(fred), "ECBDFR")
        points = thin_steps(sane(points, -2, 10))
        if points:
            rows = points_to_rows(points, "official", "fred-ECBDFR")
            changed = replace_series("ecb_deposit.csv", rows)
            info = status_from(rows, True, None, "FRED ECBDFR, depozitní sazba ECB", "https://fred.stlouisfed.org/series/ECBDFR")
            info["changed"] = changed
            return info
    return update_ecb_csv(
        "ecb_deposit.csv",
        "https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?format=csvdata&startPeriod=2022-01-01",
        "ECB, depozitní sazba (FRED ECBDFR se nepodařilo stáhnout, použita řada ECB)",
        -2, 10, "ecb-dfr", thin=True,
    )


def update_eurusd() -> dict:
    fred = try_fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXUSEU&cosd=2023-01-01", timeout=12)
    if fred:
        points = sane(parse_fred(decode(fred), "DEXUSEU"), 0.5, 2)
        if points:
            label = "FRED DEXUSEU, USD za 1 EUR"
            source_rows = points_to_rows(points, "official", "fred-DEXUSEU")
            ecb_raw = try_fetch(
                "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&startPeriod="
                + points[-1][0].isoformat(),
                timeout=30,
            )
            if ecb_raw:
                newer = []
                same = None
                reader = csv.DictReader(io.StringIO(decode(ecb_raw)))
                for row in reader:
                    day = parse_iso(row.get("TIME_PERIOD") or "")
                    value = fnum(row.get("OBS_VALUE") or "")
                    if not day or value is None or not 0.5 < value < 2:
                        continue
                    if day == points[-1][0]:
                        same = value
                    elif day > points[-1][0]:
                        newer.append((day, value))
                if newer and (same is None or abs(same - points[-1][1]) <= 0.01):
                    source_rows.extend(points_to_rows(newer, "official", "ecb-eurusd"))
                    label += "; dny po posledním FRED doplněny z ECB"
            changed = replace_series("eurusd.csv", source_rows)
            info = status_from(source_rows, True, None, label, "https://fred.stlouisfed.org/series/DEXUSEU")
            info["changed"] = changed
            return info
    info = update_ecb_csv(
        "eurusd.csv",
        "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&startPeriod=2023-01-01",
        "ECB, referenční kurz USD za 1 EUR (FRED DEXUSEU nedostupný)",
        0.5, 2, "ecb-eurusd",
    )
    if info.get("rows"):
        return info
    fx = load_rows("cnb_fx.csv")
    points = []
    for row in fx:
        day = parse_iso(row.get("date", ""))
        eur = fnum(row.get("eur_czk", ""))
        usd = fnum(row.get("usd_czk", ""))
        if day and eur and usd:
            points.append((day, round(eur / usd, 4)))
    if not points:
        return info
    rows = points_to_rows(points, "official", "cnb-cross")
    changed = replace_series("eurusd.csv", rows)
    fallback = status_from(rows, True, None, "ČNB, EUR/USD ze dvou fixingů (FRED i ECB kurz nedostupné)", "https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt")
    fallback["changed"] = changed
    return fallback


def parse_fred(text: str, column: str) -> list[tuple[date, float]]:
    points = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        day = parse_iso(row.get("observation_date") or row.get("DATE") or "")
        value = fnum(row.get(column) or "")
        if day and value is not None:
            points.append((day, value))
    return points


def update_treasury() -> dict:
    label = "US Treasury, par výnos 2Y a 10Y"
    base = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv"
    fred2 = try_fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2&cosd=2023-01-01", timeout=12)
    fred10 = try_fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2023-01-01", timeout=12)
    if fred2 and fred10:
        points2 = sane(parse_fred(decode(fred2), "DGS2"), -1, 20)
        points10 = sane(parse_fred(decode(fred10), "DGS10"), -1, 20)
        if points2 and points10:
            changed = replace_series("ust_2y.csv", points_to_rows(points2, "official", "fred-DGS2"))
            changed = replace_series("ust_10y.csv", points_to_rows(points10, "official", "fred-DGS10")) or changed
            rows = load_rows("ust_2y.csv")
            info = status_from(rows, True, None, "FRED DGS2 a DGS10", "https://fred.stlouisfed.org/series/DGS2")
            info["changed"] = changed
            info["also"] = "ust_10y"
            return info
    points2, points10 = [], []
    for year in range(2023, TODAY.year + 1):
        raw = try_fetch(base.format(year=year), timeout=30)
        if not raw:
            continue
        reader = csv.DictReader(io.StringIO(decode(raw)))
        for row in reader:
            day = parse_iso(row.get("Date") or "")
            y2 = fnum(row.get("2 Yr") or "")
            y10 = fnum(row.get("10 Yr") or "")
            if not day or day < date(2023, 1, 1):
                continue
            if y2 is not None:
                points2.append((day, y2))
            if y10 is not None:
                points10.append((day, y10))
    points2, points10 = sane(points2, -1, 20), sane(points10, -1, 20)
    if not points2 or not points10:
        two = kept("ust_2y.csv", "FRED ani US Treasury výnosy se nepodařilo stáhnout", label, base.format(year=TODAY.year))
        ten = kept("ust_10y.csv", two["error"], label, base.format(year=TODAY.year))
        two["extra"] = {"ust_10y": ten}
        return two
    changed = replace_series("ust_2y.csv", points_to_rows(points2, "official", "us-treasury"))
    changed = replace_series("ust_10y.csv", points_to_rows(points10, "official", "us-treasury")) or changed
    rows = load_rows("ust_2y.csv")
    info = status_from(rows, True, None, "US Treasury par výnos (FRED DGS2/DGS10 nedostupný)", "https://home.treasury.gov/resource-center/data-chart-center/interest-rates")
    info["changed"] = changed
    info["also"] = "ust_10y"
    return info


def update_us_cpi() -> dict:
    label = "BLS CPI-U, meziročně (CUUR0000SA0)"
    url = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
    fred = try_fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL&cosd=2022-01-01", timeout=12)
    index = {}
    source = "fred-CPIAUCSL"
    if fred:
        for day, value in parse_fred(decode(fred), "CPIAUCSL"):
            index[(day.year, day.month)] = value
    if not index:
        body = json.dumps({"seriesid": ["CUUR0000SA0"], "startyear": "2022", "endyear": str(TODAY.year)}).encode()
        bls_raw = try_fetch(url, timeout=40, data=body, headers={"Content-Type": "application/json"})
        if not bls_raw:
            return kept("us_cpi.csv", "FRED CPIAUCSL ani BLS API se nepodařilo stáhnout", label, "https://www.bls.gov/cpi/")
        payload = json.loads(decode(bls_raw))
        series = (payload.get("Results") or {}).get("series") or []
        for item in (series[0].get("data") if series else []):
            if not str(item.get("period", "")).startswith("M") or item.get("period") == "M13":
                continue
            value = fnum(str(item.get("value", "")))
            if value is None:
                continue
            index[(int(item["year"]), int(item["period"][1:]))] = value
        source = "bls-cpi-u"
    points = []
    for year, month in sorted(index):
        previous = index.get((year - 1, month))
        if not previous:
            continue
        day = month_end(year, month)
        if day >= date(2023, 1, 1):
            points.append((day, round((index[(year, month)] / previous - 1) * 100, 2)))
    points = sane(points, -5, 30)
    if not points:
        return kept("us_cpi.csv", "z indexu CPI nešla spočítat meziroční změna", label, "https://www.bls.gov/cpi/")
    used = "FRED CPIAUCSL, meziroční změna indexu" if source.startswith("fred") else "BLS CPI-U CUUR0000SA0, meziroční změna indexu (FRED nedostupný)"
    rows = points_to_rows(points, "official", source)
    changed = replace_series("us_cpi.csv", rows)
    info = status_from(rows, True, None, used, "https://fred.stlouisfed.org/series/CPIAUCSL" if source.startswith("fred") else "https://www.bls.gov/cpi/")
    info["changed"] = changed
    return info


def update_fed() -> dict:
    label = "Fed, horní hranice cíle fed funds"
    url = "https://www.federalreserve.gov/monetarypolicy/openmarket.htm"
    fred = try_fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU&cosd=2022-01-01", timeout=12)
    if fred:
        points = thin_steps(sane([(day, value) for day, value in parse_fred(decode(fred), "DFEDTARU") if day >= date(2022, 1, 1)], -1, 20))
        if points:
            rows = points_to_rows(points, "official", "fred-DFEDTARU")
            changed = replace_series("fed_funds.csv", rows)
            info = status_from(rows, True, None, "FRED DFEDTARU", "https://fred.stlouisfed.org/series/DFEDTARU")
            info["changed"] = changed
            return info
    raw = try_fetch(url, timeout=30)
    if not raw:
        return kept("fed_funds.csv", "FRED DFEDTARU ani stránka Fedu se nepodařily stáhnout", label, url)
    html = decode(raw)
    parts = re.split(r"<h[1-4][^>]*>(.*?)</h[1-4]>", html, flags=re.I | re.S)
    points = []
    current_year = None
    for part in parts:
        year_match = re.fullmatch(r"\s*(20\d{2})\s*", re.sub(r"<[^>]+>", "", part))
        if year_match:
            current_year = int(year_match.group(1))
            continue
        if not current_year or "Level (%)" not in part:
            continue
        text = re.sub(r"<[^>]+>", " ", part)
        text = re.sub(r"\s+", " ", text)
        for month_name, day_num, lower, upper in re.findall(
            r"([A-Z][a-z]+)\s+(\d{1,2})\s+\d+\s+\d+\s+([\d.]+)\s*-\s*([\d.]+)",
            text,
        ):
            month = MONTHS_EN.get(month_name)
            value = fnum(upper)
            if not month or value is None:
                continue
            try:
                points.append((date(current_year, month, int(day_num)), value))
            except ValueError:
                continue
    points = thin_steps(sane([item for item in points if item[0] >= date(2022, 1, 1)], -1, 20))
    if not points:
        return kept("fed_funds.csv", "ze stránky Fedu nešla přečíst historie cíle", label, url)
    rows = points_to_rows(points, "official", "fed-openmarket")
    changed = replace_series("fed_funds.csv", rows)
    info = status_from(rows, True, None, "Fed, horní hranice cíle (FRED DFEDTARU nedostupný)", url)
    info["changed"] = changed
    return info


def update_brent() -> dict:
    label = "EIA, Europe Brent spot"
    url = "https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=RBRTE&f=D"
    fred = try_fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU&cosd=2023-01-01", timeout=12)
    if fred:
        points = sane(parse_fred(decode(fred), "DCOILBRENTEU"), 5, 250)
        if points:
            rows = points_to_rows(points, "official", "fred-DCOILBRENTEU")
            changed = replace_series("brent.csv", rows)
            info = status_from(rows, True, None, "FRED DCOILBRENTEU", "https://fred.stlouisfed.org/series/DCOILBRENTEU")
            info["changed"] = changed
            return info
    raw = try_fetch(url, timeout=40)
    if not raw:
        return kept("brent.csv", "FRED DCOILBRENTEU ani EIA se nepodařilo stáhnout", label, url)
    html = decode(raw)
    points = []
    weeks = re.findall(
        r"(\d{4})\s+([A-Za-z]{3})-\s*(\d{1,2})\s+to\s+[A-Za-z]{3}-\s*\d{1,2}</td>(.*?)</tr>",
        html,
        flags=re.I | re.S,
    )
    for year, month_name, day_text, rest in weeks:
        month = MONTHS_EN.get(month_name)
        if not month:
            continue
        try:
            start = date(int(year), month, int(day_text))
        except ValueError:
            continue
        cells = re.findall(r"<td[^>]*>\s*([^<]*?)\s*</td>", rest)
        for offset, cell in enumerate(cells[:5]):
            value = fnum(cell)
            if value is None:
                continue
            day = start + timedelta(days=offset)
            if day >= date(2023, 1, 1):
                points.append((day, value))
    points = sane(points, 5, 250)
    if not points:
        return kept("brent.csv", "z tabulky EIA nešly přečíst ceny Brentu", label, url)
    rows = points_to_rows(points, "official", "eia-brent")
    changed = replace_series("brent.csv", rows)
    info = status_from(rows, True, None, "EIA Europe Brent spot (FRED DCOILBRENTEU nedostupný)", url)
    info["changed"] = changed
    return info


def update_bond() -> dict:
    label = "ruční řada, výnos 3letého českého státního dluhopisu"
    url = "https://www.cnb.cz/arad/"
    rows = load_rows("cz_bond_3y.csv")
    if rows:
        info = status_from(rows, False, None, label, url, auto=False)
        info["ok"] = True
        info["note"] = "Soubor data/cz_bond_3y.csv je ruční. Automatický zdroj bez registrace se nepoužívá."
        return info
    return {
        "ok": False,
        "refreshed": False,
        "error": "ČNB ARAD pro řadu výnosu 3letého státního dluhopisu vyžaduje API klíč a jiný spolehlivý soubor bez registrace se nepodařilo získat. Až bude v data/cz_bond_3y.csv ruční řada (date,value,quality,source), dashboard ji použije.",
        "rows": 0,
        "last_date": "",
        "last_value": "",
        "source_label": "nedostupné bez ručního souboru",
        "source_url": url,
        "auto": False,
        "quality": "",
    }


def update_airbank_check() -> dict:
    url = "https://www.airbank.cz/co-vas-nejvic-zajima/urokove-sazby-u-hypoteky/"
    manual = load_rows("airbank_3y.csv")
    raw = try_fetch(url, timeout=30)
    info = {
        "ok": True,
        "refreshed": False,
        "error": None,
        "rows": len(manual),
        "last_date": manual[-1]["date_effective"] if manual else "",
        "last_value": manual[-1]["rate_pct"] if manual else "",
        "source_label": "ruční historie ceníku Air Bank; stránka se jen kontroluje",
        "source_url": url,
        "auto": False,
        "quality": "manual",
    }
    if not raw:
        info["scrape"] = "stránku Air Bank se nepodařilo otevřít, ruční řada beze změny"
        return info
    text = re.sub(r"<[^>]+>", " ", decode(raw))
    text = re.sub(r"\s+", " ", text)
    start = text.find("Převedení hypotéky a otočka fixace")
    block = text[start:start + 2500] if start >= 0 else ""
    date_match = re.search(r"platné od\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", text)
    scraped_date = None
    if date_match:
        scraped_date = date(int(date_match.group(3)), int(date_match.group(2)), int(date_match.group(1))).isoformat()
    # První tabulka refinancování, řádek bez pojištění: 2 roky, 3 roky, 5 let, 7 let, 10 let.
    without = None
    marker = block.find("Bez pojištění")
    if marker >= 0:
        tail = re.findall(r"(\d{1,2},\d{2})\s*%", block[marker:marker + 500])
        if len(tail) >= 2:
            without = fnum(tail[1])
    if without is None:
        info["scrape"] = "ze stránky Air Bank nešla spolehlivě přečíst 3letá sazba, ruční řada beze změny"
        return info
    info["scrape_rate"] = without
    info["scrape_date"] = scraped_date
    latest = fnum(manual[-1]["rate_pct"]) if manual else None
    if latest is not None and abs(latest - without) < 0.001:
        info["scrape"] = f"stránka uvádí {fmt_num(without)} % od {scraped_date or 'neuvedeného data'}, shoduje se s ruční řadou"
    else:
        info["scrape"] = (
            f"stránka uvádí {fmt_num(without)} % od {scraped_date or 'neuvedeného data'}, "
            "ruční řada se automaticky nemění"
        )
    return info


def pearson(xs: list[float], ys: list[float]) -> tuple[float, float] | None:
    n = len(xs)
    if n < 3:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    if var_x <= 0 or var_y <= 0:
        return None
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    return cov / var_x, cov / math.sqrt(var_x * var_y)


def week_key(day: date) -> tuple[int, int]:
    iso = day.isocalendar()
    return iso[0], iso[1]


def weekly_last(points: list[tuple[date, float]]) -> dict[tuple[int, int], tuple[date, float]]:
    buckets: dict[tuple[int, int], tuple[date, float]] = {}
    for day, value in points:
        buckets[week_key(day)] = (day, value)
    return buckets


def expand_step(points: list[tuple[date, float]], until: date) -> list[tuple[date, float]]:
    points = sorted(points)
    if not points:
        return []
    out = []
    index = 0
    value = points[0][1]
    day = points[0][0]
    while day <= until:
        while index + 1 < len(points) and points[index + 1][0] <= day:
            index += 1
            value = points[index][1]
        if day.weekday() < 5:
            out.append((day, value))
        day += timedelta(days=1)
    return out


def adjacent_changes(rows: list[tuple[date, float, float]], min_gap: int, max_gap: int) -> list[tuple[date, float, float]]:
    changes = []
    for previous, current in zip(rows, rows[1:]):
        gap = (current[0] - previous[0]).days
        if min_gap <= gap <= max_gap:
            changes.append((current[0], current[1] - previous[1], current[2] - previous[2]))
    return changes


def rolling_corr(changes: list[tuple[date, float, float]], window: int) -> list[dict]:
    series = []
    min_points = max(8, window // 2)
    for index in range(len(changes)):
        sample = changes[max(0, index - window + 1):index + 1]
        if len(sample) < min_points:
            continue
        fit = pearson([item[2] for item in sample], [item[1] for item in sample])
        if not fit:
            continue
        series.append({"date": changes[index][0].isoformat(), "corr": round(fit[1], 3)})
    return series


def change_over(points: list[tuple[date, float]], days: int) -> float | None:
    if len(points) < 2:
        return None
    last_day, last_value = points[-1]
    target = last_day - timedelta(days=days)
    previous = None
    for day, value in points:
        if day <= target:
            previous = value
        else:
            break
    if previous is None:
        return None
    return last_value - previous


def verdict(corr: float, n: int, monthly: bool) -> str:
    minimum = 12 if monthly else 30
    if n < minimum:
        return "málo dat"
    magnitude = abs(corr)
    if magnitude >= 0.45:
        return "silný"
    if magnitude >= 0.25:
        return "střední"
    return "slabý"


def compute_influence() -> dict:
    irs = rows_to_points(load_rows("irs_3y.csv"))
    irs = [(day, value) for day, value in irs if day >= date(2024, 1, 1)]
    results = []
    if len(irs) < 10:
        return {"computed_at": datetime.now(timezone.utc).isoformat(), "drivers": [], "ranking": [], "error": "málo bodů IRS"}
    until = irs[-1][0]
    for spec in DRIVERS:
        rows = load_rows(spec["file"])
        points = rows_to_points(rows, spec.get("column", "value"))
        monthly = spec["kind"] == "monthly"
        fresh_limit = 50 if monthly else 14
        fresh = bool(points) and (TODAY - points[-1][0]).days <= fresh_limit
        entry = {
            "id": spec["id"],
            "impact_per": spec["impact_per"],
            "impact_name": spec["impact_name"],
            "kind": spec["kind"],
            "last_date": points[-1][0].isoformat() if points else "",
            "fresh": fresh,
        }
        if len(points) < 3:
            entry.update({"n": len(points), "verdict": "málo dat", "confidence": "řada chybí", "corr": None})
            results.append(entry)
            continue
        if monthly:
            left = {}
            for day, value in irs:
                left[(day.year, day.month)] = (day, value)
            right = {}
            for day, value in points:
                right[(day.year, day.month)] = (day, value)
            keys = sorted(set(left) & set(right))
            aligned = []
            for key in keys:
                previous = (key[0], key[1] - 1) if key[1] > 1 else (key[0] - 1, 12)
                if previous not in keys and previous not in set(left) | set(right):
                    pass
                aligned.append((left[key][0], left[key][1], right[key][1]))
            # Jen sousední měsíce.
            changes = []
            keyed = { (item[0].year, item[0].month): item for item in aligned }
            for key in sorted(keyed):
                previous = (key[0], key[1] - 1) if key[1] > 1 else (key[0] - 1, 12)
                if previous not in keyed:
                    continue
                current = keyed[key]
                prev = keyed[previous]
                changes.append((current[0], current[1] - prev[1], current[2] - prev[2]))
            window = 6
            confidence = "nižší (měsíční změny)"
        else:
            driver_points = expand_step(points, until) if spec["kind"] == "step" else points
            left = weekly_last(irs)
            right = weekly_last(driver_points)
            keys = sorted(set(left) & set(right))
            aligned = [(left[key][0], left[key][1], right[key][1]) for key in keys if left[key][0] >= date(2024, 1, 1)]
            changes = adjacent_changes(aligned, 4, 12)
            window = 26
            confidence = "týdenní změny"
        fit = pearson([item[2] for item in changes], [item[1] for item in changes]) if changes else None
        if not fit:
            entry.update({"n": len(changes), "verdict": "málo dat", "confidence": confidence, "corr": None})
            results.append(entry)
            continue
        beta, corr = fit
        impact_bp = beta * spec["impact_per"] * 100
        delta = change_over(points if spec["kind"] != "step" else expand_step(points, until), 30)
        implied = None if delta is None else beta * delta * 100
        entry.update({
            "n": len(changes),
            "corr": round(corr, 3),
            "r2": round(corr * corr, 3),
            "beta": round(beta, 4),
            "impact_bp": round(impact_bp, 1),
            "verdict": verdict(corr, len(changes), monthly),
            "confidence": confidence,
            "sign": 1 if corr >= 0 else -1,
            "change_1m": None if delta is None else round(delta, 4),
            "implied_irs_bp": None if implied is None else round(implied, 1),
            "rolling": rolling_corr(changes, window)[-40:],
        })
        results.append(entry)

    ranked = [item for item in results if item.get("corr") is not None and item.get("verdict") != "málo dat"]
    ranked.sort(key=lambda item: abs(item["corr"]), reverse=True)
    used = []
    sum_irs = 0.0
    for item in ranked:
        if not item.get("fresh") or item.get("implied_irs_bp") is None:
            continue
        used.append(item["id"])
        sum_irs += item["implied_irs_bp"]
        if len(used) == 5:
            break
    bank = sum_irs * (0.625 if sum_irs >= 0 else 0.40)
    approximate = any(row.get("quality") == "approximate" for row in load_rows("irs_3y.csv"))
    return {
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "method": (
            "Pearsonova korelace a OLS beta ze změn, ne z hladin. "
            "Denní a týdenní řady používají týdenní změny od ledna 2024, inflace měsíční změny. "
            "Okno je celé překrytí s řadou 3Y IRS, tedy zhruba poslední necelé tři roky. "
            "Silný vliv je |korelace| alespoň 0,45, střední od 0,25, jinak slabý. "
            "U měsíčních řad je jistota nižší. "
            "Přenos do sazby hypotéky je 62,5 % u kladného součtu (střed pásma 60–65 %) a 40 % u záporného."
        ),
        "irs_approximate": approximate,
        "pass_through_up": 0.625,
        "pass_through_down": 0.40,
        "drivers": results,
        "ranking": [item["id"] for item in ranked],
        "implication": {
            "used": used,
            "sum_irs_bp": round(sum_irs, 1),
            "sum_bank_bp": round(bank, 1),
        },
    }


def main() -> int:
    DATA.mkdir(exist_ok=True)
    sample = parse_pribor_text("06.11.2026||4,00||4,03||4,04||4,07||||4,10||4,16||||4,32")
    if sample != [(date(2026, 11, 6), 4.10)]:
        print("kontrolní rozklad PRIBOR nesedí", sample, file=sys.stderr)
        return 1

    tasks = [
        ("irs", update_irs),
        ("cnb_fx", update_fx),
        ("cnb_repo", update_repo),
        ("pribor_3m", update_pribor),
        ("cz_cpi", update_cpi),
        ("hicp_ea", update_hicp),
        ("eur_2y", update_eur_2y),
        ("ecb_deposit", update_ecb_deposit),
        ("eurusd", update_eurusd),
        ("ust", update_treasury),
        ("us_cpi", update_us_cpi),
        ("fed_funds", update_fed),
        ("brent", update_brent),
        ("cz_bond_3y", update_bond),
        ("airbank", update_airbank_check),
    ]
    series = {}
    for name, function in tasks:
        print(f"→ {name}")
        try:
            series[name] = function()
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            series[name] = {"ok": False, "refreshed": False, "error": str(exc), "auto": True}
        info = series[name]
        print(f"  ok={info.get('ok')} rows={info.get('rows')} last={info.get('last_date')} {info.get('last_value')} {info.get('error') or ''}")

    try:
        influence = compute_influence()
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        influence = {"computed_at": datetime.now(timezone.utc).isoformat(), "error": str(exc), "drivers": [], "ranking": []}
    (DATA / "influence.json").write_text(json.dumps(influence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    meta = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "series": series,
    }
    (DATA / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("pořadí vlivu:", ", ".join(influence.get("ranking") or []))
    implication = influence.get("implication") or {}
    print(f"součet IRS {implication.get('sum_irs_bp')} bp, banka {implication.get('sum_bank_bp')} bp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
