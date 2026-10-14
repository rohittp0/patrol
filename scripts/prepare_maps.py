"""Compile curated real administrative boundaries into a shared land graph.

All distances and tunable tolerances arrive from playtest.config.ts via stdin.
Natural Earth source files are pinned and hashed; see source-metadata.json in
the ignored download cache. Country boards are static assets for GitHub Pages.
"""
import hashlib
import json
import math
import pathlib
import sys
from collections import defaultdict
from urllib.request import Request, urlopen

import numpy as np
from shapely import constrained_delaunay_triangles, make_valid, transform as transform_geometry
from shapely.geometry import LineString, Point, Polygon, mapping, shape
from shapely.ops import linemerge, polygonize, substring, unary_union


def transform(function, geometry):
    return transform_geometry(geometry, function, interleaved=False)

CONFIG = json.load(sys.stdin)
CACHE = pathlib.Path("scripts/.cache")
OUT = pathlib.Path("public/data")
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
SOURCE_REVISION = "ca96624a56bd078437bca8184e78163e5039ad19"
SOURCE_NAMES = ["ne_10m_admin_1_states_provinces", "ne_10m_admin_0_boundary_lines_land"]
if any(level.get("excludeInlandWater") for level in CONFIG["levels"]):
    SOURCE_NAMES.append("ne_10m_lakes")
source = {"revision": SOURCE_REVISION, "files": {}}
for source_name in SOURCE_NAMES:
    source_url = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{SOURCE_REVISION}/geojson/{source_name}.geojson"
    source_path = CACHE / f"{source_name}.geojson"
    if not source_path.exists():
        with urlopen(Request(source_url, headers={"User-Agent": "Patrol-prototype"}), timeout=60) as response:
            source_path.write_bytes(response.read())
    data = source_path.read_bytes()
    source["files"][source_name] = {"url": source_url, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
(CACHE / "source-metadata.json").write_text(json.dumps(source, indent=2) + "\n")
states = json.loads((CACHE / f"{SOURCE_NAMES[0]}.geojson").read_text())["features"]
land_boundaries = json.loads((CACHE / f"{SOURCE_NAMES[1]}.geojson").read_text())["features"]


def parts(geometry, kind):
    if geometry.geom_type == kind:
        return [geometry]
    if hasattr(geometry, "geoms"):
        return [part for child in geometry.geoms for part in parts(child, kind)]
    return []


def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    d = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1, d)))


