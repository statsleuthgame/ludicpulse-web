(() => {
  'use strict';
  const API = 'https://telem.statmask.com:8443/api/public/eta/state';
  const POLL_MS = 10_000;
  const token = location.hash.slice(1);
  const el = (id) => document.getElementById(id);
  let latest = null;
  let pollTimer = null;
  let tickTimer = null;
  let controller = null;
  let map = null;
  let mapScriptLoading = false;
  let mapKitInitialized = false;
  let currentMapToken = null;
  let mapItems = [];

  const validToken = /^[A-Za-z0-9_-]{40,80}$/.test(token);
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const validPoint = (value) => value && finite(value.latitude) && finite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
  const validPoints = (value) => Array.isArray(value) && value.length >= 2
    && value.length <= 10_000 && value.every(validPoint);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const clock = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const miles = (value) => `${value < 10 ? value.toFixed(1) : Math.round(value)} mi left`;
  const ago = (iso) => {
    const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (seconds < 10) return 'Updated just now';
    if (seconds < 60) return `Updated ${seconds} sec ago`;
    return `Updated ${Math.round(seconds / 60)} min ago`;
  };

  function terminal(state) {
    el('loading').hidden = true; el('trip').hidden = true; el('terminal').hidden = false;
    el('terminal-title').textContent = state === 'expired' ? 'Link expired' : 'Sharing ended';
    el('terminal-body').textContent = state === 'expired'
      ? 'This four-hour private link has expired.' : 'The driver arrived, stopped sharing, or changed destinations.';
    stopPolling();
  }

  function svgRoute(points, progress, position) {
    const svg = el('route-fallback');
    if (!validPoints(points)) { svg.hidden = false; return; }
    const latitudes = points.map((point) => point.latitude);
    const longitudes = points.map((point) => point.longitude);
    const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes), maxLon = Math.max(...longitudes);
    const latSpan = Math.max(0.00001, maxLat - minLat), lonSpan = Math.max(0.00001, maxLon - minLon);
    const scale = Math.min(580 / lonSpan, 320 / latSpan);
    const width = lonSpan * scale, height = latSpan * scale;
    const left = (700 - width) / 2, top = (420 - height) / 2;
    const project = (point) => ({
      x: left + (point.longitude - minLon) * scale,
      y: top + (maxLat - point.latitude) * scale,
    });
    const path = points.map((point, index) => {
      const p = project(point); return `${index ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(' ');
    el('route-background').setAttribute('d', path);
    el('route-line').setAttribute('d', path);
    const destination = project(points.at(-1));
    const nearestIndex = validPoint(position) ? points.reduce((best, point, index) => {
      const lat = point.latitude - position.latitude;
      const lon = point.longitude - position.longitude;
      const distance = lat * lat + lon * lon;
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Infinity }).index : null;
    const routeIndex = nearestIndex ?? Math.round(
      clamp(progress, 0, 100) / 100 * (points.length - 1),
    );
    const current = project(points[routeIndex]);
    el('car-marker').setAttribute('cx', current.x); el('car-marker').setAttribute('cy', current.y);
    el('destination-marker').setAttribute('cx', destination.x); el('destination-marker').setAttribute('cy', destination.y);
    svg.hidden = false;
  }

  function drawMap(data) {
    svgRoute(data.routePoints, data.progress, data.position);
    if (!data.mapToken || !validPoints(data.routePoints) || !validPoint(data.position)) return;
    currentMapToken = data.mapToken;
    if (window.mapkit) { renderMapKit(data); return; }
    if (mapScriptLoading) return;
    mapScriptLoading = true;
    const script = document.createElement('script');
    script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
    script.onload = () => renderMapKit(latest);
    script.onerror = () => { mapScriptLoading = false; };
    document.head.append(script);
  }

  function renderMapKit(data) {
    try {
      if (!window.mapkit || !currentMapToken || !validPoints(data?.routePoints)) return;
      if (!mapKitInitialized) {
        window.mapkit.addEventListener('error', () => {
          el('map').hidden = true; el('route-fallback').hidden = false;
        });
        window.mapkit.init({
          authorizationCallback: (done) => done(currentMapToken), language: 'en',
        });
        mapKitInitialized = true;
      }
      map ??= new window.mapkit.Map('map', {
        colorScheme: window.mapkit.Map.ColorSchemes.Dark,
        showsCompass: window.mapkit.FeatureVisibility.Hidden,
        showsMapTypeControl: false,
      });
      if (mapItems.length) map.removeItems(mapItems);
      const route = new window.mapkit.PolylineOverlay(data.routePoints, {
        style: new window.mapkit.Style({ strokeColor: '#378ADD', lineWidth: 5, lineJoin: 'round', lineCap: 'round' }),
      });
      const car = new window.mapkit.MarkerAnnotation(data.position, { color: '#378ADD', glyphText: '●', title: 'Current location' });
      mapItems = [route, car];
      if (validPoint(data.destination)) mapItems.push(new window.mapkit.MarkerAnnotation(data.destination, { color: '#21AD81', glyphText: '✓', title: 'Destination' }));
      map.addItems(mapItems); map.showItems(mapItems, { padding: new window.mapkit.Padding(48, 48, 48, 48) });
      el('map').hidden = false; el('route-fallback').hidden = true;
    } catch (_) { el('map').hidden = true; el('route-fallback').hidden = false; }
  }

  function render(data) {
    latest = data; el('loading').hidden = true; el('terminal').hidden = true; el('trip').hidden = false;
    const delayed = data.state === 'delayed';
    el('state-chip').textContent = delayed ? 'Update delayed' : 'Live';
    el('state-chip').classList.toggle('delayed', delayed);
    el('heading').textContent = data.driverFirstName ? `${data.driverFirstName} is on the way` : 'On the way';
    el('destination').hidden = !data.destinationName;
    el('destination').textContent = data.destinationName ? `to ${data.destinationName}` : '';
    const etaAt = new Date(data.etaAt);
    el('arrival').textContent = Number.isFinite(etaAt.getTime()) ? clock(etaAt) : '—';
    el('miles').textContent = finite(data.remainingMiles) ? miles(Math.max(0, data.remainingMiles)) : 'Distance unavailable';
    el('battery').textContent = finite(data.arrivalSoc) ? `Arrival battery ${Math.round(data.arrivalSoc)}%` : 'Arrival battery unavailable';
    el('traffic').textContent = finite(data.trafficDelayMinutes) ? `${Math.max(0, Math.round(data.trafficDelayMinutes))} min` : 'Not reported';
    const progress = finite(data.progress) ? clamp(data.progress, 0, 100) : 0;
    el('progress').setAttribute('aria-valuenow', String(Math.round(progress)));
    el('progress').querySelector('span').style.width = `${progress}%`;
    drawMap(data); tick();
  }

  function tick() {
    if (!latest) return;
    const eta = Date.parse(latest.etaAt);
    const minutes = Number.isFinite(eta) ? Math.max(0, Math.ceil((eta - Date.now()) / 60_000)) : null;
    el('countdown').textContent = minutes == null ? '—' : `${minutes} min`;
    el('freshness').textContent = latest.updatedAt ? ago(latest.updatedAt) : 'Waiting for update';
  }

  async function poll() {
    if (!validToken || document.hidden) return;
    controller?.abort(); controller = new AbortController();
    try {
      const response = await fetch(API, {
        method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, routeVersion: latest?.routeVersion }), signal: controller.signal,
      });
      const responseData = await response.json();
      const data = responseData.state === 'active' || responseData.state === 'delayed'
        ? { ...latest, ...responseData, routePoints: responseData.routePoints ?? latest?.routePoints }
        : responseData;
      if (data.state === 'ended' || data.state === 'expired') terminal(data.state);
      else if (data.state === 'active' || data.state === 'delayed') render(data);
      else terminal('ended');
    } catch (error) {
      if (error.name !== 'AbortError' && latest) {
        latest.state = 'delayed'; render(latest);
      } else if (error.name !== 'AbortError') {
        el('loading').querySelector('p').textContent = 'The latest update is delayed. Retrying…';
      }
    }
  }

  function startPolling() {
    stopPolling(); void poll(); pollTimer = setInterval(poll, POLL_MS); tickTimer = setInterval(tick, 1_000);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer); if (tickTimer) clearInterval(tickTimer);
    pollTimer = null; tickTimer = null; controller?.abort(); controller = null;
  }
  document.addEventListener('visibilitychange', () => document.hidden ? stopPolling() : startPolling());
  if (!validToken) terminal('ended'); else startPolling();
})();
