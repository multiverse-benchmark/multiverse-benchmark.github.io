// Views of a task in the task explorer:
//   - the focused view, in which the task takes the whole window;
//   - the list of hints at the top of a gold trajectory, which leads to each hint;
//   - a model's run in two panes: the verifier results stay while the trajectory scrolls.
//
//   BASE_URL=http://127.0.0.1:4173/ node tests/task-views.browser.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = (process.env.BASE_URL || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const out = process.env.QA_OUTPUT_DIR || 'artifacts/tests';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(modulePath) : await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
await mkdir(out, { recursive: true });

// ---------------------------------------------------------------- the focused view
{
const task = '43pga4co7c4gifkfjrw34888xu7eiwyj';
for (const [width, height] of [[1440, 900], [390, 844]]) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}deep-dive.html#task=${task}&section=trajectories`, { waitUntil: 'load' });
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator('[data-run-row]').first().waitFor({ timeout: 20000 });
  const box = async () => dialog.evaluate(node => { const r = node.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; });
  const before = await box();
  assert.equal(await dialog.getAttribute('data-task-view'), 'dialog');
  await dialog.locator('[data-task-focus]').click();
  await page.waitForTimeout(250);
  assert.equal(await dialog.getAttribute('data-task-view'), 'focus');
  assert.deepEqual(await box(), [0, 0, width, height], `focused view fills the window at ${width}`);
  assert.equal(new URL(page.url()).searchParams.get('view'), 'focus');
  assert.equal(new URL(page.url()).hash, `#task=${task}&section=trajectories`, 'the address keeps the task and the tab');
  await page.screenshot({ path: `${out}/focus-${width}.png` });
  // The tab, a model and another task keep the view; a reload of the address opens it focused.
  await dialog.getByRole('tab', { name: 'Gold trajectory' }).click();
  await dialog.getByRole('list', { name: 'Gold trajectory steps' }).locator(':scope > li').first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get('view'), 'focus');
  await page.reload({ waitUntil: 'load' });
  await dialog.getByRole('list', { name: 'Gold trajectory steps' }).locator(':scope > li').first().waitFor();
  assert.equal(await dialog.getAttribute('data-task-view'), 'focus', 'the address opens the focused view');
  assert.deepEqual(await box(), [0, 0, width, height]);
  // Leaving the view returns the dialog; Escape still closes the task.
  await dialog.locator('[data-task-focus]').click();
  await page.waitForTimeout(250);
  assert.equal(await dialog.getAttribute('data-task-view'), 'dialog');
  assert.deepEqual(await box(), before, 'the dialog has its earlier frame again');
  assert.equal(new URL(page.url()).searchParams.get('view'), null);
  await dialog.locator('[data-task-focus]').click();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  // The next task opens as the last one was left.
  await page.locator('.mv-task-card').first().click();
  await dialog.getByRole('tab', { name: 'Overview' }).waitFor();
  assert.equal(await dialog.getAttribute('data-task-view'), 'focus', 'the next task opens focused');
  assert.deepEqual(errors, []);
  console.log(`PASS focused view at ${width}x${height}: fills the window, in the address, kept across tabs, reload and tasks; dialog frame ${before.join(',')} restored`);
  await context.close();
}
}

