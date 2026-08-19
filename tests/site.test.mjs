import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const pagePaths = [
  'index.html',
  'pulse/index.html',
  'hub/index.html',
  'support/index.html',
  'privacy/index.html',
  'terms/index.html',
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

function localTarget(pagePath, value) {
  if (/^(?:https?:|mailto:|tel:|data:|#)/.test(value)) return null;
  const clean = value.split('#')[0].split('?')[0];
  if (!clean) return null;
  const target = clean.startsWith('/')
    ? join(root, clean)
    : resolve(root, dirname(pagePath), clean);
  return clean.endsWith('/') ? join(target, 'index.html') : target;
}

test('homepage communicates the company and both product roles', () => {
  const html = read('index.html');
  assert.match(html, /Connected technology, built around the driver/);
  assert.match(html, /Ludic Pulse/);
  assert.match(html, /Ludic Hub/);
  assert.match(html, /href="\/pulse\/"/);
  assert.match(html, /href="\/hub\/"/);
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Tesla/);
});

test('Pulse has its own page and states the current product boundaries', () => {
  const html = read('pulse/index.html');
  assert.match(html, /Free US beta/);
  assert.match(html, /authorized Tesla access/);
  assert.match(html, /Ludic hardware is not required/);
  assert.match(html, /Share ETA/);
  assert.match(html, /aria-current="page">Pulse/);
});

test('Hub page is specific about capabilities without inventing launch facts', () => {
  const html = read('hub/index.html');
  assert.match(html, /In development/);
  assert.match(html, /archiving TeslaCam footage/);
  assert.match(html, /private Wi-Fi/);
  assert.match(html, /price, and availability are not yet announced/);
  assert.doesNotMatch(html, /gap-free recording|cloud-surveillance/i);
  assert.doesNotMatch(html, /available (?:now|today)|ships? (?:now|on)|\$\d+/i);
});

test('brand system uses the locked colors and exact approved wordmark asset', () => {
  const css = read('styles.css');
  assert.match(css, /--green: #21ad81;/);
  assert.match(css, /--blue: #378add;/);
  assert.ok(existsSync(join(root, 'assets/ludic-technologies-wordmark.png')));
  assert.ok(existsSync(join(root, 'social-card.png')));
});

test('all public pages include baseline accessibility structure', () => {
  for (const pagePath of pagePaths) {
    const html = read(pagePath);
    assert.match(html, /<html lang="en">/, pagePath);
    assert.match(html, /class="skip-link" href="#main"/, pagePath);
    assert.match(html, /<main id="main"[^>]*tabindex="-1"/, pagePath);
    assert.match(html, /aria-label="Main navigation"/, pagePath);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, pagePath);
    for (const image of html.match(/<img\b[^>]*>/g) ?? []) {
      assert.match(image, /\balt="[^"]*"/, `${pagePath}: ${image}`);
    }
  }
});

test('public HTML never displays or advertises the Pulse app icon', () => {
  const publicPages = [...pagePaths, 'eta/index.html', 'auth/tesla/callback/index.html'];
  for (const pagePath of publicPages) {
    assert.doesNotMatch(read(pagePath), /(?:icon|favicon)\.png/i, pagePath);
  }
});

test('local links and assets referenced by company pages resolve', () => {
  for (const pagePath of pagePaths) {
    const html = read(pagePath);
    const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1]);
    for (const reference of references) {
      const target = localTarget(pagePath, reference);
      if (!target) continue;
      assert.ok(existsSync(target), `${pagePath}: missing ${reference}`);
    }
  }
});

test('legal, support, Tesla, and Shared ETA routes remain present', () => {
  const required = [
    'pulse/index.html',
    'support/index.html',
    'privacy/index.html',
    'terms/index.html',
    'eta/index.html',
    '.well-known/appspecific/com.tesla.3p.public-key.pem',
    'CNAME',
  ];
  for (const relativePath of required) {
    assert.ok(existsSync(join(root, relativePath)), relativePath);
  }
});
