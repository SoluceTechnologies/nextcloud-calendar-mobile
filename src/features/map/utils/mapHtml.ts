import { leafletCss, leafletJs } from './leafletAssets';

export interface MapHtmlData {
  lat: number;
  lon: number;
  zoom: number;
  interactive: boolean;
  label: string;
  isDark: boolean;
  markerColor: string;
  backgroundColor: string;
}

function escapeJsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function buildMapHtml({
  lat,
  lon,
  zoom,
  interactive,
  label,
  isDark,
  markerColor,
  backgroundColor,
}: MapHtmlData): string {
  const data = JSON.stringify({
    lat,
    lon,
    zoom,
    interactive,
    label: label || '',
    markerColor,
    backgroundColor,
  });

  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attributionText = '© OpenStreetMap contributors';
  const spinnerTrack = isDark ? '#333333' : '#dddddd';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=${interactive ? 'yes' : 'no'}" />
<style>
${leafletCss}
html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
body { background: ${backgroundColor}; }
#map { background: ${backgroundColor}; }
body.dark .leaflet-tile-pane {
  filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.1);
}
#loader {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${backgroundColor};
  transition: opacity 0.2s ease;
}
#loader.hidden { opacity: 0; pointer-events: none; }
.spinner {
  width: 32px; height: 32px;
  border: 3px solid ${spinnerTrack};
  border-top-color: ${markerColor};
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.map-attribution {
  position: absolute;
  bottom: 8px;
  right: 8px;
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 10px;
  line-height: 14px;
  color: ${isDark ? '#aaaaaa' : '#333333'};
  background: ${isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)'};
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
}
</style>
<script>
${leafletJs}
</script>
</head>
<body class="${isDark ? 'dark' : ''}">
<div id="map"></div>
<div id="loader"><div class="spinner"></div></div>
<script>
  (function() {
    var data = ${data};

    function initMap() {
      if (typeof L === 'undefined') {
        setTimeout(initMap, 50);
        return;
      }

      var map = L.map('map', {
        zoomControl: data.interactive,
        attributionControl: false,
        dragging: data.interactive,
        scrollWheelZoom: data.interactive,
        doubleClickZoom: data.interactive,
        boxZoom: data.interactive,
        touchZoom: data.interactive,
        keyboard: false,
        tap: data.interactive,
      }).setView([data.lat, data.lon], data.zoom);

      var tiles = L.tileLayer('${escapeJsString(tileUrl)}', {
        maxZoom: 19,
        attribution: '',
        subdomains: 'abc',
        detectRetina: false,
      });
      tiles.addTo(map);

      var loadFired = false;
      function onTilesLoaded() {
        if (loadFired) return;
        loadFired = true;
        hideLoader();
      }
      tiles.on('load', onTilesLoaded);
      setTimeout(onTilesLoaded, 3000);

      L.circleMarker([data.lat, data.lon], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: data.markerColor,
        fillOpacity: 1,
      }).addTo(map);

      var attribution = L.DomUtil.create('div', 'map-attribution', map.getContainer());
      attribution.textContent = '${escapeJsString(attributionText)}';
    }

    function hideLoader() {
      var loader = document.getElementById('loader');
      if (loader) {
        loader.classList.add('hidden');
        setTimeout(function() { loader.style.display = 'none'; }, 250);
      }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initMap();
    } else {
      document.addEventListener('DOMContentLoaded', initMap);
    }
  })();
</script>
</body>
</html>`;
}
