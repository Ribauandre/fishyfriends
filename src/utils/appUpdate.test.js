import { announceUpdate, applyUpdate, onUpdateReady, resetForTests } from './appUpdate';

afterEach(() => {
  resetForTests();
  delete navigator.serviceWorker;
});

function fakeServiceWorkerContainer() {
  const handlers = [];
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { addEventListener: jest.fn((type, handler) => handlers.push({ type, handler })) },
  });
  return { fireControllerChange: () => handlers.filter((h) => h.type === 'controllerchange').forEach((h) => h.handler()) };
}

test('tells a listener about an update announced before it started listening', () => {
  const registration = { waiting: {} };
  announceUpdate(registration);
  const listener = jest.fn();
  onUpdateReady(listener);
  expect(listener).toHaveBeenCalledWith(registration);
});

test('tells current listeners when an update arrives, and stops after unsubscribing', () => {
  const listener = jest.fn();
  const stop = onUpdateReady(listener);
  announceUpdate({ waiting: {} });
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  announceUpdate({ waiting: {} });
  expect(listener).toHaveBeenCalledTimes(1);
});

test('applying asks the waiting worker to take over, then reloads exactly once when it has', () => {
  const sw = fakeServiceWorkerContainer();
  const postMessage = jest.fn();
  const reload = jest.fn();
  applyUpdate({ waiting: { postMessage } }, { reload });
  expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  expect(reload).not.toHaveBeenCalled();
  sw.fireControllerChange();
  sw.fireControllerChange();
  expect(reload).toHaveBeenCalledTimes(1);
});

test('with nothing waiting, applying just reloads', () => {
  const reload = jest.fn();
  applyUpdate({ waiting: null }, { reload });
  expect(reload).toHaveBeenCalledTimes(1);
});
