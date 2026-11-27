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
page.setDefaultTimeout(20000);
const results = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir(output, { recursive: true });
const check = (name, details = {}) => { results.push({ name, passed: true, ...details }); console.log(`PASS ${name}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBase = new URL('data/tool-source/', base);
const sourceUrl = file => new URL(file.asset, sourceBase).href;
const readSource = async file => {
  const response = await page.request.get(sourceUrl(file));
  assert.equal(response.status(), 200, `Source HTTP status: ${file.path}`);
  const bytes = await response.body();
  assert.equal(bytes.length, file.bytes, `Source byte count: ${file.path}`);
  assert.equal(sha256(bytes), file.sha256, `Source SHA-256: ${file.path}`);
  return bytes;
};
const serviceFilter = () => page.getByRole('combobox', { name: 'Filter source by service' });
const search = () => page.getByRole('searchbox', { name: 'Search tools and source files' });
const mode = name => page.getByRole('group', { name: 'Source browsing mode' }).getByRole('button', { name, exact: true });
const entries = () => page.locator('.source-entry-list .source-entry');
const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Document must not overflow horizontally');
const waitCount = async (count, label) => {
  await page.waitForFunction(({ count, label }) => document.querySelector('.source-list-label')?.textContent?.startsWith(`${count.toLocaleString('en-US')} ${label}`), { count, label });
  assert.equal(await entries().count(), count);
};
const waitSource = async (file, line) => {
  await page.waitForFunction(({ path, line }) => document.querySelector('.source-file-bar > span')?.textContent === path
    && document.querySelector('.source-code')?.getAttribute('aria-busy') === 'false'
    && (!line || document.querySelector('.source-code-line.active')?.getAttribute('data-line') === String(line)), { path: file.path, line }, { timeout: 60000 });
  assert.equal(await page.locator('.source-code [role="alert"]').count(), 0);
};
const chooseFile = async file => {
  await mode('Files').click();
  await serviceFilter().selectOption('');
  await page.getByRole('combobox', { name: 'Filter source by file type' }).selectOption('');
  await search().fill(file.path);
  await waitCount(1, 'FILES');
  await entries().first().click();
  await waitSource(file, file.lines ? 1 : undefined);
};

try {
  const response = await page.request.get(new URL('index.json', sourceBase).href);
  assert.equal(response.status(), 200);
  const index = await response.json();
  const benchmarkTools = index.tools.filter(tool => tool.service !== '_shared');
  const benchmarkServices = index.services.filter(service => service.id !== '_shared');
  const helpers = index.tools.filter(tool => tool.service === '_shared');
  assert.equal(benchmarkTools.length, 809);
  assert.equal(benchmarkServices.length, 35);
  assert.equal(helpers.length, 15);
  assert.equal(index.statistics.toolCount, benchmarkTools.length);
  assert.equal(new Set(index.files.map(file => file.id)).size, index.files.length);
  // The tool explorer is on the deep-dive page. This test checks the source snapshot of the
  // paper's release (data/tool-source), so the link names that release.
  await page.goto(new URL('deep-dive.html?release=v1.0.0', base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('.source-browser').waitFor();
  await waitCount(index.tools.length, 'TOOLS');
  const summary = await page.locator('.source-summary').innerText();
  assert.match(summary, /809\s+tools/);
  assert.match(summary, /35\s+services/);
  assert(summary.includes(index.files.length.toLocaleString('en-US')));
  assert((await page.locator('.source-footnote').innerText()).includes(`${helpers.length} shared utility and authentication helpers`));
  check('Published catalog reports 809 benchmark tools, 35 services, and 15 separately identified framework helpers', { files: index.files.length, sourceRelease: index.provenance?.release || index.provenance?.version || null });

  await serviceFilter().selectOption('_shared');
  await waitCount(helpers.length, 'TOOLS');
  for (const service of benchmarkServices) {
    await serviceFilter().selectOption(service.id);
    await waitCount(benchmarkTools.filter(tool => tool.service === service.id).length, 'TOOLS');
  }
  await serviceFilter().selectOption('whatsup');
  await search().fill('message');
  const matching = index.tools.filter(tool => tool.service === 'whatsup' && `${tool.name} ${tool.service} ${tool.description}`.toLowerCase().includes('message'));
  await waitCount(matching.length, 'TOOLS');
  assert(matching.length > 0);
  await search().fill('no-tool-matches-9428673');
  await waitCount(0, 'TOOLS');
  await page.locator('.source-empty').getByRole('button', { name: 'Clear filters' }).click();
  await waitCount(index.tools.length, 'TOOLS');
  check('Every service filter matches its actual catalog; search composes with service filters and empty-state reset');

  const tool = index.tools.find(tool => tool.service === 'whatsup' && /send.*message/i.test(tool.name)) || benchmarkTools[0];
  const file = index.files.find(file => file.id === tool.fileId);
  const bytes = await readSource(file);
  const source = bytes.toString('utf8');
  const lines = source.replace(/\n$/, '').split('\n').map(line => line.replace(/\r$/, ''));
  await serviceFilter().selectOption(tool.service);
  await search().fill(tool.name);
  await entries().filter({ has: page.getByText(tool.name, { exact: true }) }).click();
  await waitSource(file, tool.line);
  assert.equal(new URL(page.url()).hash, `#tool=${encodeURIComponent(tool.id)}`);
  assert.equal(await page.locator('.source-code-line.active code').textContent(), lines[tool.line - 1]);
  assert.match(lines[tool.functionLine - 1], new RegExp(`(?:async\\s+)?def\\s+${tool.name}\\b`));
  const activeBox = await page.locator('.source-code-line.active').boundingBox();
  const viewerBox = await page.locator('.source-code').boundingBox();
  assert(viewerBox.height <= 1000, 'Inline source viewer has a bounded viewport');
  assert(await page.locator('.source-code-line').count() < 150, 'The initial implementation is virtualized');
  assert(activeBox.y >= viewerBox.y && activeBox.y + activeBox.height <= viewerBox.y + viewerBox.height, 'Selected tool declaration is visible in the code viewport');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitSource(file, tool.line);
  assert((await page.locator('.source-function').innerText()).includes(tool.name));
  check('Selecting a tool loads exact implementation bytes and jumps to its declared line; tool deep link survives refresh', { tool: tool.id, file: file.path, line: tool.line, functionLine: tool.functionLine });

  const find = page.getByRole('textbox', { name: 'Find text in source file' });
  const expectedMatches = lines.flatMap((line, i) => line.toLowerCase().includes('def ') ? [i + 1] : []);
  assert(expectedMatches.length > 1, 'Find fixture needs multiple function declarations');
  await find.fill('def ');
  await waitSource(file, expectedMatches[0]);
  assert.equal(await page.locator('.source-find > span').textContent(), `1/${expectedMatches.length}`);
  await page.getByRole('button', { name: 'Next matching line' }).click();
  await waitSource(file, expectedMatches[1]);
  await find.press('Shift+Enter');
  await waitSource(file, expectedMatches[0]);
  await page.getByRole('button', { name: 'Previous matching line' }).click();
  await waitSource(file, expectedMatches.at(-1));
  await find.fill('no-source-line-matches-9428673');
  assert.equal(await page.locator('.source-find > span').textContent(), '0/0');
  assert(await page.getByRole('button', { name: 'Next matching line' }).isDisabled());
  await page.getByRole('button', { name: 'Clear source search' }).click();
  check('Find in file counts exact matching lines, navigates both ways, wraps, and handles no matches', { matchingLines: expectedMatches.length });

  const linkLine = expectedMatches.at(-1);
  await page.getByRole('button', { name: `Link to line ${linkLine}`, exact: true }).click();
  assert.equal(new URL(page.url()).hash, `#source=${encodeURIComponent(file.id)}&line=${linkLine}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitSource(file, linkLine);
  assert.equal(await page.locator('.source-code-line.active code').textContent(), lines[linkLine - 1]);
  // The link of a file leads to that file in the repository, at the selected line. The explorer offers no
  // link to a source file as this site serves it.
  const browser_ = page.locator('.source-browser');
  const repository = 'https://github.com/google-deepmind/MultiVerse/blob/main/';
  assert.equal(index.provenance.path, 'api_runtime/v1.0.0', 'the catalog names the release by its folder in the repository');
  const repositoryLink = browser_.locator('.source-file-bar a');
  assert.equal(await repositoryLink.count(), 1, 'one link in the file bar');
  assert.equal(await repositoryLink.getAttribute('href'), `${repository}api_runtime/v1.0.0/${file.path}#L${linkLine}`, 'the link of a file opens the file in the repository at the selected line');
  assert.equal((await repositoryLink.innerText()).trim(), 'View on GitHub');
  assert.equal(await browser_.locator('a[href*="tool-source/"], a[download]').count(), 0, 'no link to a served source file');
  check('Source line deep link survives refresh; the link of a file opens that file in the repository; no link to a served source file', { sha256: file.sha256, bytes: bytes.length, line: linkLine });

  await mode('Files').click();
  await serviceFilter().selectOption('');
  await search().fill('');
  const kind = page.getByRole('combobox', { name: 'Filter source by file type' });
  for (const type of ['implementation', 'test', 'shared']) {
    await kind.selectOption(type);
    await waitCount(index.files.filter(file => file.kind === type).length, 'FILES');
  }
  await kind.selectOption('test');
  await serviceFilter().selectOption(tool.service);
  const serviceTests = index.files.filter(file => file.kind === 'test' && file.service === tool.service);
  await waitCount(serviceTests.length, 'FILES');
  const test = serviceTests.find(file => file.lines > 10);
  assert(test);
  await search().fill(test.path);
  await waitCount(1, 'FILES');
  await entries().first().click();
  await waitSource(test, 1);
  const testBytes = await readSource(test);
  assert.equal(await page.locator('.source-code-line.active code').textContent(), testBytes.toString('utf8').split('\n')[0].replace(/\r$/, ''));
  assert((await page.locator('.source-code-toolbar').innerText()).includes('Tests'));
  check('Files mode filters implementation, tests, and shared utilities; service and filename filters open real test source', { implementationFiles: index.files.filter(file => file.kind === 'implementation').length, testFiles: index.files.filter(file => file.kind === 'test').length, sharedFiles: index.files.filter(file => file.kind === 'shared').length, selectedTest: test.path });

  const largest = index.files.reduce((max, file) => file.lines > max.lines ? file : max);
  const largestBytes = await readSource(largest);
  const largestLines = largestBytes.toString('utf8').replace(/\n$/, '').split('\n').map(line => line.replace(/\r$/, ''));
  assert.equal(largestLines.length, largest.lines);
  await chooseFile(largest);
  const topCount = await page.locator('.source-code-line').count();
  assert(topCount > 0 && topCount < 150, `Largest file renders a bounded window of rows, got ${topCount}`);
  await page.locator('.source-code').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.locator(`.source-code-line[data-line="${largest.lines}"]`).waitFor();
  assert.equal(await page.locator(`.source-code-line[data-line="${largest.lines}"] code`).textContent(), largestLines.at(-1));
  assert(await page.locator('.source-code-line').count() < 150);
  await page.getByRole('button', { name: `Link to line ${largest.lines}`, exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitSource(largest, largest.lines);
  assert.equal(await page.locator('.source-code-line.active code').textContent(), largestLines.at(-1));
  check('Largest file stays virtualized while its exact final line remains reachable and deep-linkable', { file: largest.path, lines: largest.lines, bytes: largest.bytes, rowsRenderedAtTop: topCount, rowsRenderedAtTail: await page.locator('.source-code-line').count() });

  await page.getByRole('button', { name: 'Expand source view', exact: true }).click();
  await page.locator('.source-expanded').waitFor();
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert(await page.locator('.source-expanded').evaluate(element => element === document.activeElement));
  assert.equal(await page.getByRole('dialog', { name: 'MultiVerse tool source explorer' }).getAttribute('aria-modal'), 'true');
  await page.keyboard.press('Shift+Tab');
  assert(await page.locator('.source-expanded').evaluate(element => element.contains(document.activeElement)), 'Backward Tab stays in expanded source view');
  await page.keyboard.press('Tab');
  assert(await page.getByRole('button', { name: 'Exit expanded source view', exact: true }).evaluate(element => element === document.activeElement), 'Forward Tab wraps to the first expanded-view control');
  await noOverflow();
  await page.screenshot({ path: path.join(output, 'tools-expanded.png') });
  await page.keyboard.press('Escape');
  await page.locator('.source-expanded').waitFor({ state: 'detached' });
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert(await page.getByRole('button', { name: 'Expand source view', exact: true }).evaluate(element => element === document.activeElement), 'Escape restores focus to the opening control');
  check('Expanded view is keyboard-focused, bounds the largest source file, and Escape restores page scrolling');

  const widths = [1440, 1100, 900, 880, 800, 640, 601, 600, 390, 320];
  const layout = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 600 ? 844 : 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator('.source-browser').scrollIntoViewIfNeeded();
    await noOverflow();
    const lines = await page.locator('.source-code-line').count();
    assert(lines < 150);
    if (width === 1440 || width === 390) {
      await page.locator('.source-browser').screenshot({ path: path.join(output, `tools-${width === 1440 ? 'desktop' : 'mobile'}.png`) });
    }
    layout.push({ width, lines });
  }
  check('Tool viewer remains bounded at ten desktop/tablet/mobile widths', { layout });

  // The later release has its own source snapshot: its counts, and the link of a file to its own folder.
  const later = await (await page.request.get(new URL('data/v1.1.0/tool-source/index.json', base).href)).json();
  assert.equal(later.provenance.path, 'api_runtime/v1.1.0');
  assert.equal(later.provenance.coverage.measurement.fileListSha256, later.provenance.fileList.sha256, 'the coverage of v1.1.0 was measured on the files that are shown');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(new URL('deep-dive.html?release=v1.1.0', base).href, { waitUntil: 'domcontentloaded' });
  await page.locator('.source-browser .source-file-bar a').waitFor();
  const laterTools = later.tools.filter(tool => tool.service !== '_shared').length;
  assert.equal(laterTools, later.statistics.benchmarkToolCount);
  assert.match(await page.locator('.source-summary').innerText(), new RegExp(`${laterTools}\\s+tools`));
  assert((await page.locator('.source-summary').innerText()).includes(later.files.length.toLocaleString('en-US')));
  // The explorer opens on a tool: the link goes to the lines of its definition.
  const opened = later.tools.find(tool => tool.service === 'whatsup' && /send.*message/i.test(tool.name)) || later.tools[0];
  assert.equal(await page.locator('.source-browser .source-file-bar a').getAttribute('href'), `https://github.com/google-deepmind/MultiVerse/blob/main/api_runtime/v1.1.0/${opened.fileId}#L${opened.line}-L${opened.endLine}`);
  assert.equal(await page.locator('.source-browser a[href*="tool-source/"], .source-browser a[download]').count(), 0);
  check('v1.1.0: its own tool and file counts; the link of a tool opens its file in the v1.1.0 folder of the repository, at its lines', { tools: laterTools, files: later.files.length });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  check('No uncaught browser errors');
} catch (error) {
  results.push({ name: 'Browser assertion', passed: false, error: error.stack || String(error) });
  await page.screenshot({ path: path.join(output, 'tools-failure.png'), fullPage: false }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, 'tools-report.json'), JSON.stringify({ base: base.href, results, errors }, null, 2));
  await browser.close();
}
console.log(`Saved tool browser evidence to ${output}`);
