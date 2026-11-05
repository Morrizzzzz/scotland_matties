/* The Northern Paths — buildless, key-free, GitHub Pages compatible. */
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const fmt = (v, digits = 1) =>
    Number(v).toLocaleString('en-GB', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  const mobile = () => innerWidth <= 760;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    route: 'WHW',
    track: null,
    visible: new Set(['WHW', 'EHW', 'SSW']),
    terrain: true,
    labels: true,
    shade: true,
    exaggeration: 1.8,
    ready: false,
    markers: [],
    profile: null,
    tour: null,
  };
  let map,
    tracks,
    manifest,
    routes,
    popup,
    hoverMarker,
    toastTimer,
    terrainErrors = 0;
  function toast(message, ms = 4500) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($('toast').hidden = true), ms);
  }
  function fail(message) {
    $('loading').hidden = true;
    $('fatal-message').textContent = message;
    $('fatal').hidden = false;
  }
  const date = (iso, options = { day: 'numeric', month: 'short', year: 'numeric' }) =>
    iso ? new Intl.DateTimeFormat('en-GB', options).format(new Date(iso)) : 'Date not supplied';
  function haversine(a, b) {
    const r = Math.PI / 180,
      lat1 = a[1] * r,
      lat2 = b[1] * r,
      h =
        Math.sin((lat2 - lat1) / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
    return 12742.0176 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const r = Math.PI / 180,
      p1 = a[1] * r,
      p2 = b[1] * r,
      l = (b[0] - a[0]) * r;
    return (
      Math.atan2(
        Math.sin(l) * Math.cos(p2),
        Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l),
      ) / r
    );
  }
  function currentFeatures() {
    return tracks.features.filter((f) =>
      state.track ? f.id === state.track : f.properties.route === state.route,
    );
  }
  function bounds(features) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    features.forEach((f) => {
      b[0] = Math.min(b[0], f.bbox[0]);
      b[1] = Math.min(b[1], f.bbox[1]);
      b[2] = Math.max(b[2], f.bbox[2]);
      b[3] = Math.max(b[3], f.bbox[3]);
    });
    return [
      [b[0], b[1]],
      [b[2], b[3]],
    ];
  }
  function fit(features, duration = 1100) {
    if (!map || !features.length) return;
    map.stop();
    const panelHeight = $('profile-panel').offsetHeight;
    const padding = mobile()
      ? { top: 100, right: 45, bottom: panelHeight + 55, left: 35 }
      : { top: 135, right: 130, bottom: panelHeight + 95, left: $('sidebar').offsetWidth + 65 };
    map.fitBounds(bounds(features), {
      padding,
      maxZoom: state.track ? 12.6 : 9,
      pitch: state.terrain ? 49 : 0,
      bearing: state.terrain ? -12 : 0,
      duration: reduced ? 0 : duration,
    });
  }
  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('mobile-menu').setAttribute('aria-expanded', 'false');
  }
  function renderRoutes() {
    $('route-list').innerHTML = routes
      .map(
        (r, i) =>
          `<div class="route-card ${r.id === state.route ? 'active' : ''} ${state.visible.has(r.id) ? '' : 'off'}" style="--route:${r.color}"><button class="route-focus" data-route="${r.id}" aria-pressed="${r.id === state.route}" title="Explore ${esc(r.name)}"><span class="route-emblem">${icon('mountain')}</span><span><span class="route-name">${esc(r.name)}</span><span class="route-meta"><b>${fmt(r.distance_km)} km</b> &nbsp;·&nbsp; ${r.count} recordings &nbsp;·&nbsp; ${r.recorded_start.slice(0, 4)}</span></span></button><button class="route-eye" data-visibility="${r.id}" aria-pressed="${state.visible.has(r.id)}" aria-label="${state.visible.has(r.id) ? 'Hide' : 'Show'} ${esc(r.name)}" title="Toggle route visibility">${icon('eye')}</button></div>`,
      )
      .join('');
    $('route-list')
      .querySelectorAll('[data-route]')
      .forEach((button) =>
        button.addEventListener('click', () => selectRoute(button.dataset.route)),
      );
    $('route-list')
      .querySelectorAll('[data-visibility]')
      .forEach((button) =>
        button.addEventListener('click', () => {
          const id = button.dataset.visibility;
          state.visible.has(id) ? state.visible.delete(id) : state.visible.add(id);
          if (!state.visible.has(state.route)) stopTour();
          renderRoutes();
          applyFilters();
          if (!state.visible.size)
            toast('All route layers are hidden. Use an eye button to show a path.');
        }),
      );
  }
  function renderTracks() {
    const q = $('search').value.toLowerCase().trim();
    const fs = tracks.features.filter((f) =>
      q
        ? [
            f.properties.name,
            f.properties.desc_,
            f.properties.recorded_at,
            f.properties.route,
            f.properties.route_name,
            date(f.properties.recorded_at),
          ].some((x) => String(x).toLowerCase().includes(q))
        : f.properties.route === state.route,
    );
    $('track-count').textContent = String(fs.length).padStart(2, '0');
    $('tracks-heading').textContent = q ? 'Search all recordings' : 'The recorded journey';
    $('track-list').innerHTML = fs.length
      ? fs
          .map(
            (f) =>
              `<button class="track-row ${f.id === state.track ? 'selected' : ''}" style="--route:${f.properties.color}" data-track="${f.id}" aria-pressed="${f.id === state.track}"><span class="track-number">${String(f.properties.stage).padStart(2, '0')}</span><span class="track-info"><strong>${esc(f.properties.name)}${q ? ' · ' + esc(f.properties.route) : ''}</strong><small>${esc(date(f.properties.recorded_at))}</small></span><span class="track-km">${fmt(f.properties.distance_km)} km</span></button>`,
          )
          .join('')
      : '<p class="empty-state">No recordings match that search. Try a route name, track number or year.</p>';
    $('track-list')
      .querySelectorAll('[data-track]')
      .forEach((button) =>
        button.addEventListener('click', () => selectTrack(button.dataset.track)),
      );
  }
  function selectRoute(id, shouldFit = true) {
    if (!routes.some((r) => r.id === id)) return;
    stopTour();
    state.route = id;
    state.track = null;
    state.visible.add(id);
    $('search').value = '';
    renderRoutes();
    renderTracks();
    renderSelection();
    applyFilters();
    if (shouldFit) fit(currentFeatures());
    if (mobile()) closeSidebar();
  }
  function selectTrack(id, shouldFit = true) {
    const f = tracks.features.find((f) => f.id === id);
    if (!f) return;
    stopTour();
    state.route = f.properties.route;
    state.track = id;
    state.visible.add(state.route);
    renderRoutes();
    renderTracks();
    renderSelection();
    applyFilters();
    if (shouldFit) fit([f]);
    if (mobile()) closeSidebar();
  }
  function applyFilters() {
    if (!state.ready) return;
    if (state.fallback) {
      map.updateRoutes(state);
      return;
    }
    const visible = ['in', ['get', 'route'], ['literal', [...state.visible]]];
    for (const id of ['track-glow', 'track-casing', 'track-lines', 'track-hit', 'track-starts'])
      map.setFilter(id, visible);
    map.setFilter('track-selection', [
      'all',
      visible,
      state.track
        ? ['==', ['get', 'atlas_id'], state.track]
        : ['==', ['get', 'route'], state.route],
    ]);
    map.setPaintProperty('track-lines', 'line-opacity', [
      'case',
      ['==', ['get', 'route'], state.route],
      1,
      0.7,
    ]);
  }
  function buildProfile(features) {
    const legs = [];
    let total = 0,
      min = Infinity,
      max = -Infinity;
    features.forEach((f) =>
      f.geometry.coordinates.forEach((points, part) => {
        const distances = [0];
        for (let i = 1; i < points.length; i++)
          distances.push(distances[i - 1] + haversine(points[i - 1], points[i]));
        for (const point of points) {
          min = Math.min(min, point[2]);
          max = Math.max(max, point[2]);
        }
        const length = distances.at(-1);
        legs.push({ points, distances, start: total, length, feature: f, part });
        total += length;
      }),
    );
    return { legs, total, min, max };
  }
  function atDistance(profile, km) {
    km = Math.max(0, Math.min(profile.total, km));
    let index = profile.legs.findIndex((l) => km <= l.start + l.length);
    if (index < 0) index = profile.legs.length - 1;
    const leg = profile.legs[index],
      local = km - leg.start;
    let lo = 0,
      hi = leg.distances.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (leg.distances[mid] < local) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo),
      a = leg.points[i - 1],
      b = leg.points[i],
      len = leg.distances[i] - leg.distances[i - 1];
    const ratio = len ? Math.max(0, Math.min(1, (local - leg.distances[i - 1]) / len)) : 0;
    return { point: a.map((v, j) => v + (b[j] - v) * ratio), leg, index, km };
  }
  function renderSelection() {
    const r = routes.find((r) => r.id === state.route),
      fs = currentFeatures(),
      single = fs.length === 1 && state.track;
    state.profile = buildProfile(fs);
    const p = state.profile;
    document.documentElement.style.setProperty('--route', r.color);
    $('selection-code').textContent = single ? `${r.id} · ${fs[0].properties.name}` : r.id;
    $('selection-date').textContent = single
      ? date(fs[0].properties.recorded_at)
      : date(r.recorded_start, { month: 'long', year: 'numeric' });
    $('selection-title').textContent = single ? fs[0].properties.name : r.name;
    $('selection-subtitle').textContent = single
      ? `${r.name} · recording ${fs[0].properties.stage} of ${r.count}`
      : r.endpoints;
    $('selection-distance').innerHTML = `${fmt(p.total)}<small>km</small>`;
    $('selection-high').innerHTML = `${fmt(p.max, 0)}<small>m</small>`;
    $('selection-count').textContent = single
      ? fs[0].properties.vertices.toLocaleString('en-GB')
      : fs.length;
    $('selection-count-label').textContent = single ? 'POINTS' : 'TRACKS';
    $('elevation-readout').textContent = 'Move over the profile to explore';
    renderProfile();
  }
  function renderProfile() {
    const p = state.profile;
    if (!p) return;
    const w = 1000,
      x0 = 34,
      x1 = 994,
      y0 = 5,
      y1 = 57,
      low = Math.min(0, Math.floor(p.min / 100) * 100),
      high = Math.max(100, Math.ceil(p.max / 100) * 100);
    const x = (km) => x0 + (km / p.total) * (x1 - x0),
      y = (z) => y1 - ((z - low) / (high - low)) * (y1 - y0);
    p.chart = { x, y, low, high };
    let paths = '';
    for (const leg of p.legs) {
      const step = Math.max(1, Math.floor(leg.points.length / 500));
      const pts = [];
      for (let i = 0; i < leg.points.length; i += step)
        pts.push([x(leg.start + leg.distances[i]), y(leg.points[i][2])]);
      pts.push([x(leg.start + leg.length), y(leg.points.at(-1)[2])]);
      const line = pts
        .map((v, i) => `${i ? 'L' : 'M'}${v[0].toFixed(2)},${v[1].toFixed(2)}`)
        .join(' ');
      paths += `<path class="chart-area" d="${line} L${pts.at(-1)[0]},${y1} L${pts[0][0]},${y1}Z"/><path class="chart-line" d="${line}"/>`;
    }
    let axes = '';
    [low, high].forEach(
      (z) =>
        (axes += `<line class="chart-grid" x1="${x0}" y1="${y(z)}" x2="${x1}" y2="${y(z)}"/><text class="chart-axis-label" x="0" y="${y(z) + 3}">${Math.round(z)} m</text>`),
    );
    for (let i = 0; i < 5; i++) {
      const km = (p.total * i) / 4;
      axes += `<text class="chart-axis-label" x="${x(km)}" y="75" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${Math.round(km)} km</text>`;
    }
    $('profile-chart').innerHTML =
      `<svg viewBox="0 0 1000 82" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="elevation-gradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${routes.find((r) => r.id === state.route).color}" stop-opacity=".26"/><stop offset="1" stop-color="${routes.find((r) => r.id === state.route).color}" stop-opacity=".025"/></linearGradient></defs>${axes}${paths}<g id="chart-cursor" visibility="hidden"><line class="chart-hover-line" y1="0" y2="57"/><circle class="chart-hover-point" r="3"/></g></svg>`;
    $('profile-chart').setAttribute(
      'aria-label',
      `Elevation profile of ${$('selection-title').textContent}, ${fmt(p.total)} kilometres, recorded elevations ${Math.round(p.min)} to ${Math.round(p.max)} metres. Use left and right arrow keys to explore.`,
    );
  }
  function showProfilePosition(km, pan = false) {
    const p = state.profile;
    if (!p || !map) return;
    const info = atDistance(p, km),
      { point } = info;
    $('elevation-readout').textContent =
      `${fmt(info.km)} km · ${Math.round(point[2])} m · ${info.leg.feature.properties.name}`;
    const cursor = $('chart-cursor');
    cursor.setAttribute('visibility', 'visible');
    const line = cursor.querySelector('line'),
      circle = cursor.querySelector('circle');
    line.setAttribute('x1', p.chart.x(km));
    line.setAttribute('x2', p.chart.x(km));
    circle.setAttribute('cx', p.chart.x(km));
    circle.setAttribute('cy', p.chart.y(point[2]));
    if (!hoverMarker) {
      const el = document.createElement('div');
      el.className = 'traveller';
      hoverMarker = makeMarker(el, { pitchAlignment: 'map' })
        .setLngLat(point.slice(0, 2))
        .addTo(map);
    } else hoverMarker.setLngLat(point.slice(0, 2));
    if (pan) map.panTo(point.slice(0, 2), { duration: reduced ? 0 : 200 });
    return info;
  }
  function removeHover() {
    if (hoverMarker) {
      hoverMarker.remove();
      hoverMarker = null;
    }
    if ($('chart-cursor')) $('chart-cursor').setAttribute('visibility', 'hidden');
  }
  function startTour() {
    if (!state.ready) return;
    if (state.tour) {
      state.tour.paused = !state.tour.paused;
      state.tour.last = performance.now();
      updateTourButton();
      return;
    }
    state.visible.add(state.route);
    renderRoutes();
    applyFilters();
    if (!state.fallback) set3D(true, false);
    const p = state.profile,
      first = atDistance(p, 0),
      ahead = atDistance(p, Math.min(0.2, p.legs[0].length));
    state.tour = {
      km: 0,
      last: performance.now() + 1500,
      duration: Math.max(45000, Math.min(160000, p.total * 1000)),
      paused: false,
      index: 0,
      bearing: bearing(first.point, ahead.point),
      frame: 0,
    };
    $('tour-controls').hidden = false;
    $('tour-progress').value = 0;
    map.flyTo({
      center: first.point.slice(0, 2),
      zoom: 12.2,
      pitch: 67,
      bearing: state.tour.bearing,
      padding: mobile()
        ? { top: 60, bottom: 220, left: 0, right: 0 }
        : { top: 50, bottom: 220, left: 350, right: 50 },
      duration: reduced ? 0 : 1400,
    });
    showProfilePosition(0);
    updateTourButton();
    toast('Following the recording. Drag the map to end the fly-through.', 3500);
    state.tour.frame = requestAnimationFrame(tourFrame);
  }
  function updateTourButton() {
    const t = state.tour;
    $('fly-button').innerHTML =
      icon(t && !t.paused ? 'pause' : 'play') +
      `<span>${!t ? (state.fallback ? 'Follow the path' : 'Fly the path') : t.paused ? 'Resume journey' : 'Pause journey'}</span>`;
  }
  function tourFrame(now) {
    const t = state.tour;
    if (!t) return;
    t.frame = requestAnimationFrame(tourFrame);
    if (t.paused) {
      t.last = now;
      return;
    }
    if (now < t.last || now - t.last < 32) return;
    const delta = Math.min(120, now - t.last);
    t.last = now;
    t.km = Math.min(state.profile.total, t.km + (delta / t.duration) * state.profile.total);
    const info = showProfilePosition(t.km),
      leg = info.leg;
    const ahead = atDistance(state.profile, Math.min(leg.start + leg.length, t.km + 0.18));
    let desired = bearing(info.point, ahead.point);
    if (haversine(info.point, ahead.point) < 0.001) desired = t.bearing;
    const difference = ((desired - t.bearing + 540) % 360) - 180;
    t.bearing += difference * 0.06;
    if (info.index !== t.index) {
      if (haversine(state.profile.legs[t.index].points.at(-1), leg.points[0]) > 0.2)
        toast('Continuing at the next recorded section.', 2000);
      t.index = info.index;
    }
    map.jumpTo({ center: info.point.slice(0, 2), zoom: 12.2, pitch: 67, bearing: t.bearing });
    $('tour-label').textContent = `${info.leg.feature.properties.name} · ${fmt(t.km)} km`;
    $('tour-progress').value = Math.round((t.km / state.profile.total) * 1000);
    if (t.km >= state.profile.total) {
      stopTour(false);
      toast('Journey complete. Every recorded section explored.');
    }
  }
  function stopTour(clear = true) {
    if (state.tour) {
      cancelAnimationFrame(state.tour.frame);
      state.tour = null;
      map?.stop();
    }
    $('tour-controls').hidden = true;
    updateTourButton();
    if (clear) removeHover();
  }
  function set3D(on, animate = true) {
    if (state.fallback && on) {
      toast(
        '3D needs WebGL, which is unavailable in this browser. Open this atlas in a browser with hardware acceleration for 3D terrain.',
        7000,
      );
      return;
    }
    state.terrain = on;
    $('view-2d').setAttribute('aria-pressed', String(!on));
    $('view-3d').setAttribute('aria-pressed', String(on));
    if (state.ready) {
      map.setTerrain(on ? { source: 'terrain', exaggeration: state.exaggeration } : null);
      map.easeTo({ pitch: on ? 55 : 0, duration: animate && !reduced ? 700 : 0 });
    }
    $('terrain-status').innerHTML =
      `<i></i>${state.fallback ? '2D · WEBGL UNAVAILABLE' : on ? '3D TERRAIN' : '2D ATLAS'}`;
  }
  function download(data, filename, type) {
    const blob = new Blob([data], { type }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  function exportGeoJSON(all = false) {
    const fs = all ? tracks.features : currentFeatures();
    download(
      JSON.stringify({ type: 'FeatureCollection', features: fs }, null, 2),
      all ? 'scotland-all-tracks.geojson' : `${state.track || state.route}.geojson`,
      'application/geo+json',
    );
  }
  function exportGPX() {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="The Northern Paths" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>' +
      esc(routes.find((r) => r.id === state.route).name) +
      '</name><desc>Original recorded tracks; elevations from supplied Z values, metres assumed, vertical datum unspecified.</desc></metadata>' +
      currentFeatures()
        .map(
          (f) =>
            '<trk><name>' +
            esc(f.properties.name) +
            '</name><desc>' +
            esc(f.properties.desc_) +
            '</desc>' +
            f.geometry.coordinates
              .map(
                (part) =>
                  '<trkseg>' +
                  part
                    .map((p) => `<trkpt lat="${p[1]}" lon="${p[0]}"><ele>${p[2]}</ele></trkpt>`)
                    .join('') +
                  '</trkseg>',
              )
              .join('') +
            '</trk>',
        )
        .join('') +
      '</gpx>';
    download(xml, `${state.track || state.route}.gpx`, 'application/gpx+xml');
  }
  function showDetails() {
    const fs = currentFeatures();
    $('details-title').textContent = $('selection-title').textContent;
    const keys = [
      'name',
      'cmt',
      'desc_',
      'src',
      'link1_href',
      'link1_text',
      'link1_type',
      'link2_href',
      'link2_text',
      'link2_type',
      'number',
      'type',
      'Shape_Leng',
    ];
    $('details-content').innerHTML =
      '<p>Original shapefile attributes are preserved below. <code>Shape_Leng</code> is the original geographic-coordinate length; the map recalculates horizontal distance in kilometres. Empty values are shown as —.</p>' +
      fs
        .map(
          (f) =>
            `<details ${fs.length === 1 ? 'open' : ''}><summary>${esc(f.properties.name)} · ${esc(date(f.properties.recorded_at))} · ${fmt(f.properties.distance_km)} km</summary><p>${f.properties.vertices.toLocaleString('en-GB')} vertices · ${f.properties.parts} separate part${f.properties.parts === 1 ? '' : 's'} · source ${f.properties.route}.shp</p><table><tbody>${keys.map((k) => `<tr><td>${esc(k)}</td><td>${esc(f.properties[k] === '' || f.properties[k] == null ? '—' : f.properties[k])}</td></tr>`).join('')}</tbody></table></details>`,
        )
        .join('');
    $('details-dialog').showModal();
  }
  function makeMarker(el, opts = {}) {
    return state.fallback ? map.marker(el, opts) : new maplibregl.Marker({ element: el, ...opts });
  }
  function placeLabels(places, waypoints) {
    const endpoints = new Set(waypoints.features.map((f) => f.properties.name));
    const chosen = places.features.filter(
      (f) =>
        !endpoints.has(f.properties.name) &&
        [
          'Glasgow',
          'Edinburgh',
          'Inverness',
          'Aberdeen',
          'Dundee',
          'Perth',
          'Oban',
          'Wick',
          'Kirkwall',
          'Lerwick',
          'Stornoway',
          'Dumfries',
        ].includes(f.properties.name),
    );
    [...chosen, ...waypoints.features].forEach((f) => {
      const el = document.createElement('div');
      el.className = `map-place ${f.properties.kind === 'endpoint' ? 'endpoint' : ''}`;
      el.textContent = f.properties.name;
      const marker = makeMarker(el, { anchor: 'left', offset: [4, 0] })
        .setLngLat(f.geometry.coordinates.slice(0, 2))
        .addTo(map);
      state.markers.push({ marker, el, type: 'place' });
    });
    const labels = [
      ['THE HIGHLANDS', [-4.9, 57.48], 'region'],
      ['CAIRNGORMS', [-3.55, 56.96], 'region'],
      ['THE HEBRIDES', [-7.1, 57.35], 'region'],
      ['North Sea', [-1.15, 57.45], 'sea'],
      ['Atlantic Ocean', [-7.8, 56.5], 'sea'],
      ['ORKNEY', [-3.05, 59.15], 'region'],
      ['SHETLAND', [-1.35, 60.55], 'region'],
    ];
    labels.forEach(([name, point, type]) => {
      const el = document.createElement('div');
      el.className = type === 'sea' ? 'sea-label' : 'region-label';
      el.textContent = name;
      const marker = makeMarker(el).setLngLat(point).addTo(map);
      state.markers.push({ marker, el, type });
    });
    updateLabels();
  }
  function updateLabels() {
    const z = map.getZoom();
    state.markers.forEach(
      (m) =>
        (m.el.style.visibility =
          state.labels && (m.type === 'place' ? z < 12.2 : z < 9.6) ? 'visible' : 'hidden'),
    );
  }
  function buildStyle(relief) {
    const dem = {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 15,
      encoding: 'terrarium',
      attribution:
        '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain: Mapzen / AWS</a>',
    };
    // Numeric vector-tile IDs and a separate source-record key keep picking
    // stable when the GeoJSON is tiled by the renderer.
    const displayTracks = {
      type: 'FeatureCollection',
      features: tracks.features.map((f, id) => ({
        ...f,
        id,
        properties: { ...f.properties, atlas_id: f.id },
      })),
    };
    const startPoints = {
      type: 'FeatureCollection',
      features: displayTracks.features.map((f) => ({
        type: 'Feature',
        id: f.id,
        properties: f.properties,
        geometry: { type: 'Point', coordinates: f.geometry.coordinates[0][0].slice(0, 2) },
      })),
    };
    return {
      version: 8,
      name: 'The Northern Paths',
      sources: {
        land: {
          type: 'geojson',
          data: 'data/land.geojson',
          attribution: '<a href="https://naturalearthdata.com" target="_blank">Natural Earth</a>',
        },
        lakes: { type: 'geojson', data: 'data/lakes.geojson' },
        rivers: { type: 'geojson', data: 'data/rivers.geojson' },
        relief: { type: 'image', url: 'assets/relief.webp', coordinates: relief.coordinates },
        terrain: { ...dem },
        hillshade: { ...dem },
        tracks: { type: 'geojson', data: displayTracks, tolerance: 0.2 },
        starts: { type: 'geojson', data: startPoints },
      },
      sky: {
        'sky-color': '#10202a',
        'horizon-color': '#40564a',
        'fog-color': '#253c33',
        'sky-horizon-blend': 0.7,
        'horizon-fog-blend': 0.7,
        'fog-ground-blend': 0.7,
      },
      terrain: { source: 'terrain', exaggeration: state.exaggeration },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#101f24' } },
        { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#2b382d' } },
        {
          id: 'relief',
          type: 'raster',
          source: 'relief',
          paint: { 'raster-opacity': 0.94, 'raster-fade-duration': 0 },
        },
        {
          id: 'hillshade',
          type: 'hillshade',
          source: 'hillshade',
          paint: {
            'hillshade-shadow-color': '#0b1c19',
            'hillshade-highlight-color': '#aeb58b',
            'hillshade-accent-color': '#485b3b',
            'hillshade-exaggeration': 0.38,
            'hillshade-illumination-direction': 315,
          },
        },
        {
          id: 'coastline',
          type: 'line',
          source: 'land',
          paint: { 'line-color': '#98ab7855', 'line-width': 0.7 },
        },
        {
          id: 'lakes',
          type: 'fill',
          source: 'lakes',
          paint: { 'fill-color': '#142b2e', 'fill-outline-color': '#54726766' },
        },
        {
          id: 'rivers',
          type: 'line',
          source: 'rivers',
          paint: {
            'line-color': '#66827b',
            'line-opacity': 0.4,
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.35, 12, 1.5],
          },
        },
        {
          id: 'track-glow',
          type: 'line',
          source: 'tracks',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 8, 12, 16],
            'line-blur': 7,
            'line-opacity': 0.24,
          },
        },
        {
          id: 'track-casing',
          type: 'line',
          source: 'tracks',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#12201b',
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3.2, 12, 6],
            'line-opacity': 0.8,
          },
        },
        {
          id: 'track-lines',
          type: 'line',
          source: 'tracks',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.7, 9, 2.8, 13, 4],
            'line-opacity': 0.9,
          },
        },
        {
          id: 'track-selection',
          type: 'line',
          source: 'tracks',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#fff6d6',
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 12, 1.2],
            'line-opacity': 0.6,
          },
          filter: ['==', ['get', 'route'], 'WHW'],
        },
        {
          id: 'track-starts',
          type: 'circle',
          source: 'starts',
          minzoom: 8.3,
          paint: {
            'circle-color': '#13241d',
            'circle-radius': 3,
            'circle-stroke-width': 1,
            'circle-stroke-color': ['get', 'color'],
          },
        },
        {
          id: 'track-hit',
          type: 'line',
          source: 'tracks',
          paint: { 'line-width': 19, 'line-opacity': 0, 'line-color': '#fff' },
        },
      ],
    };
  }
  function bindUI() {
    $('search').addEventListener('input', renderTracks);
    $('fit-all').addEventListener('click', () => {
      stopTour();
      state.visible = new Set(routes.map((r) => r.id));
      renderRoutes();
      applyFilters();
      fit(tracks.features);
      closeSidebar();
    });
    $('scotland-view').addEventListener('click', () => {
      stopTour();
      map.fitBounds(
        [
          [-8.7, 54.6],
          [0.6, 61.15],
        ],
        {
          padding: mobile()
            ? { top: 85, left: 20, right: 45, bottom: $('profile-panel').offsetHeight + 45 }
            : {
                top: 90,
                left: $('sidebar').offsetWidth + 80,
                right: 90,
                bottom: $('profile-panel').offsetHeight + 70,
              },
          pitch: state.terrain ? 38 : 0,
          bearing: 0,
          duration: reduced ? 0 : 1300,
        },
      );
    });
    $('compass').addEventListener('click', () => {
      stopTour();
      map.easeTo({ bearing: 0, duration: reduced ? 0 : 600 });
    });
    $('view-2d').addEventListener('click', () => {
      stopTour();
      set3D(false);
    });
    $('view-3d').addEventListener('click', () => {
      stopTour();
      set3D(true);
    });
    $('settings-button').addEventListener('click', () => {
      const open = $('settings').hidden;
      $('settings').hidden = !open;
      $('settings-button').setAttribute('aria-expanded', String(open));
    });
    $('labels-toggle').addEventListener('change', (e) => {
      state.labels = e.target.checked;
      updateLabels();
    });
    $('shade-toggle').addEventListener('change', (e) => {
      state.shade = e.target.checked;
      map.setLayoutProperty('hillshade', 'visibility', state.shade ? 'visible' : 'none');
      map.setPaintProperty('relief', 'raster-opacity', state.shade ? 0.94 : 0);
    });
    $('relief').addEventListener('input', (e) => {
      state.exaggeration = +e.target.value;
      $('relief-value').textContent = state.exaggeration.toFixed(1) + '×';
      if (state.terrain && state.ready)
        map.setTerrain({ source: 'terrain', exaggeration: state.exaggeration });
    });
    $('mobile-menu').addEventListener('click', () => {
      const open = !$('sidebar').classList.contains('open');
      $('sidebar').classList.toggle('open', open);
      $('mobile-menu').setAttribute('aria-expanded', String(open));
    });
    $('close-sidebar').addEventListener('click', closeSidebar);
    $('fly-button').addEventListener('click', startTour);
    $('tour-stop').addEventListener('click', () => stopTour());
    $('tour-progress').addEventListener('input', (e) => {
      if (!state.tour) return;
      state.tour.km = (+e.target.value / 1000) * state.profile.total;
      const info = showProfilePosition(state.tour.km);
      map.jumpTo({ center: info.point.slice(0, 2) });
      state.tour.last = performance.now();
    });
    $('download-gpx').addEventListener('click', exportGPX);
    $('download-geojson').addEventListener('click', () => exportGeoJSON());
    $('download-all').addEventListener('click', () => exportGeoJSON(true));
    $('about-open').addEventListener('click', () => $('about-dialog').showModal());
    $('details-open').addEventListener('click', showDetails);
    document
      .querySelectorAll('.dialog-close')
      .forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    document.querySelectorAll('dialog').forEach((d) =>
      d.addEventListener('click', (e) => {
        if (e.target === d) {
          const r = d.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            d.close();
        }
      }),
    );
    $('collapse-profile').addEventListener('click', () => {
      const collapsed = $('profile-panel').classList.toggle('collapsed');
      $('collapse-profile').setAttribute('aria-expanded', String(!collapsed));
      $('collapse-profile').setAttribute(
        'aria-label',
        collapsed ? 'Expand elevation profile' : 'Collapse elevation profile',
      );
    });
    $('profile-chart').addEventListener('pointermove', (e) => {
      if (state.tour) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (((e.clientX - rect.left) / rect.width) * 1000 - 34) / 960),
      );
      showProfilePosition(ratio * state.profile.total);
    });
    $('profile-chart').addEventListener('pointerleave', () => {
      if (!state.tour) {
        removeHover();
        $('elevation-readout').textContent = 'Move over the profile to explore';
      }
    });
    let keyboardKm = 0;
    $('profile-chart').addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        stopTour();
        keyboardKm =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? state.profile.total
              : keyboardKm + ((e.key === 'ArrowRight' ? 1 : -1) * state.profile.total) / 100;
        keyboardKm = Math.max(0, Math.min(state.profile.total, keyboardKm));
        showProfilePosition(keyboardKm, true);
      }
    });
    $('share-view').addEventListener('click', async () => {
      const c = map.getCenter();
      const hash = new URLSearchParams({
        route: state.route,
        ...(state.track ? { track: state.track } : {}),
        view: [
          c.lng.toFixed(5),
          c.lat.toFixed(5),
          map.getZoom().toFixed(2),
          map.getBearing().toFixed(1),
          map.getPitch().toFixed(1),
        ].join(','),
        terrain: state.terrain ? '1' : '0',
        height: state.exaggeration,
        visible: [...state.visible].join(','),
      });
      history.replaceState(null, '', '#' + hash.toString());
      try {
        await navigator.clipboard.writeText(location.href);
        toast('Map view copied. Share the link to return to this view.');
      } catch {
        toast('This view is saved in the address bar. Copy that URL to share it.', 6500);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        stopTour();
        closeSidebar();
        $('settings').hidden = true;
        $('settings-button').setAttribute('aria-expanded', 'false');
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        if (mobile()) {
          $('sidebar').classList.add('open');
          $('mobile-menu').setAttribute('aria-expanded', 'true');
        }
        $('search').focus();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.tour) {
        state.tour.paused = true;
        updateTourButton();
      }
    });
  }
  async function init() {
    if (location.protocol === 'file:') {
      fail(
        'Open this website through a local web server or GitHub Pages. For a local preview, run python -m http.server 8000 in this folder and visit http://localhost:8000.',
      );
      return;
    }
    if (!window.maplibregl) {
      fail(
        'The map renderer could not load. Check that the vendor folder is next to index.html. Your routes are still available below.',
      );
      return;
    }
    const files = [
      'tracks.geojson',
      'manifest.json',
      'relief.json',
      'places.geojson',
      'waypoints.geojson',
    ];
    let loaded;
    try {
      loaded = await Promise.all(
        files.map(async (name) => {
          const r = await fetch('data/' + name);
          if (!r.ok) throw Error(name);
          return r.json();
        }),
      );
    } catch (e) {
      fail(
        'The map data could not load. Check that the data and assets folders are uploaded next to index.html, then reload.',
      );
      return;
    }
    [tracks, manifest] = loaded;
    routes = manifest.routes;
    const hash = new URLSearchParams(location.hash.slice(1));
    if (routes.some((r) => r.id === hash.get('route'))) state.route = hash.get('route');
    if (tracks.features.some((f) => f.id === hash.get('track'))) {
      state.track = hash.get('track');
      state.route = tracks.features.find((f) => f.id === state.track).properties.route;
    }
    if (hash.has('visible'))
      state.visible = new Set(
        hash
          .get('visible')
          .split(',')
          .filter((x) => routes.some((r) => r.id === x)),
      );
    state.terrain = hash.get('terrain') !== '0';
    if (hash.has('height'))
      state.exaggeration = Math.max(1, Math.min(3, parseFloat(hash.get('height')) || 1.8));
    $('relief').value = state.exaggeration;
    $('relief-value').textContent = state.exaggeration.toFixed(1) + '×';
    $('total-km').textContent = fmt(
      routes.reduce((s, r) => s + r.distance_km, 0),
      0,
    );
    $('total-tracks').textContent = tracks.features.length;
    renderRoutes();
    renderTracks();
    renderSelection();
    bindUI();
    const style = buildStyle(loaded[2]);
    if (!state.terrain) delete style.terrain;
    try {
      map = new maplibregl.Map({
        container: 'map',
        style,
        center: [-4.3, 56.8],
        zoom: 7.25,
        pitch: state.terrain ? 49 : 0,
        bearing: -12,
        minZoom: 4.5,
        maxZoom: 15,
        maxPitch: 78,
        maxBounds: [
          [-14, 51],
          [7, 64],
        ],
        renderWorldCopies: false,
        attributionControl: false,
        canvasContextAttributes: { antialias: true },
      });
    } catch (e) {
      console.warn('3D unavailable; opening the 2D fallback:', e.message);
      state.fallback = true;
      state.terrain = false;
      try {
        map = await window.createAtlasFallback({
          relief: loaded[2],
          tracks,
          onSelect: selectTrack,
          onDrag: () => {
            if (state.tour) stopTour();
          },
        });
      } catch (error) {
        console.error(error);
        fail('The map could not load. Please reload, or use the route-data download below.');
        return;
      }
      state.ready = true;
      applyFilters();
      placeLabels(loaded[3], loaded[4]);
      set3D(false, false);
      updateTourButton();
      $('view-3d').setAttribute('aria-disabled', 'true');
      $('view-3d').title = 'WebGL is unavailable in this browser';
      $('relief').disabled = true;
      const values = hash.get('view')?.split(',').map(Number);
      if (
        values?.length === 5 &&
        values.every(Number.isFinite) &&
        values[0] >= -14 &&
        values[0] <= 7 &&
        values[1] >= 51 &&
        values[1] <= 64
      ) {
        map.jumpTo({ center: values.slice(0, 2), zoom: Math.max(4.5, Math.min(15, values[2])) });
      } else fit(tracks.features, 0);
      map.on('move', () => {
        const c = map.getCenter();
        $('coordinates').textContent =
          `${Math.abs(c.lat).toFixed(3)}° ${c.lat >= 0 ? 'N' : 'S'} · ${Math.abs(c.lng).toFixed(3)}° ${c.lng >= 0 ? 'E' : 'W'}`;
        updateLabels();
      });
      document.querySelector('.map-help').textContent =
        'Drag to explore · Scroll to zoom · 2D compatibility view';
      $('loading').hidden = true;
      toast(
        'Opened the 2D atlas: WebGL is unavailable in this browser. 3D opens automatically where supported.',
        7500,
      );
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        customAttribution:
          '<a href="https://maplibre.org" target="_blank">MapLibre</a> · Personal track recordings',
      }),
      'bottom-right',
    );
    map.on('error', (e) => {
      console.warn('Map resource:', e.error?.message || e);
      if (
        e.sourceId === 'terrain' ||
        e.sourceId === 'hillshade' ||
        String(e.error?.message).includes('elevation-tiles')
      ) {
        terrainErrors++;
        if (terrainErrors === 6) {
          toast(
            'Some live terrain tiles are unavailable. Your tracks and the local relief backdrop remain visible.',
            8000,
          );
          $('terrain-status').textContent = 'LIVE TERRAIN INTERRUPTED';
        }
      }
    });
    map.on('load', () => {
      state.ready = true;
      applyFilters();
      placeLabels(loaded[3], loaded[4]);
      set3D(state.terrain, false);
      const values = hash.get('view')?.split(',').map(Number);
      if (
        values?.length === 5 &&
        values.every(Number.isFinite) &&
        values[0] >= -14 &&
        values[0] <= 7 &&
        values[1] >= 51 &&
        values[1] <= 64
      ) {
        map.jumpTo({
          center: values.slice(0, 2),
          zoom: Math.max(4.5, Math.min(15, values[2])),
          bearing: values[3],
          pitch: state.terrain ? Math.max(0, Math.min(78, values[4])) : 0,
        });
      } else fit(tracks.features, 0);
      $('loading').classList.add('done');
      setTimeout(() => ($('loading').hidden = true), 550);
      map.on('click', 'track-hit', (e) => {
        if (e.features?.length) selectTrack(e.features[0].properties.atlas_id);
      });
      map.on('click', 'track-starts', (e) => {
        if (e.features?.length) selectTrack(e.features[0].properties.atlas_id);
      });
      map.on('mousemove', 'track-hit', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        if (state.tour) return;
        const f = e.features?.[0];
        if (!f) return;
        const content = document.createElement('div');
        content.textContent = `${f.properties.route} · ${f.properties.name} · ${fmt(f.properties.distance_km)} km`;
        if (!popup)
          popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
        popup.setLngLat(e.lngLat).setDOMContent(content).addTo(map);
      });
      map.on('mouseleave', 'track-hit', () => {
        map.getCanvas().style.cursor = '';
        popup?.remove();
      });
    });
    map.on('move', () => {
      const c = map.getCenter();
      $('coordinates').textContent =
        `${Math.abs(c.lat).toFixed(3)}° ${c.lat >= 0 ? 'N' : 'S'} · ${Math.abs(c.lng).toFixed(3)}° ${c.lng >= 0 ? 'E' : 'W'}`;
      $('compass').querySelector('svg').style.transform = `rotate(${-map.getBearing()}deg)`;
    });
    map.on('zoom', () => {
      if (state.ready) updateLabels();
    });
    for (const name of ['dragstart', 'rotatestart', 'zoomstart', 'pitchstart'])
      map.on(name, (e) => {
        if (e.originalEvent && state.tour) stopTour();
      });
    map.on('webglcontextlost', () =>
      toast('The graphics context was interrupted. Reload if the map does not recover.', 9000),
    );
    // A failed remote elevation request must never indefinitely hide local data.
    setTimeout(() => {
      if (!$('loading').hidden) {
        $('loading').classList.add('done');
        $('loading').hidden = true;
        if (!state.ready)
          toast(
            'Terrain is taking longer to load. The atlas will appear as resources become available.',
            8000,
          );
      }
    }, 18000);
  }
  init().catch((error) => {
    console.error(error);
    fail(
      'The atlas encountered an unexpected problem. Please reload or download the original converted track data.',
    );
  });
})();
