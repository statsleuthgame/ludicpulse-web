'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  presentation, requestAppleRoute, selectAppleRoute, shouldRefreshEstimate, validPoint, validPoints,
} = require('./map-model.js');

const position = { latitude: 40.7608, longitude: -111.8910 };
const destination = { latitude: 40.7681, longitude: -111.8941 };

test('renders Apple Maps from live endpoints when Tesla omits RouteLine', () => {
  assert.deepEqual(presentation({ mapToken: 'token', position, destination }), {
    hasPosition: true,
    hasDestination: true,
    hasRoute: false,
    canRenderMap: true,
  });
});

test('adds Tesla route geometry only when every route point is valid', () => {
  assert.equal(presentation({
    mapToken: 'token', position, destination, routePoints: [position, destination],
  }).hasRoute, true);
  assert.equal(validPoints([position, { latitude: 95, longitude: 0 }]), false);
});

test('does not attempt a live map without a current vehicle position', () => {
  assert.equal(presentation({ mapToken: 'token', destination }).canRenderMap, false);
  assert.equal(presentation({ position, destination }).canRenderMap, false);
});

test('rejects malformed, non-finite, and out-of-bounds coordinates', () => {
  assert.equal(validPoint(null), false);
  assert.equal(validPoint({ latitude: Number.NaN, longitude: 0 }), false);
  assert.equal(validPoint({ latitude: 0, longitude: 181 }), false);
});

test('selects the Apple route closest to Tesla remaining distance', () => {
  const routes = [
    { distance: 16_000, polyline: { id: 'short' } },
    { distance: 19_300, polyline: { id: 'match' } },
    { distance: 24_000, polyline: { id: 'long' } },
  ];
  assert.equal(selectAppleRoute(routes, 12).polyline.id, 'match');
  assert.equal(selectAppleRoute(routes, undefined).polyline.id, 'short');
});

test('rejects unusable Apple directions results', () => {
  assert.equal(selectAppleRoute(null, 12), null);
  assert.equal(selectAppleRoute([{ distance: Number.NaN, polyline: {} }], 12), null);
  assert.equal(selectAppleRoute([{ distance: 19_000 }], 12), null);
});

test('refreshes an estimated route only for meaningful route changes', () => {
  const previous = { position, destination, at: 1_000 };
  const steady = { position: { latitude: 40.761, longitude: -111.891 }, destination };
  assert.equal(shouldRefreshEstimate(null, steady, 2_000), true);
  assert.equal(shouldRefreshEstimate(previous, steady, 50_000), false);
  assert.equal(shouldRefreshEstimate(previous, steady, 61_001), true);
  assert.equal(shouldRefreshEstimate(previous, {
    position: { latitude: 40.765, longitude: -111.891 }, destination,
  }, 2_000), true);
  assert.equal(shouldRefreshEstimate(previous, {
    position, destination: { latitude: 40.78, longitude: -111.89 },
  }, 2_000), true);
});

test('never estimates when Tesla geometry exists or endpoints are incomplete', () => {
  assert.equal(shouldRefreshEstimate(null, { position, destination, routePoints: [position, destination] }), false);
  assert.equal(shouldRefreshEstimate(null, { position }), false);
  assert.equal(shouldRefreshEstimate(null, { destination }), false);
});

test('uses the MapKit 5 callback contract with Coordinate instances and automobile routing', async () => {
  let captured;
  class Coordinate {
    constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); }
  }
  class Directions {
    static Transport = { Automobile: 'AUTOMOBILE' };
    route(request, callback) {
      captured = { request, callback };
      callback(null, { routes: [{ distance: 1, polyline: {} }] });
    }
  }
  const response = await requestAppleRoute({ Coordinate, Directions }, position, destination, new Date(0));
  assert.ok(captured.request.origin instanceof Coordinate);
  assert.ok(captured.request.destination instanceof Coordinate);
  assert.equal(captured.request.transportType, 'AUTOMOBILE');
  assert.equal(captured.request.requestsAlternateRoutes, true);
  assert.equal(typeof captured.callback, 'function');
  assert.equal(response.routes.length, 1);
});

test('rejects MapKit callback failures, empty responses, and unavailable directions', async () => {
  class Coordinate {
    constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); }
  }
  class FailedDirections {
    static Transport = { Automobile: 'AUTOMOBILE' };
    route(_request, callback) { callback(new Error('service failed')); }
  }
  class EmptyDirections {
    static Transport = { Automobile: 'AUTOMOBILE' };
    route(_request, callback) { callback(null, null); }
  }
  await assert.rejects(requestAppleRoute({ Coordinate, Directions: FailedDirections }, position, destination), /service failed/);
  await assert.rejects(requestAppleRoute({ Coordinate, Directions: EmptyDirections }, position, destination), /no directions response/);
  await assert.rejects(requestAppleRoute({}, position, destination), /unavailable/);
});
