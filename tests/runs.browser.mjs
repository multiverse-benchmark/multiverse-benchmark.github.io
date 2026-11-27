// The runs behind the v1.1.0 validation leaderboard, as the task explorer
// shows them: the "Trajectories" tab of a task, beside its "Gold trajectory".
//
// Every value is checked against the files the page ships: the run index and
// the run files.
//
//   BASE_URL=http://127.0.0.1:4173/ node tests/runs.browser.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:4173/');
const output = process.env.QA_OUTPUT_DIR || 'artifacts/tests';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(modulePath) : await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
await mkdir(output, { recursive: true });
const check = name => console.log(`PASS ${name}`);

const root = path.resolve(import.meta.dirname, '..');
const index = JSON.parse(await readFile(path.join(root, 'public/data/v1.1.0/runs/index.json'), 'utf8'));
const tasks = JSON.parse(await readFile(path.join(root, 'public/data/v1.1.0/tasks.json'), 'utf8'));
const leaderboard = JSON.parse(await readFile(path.join(root, 'src/data/leaderboard.v1.1.0.json'), 'utf8')).sets.validation;
const runFile = async (model, task) => JSON.parse(gunzipSync(await readFile(path.join(root, `public/data/v1.1.0/runs/${model}/${task}.json.gz`))).toString('utf8'));
const modelName = Object.fromEntries(leaderboard.models.map(model => [model.id, model.name]));
const cellOf = (task, model) => index.cells[task][index.models.indexOf(model)];
const verdictsOf = run => run.verifiers.map(verifier => (!verifier.applicable ? 'na' : verifier.passed ? 'pass' : 'fail'));
const VERDICT = { p: 'pass', f: 'fail', n: 'na' };

async function openPage(width, height = 1000) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return { page, errors };
}
const stepsOf = dialog => dialog.getByRole('list', { name: 'Run trajectory steps' }).locator(':scope > li');
/** Whether the run starts at the top of the dialog's scrolling area and its trajectory begins inside the visible part. */
const runInView = dialog => dialog.locator('[data-run]').evaluate(node => {
  const area = node.closest('.overflow-y-auto').getBoundingClientRect();
  const top = node.getBoundingClientRect().top;
  const steps = node.querySelector('ol[aria-label="Run trajectory steps"]').getBoundingClientRect().top;
  return top >= area.top - 2 && top <= area.top + 48 && (steps < area.bottom || area.height < 700);
});

