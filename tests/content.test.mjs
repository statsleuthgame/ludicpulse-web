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
  assert.match(main, /Connected technology, built around the driver/);
  assert.match(main, /href="\/pulse\/"/);
  assert.match(main, /href="\/hub\/"/);
  assert.doesNotMatch(main, /class="hero-mark|(?:icon|favicon)\.png/i);
});

test('Pulse stays concise while covering the app essentials', () => {
  const main = mainMarkup(read('pulse/index.html'));
  assert.equal((main.match(/<section\b/g) ?? []).length, 3);
  assert.ok(wordCount(main) <= 240, `Pulse has ${wordCount(main)} words`);
  assert.match(main, /Check and control/);
  assert.match(main, /Understand/);
  assert.match(main, /Share ETA/);
  assert.match(main, /hardware is not required/);
});

test('Hub stays concise and distinguishes present direction from launch facts', () => {
  const main = mainMarkup(read('hub/index.html'));
  assert.equal((main.match(/<section\b/g) ?? []).length, 3);
  assert.ok(wordCount(main) <= 240, `Hub has ${wordCount(main)} words`);
  assert.match(main, /Archive/);
  assert.match(main, /Find/);
  assert.match(main, /Download/);
  assert.match(main, /not yet announced and may change/);
});

test('primary navigation contains only the three user destinations', () => {
  for (const pagePath of ['index.html', 'pulse/index.html', 'hub/index.html', 'support/index.html', 'privacy/index.html', 'terms/index.html']) {
    const html = read(pagePath);
    const nav = html.match(/<nav id="site-nav"[\s\S]*?<\/nav>/)?.[0] ?? '';
    assert.equal((nav.match(/<a\b/g) ?? []).length, 3, pagePath);
    assert.doesNotMatch(nav, /Why Ludic|principles/, pagePath);
  }
});
