import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/tests';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(modulePath) : await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
// A first visit shows the latest release (v1.1.0), so the expected counts come from its task file.
const tasks = JSON.parse(await readFile(path.join(root, 'public/data/v1.1.0/tasks.json'), 'utf8'));
const results = [];
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
page.on('pageerror', error => errors.push(error.message));
await mkdir(output, { recursive: true });
const check = (name, details = {}) => { results.push({ name, passed: true, ...details }); console.log(`PASS ${name}`); };
const waitCount = async (count) => page.waitForFunction(expected => document.querySelector('.mv-results-meta strong')?.textContent === String(expected), count);
const tab = name => page.getByRole('tab', { name, exact: true });
const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Document must not overflow horizontally');

try {
  // The task explorer is on the deep-dive page.
  await page.goto(new URL('deep-dive.html', base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('.mv-task-card').first().waitFor();
  await waitCount(400);
  assert.equal(await page.locator('.mv-task-card').count(), 9);
  for (const code of ['ST', 'IF', 'MT', 'MTIF']) {
    await page.getByRole('button', { name: new RegExp(`^${code}:`) }).click();
    await waitCount(100);
    assert.deepEqual([...new Set(await page.locator('.mv-task-grid .mv-setting-badge').allTextContents())], [code]);
  }
  check('Exactly 400 tasks; every task setting filters to 100');

  await page.getByRole('button', { name: /All settings/ }).click();
  const tool = [...new Set(tasks.flatMap(task => task.tools))].find(name => tasks.filter(task => task.tools.includes(name)).length < 400);
  const toolCount = tasks.filter(task => task.tools.includes(tool)).length;
  await page.getByRole('combobox', { name: 'Filter tasks by service' }).selectOption(tool);
  await waitCount(toolCount);
  await page.getByRole('button', { name: /^IF:/ }).click();
  await waitCount(tasks.filter(task => task.tools.includes(tool) && task.taskType === 'IF').length);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await waitCount(400);
  check('Service filter composes with setting filter and reset', { tool, toolCount });

  const search = page.getByRole('searchbox', { name: 'Search all validation tasks' });
  assert.equal(await search.getAttribute('placeholder'), 'Search tasks by title, query, or service…');
  await search.fill(tasks[0].id);
  await waitCount(1);
  // A label that no card shows is not searched.
  await search.fill('USER_SIMULATION_SAMPLE');
  await waitCount(0);
  await search.fill('no-task-matches-this-unique-search-9428673');
  await waitCount(0);
  await page.getByText('No matching tasks', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear all filters', exact: true }).click();
  await waitCount(400);
  const firstTitle = await page.locator('.mv-task-card h3').first().textContent();
  await page.getByRole('button', { name: 'Next task page', exact: true }).click();
  assert.notEqual(await page.locator('.mv-task-card h3').first().textContent(), firstTitle);
  await page.getByRole('button', { name: 'Previous task page', exact: true }).click();
  assert.equal(await page.locator('.mv-task-card h3').first().textContent(), firstTitle);
  check('Search by task ID, empty results, reset, and pagination');
  await page.locator('.mv-task-grid').screenshot({ path: path.join(output, 'explorer-desktop.png') });

  await page.locator('.mv-task-card').first().click();
  await tab('Overview').waitFor();
  assert.equal(new URL(page.url()).hash, `#task=${tasks[0].id}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await tab('Overview').waitFor();
  assert((await page.getByRole('dialog').innerText()).includes(tasks[0].title));
  const sections = {
    Overview: 'User query',
    'Context & dialogue': 'Dialogue',
    Instructions: 'System',
    Evaluation: 'verification',
    'Source & setup': 'Source',
  };
  for (const [name] of Object.entries(sections)) {
    await tab(name).click();
    assert((await page.getByRole('tabpanel').innerText()).length > 40, `${name} must display real task content`);
  }
  check('Task hash survives refresh; task details and authored content render');

  await tab('Gold trajectory').click();
  const detail = JSON.parse(gunzipSync(await readFile(path.join(root, `public/data/v1.1.0/tasks/${tasks[0].id}.json.gz`))).toString());
  const steps = detail.goldTrajectories[0].steps;
  const trajectory = page.getByRole('list', { name: 'Gold trajectory steps' });
  const rendered = trajectory.locator(':scope > li');
  const collapsedMatch = (await page.getByRole('tabpanel').innerText()).match(/(\d+) duplicate system entr/);
  const collapsed = collapsedMatch ? Number(collapsedMatch[1]) : 0;
  assert.equal(await rendered.count(), steps.length - collapsed);
  assert((await rendered.last().innerText()).includes(`Step ${steps.at(-1).step}`));
  await rendered.last().scrollIntoViewIfNeeded();
  const box = await rendered.last().boundingBox();
  assert(box && box.y < 1000 && box.y + box.height > 0, 'The final source step is reachable in the dialog scrollbar');
  await noOverflow();
  check('Complete reference trajectory is simultaneously rendered and final step reachable', { sourceSteps: steps.length, displayedSteps: steps.length - collapsed });

  await tab('Service states').click();
  await page.getByRole('navigation', { name: 'State services' }).waitFor();
  await page.getByRole('button', { name: 'Inspect gridwell_mail state', exact: true }).click();
  await page.getByRole('region', { name: 'Mail state viewer' }).waitFor();
  const records = page.getByLabel('Mail records', { exact: true }).getByRole('button');
  assert(await records.count() > 0);
  await records.first().click();
  assert(await page.getByRole('button', { name: 'Inspect record data', exact: true }).isVisible());
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  assert(await page.getByRole('table').isVisible());
  await page.getByRole('button', { name: 'Tree', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Tree', exact: true }).getAttribute('aria-pressed'), 'true');
  assert(await page.getByRole('tabpanel').locator('button[aria-expanded]').count() > 0);
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  assert(await page.getByLabel('State source · gridwell_mail', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'App view', exact: true }).click();
  await page.getByRole('button', { name: 'Gold final state', exact: true }).click();
  await page.getByRole('region', { name: 'Mail state viewer' }).waitFor();
  await page.getByRole('button', { name: 'Gold DB diff', exact: true }).click();
  assert((await page.getByRole('tabpanel').innerText()).includes('Gold'));
  check('Service records, App/Table/Tree/JSON modes, final snapshot, and authored diff');

  await tab('Desktop GUI').click();
  const frame = page.getByTitle(new RegExp('MultiVerse desktop:'));
  assert((await frame.getAttribute('src')).includes(`task=${tasks[0].id}&phase=initial`));
  await page.getByRole('button', { name: 'Gold final state', exact: true }).click();
  assert((await frame.getAttribute('src')).includes('&phase=final'));
  assert((await page.getByRole('link', { name: 'Open full screen' }).getAttribute('href')).includes('&phase=final'));
  const desktopNote = page.locator('[data-desktop-note]');
  const desktopNoteText = (await desktopNote.innerText()).replace(/\s+/g, ' ').trim();
  assert(desktopNoteText.startsWith('The GUIs are supplementary and are not used in the evaluation.'));
  assert(desktopNoteText.includes('a bug in a GUI does not affect benchmark results'));
  assert.equal(await desktopNote.getByRole('link', { name: 'code repository' }).getAttribute('href'), 'https://github.com/google-deepmind/MultiVerse');
  // The note is read before the desktop: it sits above the frame.
  assert((await desktopNote.boundingBox()).y < (await frame.boundingBox()).y);
  check('Desktop GUI iframe and full-screen link follow initial/final selection; the note above the desktop says the GUIs are not used in the evaluation');

  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mv-task-card').first().scrollIntoViewIfNeeded();
  await noOverflow();
  await page.screenshot({ path: path.join(output, 'explorer-mobile.png') });
  await page.locator('.mv-task-card').first().click();
  await tab('Gold trajectory').click();
  await page.getByRole('list', { name: 'Gold trajectory steps' }).locator(':scope > li').last().scrollIntoViewIfNeeded();
  await noOverflow();
  await page.getByRole('dialog').screenshot({ path: path.join(output, 'task-mobile.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert(await page.locator('.mv-task-card').first().evaluate(element => element === document.activeElement), 'Closing dialog returns focus to the opening task');
  check('390px mobile layout has no document overflow; full trajectory and focus restoration work');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  check('No uncaught browser errors');
  await writeFile(path.join(output, 'explorer-report.json'), JSON.stringify({ base, results, errors }, null, 2));
} finally {
  await browser.close();
}
console.log(`Saved browser evidence to ${output}`);
