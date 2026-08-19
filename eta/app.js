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
  let estimatedRoute = null;
  let estimateBasis = null;
  let estimateGeneration = 0;
  let estimateFailures = 0;
  let estimateRetryTimer = null;

  const validToken = /^[A-Za-z0-9_-]{40,80}$/.test(token);
  const {
    validPoint, validPoints, presentation, requestAppleRoute, selectAppleRoute,
    shouldRefreshEstimate,
  } = window.EtaMapModel;
  const ESTIMATE_RETRY_MS = [5_000, 15_000, 60_000];
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const clock = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const miles = (value) => `${value < 10 ? value.toFixed(1) : Math.round(value)} mi left`;
  function terminal(state) {
    el('loading').hidden = true; el('trip').hidden = true; el('terminal').hidden = false;
    el('terminal-title').textContent = state === 'expired' ? 'Link expired' : 'Sharing ended';
    el('terminal-body').textContent = state === 'expired'
      ? 'This four-hour private link has expired.' : 'The driver arrived, stopped sharing, or changed destinations.';
    stopPolling();
  }

  function svgRoute(points, progress, position) {
    const svg = el('route-fallback');
    if (!validPoints(points)) { svg.hidden = true; return; }
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

  function showMapFallback(data) {
    const hasRoute = validPoints(data?.routePoints);
    el('map').hidden = true;
    el('route-fallback').hidden = !hasRoute;
    el('map-unavailable').hidden = hasRoute;
    el('route-source').hidden = true;
  }

  function routeLabel(value) {
    el('route-source').hidden = !value;
    el('route-source').textContent = value || '';
  }

  function drawMap(data) {
    svgRoute(data.routePoints, data.progress, data.position);
    el('map-unavailable').hidden = true;
    const model = presentation(data);
    if (!model.canRenderMap) { showMapFallback(data); return; }
    currentMapToken = data.mapToken;
    if (window.mapkit) { renderMapKit(data); return; }
    if (mapScriptLoading) return;
    mapScriptLoading = true;
    const script = document.createElement('script');
    script.src = 'https://cdn.apple-mapkit.com/mk/5.81.65/mapkit.js';
    script.onload = () => renderMapKit(latest);
    script.onerror = () => { mapScriptLoading = false; showMapFallback(latest); };
    document.head.append(script);
  }

  function renderMapKit(data) {
    try {
      const model = presentation(data);
      if (!window.mapkit || !currentMapToken || !model.hasPosition) return;
      if (!mapKitInitialized) {
        window.mapkit.addEventListener('error', () => {
          showMapFallback(latest);
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
      const coordinate = (point) => new window.mapkit.Coordinate(point.latitude, point.longitude);
      const car = new window.mapkit.MarkerAnnotation(coordinate(data.position), { color: '#378ADD', glyphText: '●', title: 'Current location' });
      mapItems = [car];
      if (model.hasRoute) {
        cancelEstimateWork(); estimatedRoute = null; estimateBasis = null; estimateFailures = 0;
        mapItems.unshift(new window.mapkit.PolylineOverlay(data.routePoints.map(coordinate), {
          style: new window.mapkit.Style({ strokeColor: '#378ADD', lineWidth: 5, lineJoin: 'round', lineCap: 'round' }),
        }));
        routeLabel('Tesla route');
      } else if (estimatedRoute?.polyline) {
        estimatedRoute.polyline.style = new window.mapkit.Style({
          strokeColor: '#378ADD', lineWidth: 5, lineJoin: 'round', lineCap: 'round',
        });
        mapItems.unshift(estimatedRoute.polyline);
        routeLabel('Estimated route');
      } else {
        routeLabel(null);
      }
      if (validPoint(data.destination)) mapItems.push(new window.mapkit.MarkerAnnotation(coordinate(data.destination), { color: '#21AD81', glyphText: '✓', title: 'Destination' }));
      map.addItems(mapItems); map.showItems(mapItems, { padding: new window.mapkit.Padding(48, 48, 48, 48) });
      el('map').hidden = false; el('route-fallback').hidden = true; el('map-unavailable').hidden = true;
      requestEstimatedRoute(data);
    } catch (error) {
      console.warn(`[Ludic Pulse] Map rendering failed (${typeof error?.name === 'string' ? error.name : 'Error'}).`);
      showMapFallback(data);
    }
  }

  function cancelEstimateWork() {
    estimateGeneration += 1;
    if (estimateRetryTimer) clearTimeout(estimateRetryTimer);
    estimateRetryTimer = null;
  }

  function scheduleEstimateRetry() {
    if (estimateRetryTimer || !latest || validPoints(latest.routePoints)) return;
    const delay = ESTIMATE_RETRY_MS[Math.min(estimateFailures - 1, ESTIMATE_RETRY_MS.length - 1)];
    estimateRetryTimer = setTimeout(() => {
      estimateRetryTimer = null;
      void requestEstimatedRoute(latest, true);
    }, delay);
  }

  async function requestEstimatedRoute(data, force = false) {
    if (!window.mapkit || (!force && !shouldRefreshEstimate(estimateBasis, data))) return;
    if (estimateRetryTimer) clearTimeout(estimateRetryTimer);
    estimateRetryTimer = null;
    const requestGeneration = ++estimateGeneration;
    estimateBasis = { position: data.position, destination: data.destination, at: Date.now() };
    if (!estimatedRoute) routeLabel('Calculating route…');
    try {
      const response = await requestAppleRoute(window.mapkit, data.position, data.destination);
      if (requestGeneration !== estimateGeneration || !latest || validPoints(latest.routePoints)) return;
      const route = selectAppleRoute(response?.routes, data.remainingMiles);
      if (!route) throw new Error('MapKit returned no usable route');
      estimatedRoute = route;
      estimateFailures = 0;
      renderMapKit(latest);
    } catch (error) {
      if (requestGeneration !== estimateGeneration) return;
      estimateFailures += 1;
      if (!estimatedRoute) routeLabel('Route temporarily unavailable · retrying');
      const reason = typeof error?.name === 'string' ? error.name : 'Error';
      console.warn(`[Ludic Pulse] Estimated route request failed (${reason}).`);
      scheduleEstimateRetry();
    }
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
    cancelEstimateWork(); estimateBasis = null;
  }
  document.addEventListener('visibilitychange', () => document.hidden ? stopPolling() : startPolling());
  if (!validToken) terminal('ended'); else startPolling();
})();
