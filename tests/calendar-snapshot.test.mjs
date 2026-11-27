/** Calendar DB snapshots store naive UTC timestamps and the original offset. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
async function loadModule(file) {
  const result = await build({ entryPoints: [path.join(root, file)], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const [{ readSnapshotTool }, { calendarTime, getServiceView }] = await Promise.all([
  loadModule('gui-src/frontend/src/snapshotReadTools.ts'),
  loadModule('src/components/explorer/detail/serviceStateModel.ts'),
]);
const read = (tool, params, db) => readSnapshotTool('gridwell_calendar', tool, params, { gridwell_calendar: db });
const timeFields = ['start', 'end', 'originalStartTime'];
const displayTime = (value) => value?.dateTime ? [value.dateTime, value.timeZone].filter(Boolean).join(' · ') : value?.date || '';
function calendar(events) {
  return { calendars: { primary: { id: 'primary', primary: true } }, events: Object.fromEntries(events.map(event => [`primary:${event.id}`, event])) };
}

const cases = [
  ['previous local day', { dateTime: '2026-02-16T01:30:00', offset: '-06:00', timeZone: 'America/Chicago' }, '2026-02-15T19:30:00-06:00'],
  ['next local month', { dateTime: '2026-01-31T22:45:00', offset: '+05:30', timeZone: 'Asia/Kolkata' }, '2026-02-01T04:15:00+05:30'],
  ['quarter-hour offset', { dateTime: '2026-01-01T00:00:00', offset: '+05:45' }, '2026-01-01T05:45:00+05:45'],
  ['zero offset', { dateTime: '2026-02-16T01:30:00', offset: '+00:00' }, '2026-02-16T01:30:00+00:00'],
  ['DST before spring transition', { dateTime: '2026-03-08T07:30:00', offset: '-06:00', timeZone: 'America/Chicago' }, '2026-03-08T01:30:00-06:00'],
  ['DST after spring transition', { dateTime: '2026-03-08T08:30:00', offset: '-05:00', timeZone: 'America/Chicago' }, '2026-03-08T03:30:00-05:00'],
  ['DST repeated hour first occurrence', { dateTime: '2026-11-01T06:30:00', offset: '-05:00', timeZone: 'America/Chicago' }, '2026-11-01T01:30:00-05:00'],
  ['DST repeated hour second occurrence', { dateTime: '2026-11-01T07:30:00', offset: '-06:00', timeZone: 'America/Chicago' }, '2026-11-01T01:30:00-06:00'],
  ['fractional second', { date: null, dateTime: '2026-02-16T01:30:00.125', offset: '-06:00' }, '2026-02-15T19:30:00.125-06:00'],
  ['explicit RFC3339', { dateTime: '2026-02-15T19:30:00-06:00', offset: '-08:00', timeZone: 'America/Chicago' }],
  ['explicit UTC', { dateTime: '2026-02-16T01:30:00Z', offset: '-06:00' }],
  ['all-day', { date: '2026-02-15', dateTime: null, offset: null, timeZone: null }],
  ['all-day with stored offset', { date: '2026-02-15', offset: '+00:00', timeZone: 'Europe/London' }],
  ['missing offset', { dateTime: '2026-02-16T01:30:00', timeZone: 'America/Chicago' }],
  ['null offset', { dateTime: '2026-02-16T01:30:00', offset: null }],
  ['invalid offset minute', { dateTime: '2026-02-16T01:30:00', offset: '+05:99' }],
  ['invalid offset hour', { dateTime: '2026-02-16T01:30:00', offset: '+24:00' }],
  ['malformed date', { dateTime: 'not-a-date', offset: '-06:00' }],
];

for (const timezone of ['UTC', 'America/Chicago', 'Europe/London', 'Asia/Seoul']) {
  test(`get/list/instances and explorer display use stored offsets in ${timezone}`, () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = timezone;
    try {
      for (const [label, source, expectedDateTime] of cases) {
        const expected = structuredClone(source);
        if (expectedDateTime) {
          expected.dateTime = expectedDateTime;
          delete expected.offset;
        }
        const db = calendar([{ id: 'event', summary: label, recurringEventId: 'series', start: source, end: source, originalStartTime: source }]);
        const raw = structuredClone(db);
        const results = [
          read('get_event', { calendarId: 'primary', eventId: 'event' }, db),
          read('list_events', { calendarId: 'primary' }, db).items[0],
          read('list_event_instances', { calendarId: 'primary', eventId: 'series' }, db).items[0],
        ];
        for (const result of results) {
          for (const field of timeFields) assert.deepEqual(result[field], expected, `${label}: ${field}`);
          result.start.dateTime = 'changed by native app';
        }
        assert.equal(calendarTime(source), displayTime(expected), `${label}: explorer time`);
        const record = getServiceView('gridwell_calendar', db).records[0];
        assert.equal(record.subtitle, displayTime(expected), `${label}: explorer agenda`);
        assert.equal(record.fields.find(field => field.label === 'Ends')?.value, displayTime(expected), `${label}: explorer end`);
        assert.deepEqual(db, raw, `${label}: projection and consumer mutations leave raw state intact`);
      }
      assert.equal(calendarTime('2026-02-15'), '2026-02-15');
      assert.equal(calendarTime(null), '');
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  test(`date bounds and mixed-offset ordering compare actual instants in ${timezone}`, () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = timezone;
    try {
      const db = calendar([
        { id: 'later', start: { dateTime: '2026-02-16T13:00:00', offset: '-08:00' }, end: { dateTime: '2026-02-16T14:00:00', offset: '-08:00' } },
        { id: 'earlier', start: { dateTime: '2026-02-16T12:00:00', offset: '+09:00' }, end: { dateTime: '2026-02-16T12:30:00', offset: '+09:00' } },
        { id: 'dinner', recurringEventId: 'dinner-series', start: { dateTime: '2026-02-16T01:30:00', offset: '-06:00' }, end: { dateTime: '2026-02-16T03:00:00', offset: '-06:00' } },
      ]);
      assert.deepEqual(read('list_events', { calendarId: 'primary' }, db).items.map(event => event.id), ['dinner', 'earlier', 'later']);
      const bounds = { calendarId: 'primary', timeMin: '2026-02-15T00:00:00-06:00', timeMax: '2026-02-16T00:00:00-06:00' };
      assert.deepEqual(read('list_events', bounds, db).items.map(event => event.id), ['dinner']);
      assert.deepEqual(read('list_event_instances', { ...bounds, eventId: 'dinner-series' }, db).items.map(event => event.id), ['dinner']);
      assert.deepEqual(read('list_events', { ...bounds, timeMax: '2026-02-15T19:30:00-06:00' }, db).items, []);
      assert.deepEqual(read('list_events', { ...bounds, timeMin: '2026-02-15T21:00:01-06:00' }, db).items, []);
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });
}

async function readSnapshot(file) {
  return JSON.parse(gunzipSync(await readFile(path.join(root, file))));
}

test('homepage dinner recurrence restores Sunday evening in both authored phases', async () => {
  for (const phase of ['initial', 'final']) {
    const { data } = await readSnapshot(`public/data/demos/figure1-message-demo/${phase}.json.gz`);
    const db = data.gridwell_calendar;
    const raw = structuredClone(db);
    const dinner = read('get_event', { calendarId: 'fam-vance', eventId: 'event-0003' }, db);
    assert.equal(dinner.start.dateTime, '2026-01-04T18:00:00-06:00');
    assert.equal(dinner.end.dateTime, '2026-01-04T20:00:00-06:00');
    assert.deepEqual(dinner.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20260530T160000Z']);
    assert.equal(calendarTime(db.events['fam-vance:event-0003'].start), '2026-01-04T18:00:00-06:00 · America/Chicago');
    assert.deepEqual(db, raw, `${phase}: raw authored dinner snapshot remains unchanged`);
  }
});

test('every exported initial/final calendar snapshot preserves instants and raw records', async () => {
  const files = [];
  for (const directory of ['public/data/states', 'public/data/demos']) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const phase of ['initial', 'final']) files.push(`${directory}/${entry.name}/${phase}.json.gz`);
    }
  }
  const counts = { snapshotFiles: files.length, calendarSnapshots: 0, events: 0, convertedTimes: 0, unchangedTimes: 0 };
  for (const file of files) {
    const db = (await readSnapshot(file)).data?.gridwell_calendar;
    if (!db?.events) continue;
    counts.calendarSnapshots++;
    const raw = JSON.stringify(db);
    const sourceEvents = Object.entries(db.events);
    const agenda = getServiceView('gridwell_calendar', db);
    assert.equal(agenda.records.length, sourceEvents.length, `${file}: agenda includes every event`);
    const listed = new Map();
    for (const [key, source] of sourceEvents) {
      counts.events++;
      const calendarId = source.calendarId || source.calendar_id || (source.id && key.endsWith(`:${source.id}`) ? key.slice(0, -String(source.id).length - 1) : undefined);
      if (!listed.has(calendarId)) listed.set(calendarId, read('list_events', { calendarId, showDeleted: true }, db).items);
      const result = read('get_event', { calendarId, eventId: source.id }, db);
      const listResult = listed.get(calendarId).find(event => event.id === source.id);
      assert(listResult, `${file}:${key}: list includes event`);
      for (const field of timeFields) {
        const sourceTime = source[field];
        const projected = result[field];
        const label = `${file}:${key}:${field}`;
        assert.deepEqual(listResult[field], projected, `${label}: list and get agree`);
        if (sourceTime?.dateTime && !sourceTime.date && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(sourceTime.dateTime) && /^[+-](?:[01]\d|2[0-3]):[0-5]\d$/.test(sourceTime.offset || '')) {
          counts.convertedTimes++;
          assert.equal(Date.parse(projected.dateTime), Date.parse(`${sourceTime.dateTime}Z`), `${label}: UTC instant preserved`);
          assert(projected.dateTime.endsWith(sourceTime.offset), `${label}: original offset restored`);
          assert.equal(Object.hasOwn(projected, 'offset'), false, `${label}: internal offset removed from API projection`);
          const { dateTime: _sourceDateTime, offset: _sourceOffset, ...sourceMetadata } = sourceTime;
          const { dateTime: _projectedDateTime, ...projectedMetadata } = projected;
          assert.deepEqual(projectedMetadata, sourceMetadata, `${label}: other fields preserved`);
        } else {
          counts.unchangedTimes++;
          assert.deepEqual(projected, sourceTime, `${label}: values without a stored UTC offset are preserved`);
        }
        assert.equal(calendarTime(sourceTime), displayTime(projected), `${label}: explorer matches native API time`);
      }
      const record = agenda.records.find(record => record.path.at(-1) === key);
      assert.equal(record.subtitle, displayTime(result.start), `${file}:${key}: agenda start`);
      assert.equal(record.fields.find(field => field.label === 'Ends')?.value || '', displayTime(result.end), `${file}:${key}: agenda end`);
    }
    assert.equal(JSON.stringify(db), raw, `${file}: all raw calendar records remain unchanged`);
  }
  assert(counts.calendarSnapshots > 2 && counts.convertedTimes > 0, 'both validation tasks and the demo were checked');
  console.log('Calendar snapshot coverage:', JSON.stringify(counts));
});