// ---------------------------------------------------------------- the hints of a gold trajectory
{
// The steps that are hints in the gold trajectory of six v1.1.0 tasks: one marked [SYSTEM HINT], unmarked ones in
// single-turn tasks (every user message after the query) and in multi-turn tasks (a user message that does not follow
// a message of the agent), and a task without any.
const expected = {
  '43pga4co7c4gifkfjrw34888xu7eiwyj': [38],
  '0bppzdhfn4yf2qabngzbw24519svowxr': [94],
  '0c4ryig02uma5s8gial19n4k0b3xfi1z': [36],
  '0ljx7oet7sarm92wijbcyhp14d65t5rr': [6],
  '0m8flz38nxfxcj0gotcd18wp3onrv1b8': [3, 73],
  '0mkt5pm5uxl2rbwpqlom6pzum4ujdxje': [],
};
const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, reducedMotion: 'reduce' });
const errors = []; page.on('pageerror', e => errors.push(e.message));
for (const [task, steps] of Object.entries(expected)) {
  await page.goto(`${base}deep-dive.html#task=${task}&section=gold-trajectory`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  const dialog = page.locator('[role="dialog"]');
  const list = dialog.getByRole('list', { name: 'Gold trajectory steps' });
  await list.locator(':scope > li').first().waitFor({ timeout: 20000 });
  const hints = dialog.locator('[data-trajectory-hints]');
  if (!steps.length) { assert.equal(await hints.count(), 0, `${task}: no list of hints`); console.log(`PASS ${task.slice(0, 8)}: no hints, no list`); continue; }
  assert.deepEqual((await hints.locator('button').evaluateAll(nodes => nodes.map(node => Number(node.dataset.hintStep)))), steps, `${task}: listed hints`);
  assert((await hints.innerText()).includes(`${steps.length} ${steps.length === 1 ? 'hint' : 'hints'} given in this gold trajectory`));
  assert.deepEqual(await list.locator(':scope > li[data-step-hint]').evaluateAll(nodes => nodes.map(node => Number(node.dataset.step))), steps, `${task}: steps labelled as hints`);
  // With a filter on, a hint of the list still leads to its step.
  await dialog.getByRole('combobox', { name: 'Filter gold trajectory step type' }).selectOption('user');
  const last = steps.at(-1);
  await hints.locator(`button[data-hint-step="${last}"]`).click();
  await page.waitForTimeout(350);
  const step = list.locator(`:scope > li[data-step="${last}"]`);
  assert.equal(await step.getAttribute('data-step-target'), 'true', `${task}: the step is marked`);
  const inView = await step.evaluate(node => { const area = node.closest('.overflow-y-auto').getBoundingClientRect(); const top = node.getBoundingClientRect().top; return top >= area.top - 2 && top < area.top + 80; });
  assert.equal(inView, true, `${task}: the step is at the top of the view`);
  assert((await step.innerText()).startsWith('Hint'), `${task}: the step is labelled Hint`);
  console.log(`PASS ${task.slice(0, 8)}: ${steps.length} hint(s) listed (steps ${steps.join(', ')}); a click leads to step ${last}`);
  if (task.startsWith('0m8flz38')) { await dialog.locator('.overflow-y-auto').first().evaluate(node => { node.scrollTop = 0; }); await page.screenshot({ path: `${out}/hint-list.png` }); }
}
assert.deepEqual(errors, []);
  await page.close();
}

// ---------------------------------------------------------------- a run in two panes
{
const task = '2jqsj59tjm7ltrs60oqxwey4s1wgsitv', model = 'claude_opus_5_5';
for (const [width, height, focus] of [[1440, 900, false], [1920, 1080, true], [1100, 800, false], [390, 844, false]]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}deep-dive.html${focus ? '?view=focus' : ''}#task=${task}&section=trajectories&model=${model}`, { waitUntil: 'load' });
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator(`[data-run="${model}/${task}"]`).waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  const geometry = () => dialog.locator('[data-run]').evaluate(node => {
    const r = element => { const b = element.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
    const area = r(node.closest('.overflow-y-auto'));
    const verifiers = node.querySelector('[data-run-pane="verifiers"]'), trajectory = node.querySelector('[data-run-pane="trajectory"]');
    return { area, run: r(node), verifiers: r(verifiers), trajectory: r(trajectory), card: r(node.querySelector('[data-run-verifier]')),
      trajectoryScrolls: trajectory.scrollHeight > trajectory.clientHeight + 50, scrollTop: trajectory.scrollTop, outer: node.closest('.overflow-y-auto').scrollTop };
  });
  const before = await geometry();
  // The run takes the height of the scrolling area, down to its minimum height where that area is very short.
  const fits = before.run.bottom <= before.area.bottom + 1;
  const atMinimum = before.run.bottom - before.run.top <= 441;
  assert(before.run.top >= before.area.top && (fits || atMinimum), `the run fits the scrolling area at ${width}: ${JSON.stringify(before)}`);
  assert(before.trajectoryScrolls, 'the trajectory scrolls in its own pane');
  const sideBySide = before.trajectory.left >= before.verifiers.right;
  assert.equal(sideBySide, width >= 1280, `side by side from 1280px (${width})`);
  // Scrolling the trajectory moves neither the verifier results nor the area around the run.
  await dialog.locator('[data-run-pane="trajectory"]').hover();
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(300);
  const after = await geometry();
  assert(after.scrollTop >= 1000, `the trajectory pane scrolled (${after.scrollTop})`);
  assert.deepEqual(after.card, before.card, 'the verifier results stayed in place');
  assert.equal(after.outer, before.outer, 'the area around the run did not move');
  // A verifier opens next to the trajectory.
  const detail = dialog.locator('[data-run-verifier-detail="response"]');
  await detail.locator(':scope > summary').click();
  assert((await detail.innerText()).includes('Rationale of vote'));
  await page.screenshot({ path: `${out}/panes-${width}${focus ? '-focus' : ''}.png` });
  assert.deepEqual(errors, []);
  console.log(`PASS ${width}x${height}${focus ? ' focused' : ''}: ${sideBySide ? 'side by side' : 'stacked'}; the trajectory scrolls in its pane (${after.scrollTop}px) and the verifier results stay`);
  await page.close();
}
}

await browser.close();
console.log('All checks of the task views passed.');
