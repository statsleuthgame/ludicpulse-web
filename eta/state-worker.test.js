'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(new URL('./state-worker.js', `file://${__filename}`), 'utf8');
const settle = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

function error(name) {
  const value = new Error(name);
  value.name = name;
  return value;
}

function createHarness(responses = []) {
  const fetchCalls = [];
  const messages = [];
  const timers = [];
  let messageHandler;
  const queue = [...responses];
  const self = {
    addEventListener(name, callback) {
      if (name === 'message') messageHandler = callback;
    },
    postMessage(message) { messages.push(JSON.parse(JSON.stringify(message))); },
  };
  const context = vm.createContext({
    AbortController,
    clearInterval(timer) { if (timer) timer.active = false; },
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      const response = queue.shift();
      if (response instanceof Error) throw response;
      if (response?.deferred) return new Promise(() => {});
      return { json: async () => response };
    },
    self,
    setInterval(callback, delay) {
      const timer = { active: true, callback, delay };
      timers.push(timer);
      return timer;
    },
  });
  vm.runInContext(source, context);
  return {
    fetchCalls,
    messages,
    timers,
    async send(data) {
      messageHandler({ data });
      await settle();
    },
    async runActiveTimer() {
      const timer = timers.find((candidate) => candidate.active);
      assert.ok(timer, 'expected an active polling timer');
      timer.callback();
      await settle();
    },
  };
}

test('owns the bearer and carries only route version across polls', async () => {
  const token = 'A'.repeat(43);
  const harness = createHarness([
    { state: 'active', routeVersion: 7 },
    { state: 'active', routeVersion: 8 },
  ]);
  await harness.send({ type: 'initialize', token });
  assert.equal(harness.fetchCalls.length, 0);
  await harness.send({ type: 'start' });

  assert.equal(harness.fetchCalls[0].url, 'https://telem.statmask.com:8443/api/public/eta/state');
  assert.deepEqual(JSON.parse(harness.fetchCalls[0].options.body), { token });
  assert.equal(harness.fetchCalls[0].options.method, 'POST');
  assert.equal(harness.fetchCalls[0].options.cache, 'no-store');
  assert.equal(harness.fetchCalls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(harness.timers[0].delay, 10_000);
  assert.deepEqual(harness.messages[0], { type: 'ready' });
  assert.deepEqual(harness.messages[1], {
    type: 'state', data: { state: 'active', routeVersion: 7 },
  });

  await harness.runActiveTimer();
  assert.deepEqual(JSON.parse(harness.fetchCalls[1].options.body), { token, routeVersion: 7 });
});

test('rejects malformed tokens and never replaces an initialized bearer', async () => {
  const invalid = createHarness();
  await invalid.send({ type: 'initialize', token: 'short' });
  await invalid.send({ type: 'start' });
  assert.deepEqual(invalid.messages, [{ type: 'invalid' }]);
  assert.equal(invalid.fetchCalls.length, 0);

  const original = 'A'.repeat(43);
  const replacement = 'B'.repeat(43);
  const initialized = createHarness([{ state: 'active' }]);
  await initialized.send({ type: 'initialize', token: original });
  await initialized.send({ type: 'initialize', token: replacement });
  await initialized.send({ type: 'start' });
  assert.deepEqual(JSON.parse(initialized.fetchCalls[0].options.body), { token: original });
});

test('stops and resumes polling without retransmitting the bearer to the page', async () => {
  const token = 'A'.repeat(43);
  const harness = createHarness([{ deferred: true }, { state: 'active' }]);
  await harness.send({ type: 'initialize', token });
  await harness.send({ type: 'start' });
  const firstSignal = harness.fetchCalls[0].options.signal;
  await harness.send({ type: 'stop' });
  assert.equal(firstSignal.aborted, true);
  assert.equal(harness.timers[0].active, false);

  await harness.send({ type: 'start' });
  assert.equal(harness.fetchCalls.length, 2);
  assert.ok(harness.messages.every((message) => !Object.hasOwn(message, 'token')));
});

test('reports network failures without exposing errors or aborted requests', async () => {
  const token = 'A'.repeat(43);
  const harness = createHarness([error('NetworkError'), error('AbortError')]);
  await harness.send({ type: 'initialize', token });
  await harness.send({ type: 'start' });
  assert.deepEqual(harness.messages, [{ type: 'ready' }, { type: 'error' }]);

  await harness.send({ type: 'stop' });
  await harness.send({ type: 'start' });
  assert.deepEqual(harness.messages, [{ type: 'ready' }, { type: 'error' }]);
});
