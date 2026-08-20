'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const model = require('./map-model.js');

const source = readFileSync(new URL('./app.js', `file://${__filename}`), 'utf8');
const pageSource = readFileSync(new URL('./index.html', `file://${__filename}`), 'utf8');
const position = { latitude: 40.7608, longitude: -111.8910 };
const destination = { latitude: 40.7681, longitude: -111.8941 };

const settle = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

test('pins the MapKit runtime whose callback contract the page implements', () => {
  assert.match(source, /\/mk\/5\.81\.65\/mapkit\.js/);
  assert.doesNotMatch(source, /\/mk\/5\.x\.x\/mapkit\.js/);
});

test('keeps the recipient page focused and exposes a no-install link preview', () => {
  assert.doesNotMatch(pageSource, /class="details"|id="traffic"|id="freshness"|class="privacy"/);
  assert.doesNotMatch(source, /el\('traffic'\)|el\('freshness'\)/);
  assert.doesNotMatch(pageSource, /(?:icon|favicon)\.png/);
  assert.match(pageSource, /property="og:title" content="Live ETA · Ludic Pulse"/);
  assert.match(pageSource, /property="og:description" content="Tap to follow the private live trip\. No app or sign-in required\."/);
  assert.match(pageSource, /property="og:image" content="https:\/\/ludicpulse\.com\/social-card\.png"/);
  assert.match(pageSource, /name="twitter:card" content="summary_large_image"/);
  assert.match(pageSource, /rel="canonical" href="https:\/\/ludicpulse\.com\/eta\/"/);
  assert.doesNotMatch(pageSource, /#[A-Za-z0-9_-]{40,80}/);
  assert.match(pageSource, /class="brand"><span>Ludic Pulse<\/span>/);
});

function element() {
  const children = new Map();
  return {
    hidden: false,
    textContent: '',
    style: {},
    attributes: {},
    classList: { toggle() {} },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element());
      return children.get(selector);
    },
  };
}

async function runPage(data, directionResults) {
  const elements = new Map();
  const maps = [];
  const timers = [];
  const warnings = [];
  const pendingDirections = [];
  const results = Array.isArray(directionResults) ? [...directionResults] : [directionResults];
  let directionCalls = 0;
  let visibilityHandler;
  class FakeMap {
    static ColorSchemes = { Dark: 'dark' };
    constructor() { this.items = []; maps.push(this); }
    addItems(items) { this.items.push(...items); }
    removeItems(items) { this.items = this.items.filter((item) => !items.includes(item)); }
    showItems() {}
  }
  class Overlay {
    constructor(points, options = {}) { this.points = points; this.style = options.style; }
  }
  class Coordinate {
    constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); }
  }
  class Directions {
    static Transport = { Automobile: 'AUTOMOBILE' };
    route(request, callback) {
      directionCalls += 1;
      assert.equal(typeof callback, 'function');
      assert.ok(request.origin instanceof Coordinate);
      assert.ok(request.destination instanceof Coordinate);
      assert.equal(request.transportType, 'AUTOMOBILE');
      assert.equal(request.requestsAlternateRoutes, true);
      const result = results.shift();
      const complete = () => {
        if (result instanceof Error) callback(result);
        else callback(null, result);
      };
      if (result?.deferred) pendingDirections.push(() => {
        if (result.value instanceof Error) callback(result.value);
        else callback(null, result.value);
      });
      else queueMicrotask(complete);
    }
  }
  const mapkit = {
    addEventListener() {},
    init() {},
    Map: FakeMap,
    FeatureVisibility: { Hidden: 'hidden' },
    Coordinate,
    MarkerAnnotation: class MarkerAnnotation { constructor(point, options) { Object.assign(this, { point, options }); } },
    PolylineOverlay: Overlay,
    Style: class Style { constructor(options) { Object.assign(this, options); } },
    Padding: class Padding {},
    Directions,
  };
  const document = {
    hidden: false,
    head: { append() {} },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    addEventListener(name, callback) { if (name === 'visibilitychange') visibilityHandler = callback; },
    createElement() { return element(); },
  };
  const context = vm.createContext({
    AbortController,
    Date,
    console: { warn(message) { warnings.push(message); } },
    document,
    fetch: async () => ({ json: async () => data }),
    location: { hash: `#${'A'.repeat(43)}` },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(callback, delay) {
      const timer = { callback, delay, active: true };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { if (timer) timer.active = false; },
    window: { EtaMapModel: model, mapkit },
  });
  vm.runInContext(source, context);
  await settle();
  await settle();
  return {
    get directionCalls() { return directionCalls; },
    elements,
    maps,
    pendingDirections,
    timers,
    warnings,
    async runNextTimer() {
      const timer = timers.find((candidate) => candidate.active);
      assert.ok(timer, 'expected an active retry timer');
      timer.active = false;
      timer.callback();
      await settle();
      await settle();
    },
    async setHidden(hidden) {
      document.hidden = hidden;
      visibilityHandler();
      await settle();
      await settle();
    },
  };
}

