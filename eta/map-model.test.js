'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { presentation, validPoint, validPoints } = require('./map-model.js');

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
