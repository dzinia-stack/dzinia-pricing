import json
import pathlib
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {
    "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def parse_number(value: str):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower()).strip("-")
    return s or "service"


def load_shared_strings(zf: zipfile.ZipFile):
    sst = []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    for si in root.findall("x:si", NS):
        sst.append("".join([(n.text or "") for n in si.findall(".//x:t", NS)]))
    return sst


def get_sheet_target(zf: zipfile.ZipFile, sheet_name: str):
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {r.attrib["Id"]: r.attrib["Target"] for r in rels}

    for s in wb.findall("x:sheets/x:sheet", NS):
        if s.attrib.get("name") == sheet_name:
            rid = s.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            return "xl/" + rid_to_target[rid].lstrip("/")

    raise ValueError(f"Sheet '{sheet_name}' not found")


def extract_services(xlsx_path: pathlib.Path):
    with zipfile.ZipFile(xlsx_path) as zf:
        sst = load_shared_strings(zf)
        target = get_sheet_target(zf, "Services & Pricing")
        ws = ET.fromstring(zf.read(target))

        used_ids = set()
        services = []

        for row in ws.findall("x:sheetData/x:row", NS):
            row_num = int(row.attrib.get("r", "0"))
            if row_num < 4:
                continue

            vals = {}
            for c in row.findall("x:c", NS):
                ref = c.attrib.get("r", "")
                col = "".join(ch for ch in ref if ch.isalpha())
                cell_type = c.attrib.get("t")
                v = c.find("x:v", NS)

                if v is None:
                    value = ""
                elif cell_type == "s":
                    value = sst[int(v.text)] if v.text else ""
                else:
                    value = v.text or ""

                vals[col] = value

            section = vals.get("B", "").strip()
            service_name = vals.get("C", "").strip()
            scope = vals.get("D", "").strip()
            unit = vals.get("E", "").strip()
            base_raw = vals.get("F", "").strip()
            gst_raw = vals.get("G", "").strip()
            final_raw = vals.get("H", "").strip()
            notes = vals.get("I", "").strip()

            if not service_name:
                continue

            base_price = parse_number(base_raw)
            gst_price = parse_number(gst_raw)
            final_price = parse_number(final_raw)

            key = slugify(f"{section}-{service_name}")
            unique_key = key
            counter = 2
            while unique_key in used_ids:
                unique_key = f"{key}-{counter}"
                counter += 1
            used_ids.add(unique_key)

            services.append(
                {
                    "id": unique_key,
                    "section": section,
                    "service": service_name,
                    "scope": scope,
                    "unit": unit,
                    "base_price": base_price,
                    "gst_price": gst_price,
                    "final_price": final_price,
                    "base_raw": base_raw,
                    "final_raw": final_raw,
                    "notes": notes,
                }
            )

    return services


def main():
    app_dir = pathlib.Path(__file__).resolve().parent
    xlsx_path = app_dir / "Dzinia_Services_Pricing_2025.xlsx"
    json_path = app_dir / "services.json"
    js_path = app_dir / "services-data.js"

    services = extract_services(xlsx_path)

    payload = {
        "source_file": xlsx_path.name,
        "sheet": "Services & Pricing",
        "service_count": len(services),
        "services": services,
    }

    json_text = json.dumps(payload, indent=2)
    json_path.write_text(json_text, encoding="utf-8")

    js_text = "window.SERVICES_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n"
    js_path.write_text(js_text, encoding="utf-8")

    print(f"Wrote {json_path} and {js_path} with {len(services)} services")


if __name__ == "__main__":
    main()
