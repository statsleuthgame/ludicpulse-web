import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
const script = readFileSync(resolve(root, 'site.js'), 'utf8');
const pagePaths = ['index.html', 'pulse/index.html', 'hub/index.html', 'support/index.html', 'privacy/index.html', 'terms/index.html', 'beta/index.html'];

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => Number.parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('dim text meets WCAG AA contrast on every shared dark surface', () => {
  const dim = css.match(/--dim:\s*(#[a-f\d]{6})/i)?.[1];
  assert.ok(dim);
  for (const background of ['#050506', '#080809', '#0d0e10']) {
    assert.ok(contrast(dim, background) >= 4.5, `${dim} on ${background}`);
  }
});

test('skip links have a focusable destination and scripted focus transfer', () => {
  for (const pagePath of pagePaths) {
    assert.match(read(pagePath), /<main id="main"[^>]*tabindex="-1"/, pagePath);
  }
  assert.match(script, /document\.querySelectorAll\('\.skip-link'\)/);
  assert.match(script, /target\?\.focus/);
});

test('mobile navigation supports containment, Escape, and focus restoration', () => {
  assert.match(script, /event\.key === 'Escape'/);
  assert.match(script, /setPageInert\(true\)/);
  assert.match(script, /event\.key !== 'Tab'/);
  assert.match(script, /closeMenu\(\{ restoreFocus: true \}\)/);
  assert.match(script, /!focusable\.includes\(document\.activeElement\)/);
});

test('mobile navigation owns the viewport below the header', () => {
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.site-nav \{[\s\S]*?position: fixed;[\s\S]*?top: 68px;[\s\S]*?height: calc\(100dvh - 68px\);[\s\S]*?overflow-y: auto;[\s\S]*?background: var\(--black\);/);
  const headerRule = css.match(/\.site-header \{([^}]*)\}/)?.[1] ?? '';
  assert.match(headerRule, /background: var\(--black\)/);
  assert.doesNotMatch(headerRule, /backdrop-filter|transform|perspective/);
  const layerMove = script.indexOf('document.body.append(menu)');
  const layerRestore = script.indexOf('requestAnimationFrame(reattachMenu)', layerMove);
  assert.ok(layerMove >= 0 && layerRestore > layerMove);
  assert.equal(script.match(/requestAnimationFrame\(reattachMenu\)/g)?.length, 2);
  assert.match(script, /queueMicrotask\(\(\) => requestAnimationFrame\(reattachMenu\)\)/);
});

test('mobile navigation restores its opening scroll position when dismissed', () => {
  assert.match(script, /menuScrollY = window\.scrollY/);
  assert.match(script, /document\.body\.style\.top = `-\$\{menuScrollY\}px`/);
  assert.match(css, /body\.menu-open \{[^}]*position: fixed;/);
  assert.match(script, /const scrollYToRestore = menuScrollY/);
  assert.match(script, /window\.scrollTo\(0, scrollYToRestore\)/);
  assert.match(script, /closeMenu\(\{ restoreScroll: false \}\)/);
});

test('named visual groups use supported semantic elements', () => {
  assert.doesNotMatch(read('index.html'), /<figure class="hero-mark|(?:icon|favicon)\.png/);
  assert.match(read('index.html'), /<figure class="pulse-carousel[^>]*aria-roledescription="carousel"/);
  assert.match(read('pulse/index.html'), /<figcaption/);
  assert.match(read('hub/index.html'), /<ol class="hub-flow[^>]*aria-label/);
  assert.match(read('pulse/index.html'), /<div class="screen-reel[^>]*role="region"[^>]*aria-label/);
  for (const pagePath of pagePaths) {
    assert.doesNotMatch(read(pagePath), /<div(?![^>]*role="(?:group|region)")[^>]*aria-label=/, pagePath);
  }
});

test('mobile product headlines use a bounded size and can wrap safely', () => {
  assert.match(css, /h1, h2, h3 \{ overflow-wrap: break-word; \}/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.subpage-hero h1 \{ font-size: clamp\(42px, 11\.5vw, 58px\); \}/);
});

test('mobile privacy tables retain their column labels', () => {
  const privacy = read('privacy/index.html');
  for (const label of ['Category', 'Examples', 'Purpose', 'Data', 'Retention']) {
    assert.match(privacy, new RegExp(`data-label="${label}"`));
  }
  assert.match(css, /td\[data-label\]::before[^}]*content: attr\(data-label\)/);
});

test('shared interactive controls expose accessible target sizing', () => {
  assert.match(css, /\.site-nav a \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.text-link \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.footer-shell a \{[^}]*min-height: 44px/);
  assert.match(css, /\.menu-button \{[\s\S]*?width: 44px;[\s\S]*?height: 44px/);
  assert.match(css, /\.nav-beta \{[\s\S]*?min-height: 42px/);
  assert.match(css, /\.form-fields input \{[\s\S]*?min-height: 56px/);
  assert.match(css, /\.carousel-controls button \{[\s\S]*?width: 44px;[\s\S]*?height: 44px/);
});

test('desktop footer stays compact with navigation on one row', () => {
  for (const pagePath of pagePaths) {
    const footer = read(pagePath).match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0] ?? '';
    assert.match(footer, /class="footer-brand"/, pagePath);
    assert.match(footer, /class="footer-content"/, pagePath);
  }
  assert.match(css, /\.site-footer \{[^}]*padding: 32px 0;/);
  assert.match(css, /\.footer-shell nav \{[^}]*display: flex;[^}]*flex-wrap: nowrap;[^}]*justify-content: flex-end;/);
  assert.doesNotMatch(css, /\.footer-shell nav \{[^}]*grid-template-columns/);
});

test('screen carousel pauses for users and respects reduced motion', () => {
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(script, /carousel\.addEventListener\('pointerenter', stop\)/);
  assert.match(script, /carousel\.addEventListener\('focusin', stop\)/);
  assert.match(script, /setAttribute\('aria-hidden'/);
  assert.match(script, /setAttribute\('aria-current'/);
});
