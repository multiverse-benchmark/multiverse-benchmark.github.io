import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:4173/');
const output = process.env.QA_OUTPUT_DIR || 'artifacts/tests';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
const tasks = JSON.parse(await readFile(path.join(root, 'public/data/tasks.json'), 'utf8'));
const remaining = new Set(tasks.flatMap(task => task.tools));
let selected = [];
while (remaining.size) {
  const task = tasks.reduce((best, candidate) => candidate.tools.filter(tool => remaining.has(tool)).length > best.tools.filter(tool => remaining.has(tool)).length ? candidate : best);
  const tools = task.tools.filter(tool => remaining.has(tool));
  if (!tools.length) throw new Error('Could not construct full service coverage.');
  selected.push({ ...task, testTools: tools });
  tools.forEach(tool => remaining.delete(tool));
}
if (process.env.GUI_SERVICES) {
  const wanted = new Set(process.env.GUI_SERVICES.split(','));
  selected = selected.map(task => ({ ...task, testTools: task.testTools.filter(service => wanted.has(service)) })).filter(task => task.testTools.length);
}
const report = { base: base.href, selectedTasks: selected.map(task => ({ id: task.id, tools: task.testTools })), views: [], failures: [], stateChecks: [], screenshots: [] };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
await mkdir(output, { recursive: true });

