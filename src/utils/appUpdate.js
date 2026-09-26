// A deployed update used to reach the installed app only once every copy of it was closed,
// and an iPhone home-screen app is rarely truly closed, so people ran old versions for days.
// The service worker registration announces a waiting update here; the banner offers it, and
// applying it tells the waiting worker to take over and reloads once it has.
let pending = null;
const listeners = new Set();

export function announceUpdate(registration) {
  pending = registration;
  listeners.forEach((listener) => listener(registration));
}

export function onUpdateReady(listener) {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => listeners.delete(listener);
}

export function applyUpdate(registration, { reload = () => window.location.reload() } = {}) {
  const worker = registration?.waiting;
  if (!worker || !navigator.serviceWorker) { reload(); return; }
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    reload();
  });
  worker.postMessage({ type: 'SKIP_WAITING' });
}

export function resetForTests() {
  pending = null;
  listeners.clear();
}
