# The Northern Paths

A dark fantasy walking atlas of Scotland, made from the three shapefiles in `SCOTLAND_HIKING.zip`. The interface uses forest greens, muted gold, a compass rose and Cinzel lettering. All geography and route geometry are real; the presentation is fantasy inspired.

## Publish on GitHub Pages

No build step, API key, npm installation or server backend is needed.

1. Extract this ZIP on your computer.
2. Create a GitHub repository, for example `scotland-atlas`.
3. Upload **the contents** of the extracted folder. `index.html` must be at the repository root, alongside `app.js`, `style.css`, `assets/`, `data/` and `vendor/`. Do not upload the ZIP as the website.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, set **Source → Deploy from a branch**.
6. Choose **main** and **/ (root)**, then **Save**.
7. Wait for the Pages deployment to finish. GitHub will show the published address in Settings → Pages, usually `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

Keep `.nojekyll` if you upload using Git. All application paths are relative, so a repository subfolder URL works without changing the code. Public repositories are supported by GitHub Free; availability for private repositories depends on your plan. This package has not been published to your GitHub account.

Official instructions: [Configure a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Preview on your computer

From a terminal in the extracted folder:

```bash
python -m http.server 8000
```

On Windows, use `py -m http.server 8000` if `python` is unavailable. Open `http://localhost:8000` in your browser. Double-clicking `index.html` does not work because browsers restrict local file data requests.

## Explore

- **Pan:** drag the map. **Zoom:** scroll or use + / −. **Tilt / rotate:** right-drag, or Ctrl-drag. On touch screens, use two fingers.
- Click a **route card** to focus that route. Its **eye button** independently shows or hides the layer.
- **View all** shows every uploaded layer and fits all routes; **All Scotland** includes the mainland, Hebrides, Orkney and Shetland.
- Click a **track in the sidebar** or a **line on the map** to inspect the individual recording. Click its route card to return to the whole route.
- Search by track name, route, date or year. Search covers **all three layers**, even when a route is selected. Press `/` to focus the search.
- Move over the **elevation profile** to locate that point on the map. Focus the profile and use the left/right arrows to explore with a keyboard.
- **Fly the path** follows the selected recording or route in 3D. Pause, resume or scrub the progress bar. Drag the map, press Escape or click End journey to stop. Separate recording parts remain separate; the camera moves to the next section when a gap is encountered.
- Switch between **2D** and **3D**. The layer button opens place-name, shading and terrain-exaggeration settings.
- **Copy this map view** creates a URL with the current camera, selection, visibility and terrain height. If clipboard permission is unavailable, copy the updated address bar instead.
- Download the current selection as **GPX** or **GeoJSON**. **Details** shows original DBF attributes. The information dialog offers a download of all tracks.
- On a phone, open **Routes** to display the sidebar. The elevation panel can be collapsed to give the map more room.

## The supplied data

| Source | Display name | Recordings | Approximate recorded length | Recorded dates |
| --- | --- | ---: | ---: | --- |
| WHW.shp | West Highland Way | 10 | 170.4 km | 20–29 September 2015 |
| EHW.shp | East Highland Way | 6 | 149.5 km | 1–6 October 2014 |
| SSW.shp | Speyside Way | 8 | 166.4 km | 15–21 April 2016 |
| Total | | 24 | 486.3 km | 2014–2016 |

The display names are inferred from the layer codes and geographic locations. These are personal recordings, including detours and side trips, **not official current trail alignments or advertised trail distances**. SSW includes the recorded Tomintoul-area spur and other excursions. No track has been silently removed to match an official route length.

### Conversion and measurements

