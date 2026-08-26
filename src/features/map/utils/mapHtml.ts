interface MapHtmlData {
  lat: number;
  lon: number;
  zoom: number;
  interactive: boolean;
  label: string;
}

export function buildMapHtml({ lat, lon, zoom, interactive, label }: MapHtmlData): string {
  const data = JSON.stringify({
    lat,
    lon,
    zoom,
    interactive,
    label: label || '',
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=${interactive ? 'yes' : 'no'}" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
  body { background: transparent; }
  #map { background: #e5e3df; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  (function() {
    var data = ${data};

    function initMap() {
      if (typeof L === 'undefined') {
        setTimeout(initMap, 100);
        return;
      }

      var map = L.map('map', {
        zoomControl: data.interactive,
        attributionControl: true,
        dragging: data.interactive,
        scrollWheelZoom: data.interactive,
        doubleClickZoom: data.interactive,
        boxZoom: data.interactive,
        touchZoom: data.interactive,
        keyboard: false,
        tap: data.interactive,
      }).setView([data.lat, data.lon], data.zoom);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      L.marker([data.lat, data.lon], { title: data.label || '' }).addTo(map);
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
