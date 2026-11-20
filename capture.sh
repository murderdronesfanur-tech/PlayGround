#!/usr/bin/env bash
set -euo pipefail

: "${CAPTURE_URL:?Set CAPTURE_URL to the exact URL to capture}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the evidence output directory}"

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
# The worker's Playwright package is used with the installed system Chromium when available.
export NODE_PATH="${NODE_PATH:+$NODE_PATH:}/home/runner/.local/share/omgithub-playwright/node_modules"
/usr/bin/time -p node - "$CAPTURE_URL" "$CAPTURE_DIR" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [url, outputDir] = process.argv.slice(2);
const fail = (code, message) => {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
};

(async () => {
  if (!/^https?:\/\//i.test(url)) fail(1, 'CAPTURE_URL must be an absolute HTTP(S) URL.');
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (error) {
    fail(75, `Playwright is unavailable: ${error.message}`);
  }
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/home/runner/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
    '/home/runner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  ].filter(Boolean);
  const executablePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!executablePath) fail(75, 'No Chromium executable is installed.');

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (error) {
    fail(75, `Could not launch Chromium: ${error.message}`);
  }

  try {
    for (const view of [
      { name: 'final-desktop.png', viewport: { width: 1440, height: 960 }, isMobile: false, hasTouch: false },
      { name: 'final-mobile.png', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    ]) {
      const context = await browser.newContext({
        viewport: view.viewport,
        deviceScaleFactor: 1,
        isMobile: view.isMobile,
        hasTouch: view.hasTouch,
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      let response;
      try {
        response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (!response) fail(75, `No navigation response for ${url}`);
        if (response.status() >= 500) fail(75, `Preview returned HTTP ${response.status()}.`);
        if (response.status() >= 400) fail(1, `Preview returned HTTP ${response.status()}.`);
        await page.waitForSelector('#canvas', { state: 'visible', timeout: 15000 });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
      } catch (error) {
        if (error.exitCode) throw error;
        if (error.name === 'TimeoutError' || /net::|navigation|ERR_/i.test(error.message)) {
          fail(75, `Temporary navigation/render wait failure: ${error.message}`);
        }
        fail(1, `Page rendering failed: ${error.message}`);
      }

      const rendered = await page.evaluate(() => {
        const canvas = document.querySelector('#canvas');
        const rect = canvas?.getBoundingClientRect();
        const context = canvas?.getContext('2d');
        const pixel = context && canvas.width && canvas.height
          ? Array.from(context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data)
          : null;
        return {
          title: document.title,
          hasGameTitle: document.body.innerText.includes('ASTRO CORE'),
          canvasSize: canvas ? [canvas.width, canvas.height] : [0, 0],
          visibleCanvas: !!rect && rect.width > 0 && rect.height > 0,
          pixel,
        };
      });
      if (pageErrors.length) fail(1, `Page JavaScript error: ${pageErrors.join('; ')}`);
      if (!rendered.hasGameTitle || rendered.title !== 'Astro Core' ||
          !rendered.visibleCanvas || rendered.canvasSize.some(size => size <= 0) ||
          !rendered.pixel || rendered.pixel[3] === 0) {
        fail(1, `Game did not render correctly in ${view.name}: ${JSON.stringify(rendered)}`);
      }
      await page.screenshot({ path: path.join(outputDir, view.name), type: 'png' });
      console.log(`Captured ${view.name} at ${view.viewport.width}x${view.viewport.height}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.message || error);
  process.exitCode = error.exitCode || 1;
});
NODE