const active = (extra = {}) => ({
  state: 'active',
  mapToken: 'map-token',
  etaAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  updatedAt: new Date().toISOString(),
  remainingMiles: 12,
  progress: 40,
  position,
  destination,
  ...extra,
});

test('draws a labeled Apple estimate chosen with Tesla remaining distance', async () => {
  const short = new (class { constructor() { this.distance = 16_000; this.polyline = { style: null }; } })();
  const match = new (class { constructor() { this.distance = 19_300; this.polyline = { style: null }; } })();
  const result = await runPage(active(), { routes: [short, match] });
  assert.equal(result.directionCalls, 1);
  assert.equal(result.elements.get('route-source').textContent, 'Estimated route');
  assert.equal(result.elements.get('route-source').hidden, false);
  assert.ok(result.maps[0].items.includes(match.polyline));
  assert.ok(!result.maps[0].items.includes(short.polyline));
});

test('prefers exact Tesla route geometry and skips Apple directions', async () => {
  const result = await runPage(active({ routePoints: [position, destination] }), { routes: [] });
  assert.equal(result.directionCalls, 0);
  assert.equal(result.elements.get('route-source').textContent, 'Tesla route');
  assert.equal(result.elements.get('route-source').hidden, false);
});

test('keeps the live endpoint map when Apple directions fails', async () => {
  const result = await runPage(active(), new Error('directions unavailable'));
  assert.equal(result.directionCalls, 1);
  assert.equal(result.elements.get('map').hidden, false);
  assert.equal(result.elements.get('route-source').textContent, 'Route temporarily unavailable · retrying');
  assert.equal(result.elements.get('route-source').hidden, false);
  assert.equal(result.elements.get('route-fallback').hidden, true);
  assert.equal(result.timers.filter((timer) => timer.active)[0].delay, 5_000);
  assert.equal(result.warnings.length, 1);
  assert.doesNotMatch(result.warnings[0], /40\.7608|-111\.891/);
});

test('retries a transient directions failure and draws the recovered route', async () => {
  const recovered = { distance: 19_300, polyline: { style: null } };
  const result = await runPage(active(), [new Error('temporary'), { routes: [recovered] }]);
  assert.equal(result.directionCalls, 1);
  await result.runNextTimer();
  assert.equal(result.directionCalls, 2);
  assert.equal(result.elements.get('route-source').textContent, 'Estimated route');
  assert.ok(result.maps[0].items.includes(recovered.polyline));
});

test('discards a stale directions response after backgrounding and refreshes on return', async () => {
  const stale = { distance: 19_300, polyline: { style: null } };
  const fresh = { distance: 19_100, polyline: { style: null } };
  const result = await runPage(active(), [{ deferred: true, value: { routes: [stale] } }, { routes: [fresh] }]);
  assert.equal(result.directionCalls, 1);
  await result.setHidden(true);
  result.pendingDirections[0]();
  await settle();
  assert.ok(!result.maps[0].items.includes(stale.polyline));
  await result.setHidden(false);
  assert.equal(result.directionCalls, 2);
  assert.ok(result.maps[0].items.includes(fresh.polyline));
});
