# Credits and data provenance

## User-supplied recordings

Source: `SCOTLAND_HIKING.zip`, containing EHW, SSW and WHW WGS84 PolyLineZ shapefiles. The upload did not supply a reuse licence for these personal recordings; this package does not assign one. All records and their DBF attributes are retained. Ownership remains with the relevant rights holders.

## Geographic backdrop

- Natural Earth 1:10 million countries/coastline, lakes, rivers and populated places: https://www.naturalearthdata.com/ . Public domain: https://www.naturalearthdata.com/about/terms-of-use/ . A geographically filtered subset is bundled.
- Country polygons decoded from `world-atlas@2.0.2/countries-10m.json`: https://github.com/topojson/world-atlas . Natural Earth data is public domain. World Atlas packaging is ISC licensed; the licence is in `vendor/WORLD-ATLAS-LICENSE.txt`.
- Lakes, rivers and populated places obtained from the Natural Earth repository: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson .
- The four labelled trail endpoints use the supplied recordings' start/end coordinates, with place names inferred from their locations. Region and sea labels are approximate geographic labels for presentation.

## Elevation and relief

Mapzen Terrain Tiles on AWS, accessed 3 November 2026: https://registry.opendata.aws/terrain-tiles/ . Public Terrarium tile service: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png .

The bundled relief image is generated from a zoom-8 regional mosaic of those elevation tiles. Its georeferencing is stored in `data/relief.json`. Colour tint and hillshade are presentation choices; elevations were not invented. The interactive map requests live terrain separately, with an initial 1.8× height exaggeration.

Terrain source attribution and applicable licences: https://github.com/tilezen/joerd/blob/master/docs/attribution.md . A copy is bundled as `vendor/TERRAIN-ATTRIBUTION.md`. Sources include SRTM, GMTED and ETOPO1, as applicable by location and resolution. See the full attribution document for all source datasets.

## Software and fonts

- MapLibre GL JS **5.6.1**, BSD-3-Clause and bundled dependency notices: https://github.com/maplibre/maplibre-gl-js . Full notice in `vendor/MAPLIBRE-LICENSE.txt`.
- Leaflet **1.9.4**, BSD-2-Clause, used only when WebGL cannot initialise: https://leafletjs.com/ . Notice in `vendor/LEAFLET-LICENSE.txt`.
- Cinzel, Natanael Gama; Manrope, Mikhail Sharanda and contributors. SIL Open Font License 1.1. Fonts downloaded from Google Fonts and bundled locally; licence files are in `assets/`.
- `pyshp` is used only by the optional conversion tool and is not needed to run the website: https://github.com/GeospatialPython/pyshp .

The user interface and code were created for this atlas. No film stills, book maps, Tolkien quotations, official logos or other franchise assets are used.
