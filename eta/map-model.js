((root, factory) => {
  const model = factory();
  root.EtaMapModel = model;
  if (typeof module === 'object' && module.exports) module.exports = model;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const validPoint = (value) => Boolean(value && finite(value.latitude) && finite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180);
  const validPoints = (value) => Array.isArray(value) && value.length >= 2
    && value.length <= 10_000 && value.every(validPoint);

  function presentation(data) {
    const hasPosition = validPoint(data?.position);
    const hasDestination = validPoint(data?.destination);
    const hasRoute = validPoints(data?.routePoints);
    return {
      hasPosition,
      hasDestination,
      hasRoute,
      canRenderMap: typeof data?.mapToken === 'string' && data.mapToken.length > 0 && hasPosition,
    };
  }

  return { validPoint, validPoints, presentation };
});
