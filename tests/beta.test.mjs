import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('homepage exposes beta access in the header and after the Inside the app rows', () => {
  const html = read('index.html');
  assert.match(html, /class="nav-beta" href="\/beta\/"/);
  const hero = html.match(/<section class="subpage-hero[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(hero, /<div class="inside-beta-action"><a class="button button-primary" href="\/beta\/">Join the private beta<\/a><\/div>/);
  assert.doesNotMatch(hero, /See inside Pulse|hero-actions/);
});

test('beta page collects exactly name and email from people', () => {
  assert.ok(existsSync(resolve(root, 'beta/index.html')));
  const html = read('beta/index.html');
  const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? '';
  const visibleInputs = [...main.matchAll(/<input\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((input) => !/name="website"/.test(input));
  assert.equal(visibleInputs.length, 2);
  assert.match(visibleInputs[0], /name="name"/);
  assert.match(visibleInputs[1], /name="email"/);
  assert.deepEqual(visibleInputs.map((input) => input.match(/name="([^"]+)"/)?.[1]), ['name', 'email']);
});

test('beta form uses the owned endpoint and explains the narrow data use', () => {
  const html = read('beta/index.html');
  assert.match(html, /action="https:\/\/telem\.statmask\.com:8443\/api\/public\/beta-signup"/);
  assert.match(html, /method="post"/);
  assert.match(html, /only to contact you about private beta access/i);
  assert.match(html, /href="\/privacy\/"/);
  assert.match(html, /role="status"[^>]*aria-live="polite"/);
});

test('privacy policy discloses the beta notification email processor', () => {
  const privacy = read('privacy/index.html');
  assert.match(privacy, /<strong>Resend<\/strong>/);
  assert.match(privacy, /name, email address, and submission time/);
});

test('beta behavior sends only the two requested fields and handles every state', () => {
  const script = read('site.js');
  assert.match(script, /data-beta-form/);
  assert.match(script, /name:\s*formData\.get\('name'\)/);
  assert.match(script, /email:\s*formData\.get\('email'\)/);
  assert.match(script, /website:\s*formData\.get\('website'\)/);
  assert.match(script, /response\.ok/);
  assert.match(script, /beta-form--success/);
  assert.match(script, /beta-form--error/);
  assert.doesNotMatch(script, /phone|vin|vehicle|company|newsletter|analytics/i);
});
