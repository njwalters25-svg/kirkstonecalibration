// Compatibility loader retained for the existing index.html script tag.
// The actual invoice/reference integrity logic lives in invoice-number-edit.js.
(function () {
  function loadReferenceIntegrity() {
    if (window.__kirkstoneReferenceIntegrityInstalled) return;
    if (document.querySelector('script[data-reference-integrity-loader]')) return;
    const script = document.createElement('script');
    script.src = 'js/invoice-number-edit.js?v=20260917-1';
    script.async = false;
    script.dataset.referenceIntegrityLoader = 'true';
    document.head.appendChild(script);
  }

  if (document.readyState === 'complete') loadReferenceIntegrity();
  else window.addEventListener('load', loadReferenceIntegrity, { once: true });
})();
