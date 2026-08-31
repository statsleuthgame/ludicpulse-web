'use strict';

const API = 'https://telem.statmask.com:8443/api/public/eta/state';
const POLL_MS = 10_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,80}$/;

let token = null;
let routeVersion;
let pollTimer = null;
let controller = null;

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  controller?.abort();
  controller = null;
}

async function poll() {
  if (!token) return;
  controller?.abort();
  const requestController = new AbortController();
  controller = requestController;
  try {
    const response = await fetch(API, {
      method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, routeVersion }), signal: requestController.signal,
    });
    const data = await response.json();
    if (data && typeof data === 'object'
      && Object.prototype.hasOwnProperty.call(data, 'routeVersion')) {
      routeVersion = data.routeVersion;
    }
    self.postMessage({ type: 'state', data });
  } catch (error) {
    if (error.name !== 'AbortError') self.postMessage({ type: 'error' });
  } finally {
    if (controller === requestController) controller = null;
  }
}

function startPolling() {
  if (!token || pollTimer) return;
  void poll();
  pollTimer = setInterval(poll, POLL_MS);
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'initialize') {
    if (token) return;
    if (typeof message.token !== 'string' || !TOKEN_PATTERN.test(message.token)) {
      self.postMessage({ type: 'invalid' });
      return;
    }
    token = message.token;
    self.postMessage({ type: 'ready' });
    return;
  }
  if (message.type === 'start') startPolling();
  else if (message.type === 'stop') stopPolling();
});
