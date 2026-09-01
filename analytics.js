'use strict';

// Marketing-page analytics only. Shared ETA and Tesla callback pages never load
// this file, so tokens, route state, and callback parameters cannot enter it.
window.va = window.va || function () {
  (window.vaq = window.vaq || []).push(arguments);
};

const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

if (!isLocal && !document.querySelector('[data-vercel-insights]')) {
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  script.dataset.vercelInsights = '';
  document.head.append(script);
}
