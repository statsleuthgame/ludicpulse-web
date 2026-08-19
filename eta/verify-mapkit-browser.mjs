import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const token = process.env.MAPKIT_TEST_TOKEN;
if (!token || token.split('.').length !== 3) {
  throw new Error('Set MAPKIT_TEST_TOKEN to a current https://ludicpulse.com MapKit JS token.');
}

const chromePath = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = await mkdtemp(join(tmpdir(), 'ludic-mapkit-browser-'));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function devtoolsTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await json(`http://127.0.0.1:${port}/json/list`);
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* Chrome is still starting. */ }
    await delay(100);
  }
  throw new Error('Chrome DevTools did not become ready.');
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else {
      events.push(message);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const waitFor = async (method) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const index = events.findIndex((event) => event.method === method);
      if (index >= 0) return events.splice(index, 1)[0];
      await delay(50);
    }
    throw new Error(`Timed out waiting for ${method}.`);
  };
  return { events, send, socket, waitFor };
}

try {
  const target = await devtoolsTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: 'https://ludicpulse.com/' });
  let lastState;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: '({ href: location.href, readyState: document.readyState })',
      returnByValue: true,
    });
    lastState = state.result.value;
    if (state.result.value?.href === 'https://ludicpulse.com/'
      && state.result.value?.readyState === 'complete') break;
    if (attempt === 99) throw new Error(`Production origin did not finish loading: ${JSON.stringify(lastState)}.`);
    await delay(50);
  }

  const expression = `
    (async () => {
      const load = (src) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load ' + src));
        document.head.append(script);
      });
      await load('https://cdn.apple-mapkit.com/mk/5.81.65/mapkit.js');
      await load('/eta/map-model.js?v=20260819-clean');
      mapkit.init({ authorizationCallback: (done) => done(${JSON.stringify(token)}), language: 'en' });
      const mapElement = document.createElement('div');
      mapElement.style.cssText = 'width:640px;height:420px';
      document.body.append(mapElement);
      const map = new mapkit.Map(mapElement);
      const origin = { latitude: 40.7608, longitude: -111.8910 };
      const destination = { latitude: 40.7681, longitude: -111.8941 };
      const response = await EtaMapModel.requestAppleRoute(mapkit, origin, destination);
      const route = EtaMapModel.selectAppleRoute(response.routes, 1);
      if (!route?.polyline) throw new Error('Apple returned no usable route polyline.');
      route.polyline.style = new mapkit.Style({ strokeColor: '#378ADD', lineWidth: 5 });
      map.addItems([route.polyline]);
      map.showItems([route.polyline]);
      return { version: mapkit.version, routes: response.routes.length, distance: route.distance };
    })()
  `;
  const evaluation = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (evaluation.exceptionDetails) {
    const failures = cdp.events
      .filter((event) => event.method === 'Network.loadingFailed')
      .map((event) => event.params.errorText)
      .join(', ');
    const description = evaluation.exceptionDetails.exception?.description
      ?? evaluation.exceptionDetails.text ?? 'Browser evaluation failed.';
    throw new Error(`${description}${failures ? ` Network: ${failures}.` : ''}`);
  }
  const result = evaluation.result.value;
  if (result.version !== '5.81.65' || result.routes < 1 || !(result.distance > 0)) {
    throw new Error(`Unexpected MapKit result: ${JSON.stringify(result)}`);
  }
  console.log(`MapKit ${result.version}: ${result.routes} real route(s), selected distance ${Math.round(result.distance)} m.`);
  cdp.socket.close();
} finally {
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill('SIGTERM');
  await Promise.race([exited, delay(2_000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