// ---------------------------------------------------------------- the tabs of a task
{
  const { page, errors } = await openPage(1440);
  // A task that some models passed and some failed, with instructions.
  const task = Object.keys(index.cells).find(id => { const codes = index.cells[id]; return codes.some(code => code[0] === 'P') && codes.some(code => code[0] === 'F') && codes[0][4] !== 'n'; });
  await page.goto(new URL(`deep-dive.html#task=${task}`, base).href, { waitUntil: 'load' });
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByRole('tab', { name: 'Overview' }).waitFor();
  const tabs = await dialog.getByRole('tab').allInnerTexts();
  const at = name => tabs.findIndex(text => text.trim() === name);
  assert(at('Gold trajectory') >= 0 && at('Trajectories') === at('Gold trajectory') + 1 && at('Evaluation') === at('Trajectories') + 1, `Gold trajectory, Trajectories, Evaluation in this order: ${tabs.join(' | ')}`);
  assert.equal(at('Model runs'), -1, 'no tab named Model runs');
  check('tabs: Gold trajectory, then Trajectories, then Evaluation');

  await dialog.getByRole('tab', { name: 'Gold trajectory' }).click();
  await dialog.getByRole('list', { name: 'Gold trajectory steps' }).locator(':scope > li').first().waitFor();
  check('the Gold trajectory tab shows the gold trajectory');

  // The Trajectories tab: one row per model, the first model's run under the table.
  await dialog.getByRole('tab', { name: 'Trajectories', exact: true }).click();
  await dialog.locator('[data-run]').waitFor();
  assert.equal(new URL(page.url()).hash, `#task=${task}&section=trajectories`);
  assert.deepEqual(await dialog.locator('[data-run-row]').evaluateAll(rows => rows.map(row => row.dataset.runRow)), index.models, 'one row per model, in the order of the leaderboard');
  const shown = await dialog.locator('[data-run-row]').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('[role="img"]')].map(mark => mark.getAttribute('aria-label'))));
  index.models.forEach((model, row) => {
    const code = cellOf(task, model);
    ['assertion', 'dbdiff', 'response', 'instruction'].forEach((_, column) => {
      const want = VERDICT[code[column + 1]];
      assert(shown[row][column].endsWith(want === 'na' ? 'not applicable' : want === 'pass' ? 'passed' : 'failed'), `${model}: verdict ${column} of the table`);
    });
  });
  assert.deepEqual(await dialog.locator('[data-run-row] [data-run-harness]').evaluateAll(badges => badges.map(badge => badge.dataset.runHarness)), index.models.map(() => index.harness), 'every model row identifies its harness');
  check('Trajectories tab: every model with its outcome and verdicts, as in the run index');

  // Selecting a model, anywhere on its row, shows that model's trajectory and brings it into view.
  for (const model of [index.models.find(id => cellOf(task, id)[0] === 'F'), index.models.find(id => cellOf(task, id)[0] === 'P'), index.models.at(-1)]) {
    const run = await runFile(model, task);
    await dialog.locator(`[data-run-row="${model}"] td`).nth(1).click();
    await dialog.locator(`[data-run="${model}/${task}"]`).waitFor();
    await page.waitForTimeout(400);
    assert.equal(await dialog.locator(`[data-run-row="${model}"]`).getAttribute('data-selected'), 'true');
    assert.equal(await dialog.locator('[data-run]').getAttribute('data-run-passed'), String(run.passed), `${model}: outcome`);
    assert.equal(await dialog.locator('[data-run] [data-run-harness]').getAttribute('data-run-harness'), run.harness, `${model}: selected run identifies its harness`);
    assert.equal(await runInView(dialog), true, `${model}: the run is brought into view`);
    assert((await dialog.locator('[data-run]').innerText()).includes(`Trajectory of ${modelName[model]}`), `${model}: the trajectory is headed with the model`);
    assert.equal(await stepsOf(dialog).count(), run.steps.length, `${model}: every step of the trajectory`);
    const firstCall = run.steps.find(step => step.action === 'tool_use');
    if (firstCall) assert((await dialog.locator('[data-run]').innerText()).includes(firstCall.tool), `${model}: the first tool call`);
    assert.deepEqual(await dialog.locator('[data-run-verifier]').evaluateAll(cards => cards.map(card => card.dataset.verdict)), verdictsOf(run), `${model}: verdict of each verifier`);
    assert.equal(new URL(page.url()).hash, `#task=${task}&section=trajectories&model=${model}`, `${model}: the address names the run`);
    check(`selecting ${modelName[model]} shows its trajectory (${run.steps.length} steps) and verifier results`);
  }
  await page.screenshot({ path: path.join(output, 'trajectories-run-1440.png') });

  // The rationale and the votes of a judge open on request.
  const model = index.models.at(-1);
  const run = await runFile(model, task);
  const judge = run.verifiers.find(verifier => verifier.votes);
  const detail = dialog.locator(`[data-run-verifier-detail="${judge.id}"]`);
  await detail.locator(':scope > summary').click();
  assert((await detail.innerText()).includes(judge.votes[judge.shown].text.trim().slice(0, 60)), 'rationale of a vote that agrees with the verdict');
  assert.equal(await detail.locator('details').count(), judge.votes.length, 'every vote is listed');
  check('a verifier opens to its rationale and all votes');

  // The selection is by the keyboard as well.
  const other = index.models[1];
  await dialog.locator(`[data-run-row="${other}"] button`).focus();
  await page.keyboard.press('Enter');
  await dialog.locator(`[data-run="${other}/${task}"]`).waitFor();
  check('a model is selected from the keyboard');

  await dialog.getByRole('tab', { name: 'Overview' }).click();
  await dialog.locator('[data-run-row]').first().waitFor({ state: 'detached' });
  await dialog.locator(`[data-run-row="${index.models[2]}"]`).waitFor({ state: 'detached' });
  await dialog.getByRole('tab', { name: 'Trajectories', exact: true }).click();
  await dialog.locator(`[data-run-row="${index.models[2]}"] td`).nth(1).click();
  await dialog.locator(`[data-run="${index.models[2]}/${task}"]`).waitFor();
  check('the tab works again after leaving it');
  assert.deepEqual(errors, [], 'no page errors');
  await page.close();
}

