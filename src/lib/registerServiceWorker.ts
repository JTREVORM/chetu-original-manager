/**
 * Registers the service worker.
 *
 * This exists to make the app installable: a browser will not fire
 * `beforeinstallprompt` — and so will never offer to install Chetu — unless a
 * service worker with a fetch handler is registered for the scope. See
 * `public/sw.js` for why it deliberately caches almost nothing.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // The dev server rebuilds constantly; a worker there only causes confusion.
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      // Installability is a nicety — never let it break the app.
      console.warn('Service worker registration failed', error);
    });
  });
}
