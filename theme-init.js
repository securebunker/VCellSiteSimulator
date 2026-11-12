/* Pre-paint theme bootstrap. Kept external so the page can run under a strict
   script-src 'self' CSP without an inline-script hash or nonce. */
(function () {
  'use strict';
  var root = document.documentElement;
  try {
    var stored = localStorage.getItem('vcss-theme');
    var system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var theme = stored === 'light' || stored === 'dark' ? stored : system;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#eef3f8' : '#060e16');
  } catch (error) {
    root.setAttribute('data-theme', 'dark');
  }
})();
