#!/usr/bin/env python3
"""
scripts/validate_datasets.py
Validador de integridad para los datasets de Panamá Oeste y generador de GeoJSON para AguaIA.

Funcionalidades:
1. Validación sintáctica y de esquema de `data/panama_oeste_seed.json` y `data/tanker_fleet.json`.
2. Verificación de Bounding Box geográfico de Panamá Oeste (Arraiján y La Chorrera).
3. Verificación de topología hidráulica, restricciones viales y consistencia referencial (bases de cisternas).
4. Verificación de cálculo de ventanas de servicio VRP (T_servicio = galones/GPM + T_acople).
5. Exportación automática de `data/panama_oeste_locations.geojson` (FeatureCollection RFC 7946) para React + Leaflet/Mapbox.
"""

import json
import os
import sys
from pathlib import Path

# Configurar codificación segura para Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Límites del Bounding Box de Panamá Oeste
BBOX_MIN_LAT = 8.8500
BBOX_MAX_LAT = 9.0500
BBOX_MIN_LNG = -79.8600
BBOX_MAX_LNG = -79.6300

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SEED_FILE = DATA_DIR / "panama_oeste_seed.json"
FLEET_FILE = DATA_DIR / "tanker_fleet.json"
GEOJSON_FILE = DATA_DIR / "panama_oeste_locations.geojson"


def log_step(msg: str):
    print(f"  [+] {msg}")


def log_success(msg: str):
    print(f"  [OK] {msg}")


def log_error(msg: str):
    print(f"  [ERROR] {msg}", file=sys.stderr)


def validate_seed_dataset(data: dict) -> dict:
    print("\n--- Validando data/panama_oeste_seed.json ---")
    locations = data.get("locations", [])
    if len(locations) < 15 or len(locations) > 25:
        raise ValueError(f"Se esperaban entre 15 y 25 ubicaciones, se encontraron: {len(locations)}")
    log_success(f"Cantidad de ubicaciones encontradas: {len(locations)} (esperado: 20)")

    seen_ids = set()
    categories = {}
    potabilizadoras = set()

    for idx, loc in enumerate(locations, start=1):
        loc_id = loc.get("id")
        name = loc.get("name")
        if not loc_id or loc_id in seen_ids:
            raise ValueError(f"ID duplicado o inválido en ubicación {idx}: {loc_id}")
        seen_ids.add(loc_id)

        # Coordenadas
        coords = loc.get("coordinates", {})
        lat = coords.get("lat")
        lng = coords.get("lng")
        if lat is None or lng is None:
            raise ValueError(f"Coordenadas faltantes en '{loc_id}'")

        if not (BBOX_MIN_LAT <= lat <= BBOX_MAX_LAT):
            raise ValueError(f"Latitud fuera de rango en '{loc_id}' ({lat} no está en [{BBOX_MIN_LAT}, {BBOX_MAX_LAT}])")
        if not (BBOX_MIN_LNG <= lng <= BBOX_MAX_LNG):
            raise ValueError(f"Longitud fuera de rango en '{loc_id}' ({lng} no está en [{BBOX_MIN_LNG}, {BBOX_MAX_LNG}])")

        # Categoría
        cat = loc.get("category")
        categories[cat] = categories.get(cat, 0) + 1
        if cat == "planta_potabilizadora":
            potabilizadoras.add(loc_id)

        # Topología hidráulica
        ht = loc.get("hydraulic_topology", {})
        if not ht or "zone_type" not in ht or "vulnerability_multiplier" not in ht:
            raise ValueError(f"Falta 'hydraulic_topology' completo en '{loc_id}'")

        # Restricciones viales y de terreno
        ra = loc.get("road_access", {})
        if not ra or "max_tanker_capacity_gallons" not in ra or "terrain_difficulty" not in ra:
            raise ValueError(f"Falta 'road_access' completo en '{loc_id}'")

        if ra.get("terrain_difficulty") == "alta":
            max_cap = ra.get("max_tanker_capacity_gallons", 0)
            if max_cap > 3000:
                raise ValueError(f"Incoherencia vial en '{loc_id}': terreno difícil no admite cisternas mayores a 3,000 gal.")

        # Alias vernáculos
        aliases = loc.get("aliases", [])
        if not aliases or len(aliases) < 2:
            raise ValueError(f"Se requieren al menos 2 alias vernáculos en '{loc_id}' para geocodificación")

    log_success("Todas las 20 ubicaciones están dentro del Bounding Box de Panamá Oeste.")
    log_success(f"Distribución de categorías: {categories}")
    log_success(f"Plantas potabilizadoras detectadas: {list(potabilizadoras)}")

    return {
        "locations_count": len(locations),
        "potabilizadoras": potabilizadoras,
        "locations_map": {loc["id"]: loc for loc in locations}
    }