try {
  for (const task of selected) {
    for (const phase of ['initial', 'final']) {
      const errors = [], consoleErrors = [], networkApi = [];
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.includes('/api/') || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.origin !== base.origin) networkApi.push(request.url());
      });
      await page.addInitScript(() => {
        window.__guiUnsupported = [];
        window.addEventListener('snapshot-tool-unavailable', event => window.__guiUnsupported.push(event.detail));
      });
      const snapshot = JSON.parse(gunzipSync(await readFile(path.join(root, `public/data/states/${task.id}/${phase}.json.gz`))).toString());
      await page.goto(new URL(`gui/index.html?task=${task.id}&phase=${phase}`, base).href, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-app-id]').first().waitFor();
      const appIds = await page.locator('[data-app-id]').evaluateAll(elements => elements.map(element => element.dataset.appId));
      assert.deepEqual([...appIds].sort(), Object.keys(snapshot.data).sort(), 'Dock lists exactly the snapshot services');

      async function stateHashes() {
        return page.evaluate(async services => {
          const results = {};
          for (const service of services) {
            const response = await fetch(`./api/services/${encodeURIComponent(service)}/state`);
            if (!response.ok) throw new Error(`${service}: state response ${response.status}`);
            const { state } = await response.json();
            const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(state)));
            results[service] = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
          }
          return results;
        }, Object.keys(snapshot.data));
      }
      const expected = Object.fromEntries(Object.entries(snapshot.data).map(([service, state]) => [service, digest(state)]));
      assert.deepEqual(await stateHashes(), expected, 'Every API state equals the selected initial/final artifact exactly');
      const probe = await page.evaluate(async service => {
        const request = async (path, method, body) => {
          const response = await fetch(`./api/${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
          return { status: response.status, body: await response.json() };
        };
        const replies = {
          writeState: await request(`services/${service}/state`, 'POST', { state: { qa_mutation: true } }),
          writeTool: await request(`services/${service}/tools/update_snapshot_qa_probe`, 'POST', { params: {} }),
          unknownRead: await request(`services/${service}/tools/get_snapshot_qa_unknown`, 'POST', { params: {} }),
          unknownRoute: await request('unknown-qa-route', 'GET'),
        };
        window.__guiUnsupported = [];
        return replies;
      }, task.testTools[0]);
      assert.equal(probe.writeState.status, 403);
      assert(probe.writeTool.status >= 400 && probe.writeTool.body.success === false);
      assert(probe.unknownRead.status >= 400 && probe.unknownRead.body.success === false);
      assert(probe.unknownRoute.status >= 400);
      assert.deepEqual(await stateHashes(), expected, 'Rejected writes leave snapshot data unchanged');
      report.stateChecks.push({ taskId: task.id, phase, services: Object.keys(snapshot.data).length, exact: true, writesRejected: true, unknownReadsRejected: true });
      // Clear auto-opened windows so intentional error probes do not leave notices in tested apps.
      for (const close of await page.locator('[data-app-window]').getByRole('button', { name: /^Close / }).all()) await close.click();

      for (const service of task.testTools) {
        const errorsBefore = errors.length;
        const consoleBefore = consoleErrors.length;
        await page.locator(`[data-app-id="${service}"]`).click();
        const app = page.locator(`[data-app-window="${service}"]`);
        await app.waitFor();
        await app.locator('.snapshot-app-wrapper').waitFor();
        // Allow async startup reads and their explicit native-to-data fallback to settle.
        await page.waitForTimeout(650);
        const nativeButton = app.locator('.snapshot-app-tabs').getByRole('button', { name: 'App', exact: true });
        const nativeAvailable = await nativeButton.count() > 0;
        const mode = nativeAvailable && await nativeButton.getAttribute('aria-pressed') === 'true' ? 'native' : 'snapshot-data';
        const noticeElement = app.locator('.snapshot-app-notice');
        const notice = await noticeElement.count() ? await noticeElement.textContent() : '';
        const unavailable = await page.evaluate(name => window.__guiUnsupported.filter(item => item.service === name), service);
        const visibleText = await app.innerText();
        const nativeContent = await app.locator('.snapshot-native-content').innerText();
        assert(visibleText.length > 50, `${service} must display content`);
        if (mode === 'snapshot-data') assert(notice, `${service} fallback must be explicitly labeled`);
        const optionalLookups = new Set(['list_all_airports', 'get_new_releases', 'get_several_albums', 'get_recommendations']);
        const requiredUnavailable = unavailable.filter(item => !optionalLookups.has(item.tool) && !/is not stored in this snapshot/.test(item.message));
        if (requiredUnavailable.length) report.failures.push({ taskId: task.id, phase, service, kind: 'missing-core-read', unavailable: requiredUnavailable });
        if (unavailable.length && !notice) report.failures.push({ taskId: task.id, phase, service, kind: 'missing-availability-notice', unavailable });
        if (nativeAvailable && mode === 'snapshot-data') report.failures.push({ taskId: task.id, phase, service, kind: 'native-fallback', notice, unavailable });
        if (errors.length > errorsBefore) report.failures.push({ taskId: task.id, phase, service, kind: 'uncaught-error', errors: errors.slice(errorsBefore) });
        report.views.push({ taskId: task.id, phase, service, mode, nativeAvailable, notice, unavailable, consoleErrors: consoleErrors.slice(consoleBefore), contentPreview: nativeContent.slice(0, 600) });

        // Every window must also expose exact JSON, even for services without a native projection.
        await app.locator('.snapshot-app-tabs').getByRole('button', { name: 'Snapshot data', exact: true }).click();
        await app.getByRole('button', { name: 'View JSON', exact: true }).click();
        const raw = await app.locator('.snapshot-inspector-body pre').textContent();
        assert.deepEqual(JSON.parse(raw), snapshot.data[service], `${service} JSON view must preserve every stored field`);
        if (phase === 'initial' && ['gridwell_mail', 'contacts', 'slick', 'gridwell_calendar', 'gridwell_drive', 'zira'].includes(service)) {
          if (nativeAvailable && mode === 'native') await nativeButton.click();
          const file = `gui-${service}.png`;
          await app.screenshot({ path: path.join(output, file) });
          report.screenshots.push(file);
        }
        await app.getByRole('button', { name: /^Close / }).first().click();
        await app.waitFor({ state: 'hidden' });
        console.log(`CHECK ${phase} ${service}: ${mode}${notice ? ` (${notice})` : ''}`);
      }
      assert.deepEqual(await stateHashes(), expected, 'Native app display operations cannot mutate the authored snapshot');
      assert.deepEqual(networkApi, [], 'All GUI API access stays in the snapshot adapter; no server or other localhost ports');
      if (errors.length && !report.failures.some(failure => failure.taskId === task.id && failure.phase === phase && failure.kind === 'uncaught-error')) report.failures.push({ taskId: task.id, phase, kind: 'uncaught-error', errors });
      if (task.id === selected[0].id && phase === 'initial' && Object.hasOwn(snapshot.data, 'gridwell_mail')) {
        await page.locator('[data-app-id="gridwell_mail"]').click();
        await page.locator('[data-app-window="gridwell_mail"]').waitFor();
        await page.getByRole('navigation', { name: 'Desktop snapshot phase' }).getByRole('link', { name: /^Final/ }).click();
        await page.waitForURL(url => url.searchParams.get('phase') === 'final');
        await page.locator('[data-app-window="gridwell_mail"]').waitFor();
        const finalSnapshot = JSON.parse(gunzipSync(await readFile(path.join(root, `public/data/states/${task.id}/final.json.gz`))).toString());
        const selectedState = await page.evaluate(async () => (await (await fetch('./api/services/gridwell_mail/state')).json()).state);
        assert.deepEqual(selectedState, finalSnapshot.data.gridwell_mail, 'The native phase switch actually selects final records');
        assert.equal(new URL(page.url()).pathname.endsWith('/gui/index.html'), true);
        report.phaseSwitch = { passed: true, selectedAppPreserved: true, finalRecordsExact: true };
        console.log('CHECK Native menu phase switch preserves app and selects exact final records');
      }
      await page.close();
    }
  }
  report.summary = {
    uniqueServices: new Set(report.views.map(view => view.service)).size,
    views: report.views.length,
    nativeViews: report.views.filter(view => view.mode === 'native').length,
    explicitlyLabeledDataViews: report.views.filter(view => view.mode === 'snapshot-data').length,
    failures: report.failures.length,
    viewsWithUnavailableReads: report.views.filter(view => view.unavailable.length).length,
    exactStateChecks: report.stateChecks.length,
  };
  console.log(JSON.stringify(report.summary, null, 2));
} finally {
  await writeFile(path.join(output, 'gui-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
assert.equal(report.failures.length, 0, 'Native app errors/fallbacks need inspection; see gui-report.json');
