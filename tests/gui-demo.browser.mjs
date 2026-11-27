/** The homepage embeds the actual GUI with the separately labeled paper demo. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : await import('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/tests';
const demoId = 'figure1-message-demo';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
const report = { base, demoId, checks: [], uncaughtErrors: [] };

try {
  // The demo is not a validation task of either release.
  const taskIndex = [...JSON.parse(await readFile('public/data/tasks.json', 'utf8')), ...JSON.parse(await readFile('public/data/v1.1.0/tasks.json', 'utf8'))];
  assert.equal(taskIndex.some(task => task.id === demoId), false);
  const demoTask = JSON.parse(gunzipSync(await readFile(`public/data/demos/${demoId}/task.json.gz`)));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => report.uncaughtErrors.push(error.message));
  await page.goto(base);
  const preview = page.locator('.environment-demo');
  const iframe = preview.locator('iframe');
  await iframe.scrollIntoViewIfNeeded();
  const frame = page.frameLocator('.environment-native-frame');
  await frame.locator('[data-app-window="gridwell_mail"]').waitFor();
  const source = new URL(await iframe.getAttribute('src'), base);
  assert.equal(source.searchParams.get('task'), null);
  assert.equal(source.searchParams.get('demo'), demoId);
  assert.equal(source.searchParams.get('phase'), 'initial');
  assert.equal((await iframe.boundingBox()).height >= 700, true);
  assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-downloads');
  assert.match(await iframe.getAttribute('title'), /MultiVerse GUI: Dinner at The Star/);
  assert.match(await preview.locator('[data-showcase-request]').innerText(), /Reply to Julian's email/);
  assert.match(JSON.stringify(demoTask), /illustrative/i);

  async function checkExactPhase(phase) {
    const expected = JSON.parse(gunzipSync(await readFile(`public/data/demos/${demoId}/${phase}.json.gz`)));
    const actual = await frame.locator('body').evaluate(async (_, services) => {
      const states = {};
      for (const service of services) states[service] = (await (await fetch(`./api/services/${service}/state`)).json()).state;
      return states;
    }, Object.keys(expected.data));
    assert.deepEqual(actual, expected.data, `${phase}: all seven services equal the actual cached demo snapshot`);
    assert.deepEqual((await frame.locator('[data-app-id]').evaluateAll(elements => elements.map(element => element.dataset.appId))).sort(), Object.keys(expected.data).sort());
    assert.equal(expected.provenance, `illustrative_replay_${phase}`);
    report.checks.push({ phase, exactServices: Object.keys(expected.data).length, separateIllustrativeDemo: true });
  }

  await checkExactPhase('initial');
  const mail = frame.locator('[data-app-window="gridwell_mail"]');
  await mail.getByPlaceholder('Search mail').fill('subject:"Sunday The Star"');
  await mail.getByPlaceholder('Search mail').press('Enter');
  await mail.getByText('Re: Sunday The Star', { exact: false }).first().click();
  await mail.getByText(/Confirmation #OT-44119921/).first().waitFor();
  report.readOriginalDinnerEmail = true;

  await frame.locator('[data-app-id="generic_reminders"]').click();
  await frame.locator('[data-app-window="generic_reminders"]').waitFor();
  await preview.locator('.environment-native-phase button').nth(1).click();
  await frame.locator('[data-app-window="generic_reminders"]').waitFor();
  assert.equal(new URL(await iframe.getAttribute('src'), base).searchParams.get('app'), 'generic_reminders');
  await checkExactPhase('final');
  report.outerPhasePreservesApp = true;

  await frame.getByRole('navigation', { name: 'Desktop snapshot phase' }).getByRole('link', { name: 'Initial', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.environment-native-phase button:first-child')?.getAttribute('aria-pressed') === 'true');
  await frame.locator('[data-app-window="generic_reminders"]').waitFor();
  assert.equal(new URL(await iframe.getAttribute('src'), base).searchParams.get('phase'), 'initial');
  report.nativePhaseSyncsOuterControls = true;

  const popupPromise = page.waitForEvent('popup');
  await preview.getByRole('link', { name: 'Open full screen', exact: true }).click();
  const popup = await popupPromise;
  await popup.locator('[data-app-window="generic_reminders"]').waitFor();
  assert.equal(new URL(popup.url()).searchParams.get('task'), null);
  assert.equal(new URL(popup.url()).searchParams.get('demo'), demoId);
  assert.equal(new URL(popup.url()).searchParams.get('phase'), 'initial');
  assert.equal(new URL(popup.url()).searchParams.get('app'), 'generic_reminders');
  await popup.close();
  report.fullScreenPreservesAppAndPhase = true;

  await mkdir(output, { recursive: true });
  const desktopScreenshotStyle = await page.addStyleTag({ content: '.site-header,.skip-link{visibility:hidden!important}' });
  await preview.screenshot({ path: path.join(output, 'homepage-native-desktop.png') });
  await desktopScreenshotStyle.evaluate(element => element.remove());
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobile.on('pageerror', error => report.uncaughtErrors.push(error.message));
  await mobile.goto(base);
  await mobile.locator('.environment-native-frame').scrollIntoViewIfNeeded();
  await mobile.frameLocator('.environment-native-frame').locator('[data-app-window="gridwell_mail"]').waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Mobile homepage has no horizontal overflow');
  assert((await mobile.locator('.environment-native-frame').boundingBox()).height >= 700);
  assert.equal(await mobile.locator('.environment-native-frame-wrap').evaluate(element => { element.scrollLeft = 350; return element.scrollLeft > 0 && element.scrollWidth > element.clientWidth; }), true, 'Mobile embed scrolls across a readable native desktop');
  await mobile.addStyleTag({ content: '.site-header,.skip-link{visibility:hidden!important}' });
  await mobile.locator('.environment-demo').screenshot({ path: path.join(output, 'homepage-native-mobile.png') });
  report.mobileNativeFrameVisibleWithoutPageOverflow = true;
  await mobile.close();
  assert.deepEqual(report.uncaughtErrors, []);
  await writeFile(path.join(output, 'gui-demo-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