// ---------------------------------------------------------------- runs reached by address
{
  const { page, errors } = await openPage(1440);
  // A run that ended early, a run whose assertion failed, and the first task of the index.
  const early = Object.entries(index.terminations)[0];
  const failedAssertion = (() => { for (const [task, codes] of Object.entries(index.cells)) { const at = codes.findIndex(code => code[1] === 'f'); if (at >= 0) return [task, index.models[at]]; } })();
  for (const [task, model, what] of [[early[0], Object.keys(early[1])[0], 'ended early'], [...failedAssertion, 'failed assertion'], [Object.keys(index.cells)[0], index.models[0], 'first task']]) {
    const run = await runFile(model, task);
    await page.goto(new URL(`deep-dive.html#task=${task}&section=trajectories&model=${model}`, base).href, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    const dialog = page.locator('[role="dialog"]');
    await dialog.locator(`[data-run="${model}/${task}"]`).waitFor();
    assert.equal(await dialog.getByRole('tab', { name: 'Trajectories', exact: true }).getAttribute('data-state'), 'active', `${what}: the task opens on its trajectories`);
    assert.deepEqual(await dialog.locator('[data-run-verifier]').evaluateAll(cards => cards.map(card => card.dataset.verdict)), verdictsOf(run), `${what}: verdicts`);
    assert.equal(await dialog.locator('[data-run-termination]').count(), run.termination === 'completed' ? 0 : 1, `${what}: how the run ended`);
    const assertion = run.verifiers[0];
    const detail = dialog.locator('[data-run-verifier-detail="assertion"]');
    await detail.locator(':scope > summary').click();
    if (assertion.message) assert((await detail.innerText()).includes(assertion.message.split('\n')[0].slice(0, 80)), `${what}: message of the failed assertion`);
    assert.equal(await stepsOf(dialog).count(), run.steps.length, `${what}: steps`);
    check(`run by address (${what}): ${modelName[model]} on ${task.slice(0, 8)}`);
  }
  assert.deepEqual(errors, [], 'no page errors');
  await page.close();
}

// ---------------------------------------------------------------- the paper's release has no runs here
{
  const { page, errors } = await openPage(1440);
  await page.goto(new URL('deep-dive.html?release=v1.0.0', base).href, { waitUntil: 'load' });
  await page.locator('.mv-task-card').first().click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByRole('tab', { name: 'Overview' }).waitFor();
  assert.equal(await dialog.getByRole('tab', { name: 'Trajectories', exact: true }).count(), 0, 'no Trajectories tab on v1.0.0');
  await dialog.getByRole('tab', { name: 'Gold trajectory' }).click();
  await dialog.getByRole('list', { name: 'Gold trajectory steps' }).locator(':scope > li').first().waitFor();
  check('v1.0.0: the Gold trajectory tab only');
  assert.deepEqual(errors, [], 'no page errors');
  await page.close();
}

// ---------------------------------------------------------------- the result explorer of the deep dive
{
  const { page, errors } = await openPage(1440);
  await page.goto(new URL('deep-dive.html', base).href, { waitUntil: 'load' });
  const section = page.locator('#result-explorer');
  const grid = section.locator('[data-runs-grid]');
  // The result explorer is open without any action, right after the task explorer.
  await grid.locator('tbody tr').first().waitFor();
  const titleOf = id => page.locator(`#${id} .section-title`).evaluate(node => [node.querySelector('.section-title-number').textContent, node.lastChild.textContent]);
  assert.deepEqual(await page.locator('main > section[id]').evaluateAll(nodes => nodes.slice(0, 2).map(node => node.id)), ['explorer', 'result-explorer'], 'the deep dive opens with the two explorers');
  assert.deepEqual(await titleOf('explorer'), ['1', 'Task explorer']);
  assert.deepEqual(await titleOf('result-explorer'), ['2', 'Result explorer']);
  assert.equal(await grid.locator('[aria-expanded]').count(), 0, 'the result explorer has no toggle');
  await grid.scrollIntoViewIfNeeded();
  assert.equal(await grid.locator('tbody tr').count(), tasks.length, 'one row per validation task');
  assert.equal(await grid.locator('tbody a.rg-cell').count(), tasks.length * index.models.length, 'one cell per task and model');
  assert.deepEqual(await grid.locator('thead .rg-model-name').allInnerTexts(), index.models.map(id => modelName[id]), 'model columns in the order of the leaderboard');
  assert.deepEqual(await grid.locator('thead [data-run-harness]').evaluateAll(badges => badges.map(badge => badge.dataset.runHarness)), index.models.map(() => index.harness), 'each model column identifies its harness');
  // Every cell against the run index, and each model's column against its leaderboard cell.
  const shown = await grid.locator('tbody tr').evaluateAll(rows => rows.map(row => [row.dataset.rgTask, [...row.querySelectorAll('a.rg-cell')].map(cell => cell.dataset.passed === 'true')]));
  const passedByModel = index.models.map(() => 0);
  for (const [task, cells] of shown) {
    assert.deepEqual(cells, index.cells[task].map(code => code[0] === 'P'), `cells of ${task}`);
    cells.forEach((value, at) => { passedByModel[at] += value; });
  }
  index.models.forEach((model, at) => assert.equal(passedByModel[at], leaderboard.results.Average[model].bare.passed, `passed runs of ${model}`));
  check('result explorer: second section of the deep dive, open without a toggle; 400 rows, 4,800 cells equal to the run index, every column sums to the leaderboard');

  for (const setting of ['ST', 'IF', 'MT', 'MTIF']) {
    await grid.getByRole('radio', { name: setting, exact: true }).click();
    const passed = await grid.locator('tbody tr').evaluateAll(rows => { const sums = []; rows.forEach(row => [...row.querySelectorAll('a.rg-cell')].forEach((cell, at) => { sums[at] = (sums[at] || 0) + (cell.dataset.passed === 'true'); })); return sums; });
    index.models.forEach((model, at) => assert.equal(passed[at], leaderboard.results[setting][model].bare.passed, `${setting} passed runs of ${model}`));
  }
  await grid.getByRole('radio', { name: 'Fewest passes first' }).click();
  await grid.getByRole('radio', { name: 'All', exact: true }).click();
  const counts = (await grid.locator('tbody .rg-passed').allInnerTexts()).map(text => Number(text.split('/')[0]));
  assert.deepEqual(counts, [...counts].sort((a, b) => a - b), 'ordered by the number of models that passed');
  check('result explorer: each task setting sums to its leaderboard column; ordering by models passed');
  await grid.screenshot({ path: path.join(output, 'result-explorer-1440.png') });

  // A cell opens that model's trajectory in the task explorer; closing returns to the cell.
  const task = tasks.find(entry => index.cells[entry.id].some(code => code[0] === 'F')).id;
  const model = index.models.find(id => cellOf(task, id)[0] === 'F');
  const run = await runFile(model, task);
  await grid.locator(`tr[data-rg-task="${task}"] a.rg-cell`).nth(index.models.indexOf(model)).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator(`[data-run="${model}/${task}"]`).waitFor();
  assert.equal(await dialog.getByRole('tab', { name: 'Trajectories', exact: true }).getAttribute('data-state'), 'active', 'the task opens on its trajectories');
  assert.equal(await dialog.locator(`[data-run-row="${model}"]`).getAttribute('data-selected'), 'true', 'the model of the cell is selected');
  assert.equal(await stepsOf(dialog).count(), run.steps.length, 'every step of that trajectory');
  assert.equal(new URL(page.url()).hash, `#task=${task}&section=trajectories&model=${model}`, 'the address names the run');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('rg-cell')), true, 'the focus returns to the cell');
  check('a cell opens that model’s trajectory in the task explorer; closing returns to the cell');
  assert.deepEqual(errors, [], 'no page errors');
  await page.close();

  // The paper's release has the task explorer only, and its sections are numbered without the result explorer.
  const paper = await openPage(1440);
  await paper.page.goto(new URL('deep-dive.html?release=v1.0.0', base).href, { waitUntil: 'load' });
  await paper.page.locator('.mv-task-card').first().waitFor();
  assert.equal(await paper.page.locator('[data-runs-grid]').count(), 0, 'no result explorer on v1.0.0');
  assert.equal(await paper.page.locator('#result-explorer').count(), 0, 'no section of the result explorer on v1.0.0');
  assert.deepEqual(await paper.page.locator('[data-dive-card]').evaluateAll(cards => cards.map(card => card.dataset.diveCard)), ['explorer', 'principles', 'dataset', 'tools', 'releases'], 'the cards of v1.0.0');
  assert.deepEqual(await paper.page.locator('main > section[id] .section-title-number').allInnerTexts(), ['1', '2', '3', '4', '5'], 'the sections of v1.0.0 are numbered in order');
  await paper.page.close();
  // A phone-width page does not scroll sideways because of the table.
  const narrow = await openPage(390, 900);
  await narrow.page.goto(new URL('deep-dive.html', base).href, { waitUntil: 'load' });
  await narrow.page.locator('[data-runs-grid] tbody tr').first().waitFor();
  await narrow.page.locator('[data-runs-grid]').scrollIntoViewIfNeeded();
  assert.equal(await narrow.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways page scroll at 390');
  await narrow.page.locator('[data-runs-grid]').screenshot({ path: path.join(output, 'result-explorer-390.png') });
  await narrow.page.close();
  check('result explorer: absent on v1.0.0; fits a phone-width page');

  // The main page has neither explorer; its links and older links to a task lead to the deep dive.
  const main = await openPage(1440);
  await main.page.goto(new URL('index.html', base).href, { waitUntil: 'load' });
  await main.page.locator('[data-res]').waitFor();
  assert.equal(await main.page.locator('[data-runs-grid], .mv-task-card, #explorer, #result-explorer').count(), 0, 'no explorer on the main page');
  assert.deepEqual(await main.page.locator('main > section[id] .section-title-number').allInnerTexts(), ['1', '2', '3', '4', '5', '6'], 'the sections of the main page are numbered in order');
  assert.deepEqual(await main.page.locator('[data-dive-card]').evaluateAll(cards => cards.map(card => card.getAttribute('href').split('/').pop())), ['explorer', 'result-explorer', 'principles', 'dataset', 'tools', 'releases'].map(id => `deep-dive.html#${id}`), 'the cards of the main page lead to the parts of the deep dive');
  assert((await main.page.locator('.paper-button--explorer').getAttribute('href')).endsWith('deep-dive.html#explorer'), 'the title block leads to the task explorer');
  // The button to the result explorer follows the one to the task explorer, for the release that has one.
  assert.deepEqual(await main.page.locator('.paper-links-group').last().locator('a').allInnerTexts().then(texts => texts.map(text => text.trim())), ['Leaderboard', 'Task explorer', 'Result explorer', 'BibTeX'], 'the buttons of the title block');
  await main.page.locator('.paper-button--result-explorer').click();
  await main.page.locator('#result-explorer [data-runs-grid] tbody tr').first().waitFor();
  assert(new URL(main.page.url()).pathname.endsWith('/deep-dive.html'), 'the button opens the deep dive');
  assert.equal(await main.page.locator('#result-explorer').evaluate(node => { const top = node.getBoundingClientRect().top; return top >= -2 && top < 200; }), true, 'at the result explorer');
  // The validation leaderboard and the result explorer link to each other. The test set has no such link, and the
  // link of the result explorer leads to the validation set also when the test set was selected last.
  await main.page.goto(new URL('index.html', base).href, { waitUntil: 'load' });
  await main.page.locator('[data-res]').waitFor();
  assert((await main.page.locator('[data-res-result-explorer]').innerText()).trim().endsWith('Result explorer.'), 'the sentence under the validation leaderboard');
  assert((await main.page.locator('[data-res-result-explorer] a').getAttribute('href')).endsWith('deep-dive.html#result-explorer'), 'the validation leaderboard links to the result explorer');
  await main.page.locator('[data-res-set="test"]').click();
  await main.page.locator('[data-res][data-result-set="test"]').waitFor();
  assert.equal(await main.page.locator('[data-res-result-explorer]').count(), 0, 'no link to the result explorer under the test set');
  await main.page.goto(new URL('deep-dive.html', base).href, { waitUntil: 'load' });
  await main.page.locator('#result-explorer [data-runs-grid] tbody tr').first().waitFor();
  assert.equal((await main.page.locator('#result-explorer .section-heading p').innerText()).trim(), 'Explore the results and trajectories of the models on the validation set leaderboard.', 'the lead of the result explorer');
  await main.page.locator('[data-result-explorer-leaderboard]').click();
  await main.page.locator('[data-res][data-result-set="validation"]').waitFor();
  assert(!new URL(main.page.url()).pathname.endsWith('/deep-dive.html'), 'the link opens the main page');
  assert.equal(new URL(main.page.url()).hash, '#leaderboard', 'at the leaderboard');
  assert.equal(await main.page.locator('#leaderboard').evaluate(node => { const top = node.getBoundingClientRect().top; return top >= -2 && top < 200; }), true, 'with the leaderboard in view');
  await main.page.locator('[data-res-result-explorer] a').click();
  await main.page.locator('#result-explorer [data-runs-grid] tbody tr').first().waitFor();
  assert(new URL(main.page.url()).pathname.endsWith('/deep-dive.html'), 'and the leaderboard’s link leads back to the result explorer');
  await main.page.goto(new URL(`index.html#task=${task}&section=trajectories&model=${model}`, base).href, { waitUntil: 'load' });
  await main.page.locator('[role="dialog"]').locator(`[data-run="${model}/${task}"]`).waitFor();
  assert(new URL(main.page.url()).pathname.endsWith('/deep-dive.html'), 'a link to a task on the main page leads to the deep dive');
  assert.equal(new URL(main.page.url()).hash, `#task=${task}&section=trajectories&model=${model}`, 'with the task, the tab and the model');
  // Last, since the release a link names is kept for the rest of the visit.
  await main.page.goto(new URL('index.html?release=v1.0.0', base).href, { waitUntil: 'load' });
  await main.page.locator('[data-res]').waitFor();
  assert.deepEqual(await main.page.locator('.paper-links-group').last().locator('a').allInnerTexts().then(texts => texts.map(text => text.trim())), ['Results', 'Task explorer', 'BibTeX'], 'no button to the result explorer on v1.0.0');
  assert.deepEqual(main.errors, [], 'no page errors');
  await main.page.close();
  check('main page: no explorer; its cards, its title block (with a Result explorer button on v1.1.0 only) and links to a task lead to the deep dive; the validation leaderboard and the result explorer link to each other');
}

