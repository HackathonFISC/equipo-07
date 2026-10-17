"""Build data/panama_oeste_corregimientos.geojson from the OCHA/HDX COD-AB admin3 layer.

Usage (backend Python): python scripts/build_corregimiento_geometry.py <pan_admin3.geojson>
Source: https://data.humdata.org/dataset/cod-ab-pan (pan_admin_boundaries.geojson.zip), CC BY-IGO.
Only polygons whose name matches the INEC 2023 catalog are written; nothing is drawn by hand.
"""

import json
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/panama_oeste_corregimientos.json"
OUTPUT = ROOT / "data/panama_oeste_corregimientos.geojson"
TOLERANCE = 0.0004  # degrees, about 44 m: enough for a district-scale choropleth


def key(text):
    text = "".join(
        c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c)
    )
    return " ".join(text.replace("(cabecera)", "").replace("(", " ").replace(")", " ").split())


def simplify(points, tolerance):
    """Ramer-Douglas-Peucker on one ring."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5
    best, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if norm:
            distance = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
        else:
            distance = ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
        if distance > best:
            best, index = distance, i
    if best <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[: index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def polygons(geometry):
    parts = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    out = []
    for part in parts:
        rings = []
        for ring in part:
            # Split the closed ring in two halves so RDP keeps its shape.
            half = len(ring) // 2
            thin = simplify(ring[: half + 1], TOLERANCE)[:-1] + simplify(ring[half:], TOLERANCE)
            if len(thin) >= 4:
                rings.append([[round(x, 5), round(y, 5)] for x, y in thin])
        if rings:
            out.append(rings)
    return out


def main(source):
    catalog = json.loads(CATALOG.read_text("utf-8"))
    wanted = {
        (key(d["name"]), key(c["name"])): (c, d)
        for d in catalog["districts"]
        for c in d["corregimientos"]
    }
    features = []
    for feature in json.loads(Path(source).read_text("utf-8"))["features"]:
        p = feature["properties"]
        if p["adm1_pcode"] != "PA11":  # Panamá Oeste
            continue
        match = wanted.pop((key(p["adm2_name"]), key(p["adm3_name"])), None)
        assert match, f"Sin correspondencia en el catálogo INEC: {p['adm2_name']} / {p['adm3_name']}"
        corregimiento, district = match
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": corregimiento["id"],
                    "name": corregimiento["name"],
                    "district": district["name"],
                    "pcode": p["adm3_pcode"],
                    "source_name": p["adm3_name"],
                    "valid_on": p["valid_on"],
                },
                "geometry": {"type": "MultiPolygon", "coordinates": polygons(feature["geometry"])},
            }
        )
    missing = sorted(c["id"] for c, _ in wanted.values())
    collection = {
        "type": "FeatureCollection",
        "name": "Panama_Oeste_Corregimientos_COD_AB",
        "source": "OCHA/HDX, Panama - Subnational Administrative Boundaries (COD-AB) v01, admin3",
        "source_url": "https://data.humdata.org/dataset/cod-ab-pan",
        "upstream": "www.gadm.org (declarado por HDX)",
        "license": "CC BY-IGO 3.0 (declarada por HDX)",
        "retrieved": "2026-10-17",
        "processing": f"Ramer-Douglas-Peucker {TOLERANCE} grados por anillo, 5 decimales.",
        "missing_in_source": missing,
        "features": sorted(features, key=lambda f: f["properties"]["id"]),
    }
    OUTPUT.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"{len(features)} corregimientos escritos; sin geometría en la fuente: {missing}")


if __name__ == "__main__":
    main(sys.argv[1])
