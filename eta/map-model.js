((root, factory) => {
  const model = factory();
  root.EtaMapModel = model;
  if (typeof module === 'object' && module.exports) module.exports = model;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const METERS_PER_MILE = 1609.344;
  const ESTIMATE_REFRESH_MS = 60_000;
  const ESTIMATE_MOVE_DEGREES_SQUARED = 0.004 * 0.004;
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

  function selectAppleRoute(routes, remainingMiles) {
    const usable = Array.isArray(routes)
      ? routes.filter((route) => route && finite(route.distance) && route.distance > 0 && route.polyline)
      : [];
    if (!usable.length) return null;
    if (!finite(remainingMiles) || remainingMiles <= 0) return usable[0];
    const targetMeters = remainingMiles * METERS_PER_MILE;
    return usable.reduce((best, route) => (
      Math.abs(route.distance - targetMeters) < Math.abs(best.distance - targetMeters) ? route : best
    ));
  }

  function pointsDiffer(a, b) {
    if (!validPoint(a) || !validPoint(b)) return true;
    const latitude = a.latitude - b.latitude;
    const longitude = a.longitude - b.longitude;
    return latitude * latitude + longitude * longitude >= ESTIMATE_MOVE_DEGREES_SQUARED;
  }

  function shouldRefreshEstimate(previous, data, now = Date.now()) {
    if (validPoints(data?.routePoints) || !validPoint(data?.position) || !validPoint(data?.destination)) {
      return false;
    }
    if (!previous) return true;
    if (pointsDiffer(previous.destination, data.destination)) return true;
    if (pointsDiffer(previous.position, data.position)) return true;
    return !finite(previous.at) || now - previous.at >= ESTIMATE_REFRESH_MS;
  }

  function requestAppleRoute(mapkit, origin, destination, departureDate = new Date()) {
    if (!mapkit?.Coordinate || !mapkit?.Directions || !validPoint(origin) || !validPoint(destination)) {
      return Promise.reject(new Error('MapKit directions are unavailable'));
    }
    return new Promise((resolve, reject) => {
      const directions = new mapkit.Directions();
      const request = {
        origin: new mapkit.Coordinate(origin.latitude, origin.longitude),
        destination: new mapkit.Coordinate(destination.latitude, destination.longitude),
        transportType: mapkit.Directions.Transport.Automobile,
        requestsAlternateRoutes: true,
        departureDate,
      };
      directions.route(request, (error, response) => {
        if (error) reject(error);
        else if (response) resolve(response);
        else reject(new Error('MapKit returned no directions response'));
      });
    });
  }

  return {
    validPoint, validPoints, presentation, requestAppleRoute, selectAppleRoute, shouldRefreshEstimate,
  };
});
