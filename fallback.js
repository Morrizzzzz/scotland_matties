/* Graceful, explicitly labelled 2D atlas for browsers without WebGL. */
'use strict';
window.createAtlasFallback = async function (options) {
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'vendor/leaflet.css';
  document.head.prepend(css);
  await loadScript('vendor/leaflet.js');
  const container = document.getElementById('map');
  container.replaceChildren();
  container.className = 'fallback-map';
  const native = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
    minZoom: 5.5,
    maxZoom: 16,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    maxBounds: [
      [51, -14],
      [64, 7],
    ],
    maxBoundsViscosity: 0.8,
  }).setView([56.8, -4.3], 8.25);
  native.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  native.attributionControl.addAttribution(
    '<a href="https://naturalearthdata.com">Natural Earth</a> · <a href="https://registry.opendata.aws/terrain-tiles/">Relief: Mapzen / AWS</a> · Personal recordings',
  );
  L.control.zoom({ position: 'topright' }).addTo(native);
  native.createPane('atlasLand');
  native.getPane('atlasLand').style.zIndex = '200';
  native.createPane('atlasRelief');
  native.getPane('atlasRelief').style.zIndex = '250';
  native.createPane('atlasWater');
  native.getPane('atlasWater').style.zIndex = '300';
  const [land, lakes, rivers] = await Promise.all(
    ['land', 'lakes', 'rivers'].map((name) =>
      fetch(`data/${name}.geojson`).then((r) => {
        if (!r.ok) throw Error(name);
        return r.json();
      }),
    ),
  );
  L.geoJSON(land, {
    pane: 'atlasLand',
    interactive: false,
    style: { color: '#667453', opacity: 0.4, weight: 0.7, fillColor: '#2b382d', fillOpacity: 1 },
  }).addTo(native);
  const corners = options.relief.coordinates;
  const image = L.imageOverlay(
    'assets/relief.webp',
    [
      [corners[2][1], corners[0][0]],
      [corners[0][1], corners[2][0]],
    ],
    { opacity: 0.94, pane: 'atlasRelief', interactive: false },
  ).addTo(native);
  L.geoJSON(lakes, {
    pane: 'atlasWater',
    interactive: false,
    style: { color: '#547267', opacity: 0.5, weight: 0.6, fillColor: '#142b2e', fillOpacity: 1 },
  }).addTo(native);
  L.geoJSON(rivers, {
    pane: 'atlasWater',
    interactive: false,
    style: { color: '#66827b', opacity: 0.4, weight: 0.7 },
  }).addTo(native);
  const groups = [];
  options.tracks.features.forEach((feature) => {
    const back = L.geoJSON(feature, {
      interactive: false,
      style: { weight: 5.5, color: '#12201b', opacity: 0.8 },
    });
    const front = L.geoJSON(feature, {
      style: { weight: 2.6, color: feature.properties.color, opacity: 0.9 },
      onEachFeature: (f, layer) => {
        const label = document.createElement('span');
        label.textContent = `${f.properties.route} · ${f.properties.name} · ${f.properties.distance_km.toFixed(1)} km`;
        layer.bindTooltip(label, { sticky: true, direction: 'top' });
        layer.on('click', () => options.onSelect(f.id));
      },
    });
    const group = L.layerGroup([back, front]).addTo(native);
    groups.push({ feature, group, front });
  });
  let padding = { top: 0, right: 0, bottom: 0, left: 0 };
  function centerFor(p, zoom) {
    const xy = native.project([p[1], p[0]], zoom);
    return native.unproject(
      [xy.x - (padding.left - padding.right) / 2, xy.y - (padding.top - padding.bottom) / 2],
      zoom,
    );
  }
  const api = {
    isFallback: true,
    updateRoutes(state) {
      groups.forEach(({ feature, group, front }) => {
        const shown = state.visible.has(feature.properties.route);
        shown ? group.addTo(native) : group.remove();
        const selected = state.track
          ? feature.id === state.track
          : feature.properties.route === state.route;
        front.setStyle({
          color: state.track && selected ? '#fff0c4' : feature.properties.color,
          weight: selected ? 3.1 : 2.4,
          opacity: selected ? 1 : 0.7,
        });
      });
    },
    fitBounds(b, opts = {}) {
      padding = { top: 0, right: 0, bottom: 0, left: 0 };
      const p = opts.padding || {};
      native.fitBounds(
        [
          [b[0][1], b[0][0]],
          [b[1][1], b[1][0]],
        ],
        {
          paddingTopLeft: [p.left || 0, p.top || 0],
          paddingBottomRight: [p.right || 0, p.bottom || 0],
          maxZoom: (opts.maxZoom ?? 9) + 1,
          animate: opts.duration > 0,
          duration: Math.min(1, (opts.duration || 0) / 1000),
        },
      );
    },
    stop() {
      native.stop();
    },
    jumpTo(opts) {
      if (opts.padding) padding = opts.padding;
      const z = opts.zoom != null ? opts.zoom + 1 : native.getZoom();
      const c = opts.center ? centerFor(opts.center, z) : native.getCenter();
      native.setView(c, z, { animate: false });
    },
    flyTo(opts) {
      if (opts.padding) padding = opts.padding;
      const z = opts.zoom != null ? opts.zoom + 1 : native.getZoom();
      const c = opts.center ? centerFor(opts.center, z) : native.getCenter();
      native.flyTo(c, z, { animate: opts.duration > 0, duration: (opts.duration || 0) / 1000 });
    },
    easeTo() {},
    panTo(p, opts) {
      native.panTo([p[1], p[0]], {
        animate: opts.duration > 0,
        duration: (opts.duration || 0) / 1000,
      });
    },
    getCenter() {
      const p = native.getCenter();
      return { lng: p.lng, lat: p.lat };
    },
    getZoom() {
      return native.getZoom() - 1;
    },
    getBearing() {
      return 0;
    },
    getPitch() {
      return 0;
    },
    setTerrain() {},
    setLayoutProperty() {},
    setPaintProperty(id, name, value) {
      if (id === 'relief') image.setOpacity(value);
    },
    on(name, fn) {
      native.on(name, fn);
    },
    marker(el, opts = {}) {
      const ll = L.marker([0, 0], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'atlas-leaflet-marker',
          html: el,
          iconSize: [0, 0],
          iconAnchor: opts.anchor === 'left' ? [-4, 0] : [0, 0],
        }),
      });
      if (opts.anchor !== 'left') el.style.transform = 'translate(-50%, -50%)';
      const marker = {
        setLngLat(p) {
          ll.setLatLng([p[1], p[0]]);
          return marker;
        },
        addTo() {
          ll.addTo(native);
          return marker;
        },
        remove() {
          ll.remove();
        },
      };
      return marker;
    },
  };
  native.on('dragstart', options.onDrag);
  container.addEventListener('wheel', options.onDrag, { passive: true });
  return api;
};
