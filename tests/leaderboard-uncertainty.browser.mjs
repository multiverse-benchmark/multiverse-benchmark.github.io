// Check displayed task-bootstrap intervals against both releases' exports, including filter changes.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : await import('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/tests';
const source = JSON.parse(await readFile('src/data/paper/leaderboard.json', 'utf8'));
const latest = JSON.parse(await readFile('src/data/leaderboard.v1.1.0.json', 'utf8')).sets;
const settings = { all: 'Average', 'single-turn': 'ST', 'instruction-following': 'IF', 'multi-turn': 'MT', 'multi-turn-instruction-following': 'MTIF' };
const models = [...source.models].sort((a, b) => source.results.Average[b.id].bare.mean - source.results.Average[a.id].bare.mean);
const expectedCell = (model, setting, harness, dataset = source) => {
  if (harness !== 'best') return dataset.results[setting][model][harness === 'none' ? 'bare' : harness];
  return dataset.harnesses.map(h => dataset.results[setting][model][h.id]).reduce((best, cell) => cell.mean > best.mean ? cell : best);
};
const orderedModels = dataset => [...dataset.models].sort((a, b) => dataset.results.Average[b.id].bare.mean - dataset.results.Average[a.id].bare.mean);
const formatEndpoint = value => Number(value.toPrecision(12)).toFixed(1);
const intervalText = cell => `95% CI: ${formatEndpoint(cell.ci95[0])}–${formatEndpoint(cell.ci95[1])}%`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
const report = { base, intervalsChecked: 0, averageBarsChecked: 0, tableIntervalsChecked: 0, csvIntervalsChecked: 0, checks: [], errors: [] };
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '?release=v1.0.0#results', { waitUntil: 'networkidle' });
  const chart = page.locator('[data-leaderboard-chart]');
  const board = page.locator('[data-leaderboard-board]');
  await chart.locator('[data-chart-uncertainty]').waitFor();
  const group = name => page.getByRole('radiogroup', { name, exact: true });

  async function checkCsv(dataset, label, allModels = true) {
    const pending = page.waitForEvent('download');
    await page.locator('[data-res-download]').click();
    const download = await pending;
    const filename = `${output}/${label}-results.csv`;
    await download.saveAs(filename);
    const [header, ...records] = (await readFile(filename, 'utf8')).trim().split(/\r?\n/).map(line => line.split(','));
    assert(records.every(record => record.length === header.length), `${label}: CSV columns remain aligned`);
    const rows = records.map(record => Object.fromEntries(header.map((key, at) => [key, record[at]])));
    for (const model of allModels ? dataset.models : dataset.models.slice(0, 1)) {
      for (const harness of allModels ? dataset.harnesses : dataset.harnesses.slice(0, 1)) {
        const row = rows.find(value => value.model === model.name && value.harness === harness.name);
        assert(row, `${label}: downloaded CSV includes ${model.name}/${harness.name}`);
        for (const setting of ['Average', 'ST', 'IF', 'MT', 'MTIF']) {
          const cell = dataset.results[setting][model.id][harness.id];
          assert.equal(Number(row[`${setting}_ci95_low`]), cell.ci95[0], `${label}/${model.id}/${setting}: CSV lower endpoint`);
          assert.equal(Number(row[`${setting}_ci95_high`]), cell.ci95[1], `${label}/${model.id}/${setting}: CSV upper endpoint`);
          report.csvIntervalsChecked += 1;
        }
      }
    }
  }

  async function checkIntervals(axis, harness, setting, dataset = source) {
    const currentModels = orderedModels(dataset);
    const series = axis === 'settings' ? Object.keys(settings) : dataset.harnesses.map(h => h.id === 'bare' ? 'none' : h.id);
    await page.waitForFunction(count => document.querySelectorAll('[data-leaderboard-chart] .lbch-error-bar').length === count, series.length * currentModels.length);
    assert.equal(await chart.locator('.recharts-bar-rectangle').count(), series.length * currentModels.length, `${axis}: one bar per series and model`);
    const geometry = await chart.evaluate(element => {
      const ys = [...element.querySelectorAll('.recharts-cartesian-grid-horizontal line')].map(line => Number(line.getAttribute('y1')));
      const top = Math.min(...ys), bottom = Math.max(...ys);
      const groups = [...element.querySelectorAll('.lbch-error-bar')].map(node => {
        const lines = [...node.querySelectorAll('line')];
        const y = lines.flatMap(line => [Number(line.getAttribute('y1')), Number(line.getAttribute('y2'))]);
        return { series: node.getAttribute('data-ci-series'), low: (bottom - Math.max(...y)) / (bottom - top) * 100, high: (bottom - Math.min(...y)) / (bottom - top) * 100, lines: lines.length };
      });
      return { groups, top, bottom };
    });
    assert(geometry.bottom > geometry.top, 'Chart has a valid 0–100 axis');
    for (const key of series) {
      const actual = geometry.groups.filter(g => g.series === key);
      assert.equal(actual.length, currentModels.length, `${axis}/${key}: every model has an interval`);
      actual.forEach((item, index) => {
        const want = expectedCell(currentModels[index].id, axis === 'settings' ? settings[key] : setting, axis === 'settings' ? harness : key, dataset);
        assert.equal(item.lines, 3, 'Two caps and a stem');
        assert(Array.isArray(want.ci95) && want.ci95.length === 2, `${currentModels[index].name}/${key}: the source provides an interval`);
        assert(item.low >= -1e-5 && item.high <= 100 + 1e-5 && item.low <= item.high, 'Interval stays within the success-rate axis');
        assert(Math.abs(item.low - want.ci95[0]) < 1e-5, `${currentModels[index].name}/${key}: lower endpoint ${item.low} != ${want.ci95[0]}`);
        assert(Math.abs(item.high - want.ci95[1]) < 1e-5, `${currentModels[index].name}/${key}: upper endpoint ${item.high} != ${want.ci95[1]}`);
        report.intervalsChecked += 1;
      });
    }
    if (axis === 'settings' && setting === 'Average') {
      const average = await chart.evaluate(element => {
        const ys = [...element.querySelectorAll('.recharts-cartesian-grid-horizontal line')].map(line => Number(line.getAttribute('y1')));
        const top = Math.min(...ys), bottom = Math.max(...ys);
        const errorBars = [...element.querySelectorAll('.lbch-error-bar[data-ci-series="all"]')];
        // Recharts renders error bars in a sibling layer; the first bar group is Average.
        const bars = [...element.querySelector('.recharts-bar').querySelectorAll('.recharts-bar-rectangle')];
        const labels = [...element.querySelectorAll('.lbch-value-label')];
        return bars.map((bar, index) => ({
          mean: (bottom - bar.getBBox().y) / (bottom - top) * 100,
          label: labels[index]?.textContent,
          labelGap: Math.min(...[...errorBars[index].querySelectorAll('line')].flatMap(line => [Number(line.getAttribute('y1')), Number(line.getAttribute('y2'))])) - Number(labels[index]?.getAttribute('y')),
        }));
      });
      assert.equal(average.length, currentModels.length, 'Average has one bar per model');
      assert.equal(await chart.locator('.lbch-value-label').count(), currentModels.length, 'Average selection shows one mean label per model');
      average.forEach((item, index) => {
        const want = expectedCell(currentModels[index].id, 'Average', harness, dataset);
        // SVG paths round coordinates to four decimals, well below the displayed 0.1-point precision.
        assert(Math.abs(item.mean - want.mean) < 1e-4, `${currentModels[index].name}: Average bar height uses the unrounded source mean`);
        assert.equal(item.label, want.meanText, `${currentModels[index].name}: Average mean label`);
        assert(item.labelGap >= 5, `${currentModels[index].name}: Average label clears the upper CI cap`);
        report.averageBarsChecked += 1;
      });
      assert.deepEqual(await chart.locator('.lbch-legend li b').allInnerTexts(), Object.values(settings), 'Average is the first task-setting series');
      assert.deepEqual(await chart.locator('.lbch-legend li').evaluateAll(items => items.map(item => item.dataset.receded)), ['false', 'true', 'true', 'true', 'true'], 'Average selection emphasizes Average and dims the other settings');
    }
  }
  await checkIntervals('settings', 'none', 'Average');
  await chart.screenshot({ path: `${output}/paper-bars-1440.png` });
  // Hover a bar: intervals and run SD must have separate, explicit labels.
  await chart.locator('.recharts-bar-rectangle').first().hover();
  await chart.locator('.lbch-tip').waitFor();
  const tip = await chart.locator('.lbch-tip').innerText();
  assert.equal(await chart.locator('.lbch-tip-series').count(), 5, 'Paper tooltip includes Average and all four task settings');
  assert((await chart.locator('.lbch-tip-series').first().innerText()).includes(intervalText(source.results.Average[models[0].id].bare)), 'Paper Average tooltip uses its own exported CI');
  assert(tip.includes('95% CI: 73.0–87.3%'));
  assert(tip.includes('SD across 3 runs: 3.5 percentage points'));
  await page.mouse.move(0, 0);
  for (const harness of source.harnesses.slice(1)) {
    await group('Harness').getByRole('radio', { name: harness.name, exact: true }).click();
    await checkIntervals('settings', harness.id, 'Average');
  }
  await group('Harness').getByRole('radio', { name: 'Best harness', exact: true }).click();
  await checkIntervals('settings', 'best', 'Average');
  assert((await chart.locator('[data-chart-uncertainty]').innerText()).includes('conditional on the selected best harness'));
  // "Average", before "Best harness": each model's rate averaged over the harnesses, as the result file gives it.
  const harnessOptions = (await group('Harness').getByRole('radio').allInnerTexts()).map(text => text.trim());
  assert.deepEqual(harnessOptions.slice(-2), ['Average', 'Best harness'], 'Average stands before Best harness');
  await group('Harness').getByRole('radio', { name: 'Average over the harnesses', exact: true }).click();
  assert.equal(await board.getAttribute('data-harness'), 'average');
  const averaged = await board.locator('table tbody tr').evaluateAll(rows => rows.filter(row => row.querySelector('.lb-cell')).map(row => [...row.querySelectorAll('.lb-cell')].map(cell => cell.innerText.trim().split(/\s+/)[0])));
  const ranking = [...models].sort((a, b) => source.harnessAverage.Average[b.id].mean - source.harnessAverage.Average[a.id].mean);
  assert.deepEqual(averaged, ranking.map(model => ['Average', 'ST', 'IF', 'MT', 'MTIF'].map(setting => source.harnessAverage[setting][model.id].meanText)), 'every cell is the exported average over the harnesses, ranked by it');
  assert.equal(await chart.locator('[data-chart-uncertainty]').count(), 0, 'the average over the harnesses has no confidence interval to show');
  assert((await chart.locator('.lbch-subtitle').innerText()).includes('averaged over the harnesses'));
  report.checks.push('Average over the harnesses: before Best harness, every cell from the result file, no interval claimed');
  await group('Harness').getByRole('radio', { name: 'Bare', exact: true }).click();
  await group('Task setting').getByRole('radio', { name: /^ST,/ }).click();
  assert.equal(await chart.locator('.lbch-value-label').count(), models.length);
  const labelGaps = await chart.evaluate(element => {
    const caps = [...element.querySelectorAll('.lbch-error-bar[data-ci-series="single-turn"]')].map(node => Math.min(...[...node.querySelectorAll('line')].map(line => Number(line.getAttribute('y1')))));
    return [...element.querySelectorAll('.lbch-value-label')].map((label, i) => caps[i] - Number(label.getAttribute('y')));
  });
  assert(labelGaps.every(gap => gap >= 5), 'Selected mean labels clear the upper whisker');
  await chart.screenshot({ path: `${output}/selected-setting-1440.png` });
  await group('Columns').getByRole('radio', { name: 'Harnesses', exact: true }).click();
  for (const setting of ['Average', 'ST', 'IF', 'MT', 'MTIF']) {
    await group('Task setting').getByRole('radio', { name: setting === 'Average' ? 'Average' : new RegExp(`^${setting},`) }).click();
    await checkIntervals('harnesses', 'none', setting);
  }
  await group('Task setting').getByRole('radio', { name: 'Average', exact: true }).click();
  await chart.screenshot({ path: `${output}/harnesses-1440.png` });
  await checkCsv(source, 'paper', false);
  report.checks.push('All harness and setting views use the exact exported CI endpoints', 'Best harness uses its selected result CI', 'Tooltip separates task CI and run SD', 'Selected labels clear upper caps');
  await page.getByRole('group', { name: 'Benchmark release' }).getByRole('button', { name: 'v1.1.0', exact: true }).click();
  await page.locator('[data-result-set="validation"]').waitFor();
  for (const split of ['validation', 'test']) {
    if (split === 'test') await page.getByRole('tab', { name: /Test set/ }).click();
    await page.locator(`[data-result-set="${split}"]`).waitFor();
    await chart.locator('[data-chart-uncertainty]').waitFor();
    const explanation = await chart.locator('[data-chart-uncertainty]').innerText();
    assert(explanation.includes('95% task-bootstrap confidence intervals (10,000 resamples within task setting).'), `${split}: method, resample count and setting stratification are explicit`);
    assert.equal(explanation.trim(), 'Error bars: 95% task-bootstrap confidence intervals (10,000 resamples within task setting).', `${split}: the note names the intervals and says nothing else`);
    // Only Bare is available in this release, so Columns is absent and the chart uses task settings.
    assert.equal(await chart.getAttribute('data-chart-axis'), 'settings');
    assert.equal(await group('Columns').count(), 0);
    for (const setting of ['Average', 'ST', 'IF', 'MT', 'MTIF']) {
      await group('Task setting').getByRole('radio', { name: setting === 'Average' ? 'Average' : new RegExp(`^${setting},`) }).click();
      await checkIntervals('settings', 'none', setting, latest[split]);
      assert.equal(await chart.locator('.lbch-value-label').count(), latest[split].models.length, `${split}/${setting}: labels follow the selected task setting`);
    }
    await group('Task setting').getByRole('radio', { name: 'Average', exact: true }).click();
    const tableCells = await board.locator('[data-lb-row] [data-lb-cell]').evaluateAll(cells => cells.map(cell => ({
      model: cell.closest('[data-lb-row]').getAttribute('data-lb-row').split('/').at(-1),
      setting: cell.getAttribute('data-lb-cell'),
      low: cell.getAttribute('data-ci-low'),
      high: cell.getAttribute('data-ci-high'),
      sd: cell.getAttribute('data-sd'),
      title: cell.getAttribute('title'),
      accessible: [...cell.querySelectorAll('.mv-visually-hidden')].map(node => node.textContent).join(' '),
    })));
    assert.equal(tableCells.length, latest[split].models.length * 5, `${split}: all five result columns have CI values, including Average`);
    for (const cell of tableCells) {
      const setting = cell.setting === 'all' ? 'Average' : settings[cell.setting];
      const want = latest[split].results[setting][cell.model].bare;
      assert.notEqual(cell.low, null, `${split}/${cell.model}/${setting}: table lower endpoint exists`);
      assert.notEqual(cell.high, null, `${split}/${cell.model}/${setting}: table upper endpoint exists`);
      assert.equal(Number(cell.low), want.ci95[0]);
      assert.equal(Number(cell.high), want.ci95[1]);
      assert.equal(cell.sd, null, `${split}/${cell.model}/${setting}: no single-run SD`);
      const text = `95% task-bootstrap CI: ${formatEndpoint(want.ci95[0])}–${formatEndpoint(want.ci95[1])}%`;
      assert(cell.title.includes(text), `${split}/${cell.model}/${setting}: native tooltip provides the CI`);
      assert(cell.accessible.includes(text), `${split}/${cell.model}/${setting}: screen-reader text provides the CI`);
      report.tableIntervalsChecked += 1;
    }
    await checkCsv(latest[split], `latest-${split}`);
    await chart.locator('.recharts-bar-rectangle').first().hover();
    await chart.locator('.lbch-tip').waitFor();
    const tooltip = chart.locator('.lbch-tip');
    const firstModel = orderedModels(latest[split])[0];
    assert.equal(await tooltip.locator('.lbch-tip-name').innerText(), firstModel.name, `${split}: tooltip belongs to the first plotted model`);
    const tooltipSeries = await tooltip.locator('.lbch-tip-series').allInnerTexts();
    assert.equal(tooltipSeries.length, Object.keys(settings).length);
    Object.values(settings).forEach((setting, index) => assert(tooltipSeries[index].includes(intervalText(latest[split].results[setting][firstModel.id].bare)), `${split}/${setting}: tooltip prints the exported CI endpoints`));
    assert(!/\bSD\b|standard deviation/i.test(await tooltip.innerText()), `${split}: a single run has no across-run SD`);
    await page.mouse.move(0, 0);
    await chart.screenshot({ path: `${output}/latest-${split}-bars-1440.png` });
    report.checks.push(`v1.1.0 ${split}: exact exported chart CI endpoints at all five setting selections; all 60 table and CSV intervals include Average; tooltip has task CI without run SD; single-run explanation`);
  }
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce' });
  mobile.on('pageerror', error => report.errors.push(error.message));
  await mobile.goto(base + '?release=v1.0.0#results', { waitUntil: 'networkidle' });
  const mobileChart = mobile.locator('[data-leaderboard-chart]');
  await mobileChart.locator('.lbch-error-bar').first().waitFor();
  assert.equal(await mobileChart.locator('.lbch-error-bar').count(), Object.keys(settings).length * models.length);
  assert.equal(await mobileChart.locator('.lbch-value-label').count(), models.length, 'Mobile paper chart labels Average by default');
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert(await mobileChart.locator('.lbch-scroll').evaluate(node => node.scrollWidth > node.clientWidth));
  await mobileChart.screenshot({ path: `${output}/paper-bars-390.png` });
  report.checks.push('Mobile chart scrolls without page overflow');
  await mobile.close();
  for (const [split, width, theme] of [['validation', 390, 'light'], ['test', 1440, 'dark']]) {
    const preview = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    preview.on('pageerror', error => report.errors.push(error.message));
    await preview.addInitScript(value => localStorage.setItem('multiverse-color-theme', value), theme);
    await preview.emulateMedia({ colorScheme: theme });
    await preview.goto(base + '?release=v1.1.0#leaderboard', { waitUntil: 'networkidle' });
    if (split === 'test') await preview.getByRole('tab', { name: /Test set/ }).click();
    const previewChart = preview.locator('[data-leaderboard-chart]');
    await previewChart.locator('.lbch-error-bar').first().waitFor();
    assert.equal(await preview.evaluate(() => document.documentElement.dataset.theme), theme);
    assert.equal(await previewChart.locator('.lbch-error-bar').count(), Object.keys(settings).length * latest[split].models.length);
    assert.equal(await previewChart.locator('.lbch-value-label').count(), latest[split].models.length, `${split}: Average is labelled by default`);
    assert(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${split}/${width}: no horizontal page overflow`);
    if (width === 390) assert(await previewChart.locator('.lbch-scroll').evaluate(node => node.scrollWidth > node.clientWidth), 'Latest mobile chart scrolls within its frame');
    assert((await previewChart.locator('[data-chart-uncertainty]').innerText()).includes('95% task-bootstrap confidence intervals'));
    await previewChart.screenshot({ path: `${output}/latest-${split}-bars-${width}-${theme}.png` });
    report.checks.push(`v1.1.0 ${split}: CI chart and its note at ${width}px in ${theme} theme, without page overflow`);
    await preview.close();
  }
  report.checks.push('Average is the first task-setting bar in both releases, with exact source means and CIs; its 12 selected labels clear the CI caps');
  assert.deepEqual(report.errors, []);
  await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