- The supplied `.prj` files specify geographic WGS84. Coordinates are retained in longitude, latitude order (EPSG:4326).
- All **53,129 vertices**, **24 features**, **32 separate line parts**, original numeric Z values and all original DBF fields are retained in `data/tracks.geojson`. No geometry simplification or reprojection is applied to the stored file. Map rendering can simplify lines on screen at small scales.
- Every original polyline part becomes a separate part of a `MultiLineString`; missing sections are never bridged with invented route geometry. GPX export preserves these as separate `trkseg` elements.
- The original Dutch description dates are parsed to ISO strings without assigning a time zone. Recordings are listed chronologically within each layer.
- Lengths use a mean-Earth-radius haversine calculation on horizontal coordinates. They exclude gaps between parts, ignore vertical distance and are approximate. Raw `Shape_Leng` is retained but not treated as metres.
- Profiles use the **original recorded Z values**, displayed as metres on the assumption that the GPX-derived recordings use metres. The supplied metadata does not establish their vertical datum or measurement accuracy. No total-ascent statistic is claimed from noisy unsmoothed recordings.
- Map terrain is a **different dataset** from the recorded elevations. Exaggeration changes the visual terrain only, not profiles or distances.

### Files

```text
index.html                 Website entry point
style.css                  Responsive dark fantasy design
app.js                     Map, route controls, profiles, camera tour and exports
fallback.js                Leaflet 2D compatibility view for non-WebGL browsers
assets/                    Local fonts, compass and regional relief backdrop
data/tracks.geojson        All converted source features and attributes
data/manifest.json         Layer metadata, provenance and conversion notes
data/*.geojson             Small-scale geographical backdrop and route endpoints
data/relief.json           Relief image georeferencing
vendor/                    Pinned MapLibre GL JS 5.6.1, Leaflet 1.9.4 and licences
tools/convert_shapefiles.py Reproducible converter for the supplied shapefile schema
ATTRIBUTION.md             Data, font and software credits
.nojekyll                  Serve directly with GitHub Pages
```

The original archive is not republished in the website, and ArcGIS XML metadata containing workstation paths is not copied into the web bundle. Original DBF attributes are available through the map and exports.

## Dependencies and availability

JavaScript, CSS, fonts, tracks, Natural Earth vectors and a regional relief backdrop are bundled. True 3D relief and detailed live hillshade fetch public Terrarium DEM tiles from `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. These tiles do not require an API key. The browser needs internet access to that service and WebGL hardware support for true 3D. If WebGL cannot initialise, the app opens an explicitly labelled interactive 2D Leaflet fallback, with route selection, profiles, exports and a 2D following tour. The 3D control explains the missing capability. Public service availability is outside this project's control; if live tiles fail, the local backdrop and recorded tracks remain available, but live 3D coverage may be incomplete.

Natural Earth is intentionally a **small-scale** atlas backdrop, not a detailed street or footpath basemap. Close views emphasise terrain and the supplied tracks. Historical tracks and this stylised map are for exploration, not present-day trail navigation.

## Validation

Source conversion was checked against every original coordinate, Z value, part boundary and DBF attribute. The 3D style passed the MapLibre style validator. Route/profile calculations and GPX/GeoJSON output were checked programmatically. The interface was exercised in a desktop browser and a 390-pixel mobile frame, including loading under a repository-style URL subpath.

The test browser had WebGL disabled, so visual browser checks used the 2D compatibility view. Actual GPU rendering of 3D terrain was not visually verified in this environment.

## Replace or update your route data

Keep the same EHW / SSW / WHW schema and WGS84 PolyLineZ coordinate system. Install the small Python dependency and run:

```bash
python -m pip install pyshp
python tools/convert_shapefiles.py /path/to/extracted/shapefiles
```

Then commit the regenerated `data/tracks.geojson` and `data/manifest.json`. If the route endpoints change, update `data/waypoints.geojson` as well. Text in the information dialog and README reflects the supplied dataset and should be revised for a different dataset.

## Customise

- Edit route display names, colours and descriptions in `data/manifest.json`; route line colours are also stored on features in `data/tracks.geojson`. The converter keeps them in sync for a fresh conversion.
- Edit the palette, typography and panel sizes in `style.css`.
- The default terrain exaggeration is `1.8` in `app.js`; the UI offers 1×–3×.
- No Tolkien artwork, maps, logos or text are included. The fantasy atmosphere is created through original styling.