// ---------------------------------------------------------------- a future model submitted under another harness
{
  const { page, errors } = await openPage(1440);
  const baseModel = 'gpt_5_6_sol';
  const entry = { id: `${baseModel}-hermes`, modelId: baseModel, harness: 'hermes', name: modelName[baseModel] };
  const [sharedTask, partialTask, missingTask, unavailableTask] = tasks.slice(0, 4).map(task => task.id);
  const sourceRun = await runFile(baseModel, sharedTask);
  const partialSourceRun = await runFile(baseModel, partialTask);
  const syntheticIndex = structuredClone(index);
  syntheticIndex.models.push(entry);
  syntheticIndex.cells[sharedTask].push(cellOf(sharedTask, baseModel));
  syntheticIndex.cells[partialTask] = [...index.models.map(() => null), cellOf(partialTask, baseModel)];
  delete syntheticIndex.cells[unavailableTask];
  const submittedRuns = new Map([[sharedTask, sourceRun], [partialTask, partialSourceRun]].map(([task, source]) => [task, {
    ...source,
    harness: entry.harness,
    finalResponse: `Synthetic Hermes submission for ${task}.`,
  }]));
  const requestedRunPaths = [];
  let wrongHarness = false;
  await page.route('**/data/v1.1.0/runs/index.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(syntheticIndex) }));
  await page.route(`**/data/v1.1.0/runs/${entry.id}/*.json.gz`, route => {
    const pathname = new URL(route.request().url()).pathname;
    requestedRunPaths.push(pathname);
    const task = decodeURIComponent(pathname.split('/').at(-1).replace(/\.json\.gz$/, ''));
    const run = submittedRuns.get(task);
    assert(run, `only submitted second-harness runs can be requested: ${task}`);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(wrongHarness ? { ...run, harness: 'bare' } : run) });
  });
  await page.goto(new URL('deep-dive.html', base).href, { waitUntil: 'load' });
  const grid = page.locator('[data-runs-grid]');
  await grid.locator('tbody tr').first().waitFor();
  const headers = grid.locator('thead .rg-model-head');
  const baseAt = index.models.indexOf(baseModel);
  assert.equal(await headers.nth(baseAt).locator('.rg-model-name').innerText(), entry.name);
  assert.equal(await headers.last().locator('.rg-model-name').innerText(), entry.name, 'the same base model can occupy two columns');
  assert.equal(await headers.nth(baseAt).locator('[data-run-harness]').getAttribute('data-run-harness'), 'bare');
  assert.equal(await headers.last().locator('[data-run-harness]').getAttribute('data-run-harness'), entry.harness, 'the second submission names its own harness');

  const sharedRow = grid.locator(`tr[data-rg-task="${sharedTask}"]`);
  const secondHarnessCell = sharedRow.locator('a.rg-cell').last();
  assert.equal(await secondHarnessCell.getAttribute('href'), `#task=${sharedTask}&section=trajectories&model=${entry.id}`, 'cell links use the distinct submission entry id');
  await secondHarnessCell.click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator(`[data-run="${entry.id}/${sharedTask}"]`).waitFor();
  assert.equal(await dialog.locator('[data-run] [data-run-harness]').getAttribute('data-run-harness'), entry.harness, 'the selected run names its recorded harness');
  assert((await dialog.locator('[data-run]').innerText()).includes(submittedRuns.get(sharedTask).finalResponse), 'the second harness displays its own run file');
  assert(requestedRunPaths.some(value => value.endsWith(`/runs/${entry.id}/${sharedTask}.json.gz`)), 'the run was fetched from the unique entry directory');
  assert.equal(new URL(page.url()).hash, `#task=${sharedTask}&section=trajectories&model=${entry.id}`);
  assert.equal(await dialog.locator(`[data-run-row="${baseModel}"] [data-run-harness]`).getAttribute('data-run-harness'), 'bare');
  assert.equal(await dialog.locator(`[data-run-row="${entry.id}"] [data-run-harness]`).getAttribute('data-run-harness'), entry.harness);
  await dialog.locator(`[data-run-row="${baseModel}"] button`).click();
  await dialog.locator(`[data-run="${baseModel}/${sharedTask}"]`).waitFor();
  assert.equal(await dialog.locator('[data-run] [data-run-harness]').getAttribute('data-run-harness'), 'bare', 'switching back loads the original bare submission');
  assert.equal(await stepsOf(dialog).count(), sourceRun.steps.length, 'the original bare run remains intact');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  const missingRow = grid.locator(`tr[data-rg-task="${missingTask}"]`);
  assert.equal(await missingRow.locator('[data-rg-missing]').count(), 1, 'an omitted trailing entry is not a failed run');
  assert.equal(await missingRow.locator('td').nth(index.models.length).locator('a,button').count(), 0, 'an unsubmitted cell cannot open a trajectory');
  assert((await missingRow.locator('.rg-passed').innerText()).endsWith(`/ ${index.models.length}`), 'the denominator counts only submitted runs');
  assert.equal(await grid.locator(`tr[data-rg-task="${unavailableTask}"]`).count(), 0, 'a task without any submitted run is omitted');

  const partialRow = grid.locator(`tr[data-rg-task="${partialTask}"]`);
  assert.equal(await partialRow.locator('[data-rg-missing]').count(), index.models.length, 'explicit null cells stay unavailable');
  assert.equal(await partialRow.locator('a.rg-cell').count(), 1, 'a task remains visible when only a later entry has a result');
  assert((await partialRow.locator('.rg-passed').innerText()).endsWith('/ 1'), 'a partially submitted task uses its scored-run denominator');
  await partialRow.locator('th a').click();
  await dialog.locator(`[data-run="${entry.id}/${partialTask}"]`).waitFor();
  assert.deepEqual(await dialog.locator('[data-run-row]').evaluateAll(rows => rows.map(row => row.dataset.runRow)), [entry.id], 'the task lists only available submissions and selects the first available');
  assert((await dialog.locator('[data-run]').innerText()).includes(submittedRuns.get(partialTask).finalResponse), 'the partially submitted task loads its correct run');
  check('future submissions: distinct harness badges, paths and links for one base model; missing cells and partial tasks remain correct');

  // A file under the requested path must still identify the same base model and harness.
  wrongHarness = true;
  await page.goto(new URL(`deep-dive.html#task=${sharedTask}&section=trajectories&model=${entry.id}`, base).href, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await dialog.getByRole('alert').waitFor();
  assert((await dialog.getByRole('alert').innerText()).includes('another model or harness run'), 'a mismatched harness is rejected');
  assert.equal(await dialog.locator('[data-run]').count(), 0, 'the viewer does not display a different harness under the requested badge');
  check('future submissions: a run file with the wrong harness is rejected');
  assert.deepEqual(errors, [], 'no page errors');
  await page.close();
}

