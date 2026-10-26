/* flowstate PWA registration and progressive install UI */
'use strict';

(function () {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js').catch(function (error) {
        console.error('flowstate service worker registration failed:', error);
      });
    });
  }

  var deferredInstallPrompt = null;
  var installButton = null;
  var installToast = null;
  var toastTimeout;

  function showToast(message) {
    if (!installToast) installToast = document.getElementById('toast');
    if (!installToast) return;
    installToast.textContent = message;
    installToast.classList.add('is-visible');
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(function () {
      installToast.classList.remove('is-visible');
    }, 3200);
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function createInstallButton() {
    if (installButton || isStandalone()) return;
    var nav = document.querySelector('.nav-items');
    if (!nav) return;

    installButton = document.createElement('button');
    installButton.type = 'button';
    installButton.className = 'nav-btn pwa-install-btn';
    installButton.hidden = true;
    installButton.setAttribute('aria-label', 'Install flowstate');
    installButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 17v3h14v-3"/></svg><span>Install app</span>';
    nav.appendChild(installButton);

    installButton.addEventListener('click', async function () {
      if (!deferredInstallPrompt) {
        showToast('Use your browser menu and choose Install app or Add to Home Screen.');
        return;
      }
      deferredInstallPrompt.prompt();
      var outcome = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installButton.hidden = true;
      if (outcome && outcome.outcome === 'accepted') showToast('flowstate is being installed');
    });
  }

  createInstallButton();

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    createInstallButton();
    if (installButton) installButton.hidden = false;
  });

  window.addEventListener('appinstalled', function () {
    if (installButton) installButton.hidden = true;
    deferredInstallPrompt = null;
    showToast('flowstate installed successfully');
  });

  window.addEventListener('load', function () {
    if (installButton && !deferredInstallPrompt && /iphone|ipad|ipod/i.test(window.navigator.userAgent)) {
      installButton.hidden = false;
    }
  });
})();
