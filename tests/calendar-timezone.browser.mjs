/** Calendar snapshot times retain their UTC instant in every browser timezone. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/tests';
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(process.env.PLAYWRIGHT_MODULE)
  : await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
const phases = ['initial', 'final'];
const zones = ['Europe/London', 'America/Chicago', 'Asia/Seoul'];
const readGzip = async relative => JSON.parse(gunzipSync(await readFile(path.join(root, 'public/data', relative))));
const tasks = JSON.parse(await readFile(path.join(root, 'public/data/tasks.json'), 'utf8'));
const demoId = 'figure1-message-demo';
const taskId = 'qbriawb9m8luew75lb635rilt64s54gq';
assert(tasks.some(task => task.id === taskId && task.tools.includes('gridwell_calendar')), 'Representative task belongs to the current validation index');
const fixtures = {
  demo: {
    id: demoId, key: 'fam-vance:event-0003', calendarId: 'fam-vance',
    title: 'Family Dinner — The Star', times: '6:00 PM - 8:00 PM', hour: 18, weekday: 0,
    displayOffset: '-06:00',
    // The stored master is Jan 5 UTC; its local date and weekly occurrences are Sundays.
    projectedStart: '2026-01-04T18:00:00-06:00', projectedEnd: '2026-01-04T20:00:00-06:00',
  },
  task: {
    id: taskId, key: 'primary:evtdf1f6b2c773f4fe1', calendarId: 'primary',
    title: 'Capstone Branding Specifics', times: '5:00 AM - 6:00 AM', hour: 5, weekday: 3,
    displayOffset: '-06:00',
    projectedStart: '2026-03-25T05:00:00-06:00', projectedEnd: '2026-03-25T06:00:00-06:00',
    visibleDate: '2026-03-25',
  },
  mixedTask: {
    id: 'l1zr5b7si7uonyai8b8rlemr8c4u3vs2', key: 'bar:evt-001', calendarId: 'bar',
    title: 'Pre-gig drinks with promoters', times: '7:00 PM - 9:00 PM', hour: 19, weekday: 4,
    displayOffset: '+00:00',
    // The task display timezone is UTC; event-local API/agenda values are Sao Paulo.
    projectedStart: '2026-04-02T16:00:00-03:00', projectedEnd: '2026-04-02T18:00:00-03:00',
    visibleDate: '2026-04-02',
  },
};
for (const [kind, fixture] of Object.entries(fixtures)) {
  if (kind !== 'demo') assert(tasks.some(task => task.id === fixture.id), 'Calendar regression task is in the current validation index');
  fixture.snapshots = {};
  for (const phase of phases) fixture.snapshots[phase] = await readGzip(kind === 'demo' ? `demos/${fixture.id}/${phase}.json.gz` : `states/${fixture.id}/${phase}.json.gz`);
}
const demoTask = await readGzip(`demos/${demoId}/task.json.gz`);
const taskDate = String(demoTask.userSimulation.global_context_variables).match(/\d{4}-\d{2}-\d{2}/)?.[0];
assert(taskDate, 'Demo supplies a task date');
const sunday = new Date(`${taskDate}T12:00:00Z`);
sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
fixtures.demo.visibleDate = sunday.toISOString().slice(0, 10);
const report = { base, validationTaskCount: tasks.length, taskIds: [taskId, fixtures.mixedTask.id], checks: [], screenshots: [], errors: [] };
await mkdir(output, { recursive: true });

async function checkReadAPI(frame, fixture, phase) {
  const expected = fixture.snapshots[phase].data.gridwell_calendar;
  const stored = expected.events[fixture.key];
  assert.equal(stored.summary, fixture.title);
  const result = await frame.locator('body').evaluate(async (_, params) => {
    const state = async () => (await (await fetch('./api/services/gridwell_calendar/state')).json()).state;
    const call = async tool => {
      const response = await fetch(`./api/services/gridwell_calendar/tools/${tool}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params }),
      });
      return { status: response.status, body: await response.json() };
    };
    const before = await state();
    const listed = await call('list_events');
    const single = await call('get_event');
    const clock = await (await fetch('./api/time')).json();
    return { before, listed, single, clock, after: await state() };
  }, { calendarId: fixture.calendarId, eventId: stored.id });
  assert.deepEqual(result.before, expected, `${phase}: raw state equals the compressed source`);
  assert.deepEqual(result.after, expected, `${phase}: calendar read tools leave raw state unchanged`);
  assert.equal(result.clock.timezone_offset, fixture.displayOffset, 'Native display follows the task clock offset');
  assert.equal(result.listed.status, 200);
  assert.equal(result.listed.body.success, true);
  assert.equal(result.single.status, 200);
  assert.equal(result.single.body.success, true);
  const event = result.single.body.result;
  assert.deepEqual(result.listed.body.result.items.find(item => item.id === stored.id), event, 'list_events and get_event return the same projection');
  assert.equal(event.start.dateTime, fixture.projectedStart);
  assert.equal(event.end.dateTime, fixture.projectedEnd);
  for (const field of ['start', 'end']) {
    assert.equal(Date.parse(event[field].dateTime), Date.parse(`${stored[field].dateTime}Z`), `${field}: projected RFC3339 retains the stored UTC instant`);
    assert.equal(event[field].timeZone, stored[field].timeZone);
    assert.equal(Object.hasOwn(event[field], 'offset'), false, 'Internal offset metadata is removed from the API projection');
  }
  return { storedStart: stored.start.dateTime, apiStart: event.start.dateTime, apiEnd: event.end.dateTime, eventTimeZone: event.start.timeZone, taskDisplayOffset: result.clock.timezone_offset, unchangedSource: true, utcInstantPreserved: true };
}

async function checkNativeCalendar(frame, fixture, phase, zone, prefix) {
  const app = frame.locator('[data-app-window="gridwell_calendar"]');
  if (!(await app.count())) await frame.locator('[data-app-id="gridwell_calendar"]').click();
  await app.getByRole('button', { name: 'week', exact: true }).waitFor();
  const card = app.locator('div.absolute.cursor-pointer').filter({ hasText: fixture.title });
  await card.waitFor();
  assert.equal(await card.count(), 1, 'The selected week contains exactly one matching event');
  assert((await card.innerText()).includes(fixture.times), `${zone} ${phase}: event block shows ${fixture.times}`);
  const position = await card.evaluate(element => {
    const column = element.parentElement.parentElement;
    return { weekday: Array.from(column.parentElement.children).indexOf(column), top: parseFloat(element.style.top) };
  });
  assert.equal(position.weekday, fixture.weekday, `${zone} ${phase}: event is in the correct weekday column`);
  assert.equal(position.top, fixture.hour * 48, `${zone} ${phase}: event block occupies the correct hour`);
  const api = await checkReadAPI(frame, fixture, phase);
  await card.click();
  const details = app.locator('div.fixed.inset-0').filter({ hasText: fixture.title });
  await details.waitFor();
  const detailText = await details.innerText();
  assert(detailText.includes(fixture.visibleDate), `${zone} ${phase}: event details show ${fixture.visibleDate}`);
  assert(detailText.includes(fixture.times), `${zone} ${phase}: details and grid times agree`);
  const filename = `${prefix}-${phase}-${zone.replaceAll('/', '-')}.png`;
  await app.screenshot({ path: path.join(output, filename) });
  report.screenshots.push(filename);
  report.checks.push({ zone, view: prefix, taskId: fixture.id, phase, title: fixture.title, date: fixture.visibleDate, times: fixture.times, weekday: position.weekday, ...api });
  await details.getByRole('button').first().click();
}

async function checkAgenda(page, fixture, phase, zone) {
  const panel = page.getByRole('tabpanel');
  await panel.getByRole('button', { name: phase === 'initial' ? 'Initial state' : 'Gold final state', exact: true }).click();
  await panel.getByRole('button', { name: 'Inspect gridwell_calendar state', exact: true }).click();
  const agenda = panel.getByRole('region', { name: 'Calendar agenda state viewer', exact: true });
  await agenda.getByRole('textbox', { name: 'Search calendar agenda records', exact: true }).fill(fixture.title);
  await agenda.getByLabel('Calendar agenda records', { exact: true }).getByRole('button').filter({ hasText: fixture.title }).click();
  const article = agenda.locator('article');
  const fields = await article.locator('dl').evaluate(element => Object.fromEntries([...element.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent])));
  const event = fixture.snapshots[phase].data.gridwell_calendar.events[fixture.key];
  assert.equal(fields.Starts, `${fixture.projectedStart} · ${event.start.timeZone}`);
  assert.equal(fields.Ends, `${fixture.projectedEnd} · ${event.end.timeZone}`);
  assert.equal(await agenda.getByRole('table').count(), 0, 'The corrected values are visible in the calendar agenda app view');
  report.checks.push({ zone, view: 'explorer-agenda', taskId: fixture.id, phase, start: fields.Starts, end: fields.Ends });
}

try {
  for (const zone of zones) {
    const context = await browser.newContext({ timezoneId: zone, viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push({ zone, message: error.message }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.environment-native-frame').scrollIntoViewIfNeeded();
    const demoFrame = page.frameLocator('.environment-native-frame');
    await demoFrame.locator('[data-app-id="gridwell_calendar"]').waitFor();
    for (const phase of phases) {
      await page.locator('.environment-native-phase button').nth(phase === 'initial' ? 0 : 1).click();
      await demoFrame.locator('[data-app-id="gridwell_calendar"]').waitFor();
      await checkNativeCalendar(demoFrame, fixtures.demo, phase, zone, 'homepage-dinner');
    }
    for (const [kind, fixture] of Object.entries(fixtures).filter(([kind]) => kind !== 'demo')) {
      await page.goto(new URL(`deep-dive.html#task=${fixture.id}`, base).href, { waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: 'Desktop GUI', exact: true }).click();
      const desktopFrame = page.frameLocator('.mv-desktop-frame');
      for (const phase of phases) {
        await page.getByRole('group', { name: 'Desktop environment state' }).getByRole('button', { name: phase === 'initial' ? 'Initial state' : 'Gold final state', exact: true }).click();
        await desktopFrame.locator('[data-app-id="gridwell_calendar"]').waitFor();
        await checkNativeCalendar(desktopFrame, fixture, phase, zone, `explorer-${kind}`);
      }
      await page.getByRole('tab', { name: 'Service states', exact: true }).click();
      for (const phase of phases) await checkAgenda(page, fixture, phase, zone);
    }
    await context.close();
    console.log(`PASS calendar snapshot API, homepage dinner, explorer desktop and agenda in ${zone}`);
  }
  assert.deepEqual(report.errors, [], 'No uncaught browser errors');
  await writeFile(path.join(output, 'calendar-timezone-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${report.checks.length} focused calendar checks and ${report.screenshots.length} screenshots to ${output}`);
} finally {
  await browser.close();
}
