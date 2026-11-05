#!/usr/bin/env python3
"""Convert the supplied WGS84 PolyLineZ files without joining separate parts.

Usage: python tools/convert_shapefiles.py /path/to/extracted/shapefiles
Requires: pip install pyshp
"""
import argparse
import json
import math
import re
from pathlib import Path
import shapefile

ROUTES = {
    "WHW": {"name": "West Highland Way", "color": "#d5b476", "subtitle": "From the lowlands to the high mountains", "endpoints": "Milngavie → Fort William"},
    "EHW": {"name": "East Highland Way", "color": "#8eb9a4", "subtitle": "Through the quiet heart of the Highlands", "endpoints": "Fort William → Aviemore"},
    "SSW": {"name": "Speyside Way", "color": "#aaa5d1", "subtitle": "Along the Spey, toward the northern sea", "endpoints": "Aviemore → Buckie · includes side trips"},
}

def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(h)))

def date_key(text):
    months = {"jan":1,"feb":2,"mrt":3,"mar":3,"apr":4,"mei":5,"may":5,"jun":6,"jul":7,"aug":8,"sep":9,"okt":10,"oct":10,"nov":11,"dec":12}
    m = re.search(r"(\d+)\s+(\w+)\.?\s+(\d{4})\s+(\d+):(\d+)\s*(am|pm)?", text.lower())
    if not m:
        return None
    day, month, year, hour, minute, period = m.groups()
    hour = int(hour) % 12 + (12 if period == "pm" else 0)
    return f"{year}-{months[month]:02d}-{int(day):02d}T{hour:02d}:{minute}:00"

def convert(folder, output):
    features, routes = [], []
    for code, metadata in ROUTES.items():
        path = folder / f"{code}.shp"
        wkt = path.with_suffix('.prj').read_text()
        if "WGS_1984" not in wkt or not wkt.startswith("GEOGCS"):
            raise ValueError(f"{path.name}: expected geographic WGS84; reproject first")
        r = shapefile.Reader(str(path), encoding="utf-8")
        items = []
        for record_index, sr in enumerate(r.iterShapeRecords()):
            if sr.shape.shapeType != shapefile.POLYLINEZ:
                raise ValueError("This converter expects the supplied PolyLineZ geometry")
            raw = sr.record.as_dict()
            starts = list(sr.shape.parts) + [len(sr.shape.points)]
            parts = [[[float(x), float(y), float(z)] for (x,y),z in zip(sr.shape.points[a:b], sr.shape.z[a:b])]
                     for a,b in zip(starts[:-1], starts[1:])]
            assert all(len(part) >= 2 for part in parts)
            points = [p for part in parts for p in part]
            km = sum(distance(a,b) for part in parts for a,b in zip(part[:-1],part[1:]))
            props = dict(raw)
            props.update({"route":code,"route_name":metadata["name"], "color":metadata["color"],
                          "record_index": record_index, "recorded_at":date_key(raw.get("desc_","")),
                          "distance_km":round(km,4), "vertices":len(points), "parts":len(parts),
                          "min_z":min(p[2] for p in points), "max_z":max(p[2] for p in points)})
            feature = {"type":"Feature", "id":f"{code}-{record_index}",
                       "bbox":[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)],
                       "properties":props,"geometry":{"type":"MultiLineString","coordinates":parts}}
            items.append(feature)
        items.sort(key=lambda f:(f["properties"]["recorded_at"] or "",f["properties"]["name"]))
        for i, item in enumerate(items):item["properties"]["stage"]=i+1
        features.extend(items)
        routes.append({"id":code,**metadata,"count":len(items),"distance_km":round(sum(f["properties"]["distance_km"] for f in items),4),
                       "recorded_start":items[0]["properties"]["recorded_at"], "recorded_end":items[-1]["properties"]["recorded_at"]})
    output.mkdir(parents=True,exist_ok=True)
    fc={"type":"FeatureCollection","features":features}
    (output/"tracks.geojson").write_text(json.dumps(fc,ensure_ascii=False,separators=(',',':')),encoding="utf-8")
    manifest={"title":"The Northern Paths", "source":"SCOTLAND_HIKING.zip", "crs":"EPSG:4326",
              "routes":routes,"feature_count":len(features),"vertex_count":sum(f['properties']['vertices'] for f in features),
              "notes":["All vertices, multipart boundaries and original DBF attributes retained.",
                       "Dates interpreted from original Dutch descriptions; no time zone supplied.",
                       "Lengths are approximate horizontal great-circle distances; gaps between parts are excluded.",
                       "Recorded Z values are displayed as metres; original vertical datum and accuracy are unspecified.",
                       "Route names are inferred from layer codes and geographic coverage. These are personal recordings, not official current trail alignments."]}
    (output/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(manifest,indent=2))

if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("folder",type=Path)
    parser.add_argument("--output",type=Path,default=Path(__file__).resolve().parents[1]/"data")
    args=parser.parse_args()
    convert(args.folder,args.output)
