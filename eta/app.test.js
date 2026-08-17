'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const model = require('./map-model.js');

const source = readFileSync(new URL('./app.js', `file://${__filename}`), 'utf8');
const position = { latitude: 40.7608, longitude: -111.8910 };
const destination = { latitude: 40.7681, longitude: -111.8941 };

const settle = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

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

async function runPage(data, directionsResult) {
  const elements = new Map();
  const maps = [];
  let directionCalls = 0;
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
  const mapkit = {
    addEventListener() {},
    init() {},
    Map: FakeMap,
    FeatureVisibility: { Hidden: 'hidden' },
    Coordinate: class Coordinate { constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); } },
    MarkerAnnotation: class MarkerAnnotation { constructor(point, options) { Object.assign(this, { point, options }); } },
    PolylineOverlay: Overlay,
    Style: class Style { constructor(options) { Object.assign(this, options); } },
    Padding: class Padding {},
    Directions: class Directions {
      async route(request) {
        directionCalls += 1;
        assert.deepEqual(request.origin, position);
        assert.deepEqual(request.destination, destination);
        if (directionsResult instanceof Error) throw directionsResult;
        return directionsResult;
      }
    },
  };
  const document = {
    hidden: false,
    head: { append() {} },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    addEventListener() {},
    createElement() { return element(); },
  };
  const context = vm.createContext({
    AbortController,
    Date,
    console,
    document,
    fetch: async () => ({ json: async () => data }),
    location: { hash: `#${'A'.repeat(43)}` },
    setInterval: () => 1,
    clearInterval() {},
    window: { EtaMapModel: model, mapkit },
  });
  vm.runInContext(source, context);
  await settle();
  await settle();
  return { directionCalls, elements, maps };
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
  assert.equal(result.elements.get('route-source').hidden, true);
  assert.equal(result.elements.get('route-fallback').hidden, true);
});
