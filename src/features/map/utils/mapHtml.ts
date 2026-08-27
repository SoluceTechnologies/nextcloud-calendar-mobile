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
  bottomInset?: number;
  showChrome?: boolean;
  textColor?: string;
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
  bottomInset = 0,
  showChrome = false,
  textColor = isDark ? '#ffffff' : '#000000',
}: MapHtmlData): string {
  const data = JSON.stringify({
    lat,
    lon,
    zoom,
    interactive,
    showChrome,
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
#map { position: absolute; top: ${showChrome ? 56 : 0}px; left: 0; right: 0; bottom: 0; background: ${backgroundColor}; }
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
  bottom: ${8 + bottomInset}px;
  right: 8px;
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 9px;
  line-height: 12px;
  color: ${isDark ? '#aaaaaa' : '#555555'};
  background: transparent;
  padding: 2px 4px;
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
}
.chrome-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 56px;
  z-index: 1001;
  display: flex;
  align-items: center;
  padding: 0 8px;
  background: ${backgroundColor};
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  box-sizing: border-box;
}
.chrome-bar-button {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${textColor};
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
  -webkit-tap-highlight-color: rgba(0,0,0,0.1);
}
.chrome-bar-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  color: ${textColor};
  padding: 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
<script>
${leafletJs}
</script>
</head>
<body class="${isDark ? 'dark' : ''}">
${showChrome ? `<div class="chrome-bar">
  <div class="chrome-bar-button" id="map-close" aria-label="Close">&#10005;</div>
  <div class="chrome-bar-title">${escapeJsString(label)}</div>
  <div class="chrome-bar-button" id="map-open" aria-label="Open in maps">&#10148;</div>
</div>` : ''}
<div id="map"></div>
<div id="loader"><div class="spinner"></div></div>
<script>
  (function() {
    var data = ${data};

    function send(action) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(action);
      }
    }

    var closeBtn = document.getElementById('map-close');
    if (closeBtn) closeBtn.addEventListener('click', function(e) { e.stopPropagation(); send('close'); });

    var openBtn = document.getElementById('map-open');
    if (openBtn) openBtn.addEventListener('click', function(e) { e.stopPropagation(); send('openMaps'); });

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
        interactive: data.interactive,
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