// ---------------------------------------------------------------- narrow width and the dark theme
for (const [width, theme] of [[390, 'light'], [1440, 'dark']]) {
  const { page, errors } = await openPage(width, 900);
  // The page reads its theme from this key before it draws (src/lib/colorTheme.ts).
  await page.addInitScript(value => { try { window.localStorage.setItem('multiverse-color-theme', value); } catch { /* storage unavailable */ } }, theme);
  await page.emulateMedia({ colorScheme: theme });
  const task = Object.keys(index.cells)[5];
  const model = index.models[3];
  await page.goto(new URL(`deep-dive.html#task=${task}&section=trajectories`, base).href, { waitUntil: 'load' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme, `the ${theme} theme is on`);
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator('[data-run-row]').first().waitFor();
  await page.screenshot({ path: path.join(output, `trajectories-table-${width}-${theme}.png`) });
  await dialog.locator(`[data-run-row="${model}"] th`).click();
  await dialog.locator(`[data-run="${model}/${task}"]`).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await runInView(dialog), true, `the run is brought into view at ${width}`);
  await page.screenshot({ path: path.join(output, `trajectories-run-${width}-${theme}.png`) });
  check(`Trajectories tab at ${width}px, ${theme} theme`);
  assert.deepEqual(errors, [], 'no page errors');
  await page.close();
}

await browser.close();
console.log('All checks of the runs passed.');
