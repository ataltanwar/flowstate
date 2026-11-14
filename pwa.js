
/* flowstate PWA registration and progressive install UI */
'use strict';

(function () {

  // Service Worker Registration
  if (
    'serviceWorker' in navigator &&
    (
      location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1'
    )
  ) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js', {
        updateViaCache: 'none'
      })
      .then(function (registration) {
        registration.update();
        console.log(
          'FlowState service worker registered:',
          registration.scope
        );
      })
      .catch(function (error) {
        console.error(
          'FlowState service worker registration failed:',
          error
        );
      });
    });
  }

  // Install UI
  var deferredInstallPrompt = null;
  var installButton = null;
  var installToast = null;
  var toastTimeout;

  function showToast(message) {
    if (!installToast) {
      installToast = document.getElementById('toast');
    }

    if (!installToast) return;

    installToast.textContent = message;
    installToast.classList.add('is-visible');

    window.clearTimeout(toastTimeout);

    toastTimeout = window.setTimeout(function () {
      installToast.classList.remove('is-visible');
    }, 3200);
  }

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function createInstallButton() {
    if (installButton || isStandalone()) return;

    var nav = document.querySelector('.nav-items');
    if (!nav) {
      console.warn('FlowState: .nav-items not found');
      return;
    }

    installButton = document.createElement('button');
    installButton.type = 'button';
    installButton.className = 'nav-btn pwa-install-btn';
    installButton.hidden = true;

    installButton.setAttribute('aria-label', 'Install FlowState');

    installButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 3v12m-5-5 5 5 5-5M5 17v3h14v-3"/>' +
      '</svg><span>Install app</span>';

    nav.appendChild(installButton);

    installButton.addEventListener('click', async function () {
      if (!deferredInstallPrompt) {
        showToast(
          'Use your browser menu and choose Install app or Add to Home Screen.'
        );
        return;
      }

      deferredInstallPrompt.prompt();

      var outcome = await deferredInstallPrompt.userChoice;

      deferredInstallPrompt = null;
      installButton.hidden = true;

      if (outcome && outcome.outcome === 'accepted') {
        showToast('FlowState is being installed');
      }
    });
  }

  // Create button when DOM is ready
  function initializeInstallUI() {
    createInstallButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeInstallUI);
  } else {
    initializeInstallUI();
  }

  // Browser installation prompt
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();

    deferredInstallPrompt = event;

    createInstallButton();

    if (installButton) {
      installButton.hidden = false;
    }
  });

  // Successful installation
  window.addEventListener('appinstalled', function () {
    if (installButton) {
      installButton.hidden = true;
    }

    deferredInstallPrompt = null;

    showToast('FlowState installed successfully');
  });

  // iOS installation fallback
  window.addEventListener('load', function () {
    if (
      installButton &&
      !deferredInstallPrompt &&
      /iphone|ipad|ipod/i.test(navigator.userAgent)
    ) {
      installButton.hidden = false;
    }
  });

})();
