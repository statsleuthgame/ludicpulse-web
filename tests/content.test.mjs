import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function mainMarkup(html) {
  return html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? '';
}

function wordCount(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

test('homepage is a concise company gateway to separate product pages', () => {
  const main = mainMarkup(read('index.html'));
  assert.equal((main.match(/<section\b/g) ?? []).length, 3);
  assert.ok(wordCount(main) <= 180, `homepage has ${wordCount(main)} words`);
  assert.match(main, /Tesla data on your phone/);
  assert.match(main, /Pulse is the app\. Hub is optional hardware/);
  assert.match(main, /href="\/pulse\/"/);
  assert.match(main, /href="\/hub\/"/);
  assert.doesNotMatch(main, /class="hero-mark|(?:icon|favicon)\.png/i);
  assert.doesNotMatch(main, /Connected technology|Choose where you want to go|Clear products\. Clear boundaries/i);
});

test('Pulse stays concise while covering the app essentials', () => {
  const main = mainMarkup(read('pulse/index.html'));
  assert.equal((main.match(/<section\b/g) ?? []).length, 3);
  assert.ok(wordCount(main) <= 240, `Pulse has ${wordCount(main)} words`);
  assert.match(main, /accepted requests from confirmed changes/);
  assert.match(main, /Drives and charging/);
  assert.match(main, /Shared ETA/);
  assert.match(main, /hardware is not required/);
  assert.match(main, /pulse-charging\.png/);
  assert.match(main, /pulse-insights\.png/);
  assert.doesNotMatch(main, /capability-card|The information you need, without the noise/i);
});

test('Hub stays concise and distinguishes present direction from launch facts', () => {
  const main = mainMarkup(read('hub/index.html'));
  assert.equal((main.match(/<section\b/g) ?? []).length, 3);
  assert.ok(wordCount(main) <= 240, `Hub has ${wordCount(main)} words`);
  assert.match(main, /Keep TeslaCam footage local/);
  assert.match(main, /Archive/);
  assert.match(main, /Browse/);
  assert.match(main, /Transfer/);
  assert.match(main, /have not been announced and may change/);
  assert.doesNotMatch(main, /hub-device|system-packet|finally organized|Built locally\. Still taking shape/i);
});

test('support leads with actionable setup and omits the duplicated generated stylesheet', () => {
  const html = read('support/index.html');
  assert.match(html, /<h1>Support<\/h1>/);
  assert.match(html, /Sign in with Apple/);
  assert.match(html, /Connect Tesla/);
  assert.match(html, /Finish tracking setup/);
  assert.doesNotMatch(html, /<style>/);
});

test('legal pages keep their substantive disclosures without duplicated page CSS', () => {
  for (const pagePath of ['privacy/index.html', 'terms/index.html']) {
    const html = read(pagePath);
    assert.doesNotMatch(html, /<style>/, pagePath);
    assert.match(html, /Ludic Technologies LLC/, pagePath);
    assert.match(html, /support@ludicpulse\.com/, pagePath);
  }
});

test('primary navigation contains only the three user destinations', () => {
  for (const pagePath of ['index.html', 'pulse/index.html', 'hub/index.html', 'support/index.html', 'privacy/index.html', 'terms/index.html']) {
    const html = read(pagePath);
    const nav = html.match(/<nav id="site-nav"[\s\S]*?<\/nav>/)?.[0] ?? '';
    assert.equal((nav.match(/<a\b/g) ?? []).length, 3, pagePath);
    assert.doesNotMatch(nav, /Why Ludic|principles/, pagePath);
  }
});
