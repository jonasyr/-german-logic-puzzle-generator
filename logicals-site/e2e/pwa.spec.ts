import { expect, test } from '@playwright/test';

/*
 * Added to the Home Screen, the app has to start.
 *
 * The manifest and the icons used to sit beside index.html as ordinary files,
 * so Vite hashed them into /assets/. A manifest served from /assets/ resolves
 * its own relative start_url against /assets/ - a directory of JS chunks with
 * no page in it - and from iOS 16.4 Safari honours start_url when launching a
 * Home Screen web app. It opened into nothing.
 *
 * The invariant is that every path the manifest hands to the operating system
 * resolves to something real, wherever the manifest file itself is served from.
 */

type Manifest = {
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

/**
 * Waits for a worker to take control, and gives up loudly.
 *
 * navigator.serviceWorker.ready simply never settles when nothing registers,
 * so without the race a regression would hang the suite instead of failing it.
 */
async function serviceWorkerReady(page: import('@playwright/test').Page) {
  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('no service worker took control of the page')), 10_000)),
  ]));
}

async function manifest(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status(), 'the manifest itself must be served').toBe(200);
  return await response.json() as Manifest;
}

test('the manifest is served from the app root', async ({ request }) => {
  const data = await manifest(request);
  expect(data.display).toBe('standalone');
});

test('start_url and scope are absolute, not relative to wherever the file lands', async ({ request }) => {
  const data = await manifest(request);
  // This is the whole bug in one assertion: "./" was correct next to
  // index.html and wrong the moment the file moved.
  expect(data.start_url.startsWith('/'), `start_url: ${data.start_url}`).toBe(true);
  expect(data.scope.startsWith('/'), `scope: ${data.scope}`).toBe(true);
});

test('start_url actually serves the app', async ({ page, request }) => {
  const data = await manifest(request);
  await page.goto(data.start_url);
  // Not merely a 200: the start screen has to be in the document that comes back.
  await expect(page.locator('#screen-start')).toHaveCount(1);
  await expect(page.locator('#daily-button')).toHaveCount(1);
});

test('every icon the manifest names exists', async ({ request }) => {
  const data = await manifest(request);
  expect(data.icons.length).toBeGreaterThan(0);
  for (const icon of data.icons) {
    const response = await request.get(icon.src);
    expect(response.status(), `manifest icon ${icon.src}`).toBe(200);
    expect(response.headers()['content-type'], icon.src).toContain('image/');
  }
  // A maskable icon is what keeps Android from framing the artwork in a white
  // rounded square; iOS uses the apple-touch-icon below.
  expect(data.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
});

test('the iOS home screen icon and standalone flag are in place', async ({ page, request }) => {
  await page.goto('/');

  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(touchIcon, 'iOS ignores the manifest icons and uses this one').toBeTruthy();
  expect((await request.get(touchIcon!)).status(), touchIcon!).toBe(200);

  const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
  expect((await request.get(favicon!)).status(), favicon!).toBe(200);

  // Without this iOS opens a Safari window with chrome instead of a web app.
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]'))
    .toHaveAttribute('content', 'yes');
});

/*
 * The reason a Home Screen app needs one at all: a standalone window has no
 * address bar, so a moment of bad signal is a blank screen the player cannot
 * retry from. Puzzles are generated in the browser, so there is nothing about
 * solo play that actually requires the network.
 */
test('the app still starts with no network at all', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);

  // Registration happens on load, so the very first visit is fetched before the
  // worker controls the page. One online reload after it takes over is what
  // fills the cache - exactly what happens on a real second visit.
  await serviceWorkerReady(page);
  await page.reload();
  await serviceWorkerReady(page);
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
    // Not just the shell: the scripts have to be there too, or the buttons are
    // inert decoration.
    await expect(page.locator('#daily-button')).toBeVisible();
    await expect(page.locator('#start-button')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('the API is never served from the cache', async ({ page }) => {
  await page.goto('/');
  await serviceWorkerReady(page);
  // A duel played against a cached snapshot of the room would be worse than an
  // error, so /api/ is left to the network on purpose.
  const source = await (await page.request.get('/sw.js')).text();
  expect(source).toContain("url.pathname.startsWith('/api/')");
});
