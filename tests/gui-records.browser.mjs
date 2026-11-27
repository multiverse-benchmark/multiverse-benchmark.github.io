import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : await import('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/tests';
const taskId = 'u2cn7wqc8ee89cnqni87sj0c5me0oduw';
const callId = 'bdd640fb-0667-4ad1-9c80-317fa3b1799d';
const states = Object.fromEntries(await Promise.all(['initial', 'final'].map(async phase => [phase, JSON.parse(gunzipSync(await readFile(`public/data/states/${taskId}/${phase}.json.gz`))).data])));
const demoId = 'figure1-message-demo';
const demoStates = Object.fromEntries(await Promise.all(['initial', 'final'].map(async phase => [phase, JSON.parse(gunzipSync(await readFile(`public/data/demos/${demoId}/${phase}.json.gz`))).data])));
const report = { base, taskId, records: [], demoId, demoRecords: [], errors: [] };
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => report.errors.push(error.message));
  const open = async (phase, app, record = '', view = '') => {
    const params = new URLSearchParams({ task: taskId, phase, app });
    if (record) params.set('record', record);
    if (view) params.set('view', view);
    await page.goto(new URL(`gui/index.html?${params}`, base).href);
    await page.locator(`[data-app-window="${app}"]`).waitFor();
  };
  const recordLocator = record => page.locator(`[data-snapshot-record="${record}"]`);
  for (const phase of ['initial', 'final']) {
    for (const [app, record] of [['gridwell_mail', 'thread-066'], ['generic_reminders', 'reminder_2'], ['contacts', 'people/vip-julian-vance-001'], ...(phase === 'final' ? [['phone', callId]] : [])]) {
      await open(phase, app, record);
      const detail = recordLocator(record);
      await detail.waitFor();
      const text = await detail.innerText();
      if (app === 'gridwell_mail') {
        const messageId = phase === 'initial' ? 'msg_0110' : 'msg_354';
        const body = states[phase].gridwell_mail.users.me.messages[messageId].body;
        const message = detail.locator(`[data-snapshot-message="${messageId}"]`);
        assert((await message.innerText()).includes(body), 'Linked native mail message displays its exact stored body');
      } else if (app === 'generic_reminders') {
        assert.match(text, /Call Julian - The Star/);
        assert.match(text, phase === 'initial' ? /Pending/ : /Completed/);
      } else if (app === 'contacts') {
        assert.match(text, /Julian Vance/);
        assert.match(text, /\+14696230199/);
      } else {
        assert.match(text, /Julian Vance/);
        assert.match(text, /\+14696230199/);
        assert.equal(await page.locator('[data-app-window="phone"] [data-snapshot-record]').count(), 1);
      }
      const source = await page.evaluate(async service => (await (await fetch(`./api/services/${service}/state`)).json()).state, app);
      assert.deepEqual(source, states[phase][app], 'Opening a record does not alter the snapshot');
      report.records.push({ phase, app, record, nativeDetail: true, exactState: true });
    }
  }

  await page.getByRole('button', { name: 'Show all calls', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('record'), null);
  assert.equal(await page.locator('[data-app-window="phone"] [data-snapshot-record]').count(), Object.keys(states.final.phone.call_history).length);
  report.clearCallFocusRestoresAllCalls = true;

  await open('initial', 'phone', '', 'recent');
  await recordLocator(Object.keys(states.initial.phone.call_history)[0]).waitFor();
  assert.equal(await page.locator('[data-app-window="phone"] [data-snapshot-record]').count(), Object.keys(states.initial.phone.call_history).length);
  report.initialCallHistoryExact = true;

  await open('initial', 'phone', callId);
  await page.locator('.snapshot-record-notice').waitFor();
  assert.match(await page.locator('.snapshot-record-notice').innerText(), /not present in this snapshot/);
  assert.equal(await recordLocator(callId).count(), 0);
  assert.equal(await page.locator('[data-app-window="phone"] [data-snapshot-record]').count(), Object.keys(states.initial.phone.call_history).length);
  report.absentCallClearlyDisclosed = true;

  await open('initial', 'gridwell_mail', 'thread-066');
  await recordLocator('thread-066').waitFor();
  await page.getByRole('navigation', { name: 'Desktop snapshot phase' }).getByRole('link', { name: /^Final/ }).click();
  await recordLocator('thread-066').locator('[data-snapshot-message="msg_354"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('record'), 'thread-066');
  report.nativePhasePreservesRecord = true;
  await page.locator('[data-app-id="contacts"]').click();
  await page.locator('[data-app-window="contacts"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('record'), null);
  assert.equal(new URL(page.url()).searchParams.get('view'), null);
  report.dockClearsDifferentAppRecord = true;

  for (const phase of ['initial', 'final']) {
    for (const [app, record] of [['gridwell_mail', 'thread-066'], ['generic_reminders', 'reminder_2'], ['contacts', 'people/vip-julian-vance-001'], ['messages', phase === 'initial' ? 'people/vip-julian-vance-001' : 'msg_1']]) {
      const params = new URLSearchParams({ demo: demoId, phase, app, record });
      await page.goto(new URL(`gui/index.html?${params}`, base).href);
      const detail = recordLocator(record);
      await detail.waitFor();
      const text = await detail.innerText();
      if (app === 'gridwell_mail') {
        const messageId = phase === 'initial' ? 'msg_0110' : 'msg_354';
        assert((await detail.locator(`[data-snapshot-message="${messageId}"]`).innerText()).includes(demoStates[phase].gridwell_mail.users.me.messages[messageId].body));
      } else if (app === 'generic_reminders') {
        assert.match(text, /Message Julian - The Star/);
        assert.match(text, phase === 'initial' ? /Pending/ : /Completed/);
      } else if (app === 'contacts') {
        assert.match(text, /Julian Vance/);
        assert.match(text, /\+14696230199/);
      } else if (phase === 'initial') {
        assert.match(text, /No messages yet/);
        assert.equal(await detail.locator('[data-snapshot-message]').count(), 0);
        assert.deepEqual(demoStates.initial.messages.messages, {});
      } else {
        assert(text.includes(demoStates.final.messages.messages.msg_1.message_body));
        assert.match(text, /Love, Clara/);
      }
      assert.equal(new URL(page.url()).searchParams.get('task'), null);
      const source = await page.evaluate(async service => (await (await fetch(`./api/services/${service}/state`)).json()).state, app);
      assert.deepEqual(source, demoStates[phase][app], 'Demo record navigation preserves the actual cached simulator state');
      report.demoRecords.push({ phase, app, record, nativeDetail: true, exactReplayState: true });
    }
  }
  await page.goto(new URL(`gui/index.html?demo=${demoId}&phase=initial&app=messages&record=msg_1`, base).href);
  await page.locator('.snapshot-record-notice').waitFor();
  assert.equal(await recordLocator('msg_1').count(), 0);
  assert.match(await page.locator('.snapshot-record-notice').innerText(), /not present in this snapshot/);
  // The demo is not a validation task of either release.
  const tasks = [...JSON.parse(await readFile('public/data/tasks.json', 'utf8')), ...JSON.parse(await readFile('public/data/v1.1.0/tasks.json', 'utf8'))];
  assert.equal(tasks.some(task => task.id === demoId), false);
  report.demoExcludedFromValidation = true;
  report.absentInitialDemoMessageDisclosed = true;
  assert.deepEqual(report.errors, []);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'gui-records-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