def build(level):
    iso = level["admin0Code"]
    features = [f for f in states if f["properties"]["adm0_a3"] == iso]
    raw_country = max(parts(make_valid(unary_union([shape(f["geometry"]) for f in features])), "Polygon"), key=lambda p: p.area)
    latitude = raw_country.centroid.y
    sx = math.pi * 6371.0088 / 180 * math.cos(math.radians(latitude))
    sy = math.pi * 6371.0088 / 180
    project = lambda x, y, z=None: (x*sx, y*sy)
    inverse = lambda p: [round(p[0]/sx, CONFIG["map"]["geometry"]["coordinateDecimals"]), round(p[1]/sy, CONFIG["map"]["geometry"]["coordinateDecimals"])]
    country = transform(project, raw_country)
    if level.get("excludeInlandWater"):
        lakes = json.loads((CACHE / "ne_10m_lakes.geojson").read_text())["features"]
        water = [transform(project, make_valid(shape(feature["geometry"]))) for feature in lakes if shape(feature["geometry"]).intersects(raw_country)]
        water = [lake for lake in water if lake.area >= CONFIG["map"]["geometry"]["minimumInlandLakeAreaKm2"]]
        country = max(parts(make_valid(country.difference(unary_union(water))), "Polygon"), key=lambda polygon: polygon.area)
    tol = CONFIG["map"]["geometry"]["junctionToleranceKm"]
    simplify = CONFIG["map"]["geometry"]["simplificationKm"]
    groups = defaultdict(list)

    if iso in ("IND", "USA"):
        # Preserve mainland states instead of merging most of India into one
        # Interior region. Enclaved union territories join their actual host.
        merged = {"IN-PY", "IN-DL", "IN-CH", "IN-DH", "IN-LD", "IN-AN"} if iso == "IND" else {"US-DC"}
        named = {f["properties"]["iso_3166_2"]: f["properties"]["iso_3166_2"].lower() for f in features if f["properties"]["iso_3166_2"] not in merged}
        labels = {named[f["properties"]["iso_3166_2"]]: f["properties"]["name"] for f in features if f["properties"]["iso_3166_2"] in named}
        hosts = [(named[f["properties"]["iso_3166_2"]], transform(project, shape(f["geometry"]))) for f in features if f["properties"]["iso_3166_2"] in named]
        for feature in features:
            code = feature["properties"]["iso_3166_2"]
            geometry = transform(project, make_valid(shape(feature["geometry"]))).intersection(country)
            for poly in parts(geometry, "Polygon"):
                group = named.get(code)
                if group is None:
                    group = min(hosts, key=lambda host: host[1].distance(poly.representative_point()))[0]
                groups[group].append(poly)
    else:
        counties = {"GS", "VA", "ZA", "SO", "BA", "TO", "VE", "PE", "FE", "KE", "NO", "HE", "BZ", "BK", "CS", "BE", "HB", "SZ", "JN"}
        named = {"HU-"+code: "hu-"+code.lower() for code in counties}
        labels = {named[f["properties"]["iso_3166_2"]]: f["properties"]["name"] for f in features if f["properties"]["iso_3166_2"] in named}
        seeds = {named[f["properties"]["iso_3166_2"]]: transform(project, shape(f["geometry"])) for f in features if f["properties"]["iso_3166_2"] in named}
        for feature in features:
            geometry = transform(project, make_valid(shape(feature["geometry"]))).intersection(country)
            group = named.get(feature["properties"]["iso_3166_2"])
            if group is None:
                group = min(seeds, key=lambda key: seeds[key].distance(geometry.representative_point()))
            groups[group].append(geometry)

    grouped = {key: make_valid(unary_union(values)).intersection(country) for key, values in groups.items()}
    land_lines = unary_union([transform(project, shape(f["geometry"])) for f in land_boundaries if iso in (f["properties"]["ADM0_A3_L"], f["properties"]["ADM0_A3_R"])])
    network = linemerge(unary_union([geometry.boundary for geometry in grouped.values()]))
    arcs = []
    for line in parts(network, "LineString"):
        if line.length <= tol:
            continue
        is_outer = country.boundary.distance(line.interpolate(0.5, normalized=True)) <= tol
        if not is_outer:
            arcs.append({"line": line.simplify(simplify), "kind": "internal"})
            continue
        coords = list(line.coords)
        run = [coords[0]]
        previous = None
        for start, end in zip(coords, coords[1:]):
            midpoint = Point((start[0]+end[0])/2, (start[1]+end[1])/2)
            is_land = iso == "HUN" or land_lines.distance(midpoint) <= CONFIG["map"]["geometry"]["landBoundaryMatchKm"]
            if previous is not None and previous != is_land:
                arcs.append({"line": LineString(run).simplify(simplify), "kind": "exit" if previous else "coast"})
                run = [start]
            run.append(end)
            previous = is_land
        if len(run) >= 2:
            arcs.append({"line": LineString(run).simplify(simplify), "kind": "exit" if previous else "coast"})

    # Outer boundaries may be divided into open guardable stretches. Internal
    # lines keep their actual junctions and cannot be cut arbitrarily.
    max_length = CONFIG["map"]["borderLengthKm"]["max"]
    split_arcs = []
    for arc in arcs:
        pending = [arc["line"]]
        while pending:
            line = pending.pop()
            distance = sum(haversine(inverse(a), inverse(b)) for a, b in zip(line.coords, list(line.coords)[1:]))
            if arc["kind"] == "exit" and distance > max_length:
                pending.extend([substring(line, 0, line.length/2), substring(line, line.length/2, line.length)])
            else:
                if arc["kind"] == "internal" and distance > max_length:
                    raise ValueError(f"{level['id']} internal border exceeds configured length: {distance:.1f} km")
                split_arcs.append({"line": line, "kind": arc["kind"]})
    arcs = split_arcs
    faces = [poly for poly in polygonize(unary_union([arc["line"] for arc in arcs])) if country.covers(poly.representative_point())]
    if not faces:
        raise ValueError("No playable land faces")
    final_country = max(parts(unary_union(faces), "Polygon"), key=lambda p: p.area)
    faces = [face for face in faces if final_country.covers(face.representative_point())]
    face_regions = [min(grouped, key=lambda key: grouped[key].distance(face.representative_point())) for face in faces]

    def key(a, b):
        return tuple(sorted((tuple(round(v, 8) for v in a), tuple(round(v, 8) for v in b))))

    def geographic_length(line):
        coords = [inverse(p) for p in line.coords]
        return sum(haversine(a, b) for a, b in zip(coords, coords[1:]))

    # Short source fragments stay traversable, and short outer land fragments
    # remain real escape routes. They do not receive guard posts outside the
    # configured length range.
    authored = [arc for arc in arcs if arc["kind"] != "coast" and geographic_length(arc["line"]) >= CONFIG["map"]["borderLengthKm"]["min"]]
    authored.sort(key=lambda arc: (arc["kind"] == "exit", round(arc["line"].centroid.y, 4), round(arc["line"].centroid.x, 4)))
    borders = []
    edge_borders = {}
    edge_kinds = {}
    for arc in arcs:
        for a, b in zip(arc["line"].coords, list(arc["line"].coords)[1:]):
            edge_kinds[key(a, b)] = arc["kind"]
    for index, arc in enumerate(authored):
        line = arc["line"]
        if line.is_ring:
            nearby = sorted(grouped, key=lambda name: grouped[name].distance(line.centroid))[:2]
            raise ValueError(f"A guardable border cannot be closed: {level['id']} {arc['kind']} bounds={tuple(round(v, 4) for v in (*inverse(line.bounds[:2]), *inverse(line.bounds[2:])))} groups={nearby}")
        adjacent = sorted({face_regions[i] for i, face in enumerate(faces) if face.boundary.intersection(line).length > tol})
        coords = [inverse(p) for p in line.coords]
        lengths = [haversine(a, b) for a, b in zip(coords, coords[1:])]
        length = sum(lengths)
        # Geodesic half-length, interpolated along the authored polyline.
        remaining = length / 2
        post = coords[0]
        for a, b, segment in zip(coords, coords[1:], lengths):
            if remaining <= segment:
                fraction = remaining / segment if segment else 0
                post = [a[0]+(b[0]-a[0])*fraction, a[1]+(b[1]-a[1])*fraction]
                break
            remaining -= segment
        label = " · ".join(labels[region] for region in adjacent)
        if arc["kind"] == "exit":
            label = f"Land frontier {sum(b['kind'] == 'exit' for b in borders)+1:02d}"
        borders.append({"id": f"{level['id']}-{index+1:02d}", "name": label, "kind": arc["kind"], "regions": adjacent, "coordinates": coords, "post": post, "node": -1, "lengthKm": round(length, 3)})
        for a, b in zip(line.coords, list(line.coords)[1:]):
            edge_borders[key(a, b)] = index

    nodes = []
    links = []
    triangles = []
    triangle_edges = defaultdict(list)
    for face, region in zip(faces, face_regions):
        for triangle in constrained_delaunay_triangles(face).geoms:
            node_id = len(nodes)
            nodes.append({"p": inverse(triangle.centroid.coords[0]), "kind": "land", "region": region})
            triangles.append((triangle, node_id))
            coords = list(triangle.exterior.coords)
            for a, b in zip(coords, coords[1:]):
                triangle_edges[key(a, b)].append(node_id)

    def connect(a, b):
        length = haversine(nodes[a]["p"], nodes[b]["p"])
        links.append([a, b, round(length, 8)])

    for edge, adjacent in triangle_edges.items():
        border = edge_borders.get(edge)
        is_exit = len(adjacent) == 1 and edge_kinds.get(edge) == "exit"
        if len(adjacent) != 2 and not is_exit:
            continue
        a, b = edge
        node = {"p": inverse(((a[0]+b[0])/2, (a[1]+b[1])/2)), "kind": "exit" if is_exit else "portal", "region": nodes[adjacent[0]]["region"]}
        if border is not None:
            node["border"] = border
        node_id = len(nodes)
        nodes.append(node)
        for center in adjacent:
            connect(center, node_id)

    for index, border in enumerate(borders):
        point = Point(project(*border["post"]))
        adjacent = [node for triangle, node in triangles if triangle.distance(point) <= tol]
        if not adjacent:
            # WGS84 coordinate rounding can shift a post by a few millimetres.
            adjacent = [min(triangles, key=lambda pair: pair[0].distance(point))[1]]
        node_id = len(nodes)
        nodes.append({"p": border["post"], "kind": "post", "region": nodes[adjacent[0]]["region"], "border": index})
        border["node"] = node_id
        for center in adjacent:
            connect(center, node_id)

    unproject = lambda x,y,z=None: (np.round(x/sx, CONFIG["map"]["geometry"]["coordinateDecimals"]), np.round(y/sy, CONFIG["map"]["geometry"]["coordinateDecimals"]))
    country_geo = mapping(transform(unproject, final_country))
    bounds = [inverse(final_country.bounds[:2]), inverse(final_country.bounds[2:])]
    board = {
        "id": level["id"], "name": level["name"], "bounds": bounds,
        "regions": [{"id": region, "name": labels[region], "geometry": mapping(transform(unproject, face))} for face, region in zip(faces, face_regions)],
        "land": country_geo,
        "coasts": [[inverse(p) for p in arc["line"].coords] for arc in arcs if arc["kind"] == "coast"],
        "landExits": [[inverse(p) for p in arc["line"].coords] for arc in arcs if arc["kind"] == "exit"],
        "borders": borders, "nodes": nodes, "links": links, "setups": [], "source": source,
    }
    if not any(n["kind"] == "exit" for n in nodes):
        raise ValueError("Country has no land exits")
    print("Border lengths:", [(b["name"], b["lengthKm"]) for b in borders], flush=True)
    if len(borders) > len(CONFIG["appearance"]["borderPalette"]):
        raise ValueError(f"{level['id']} needs {len(borders)} distinct border colours")
    (OUT / f"{level['id']}.json").write_text(json.dumps(board, separators=(",", ":")) + "\n")
    print(f"{level['name']}: {len(faces)} land faces, {len(borders)} borders, {len(nodes)} navigation nodes, {sum(n['kind']=='exit' for n in nodes)} exits", flush=True)


requested = set(sys.argv[1:])
known = {level["id"] for level in CONFIG["levels"]}
if requested - known:
    raise ValueError(f"Unknown countries: {sorted(requested - known)}")
for current_level in CONFIG["levels"]:
    if requested and current_level["id"] not in requested:
        continue
    build(current_level)
