/** Verify that native GUI caches cannot alter another task's snapshot view. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : await import('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const tasks = ['251f2uwadoxpbosknb4vxd58r8bxsuo9', '9w5638rdq5ge83gof4sz1al5rrc3990u'];
const seeded = {
  notifications_badge: '999',
  deleted_spreadsheet_ids: '["sheet-client-overview"]',
  generic_media_library: '[{"id":"a-different-task"}]',
  multiverse_notes_undo_operations: '[{"id":"stale-operation"}]',
  whatsup_blocked_contacts: '["unrelated-contact"]',
};
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const report = { base, checkedStates: [], contentIsolated: false, themePreserved: false, hostStorageUnchanged: false };

try {
  const host = await context.newPage();
  await host.goto(base);
  await host.evaluate(values => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    localStorage.setItem('theme', 'light');
  }, seeded);

  const desktop = await context.newPage();
  const expectedState = async (id, phase) => JSON.parse(gunzipSync(await readFile(`public/data/states/${id}/${phase}.json.gz`))).data.gridwell_mail;
  const checkState = async (id, phase) => {
    await desktop.waitForSelector('[data-app-window="gridwell_mail"]');
    const stored = await desktop.evaluate(async keys => {
      const response = await fetch('./api/services/gridwell_mail/state');
      return { state: (await response.json()).state, cache: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), theme: localStorage.getItem('theme'), classes: document.documentElement.className };
    }, Object.keys(seeded));
    assert.deepEqual(stored.state, await expectedState(id, phase), 'Native data endpoint must expose the exact selected source state');
    assert.deepEqual(stored.cache, Object.fromEntries(Object.keys(seeded).map(key => [key, null])), 'Unrelated persisted app caches must not enter the desktop');
    assert.equal(stored.theme, 'light');
    assert.match(stored.classes, /\blight\b/);
    report.checkedStates.push({ task: id, phase, exactSourceState: true });
  };

  await desktop.goto(new URL(`gui/index.html?task=${tasks[0]}&phase=initial&app=gridwell_mail`, base).href);
  await checkState(tasks[0], 'initial');
  await desktop.evaluate(() => localStorage.setItem('multiverse_frame_probe', 'must-not-survive'));
  await desktop.getByRole('link', { name: /Final/ }).click();
  await desktop.waitForURL(/phase=final/);
  await checkState(tasks[0], 'final');
  assert.equal(await desktop.evaluate(() => localStorage.getItem('multiverse_frame_probe')), null, 'Content cache must reset when switching phase');
  await desktop.evaluate(() => localStorage.setItem('multiverse_frame_probe', 'must-not-cross-tasks'));
  await desktop.goto(new URL(`gui/index.html?task=${tasks[1]}&phase=initial&app=gridwell_mail`, base).href);
  await checkState(tasks[1], 'initial');
  assert.equal(await desktop.evaluate(() => localStorage.getItem('multiverse_frame_probe')), null, 'Content cache must reset when switching task');

  const actualHost = await host.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(seeded));
  assert.deepEqual(actualHost, seeded, 'The real browser caches must remain untouched');
  assert.equal(await host.evaluate(() => localStorage.getItem('multiverse_frame_probe')), null);
  assert.equal(await host.evaluate(() => localStorage.getItem('theme')), 'light');
  report.contentIsolated = true;
  report.themePreserved = true;
  report.hostStorageUnchanged = true;
  await mkdir('artifacts/production-qa', { recursive: true });
  await writeFile('artifacts/production-qa/gui-storage-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
