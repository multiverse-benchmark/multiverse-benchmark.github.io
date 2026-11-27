import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:4173/');
const output = process.env.QA_OUTPUT_DIR || 'artifacts/tests';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = modulePath ? await import(modulePath) : await import('playwright');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(30000);
const results = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir(output, { recursive: true });
const check = (name, details = {}) => { results.push({ name, passed: true, ...details }); console.log(`PASS ${name}`); };
const sourceBase = new URL('data/tool-source/', base);
const fileUrl = file => new URL(file.asset, sourceBase).href;
const sourceLines = text => text.replace(/\n$/, '').split('\n').map(line => line.replace(/\r$/, ''));
const loadSource = async file => {
  const response = await page.request.get(fileUrl(file));
  assert.equal(response.status(), 200);
  const bytes = await response.body();
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Exact source fixture: ${file.path}`);
  return bytes.toString('utf8');
};
const lineLocator = line => page.locator(`.source-code-line[data-line="${line}"]`);

// Inspect actual text fragment rectangles, not just CSS declarations. This catches
// clipped long tokens and rows whose virtual offsets still assume fixed heights.
async function geometry() {
  return page.locator('.source-code').evaluate(viewer => {
    const viewport = viewer.getBoundingClientRect();
    const rows = [...viewer.querySelectorAll('.source-code-line')].map(row => {
      const code = row.querySelector('code');
      const box = row.getBoundingClientRect();
      const content = code.getBoundingClientRect();
      const fragments = [];
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const rect of range.getClientRects()) fragments.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
      }
      return {
        line: Number(row.getAttribute('data-line')), text: code.textContent,
        top: box.top, bottom: box.bottom, height: box.height,
        codeHeight: content.height, codeClientWidth: code.clientWidth, codeScrollWidth: code.scrollWidth,
        codeClientHeight: code.clientHeight, codeScrollHeight: code.scrollHeight,
        fragmentOverflow: fragments.filter(rect => rect.left < content.left - 1 || rect.right > content.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1),
        selected: row.classList.contains('active'),
      };
    });
    return {
      clientWidth: viewer.clientWidth, scrollWidth: viewer.scrollWidth,
      clientHeight: viewer.clientHeight, scrollHeight: viewer.scrollHeight,
      scrollTop: viewer.scrollTop, scrollLeft: viewer.scrollLeft,
      viewport: { top: viewport.top, bottom: viewport.bottom },
      lineHeight: parseFloat(getComputedStyle(viewer).lineHeight),
      documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      rows,
    };
  });
}

function verifyGeometry(layout, lines, selectedLine, label) {
  assert(!layout.documentOverflow, `${label}: document overflows horizontally`);
  assert(layout.scrollWidth <= layout.clientWidth + 1, `${label}: code has horizontal overflow (${layout.scrollWidth} > ${layout.clientWidth})`);
  assert.equal(layout.scrollLeft, 0, `${label}: code should never need horizontal scrolling`);
  assert(layout.rows.length > 0 && layout.rows.length < 150, `${label}: bounded virtual row count, got ${layout.rows.length}`);
  for (let i = 0; i < layout.rows.length; i++) {
    const row = layout.rows[i];
    assert.equal(row.text, lines[row.line - 1], `${label}: exact text on line ${row.line}`);
    assert(row.height >= layout.lineHeight - 1, `${label}: logical row ${row.line} is truncated`);
    assert(row.codeScrollWidth <= row.codeClientWidth + 1, `${label}: line ${row.line} has horizontal overflow`);
    assert(row.codeScrollHeight <= row.codeClientHeight + 1, `${label}: line ${row.line} has hidden vertical content`);
    assert.deepEqual(row.fragmentOverflow, [], `${label}: line ${row.line} has text outside its row/content box`);
    if (i > 0) {
      const previous = layout.rows[i - 1];
      assert.equal(row.line, previous.line + 1, `${label}: virtual rows must be contiguous`);
      assert(row.top >= previous.bottom - 1, `${label}: rows ${previous.line}/${row.line} overlap`);
      assert(row.top <= previous.bottom + 1, `${label}: gap between rows ${previous.line}/${row.line}`);
    }
  }
  if (selectedLine) {
    const selected = layout.rows.find(row => row.selected);
    assert.equal(selected?.line, selectedLine, `${label}: expected selected line ${selectedLine}`);
    assert(selected.bottom > layout.viewport.top && selected.top < layout.viewport.bottom, `${label}: selected line ${selectedLine} must be visible`);
  }
}

async function settledGeometry(lines, selectedLine, label) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt++) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await geometry();
    try { verifyGeometry(layout, lines, selectedLine, label); return layout; }
    catch (error) { lastError = error; await page.waitForTimeout(100); }
  }
  throw lastError;
}

async function openLine(file, line, lines) {
  const url = new URL(base);
  // The fixtures come from the source snapshot of the paper's release, so the link names that release.
  url.searchParams.set('release', 'v1.0.0');
  url.hash = `source=${encodeURIComponent(file.id)}&line=${line}`;
  // Reopening an identical fragment URL is otherwise a same-document navigation
  // that preserves the old scroll anchor instead of exercising deep-link loading.
  if (page.url() === url.href) await page.reload({ waitUntil: 'domcontentloaded' });
  else await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(({ file, line }) => document.querySelector('.source-file-bar > span')?.textContent === file
    && document.querySelector('.source-code')?.getAttribute('aria-busy') === 'false'
    && document.querySelector('.source-code-line.active')?.getAttribute('data-line') === String(line), { file: file.path, line }, { timeout: 60000 });
  return settledGeometry(lines, line, `${file.path}:${line}`);
}

try {
  const response = await page.request.get(new URL('index.json', sourceBase).href);
  assert.equal(response.status(), 200);
  const index = await response.json();
  const longFile = index.files.find(file => file.id === 'APIs/cliptok/SimulationEngine/endpoint_models.py');
  const tokenFile = index.files.find(file => file.id === 'APIs/gridwell_drive/tests/sim2real/files_list_query_scenarios/test_gridwell_drive_query_filtered_pagination.py');
  assert(longFile && tokenFile);
  const longSource = await loadSource(longFile);
  const tokenSource = await loadSource(tokenFile);
  const longLines = sourceLines(longSource);
  const tokenLines = sourceLines(tokenSource);
  const longLine = longLines.findIndex(line => line.includes('List of fields to include in the response.')) + 1;
  const tokenLine = tokenLines.findIndex(line => /\S{180,}/.test(line)) + 1;
  assert(longLine > 0 && longLines[longLine - 1].length >= 400);
  assert(tokenLine > 0);

  const widths = [1440, 880, 600, 390, 320];
  const wrapping = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 600 ? 844 : 1000 });
    for (const fixture of [{ name: 'long description', file: longFile, lines: longLines, line: longLine }, { name: 'unbroken page token', file: tokenFile, lines: tokenLines, line: tokenLine }]) {
      const layout = await openLine(fixture.file, fixture.line, fixture.lines);
      const row = layout.rows.find(row => row.line === fixture.line);
      assert(row.height > layout.lineHeight + 1, `${fixture.name} must visibly wrap at ${width}px`);
      wrapping.push({ width, fixture: fixture.name, file: fixture.file.path, line: fixture.line, chars: fixture.lines[fixture.line - 1].length, rowHeight: row.height, codeWidth: layout.clientWidth, renderedRows: layout.rows.length });
    }
    if (width === 1440 || width === 390) await page.locator('.source-browser').screenshot({ path: path.join(output, `tools-wrap-${width === 1440 ? 'desktop' : 'mobile'}.png`) });
  }
  check('Real long descriptions and unbroken tokens wrap without horizontal overflow, overlapping rows, clipped text, or source changes at five widths', { wrapping });

  await page.setViewportSize({ width: 390, height: 844 });
  await openLine(longFile, 1, longLines);
  const find = page.getByRole('textbox', { name: 'Find text in source file' });
  await find.fill('List of fields to include in the response.');
  await lineLocator(longLine).waitFor();
  await settledGeometry(longLines, longLine, 'Find jumps to wrapped line');
  assert.equal(await page.locator('.source-find > span').textContent(), '1/1');
  await page.getByRole('button', { name: 'Clear source search' }).click();
  await page.getByRole('button', { name: `Link to line ${longLine}`, exact: true }).click();
  assert.equal(new URL(page.url()).hash, `#source=${encodeURIComponent(longFile.id)}&line=${longLine}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await lineLocator(longLine).waitFor();
  await settledGeometry(longLines, longLine, 'Wrapped line deep-link refresh');
  check('Find and line links use wrapped row positions and preserve the selected logical line after refresh', { file: longFile.path, line: longLine });

  const reflow = [];
  for (const width of [1440, 390, 880, 320, 1440]) {
    await page.setViewportSize({ width, height: width <= 600 ? 844 : 1000 });
    const inline = await settledGeometry(longLines, longLine, `Resize to ${width}px`);
    const inlineHeight = inline.rows.find(row => row.line === longLine).height;
    await page.getByRole('button', { name: 'Expand source view', exact: true }).click();
    await page.locator('.source-expanded').waitFor();
    const expanded = await settledGeometry(longLines, longLine, `Expanded at ${width}px`);
    const expandedHeight = expanded.rows.find(row => row.line === longLine).height;
    assert(expandedHeight <= inlineHeight, `Expanded ${width}px view should not wrap more than narrower inline view`);
    await page.keyboard.press('Escape');
    await page.locator('.source-expanded').waitFor({ state: 'detached' });
    const restored = await settledGeometry(longLines, longLine, `Collapsed at ${width}px`);
    assert.equal(restored.rows.find(row => row.line === longLine).height, inlineHeight);
    reflow.push({ width, inlineHeight, expandedHeight });
  }
  assert(reflow.find(item => item.width === 320).inlineHeight > reflow.find(item => item.width === 1440).inlineHeight);
  check('Viewport resizing and expanded-view transitions remeasure rows and keep the selected line visible', { reflow });

  // The committed 1,926-file snapshot has no literal tabs. This isolated browser
  // response changes only indentation/separator whitespace to exercise tab stops;
  // no source asset or index is changed on disk or on the server.
  const tabLines = [...tokenLines];
  tabLines[tokenLine - 1] = tabLines[tokenLine - 1].replace(/^ +/, '\t\t\t').replace(': ', ':\t');
  assert(tabLines[tokenLine - 1].includes('\t'));
  await page.route(fileUrl(tokenFile), route => route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: `${tabLines.join('\n')}\n` }));
  const tabs = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width <= 600 ? 844 : 1000 });
    const layout = await openLine(tokenFile, tokenLine, tabLines);
    tabs.push({ width, rowHeight: layout.rows.find(row => row.line === tokenLine).height });
  }
  await page.unroute(fileUrl(tokenFile));
  check('Browser-only literal-tab fixture wraps and preserves exact tab characters without geometry errors', { syntheticFixture: true, fixtureBasedOn: tokenFile.path, line: tokenLine, tabs });

  const largest = index.files.reduce((max, file) => file.lines > max.lines ? file : max);
  const largestLines = sourceLines(await loadSource(largest));
  assert.equal(largestLines.length, largest.lines);
  const large = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width <= 600 ? 844 : 1000 });
    let layout = await openLine(largest, largest.lines, largestLines);
    assert(layout.rows.some(row => row.line === largest.lines));
    const tail = layout.rows.find(row => row.line === largest.lines);
    assert(tail.bottom <= layout.viewport.bottom + 1, `Final line is fully reachable at ${width}px`);
    const samples = [{ at: 'tail link', rows: layout.rows.length, scrollHeight: layout.scrollHeight }];
    for (const position of [0, 0.25, 0.5, 0.75, 1]) {
      await page.locator('.source-code').evaluate((element, position) => { element.scrollTop = Math.max(0, (element.scrollHeight - element.clientHeight) * position); }, position);
      layout = await settledGeometry(largestLines, undefined, `Largest source at ${position} / ${width}px`);
      samples.push({ at: position, rows: layout.rows.length, first: layout.rows[0].line, last: layout.rows.at(-1).line });
    }
    assert(layout.rows.some(row => row.line === largest.lines), `Final line is reachable by scrolling at ${width}px`);
    large.push({ width, samples });
  }
  check('Largest source file remains virtualized with valid wrapped geometry through all scroll regions and a reachable final line', { file: largest.path, lines: largest.lines, bytes: largest.bytes, large });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  check('No uncaught browser errors');
} catch (error) {
  results.push({ name: 'Browser assertion', passed: false, error: error.stack || String(error) });
  await page.screenshot({ path: path.join(output, 'tools-wrap-failure.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, 'tools-wrap-report.json'), JSON.stringify({ base: base.href, results, errors }, null, 2));
  await browser.close();
}
console.log(`Saved wrapping evidence to ${output}`);