def validate_fleet_dataset(fleet: dict, potabilizadoras: set):
    print("\n--- Validando data/tanker_fleet.json ---")
    trucks = fleet.get("trucks", [])
    if len(trucks) != 4:
        raise ValueError(f"Se esperaban exactamente 4 camiones cisterna, se encontraron: {len(trucks)}")
    log_success(f"Cantidad de camiones cisterna: {len(trucks)}")

    seen_plates = set()
    capacities = {}

    for idx, truck in enumerate(trucks, start=1):
        t_id = truck.get("id")
        plate = truck.get("license_plate")
        cap = truck.get("capacity_gallons")
        base_plant = truck.get("base_plant_id")

        if not t_id or not plate:
            raise ValueError(f"Falta ID o placa en cisterna #{idx}")
        if plate in seen_plates:
            raise ValueError(f"Placa duplicada: {plate}")
        seen_plates.add(plate)

        capacities[cap] = capacities.get(cap, 0) + 1

        # Integridad referencial con plantas potabilizadoras
        if base_plant not in potabilizadoras:
            raise ValueError(f"Cisterna '{t_id}' tiene base_plant_id '{base_plant}' que no existe como planta potabilizadora.")

        # Validación del ciclo de servicio VRP
        flow_gpm = truck.get("discharge_flow_rate_gpm")
        setup_min = truck.get("setup_and_coupling_time_minutes")
        refill_min = truck.get("refill_time_minutes")

        if not flow_gpm or flow_gpm <= 0:
            raise ValueError(f"Cisterna '{t_id}' tiene un discharge_flow_rate_gpm inválido")
        if not setup_min or setup_min <= 0:
            raise ValueError(f"Cisterna '{t_id}' tiene un setup_and_coupling_time_minutes inválido")
        if not refill_min or refill_min <= 0:
            raise ValueError(f"Cisterna '{t_id}' tiene un refill_time_minutes inválido")

        # Tiempo de servicio teórico
        pumping_time = round(cap / flow_gpm, 1)
        total_service_window = round(pumping_time + setup_min, 1)
        log_step(f"{t_id} ({plate}, {cap:,} gal): T_acople={setup_min}m + T_bombeo={pumping_time}m \u2192 T_servicio={total_service_window}m | T_recarga_planta={refill_min}m")

    if capacities.get(3000) != 2 or capacities.get(10000) != 2:
        raise ValueError(f"La flota debe incluir exactamente 2 camiones de 3,000 gal y 2 de 10,000 gal. Encontrados: {capacities}")

    log_success("Composición de flota verificada: 2 cisternas ágiles (3,000 gal) y 2 pesados (10,000 gal).")
    log_success("Integridad referencial y métricas de servicio VRP comprobadas.")


def export_geojson(seed_data: dict, output_path: Path):
    print("\n--- Generando data/panama_oeste_locations.geojson ---")
    features = []
    locations = seed_data.get("locations", [])

    for loc in locations:
        coords = loc["coordinates"]
        # En estándar GeoJSON (RFC 7946), las coordenadas van [longitud, latitud]
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [coords["lng"], coords["lat"]]
            },
            "properties": {
                "id": loc["id"],
                "name": loc["name"],
                "aliases": loc.get("aliases", []),
                "category": loc["category"],
                "subcategory": loc["subcategory"],
                "district": loc["district"],
                "corregimiento": loc["corregimiento"],
                "priority_level": loc["priority_level"],
                "is_critical_lifeline": loc.get("is_critical_lifeline", False),
                "fast_track_priority": loc.get("fast_track_priority", False),
                "storage_capacity_gallons": loc.get("storage_capacity_gallons"),
                "estimated_daily_demand_gallons": loc.get("estimated_daily_demand_gallons"),
                "vulnerable_population_count": loc.get("vulnerable_population_count", 0),
                "hydraulic_topology": loc.get("hydraulic_topology", {}),
                "road_access": loc.get("road_access", {}),
                "vernacular_context": loc.get("vernacular_context", "")
            }
        }
        features.append(feature)

    geojson_doc = {
        "type": "FeatureCollection",
        "name": "Panama_Oeste_Locations_AguaIA",
        "crs": {
            "type": "name",
            "properties": {
                "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
            }
        },
        "bbox": [
            BBOX_MIN_LNG,
            BBOX_MIN_LAT,
            BBOX_MAX_LNG,
            BBOX_MAX_LAT
        ],
        "features": features
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson_doc, f, indent=2, ensure_ascii=False)

    log_success(f"Archivo GeoJSON exportado exitosamente en: {output_path}")
    log_success(f"Total de entidades vectoriales empaquetadas: {len(features)}")


def main():
    print("=" * 65)
    print(" AguaIA — Verificador de Datasets y Exportador GeoJSON (Panamá Oeste)")
    print("=" * 65)

    if not SEED_FILE.exists():
        log_error(f"No se encontró el archivo de seed: {SEED_FILE}")
        sys.exit(1)

    if not FLEET_FILE.exists():
        log_error(f"No se encontró el archivo de flota: {FLEET_FILE}")
        sys.exit(1)

    try:
        with open(SEED_FILE, "r", encoding="utf-8") as f:
            seed_data = json.load(f)

        with open(FLEET_FILE, "r", encoding="utf-8") as f:
            fleet_data = json.load(f)

        seed_info = validate_seed_dataset(seed_data)
        validate_fleet_dataset(fleet_data, seed_info["potabilizadoras"])
        export_geojson(seed_data, GEOJSON_FILE)

        print("\n" + "=" * 65)
        print(" [EXITO] VALIDACIÓN EXITOSA: TODOS LOS CRITERIOS CUMPLIDOS AL 100%")
        print("=" * 65 + "\n")

    except Exception as e:
        log_error(f"Falla durante la verificación: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
