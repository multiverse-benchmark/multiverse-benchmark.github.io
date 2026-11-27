import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Braces, ChevronRight, Code2, FileCode2, Folder, GitBranch, Link2, Loader2, Maximize2, Minimize2, Search, ShieldCheck, X } from 'lucide-react';
import coverageData from '../data/coverage.json';
import { CODE_URL } from '../content/citation';
import { PAPER_RELEASE, dataRoot, useRelease, type Release } from '../lib/release';
import './tool-explorer.css';
import { useWrappedCode } from './useWrappedCode';

interface SourceFile {
  id: string; path: string; service: string | null; kind: string;
  lines: number; bytes: number; sha256: string; asset: string;
}
interface SourceTool { id: string; name: string; service: string; description: string; fileId: string; line: number; endLine: number }
interface SourceIndex {
  services: { id: string; name: string; toolCount: number }[];
  tools: SourceTool[]; files: SourceFile[];
  statistics: Record<string, unknown>;
  provenance: Record<string, unknown>;
}
type Token = { text: string; kind: string };
const number = (value: number) => value.toLocaleString('en-US');

/**
 * Statement coverage of each release's tests (src/data/coverage.json): the figure the paper
 * reports for its own release, and for a later release the figure measured by running the
 * release's tests. The record of that measurement is in the release's provenance.json.
 */
interface ReleaseCoverage {
  source: 'paper' | 'measured';
  /** Over all executable statements, rounded as the paper rounds it. */
  statementCoveragePercent: number;
  /** The service with the lowest coverage and the one with the highest. */
  serviceCoverageRangePercent: number[];
}
const COVERAGE = coverageData as Record<Release, ReleaseCoverage>;

// Tokenize only for display. Source text is never interpreted or executed.
function highlight(source: string): Token[][] {
  const lines: Token[][] = [[]];
  const token = /(?:[rubf]{0,2})(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|#[^\n]*|\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b|\b\d+(?:\.\d+)?\b|@[A-Za-z_][\w.]*/g;
  const append = (text: string, kind: string) => text.split('\n').forEach((part, index) => { if (index) lines.push([]); if (part) lines[lines.length - 1].push({ text: part.replace(/\r$/, ''), kind }); });
  let offset = 0;
  for (const match of source.matchAll(token)) {
    append(source.slice(offset, match.index), 'plain');
    const text = match[0];
    const kind = text.startsWith('#') ? 'comment' : /^[rubf]{0,2}["']/.test(text) ? 'string' : /^\d/.test(text) ? 'number' : text.startsWith('@') ? 'decorator' : 'keyword';
    append(text, kind); offset = match.index! + text.length;
  }
  append(source.slice(offset), 'plain');
  if (source.endsWith('\n')) lines.pop();
  return lines;
}

function readHash() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return { tool: hash.get('tool'), file: hash.get('source'), line: Math.max(1, Number(hash.get('line')) || 1) };
}

/**
 * The tool explorer of the release selected on the page. Each release has its own source snapshot,
 * so the explorer starts afresh (catalog, selection, search) when the release changes.
 */
export function ToolExplorer() {
  const release = useRelease();
  return <ToolExplorerView key={release} release={release} base={`${import.meta.env.BASE_URL}${dataRoot(release)}tool-source/`} />;
}

function ToolExplorerView({ release, base }: {
  release: Release;
  /** Folder of the release's source snapshot: the catalog (index.json) and the files. */
  base: string;
}) {
  const [index, setIndex] = useState<SourceIndex | null>(null);
  const [indexError, setIndexError] = useState('');
  const [service, setService] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'tools' | 'files'>('tools');
  const [kind, setKind] = useState('');
  const [fileId, setFileId] = useState('');
  const [toolId, setToolId] = useState('');
  const [selectedLine, setSelectedLine] = useState(1);
  const [source, setSource] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [fetching, setFetching] = useState(false);
  /** The file whose source, or whose loading error, the viewer holds. */
  const [sourceFileId, setSourceFileId] = useState('');
  const [find, setFind] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const viewer = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const file = index?.files.find(item => item.id === fileId);
  const tool = index?.tools.find(item => item.id === toolId);
  // A file counts as loading from the moment it is selected, so the viewer never shows the
  // lines of the previous file under the name of the new one.
  const loading = fetching || (!!file && sourceFileId !== file.id);
  const tokens = useMemo(() => highlight(source), [source]);
  const { offsets, firstLine, lastLine, totalHeight, onScroll } = useWrappedCode(tokens, viewer, selectedLine, !!index && !loading);
  const matches = useMemo(() => find ? source.split('\n').flatMap((line, i) => line.toLowerCase().includes(find.toLowerCase()) ? [i + 1] : []) : [], [source, find]);
  const search = query.trim().toLowerCase();
  const shownTools = useMemo(() => index?.tools.filter(item => (!service || item.service === service) && (!search || `${item.name} ${item.service} ${item.description}`.toLowerCase().includes(search))) || [], [index, service, search]);
  const shownFiles = useMemo(() => index?.files.filter(item => (!service || item.service === service) && (!kind || item.kind === kind) && (!search || item.path.toLowerCase().includes(search))) || [], [index, service, kind, search]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base}index.json`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('The tool catalog could not be loaded.'); return response.json(); }).then(setIndex).catch(error => { if (error.name !== 'AbortError') setIndexError(error.message); });
    return () => controller.abort();
  }, [base]);

  useEffect(() => {
    if (!index) return;
    const openHash = (initial = false) => {
      const hash = readHash();
      const selected = index.tools.find(item => item.id === hash.tool);
      const selectedFile = index.files.find(item => item.id === hash.file);
      if (selected) {
        setFileId(selected.fileId); setToolId(selected.id); setSelectedLine(selected.line); setService(selected.service); setMode('tools');
      } else if (selectedFile) {
        setFileId(selectedFile.id); setToolId(''); setSelectedLine(hash.line); setService(selectedFile.service || ''); setMode('files');
      } else if (initial) {
        const first = index.tools.find(item => item.service === 'whatsup' && /send.*message/i.test(item.name)) || index.tools[0];
        if (first) { setFileId(first.fileId); setToolId(first.id); setSelectedLine(first.line); }
      }
      if (selected || selectedFile) requestAnimationFrame(() => document.getElementById('tools')?.scrollIntoView({ behavior: 'instant' }));
    };
    openHash(true);
    const listener = () => openHash();
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, [index]);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    setFetching(true); setSourceError(''); setSource(''); setFind(''); setMatchIndex(0);
    fetch(`${base}${file.asset}`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(`Source could not be loaded (HTTP ${response.status}).`); return response.text(); }).then(setSource).catch(error => { if (error.name !== 'AbortError') setSourceError(error.message); }).finally(() => { if (!controller.signal.aborted) { setSourceFileId(file.id); setFetching(false); } });
    return () => controller.abort();
  }, [file, base]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
      if (event.key === 'Tab' && shell.current) {
        const controls = [...shell.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,[tabindex="0"]')].filter(element => element.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === shell.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === shell.current)) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', close);
    shell.current?.focus();
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); previousFocus?.focus({ preventScroll: true }); };
  }, [expanded]);

  function updateHash(hash: string) { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`); }
  function chooseTool(item: SourceTool) { setFileId(item.fileId); setToolId(item.id); setSelectedLine(item.line); updateHash(`tool=${encodeURIComponent(item.id)}`); }
  function chooseFile(item: SourceFile) { setFileId(item.id); setToolId(''); setSelectedLine(1); updateHash(`source=${encodeURIComponent(item.id)}`); }
  function chooseLine(line: number) { setSelectedLine(line); setToolId(''); updateHash(`source=${encodeURIComponent(fileId)}&line=${line}`); }
  function jumpMatch(next: number) { if (!matches.length) return; const position = (next + matches.length) % matches.length; setMatchIndex(position); setSelectedLine(matches[position]); }

  if (indexError) return <div className="tool-error" role="alert">{indexError} <button onClick={() => window.location.reload()}>Reload page</button></div>;
  if (!index) return <div className="tool-loading"><Loader2 className="tool-spin" size={20}/> Loading the source catalog…</div>;
  const kinds = [...new Set(index.files.map(item => item.kind))];
  const benchmarkServices = index.services.filter(item => item.id !== '_shared');
  const benchmarkTools = index.tools.filter(item => item.service !== '_shared');
  const helperCount = index.tools.length - benchmarkTools.length;
  const implementationLines = index.files.filter(item => item.kind === 'implementation').reduce((sum, item) => sum + item.lines, 0);
  const testLines = index.files.filter(item => item.kind === 'test').reduce((sum, item) => sum + item.lines, 0);
  const sharedLines = index.files.filter(item => item.kind === 'shared').reduce((sum, item) => sum + item.lines, 0);

  // Where the code is in the repository: the files of a release are under one folder there (the
  // catalog records its path), so every source file has its own address. The link of a file goes
  // to the lines of the selected tool, or to the selected line.
  const releasePath = String(index.provenance.path);
  const repositoryUrl = (path: string) => `${CODE_URL}/blob/main/${releasePath}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const repositoryLines = tool ? `#L${tool.line}-L${tool.endLine}` : selectedLine > 1 ? `#L${selectedLine}` : '';

  const paperRelease = release === PAPER_RELEASE;
  const coverage = COVERAGE[release];
  const [lowestService, highestService] = coverage.serviceCoverageRangePercent;
  const coverageNote = coverage.source === 'paper'
    ? `Statement coverage as reported in the paper: ${lowestService}–${highestService}% per service.`
    : `Statement coverage measured by running the tests of ${release}: ${lowestService}–${highestService}% per service.`;

  return <div className="tool-explorer">
    {/*
      One row for every release: the number of tools and the test coverage, then the line counts.
      The tools and the lines are counted from this source snapshot. The coverage is the paper's
      figure for the release it describes, and a measured one for a later release.
    */}
    <div className="tool-metrics" role="group" aria-label="Number of tools, test coverage, and source size" data-tool-release={release}>
      <div data-tool-metric="tools"><span className="tool-metric-kicker">THIS SOURCE SNAPSHOT</span><strong>{number(benchmarkTools.length)}</strong><span>tools in {benchmarkServices.length} services</span></div>
      <div data-tool-metric="coverage" data-tool-coverage-source={coverage.source}><span className="tool-metric-kicker">CHECKED WITH TESTS</span><strong>{coverage.statementCoveragePercent}<span>%</span></strong><span>statement coverage</span></div>
      <div data-tool-metric="implementation"><span className="tool-metric-kicker">THIS SOURCE SNAPSHOT</span><strong>{number(implementationLines)}</strong><span>implementation lines</span></div>
      <div data-tool-metric="test"><span className="tool-metric-kicker">THIS SOURCE SNAPSHOT</span><strong>{number(testLines)}</strong><span>test lines</span></div>
      <div data-tool-metric="shared"><span className="tool-metric-kicker">THIS SOURCE SNAPSHOT</span><strong>{number(sharedLines)}</strong><span>shared utility lines</span></div>
    </div>
    <div className="tool-metrics-note"><ShieldCheck size={14}/><span>{coverageNote} Tool and line counts are measured from this source snapshot.</span><a href={CODE_URL} target="_blank" rel="noreferrer">Sources <ArrowUpRight size={13}/></a></div>
    <div className={`source-browser ${expanded ? 'source-expanded' : ''}`} ref={shell} tabIndex={-1} role={expanded ? 'dialog' : 'region'} aria-modal={expanded ? true : undefined} aria-label="MultiVerse tool source explorer">
      <div className="source-repo-bar"><span className="source-repo-name"><Code2 size={18}/><strong>MultiVerse</strong><span>/</span> service source</span><span className="source-snapshot"><GitBranch size={13}/> API {release}</span><button onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Exit expanded source view' : 'Expand source view'}>{expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button></div>
      <div className="source-summary"><span><Braces size={14}/><strong>{number(benchmarkTools.length)}</strong> tools</span><span><Folder size={14}/><strong>{benchmarkServices.length}</strong> services</span><span><FileCode2 size={14}/><strong>{number(index.files.length)}</strong> files</span></div>
      <div className="source-layout">
        <aside className="source-sidebar" aria-label="Browse tools and source files">
          <div className="source-sidebar-tabs" role="group" aria-label="Source browsing mode"><button aria-pressed={mode === 'tools'} onClick={() => setMode('tools')}><Braces size={14}/> Tools</button><button aria-pressed={mode === 'files'} onClick={() => setMode('files')}><Folder size={14}/> Files</button></div>
          <div className="source-filters"><label className="source-search"><Search size={14}/><input type="search" aria-label="Search tools and source files" placeholder={mode === 'tools' ? 'Find a tool or behavior…' : 'Find a source file…'} value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Filter source by service" value={service} onChange={event => setService(event.target.value)}><option value="">All services & shared utilities</option>{index.services.map(item => <option value={item.id} key={item.id}>{item.name} · {item.toolCount}</option>)}</select>{mode === 'files' && <select aria-label="Filter source by file type" value={kind} onChange={event => setKind(event.target.value)}><option value="">Implementation, tests & utilities</option>{kinds.map(item => <option key={item} value={item}>{item === 'test' ? 'Tests' : item === 'shared' ? 'Shared utilities' : item === 'implementation' ? 'Implementation' : item}</option>)}</select>}</div>
          <div className="source-list-label">{number(mode === 'tools' ? shownTools.length : shownFiles.length)} {mode === 'tools' ? 'TOOLS' : 'FILES'}<span>PYTHON</span></div>
          <div className="source-entry-list" role="group" aria-label={mode === 'tools' ? 'Matching tools' : 'Matching source files'} key={`${mode}-${service}-${kind}-${query}`}>
            {mode === 'tools' ? shownTools.map(item => <button key={item.id} className={`source-entry ${toolId === item.id ? 'selected' : ''}`} onClick={() => chooseTool(item)} title={item.description}><Braces size={14}/><span><strong>{item.name}</strong><small>{item.service}</small></span><ChevronRight size={12}/></button>) : shownFiles.map(item => <button key={item.id} className={`source-entry ${fileId === item.id ? 'selected' : ''}`} onClick={() => chooseFile(item)} title={item.path}><FileCode2 size={14}/><span><strong>{item.path.split('/').pop()}</strong><small>{item.path.split('/').slice(0, -1).join('/') || item.kind}</small></span><ChevronRight size={12}/></button>)}
            {(mode === 'tools' ? shownTools : shownFiles).length === 0 && <div className="source-empty"><Search size={22}/><strong>No matching {mode}</strong><button onClick={() => { setQuery(''); setService(''); setKind(''); }}>Clear filters</button></div>}
          </div>
        </aside>
        <div className="source-main">
          {file && <>
            <div className="source-file-bar"><span title={file.path}><FileCode2 size={15}/>{file.path}</span><div><a className="source-repository" href={`${repositoryUrl(file.path)}${repositoryLines}`} target="_blank" rel="noreferrer" aria-label={`View ${file.path} on GitHub`} title={`${releasePath}/${file.path} in the repository`}><Link2 size={15}/><span>View on GitHub</span><ArrowUpRight size={12}/></a></div></div>
            {tool && <div className="source-function"><span><Braces size={15}/>{tool.service}<ChevronRight size={12}/><strong>{tool.name}</strong></span>{tool.description && <p>{tool.description}</p>}</div>}
            <div className="source-code-toolbar"><span>{number(file.lines)} lines <i>·</i> {number(Math.round(file.bytes / 1024))} KB <i>·</i> {file.kind === 'test' ? 'Tests' : 'Python'}</span><div className="source-find"><Search size={13}/><input aria-label="Find text in source file" placeholder="Find in this file" value={find} onChange={event => { setFind(event.target.value); setMatchIndex(0); const line = source.split('\n').findIndex(value => value.toLowerCase().includes(event.target.value.toLowerCase())); if (event.target.value && line >= 0) setSelectedLine(line + 1); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); jumpMatch(matchIndex + (event.shiftKey ? -1 : 1)); } }}/>{find && <><span aria-live="polite">{matches.length ? matchIndex + 1 : 0}/{matches.length}</span><button onClick={() => jumpMatch(matchIndex - 1)} disabled={!matches.length} aria-label="Previous matching line"><ArrowUp size={13}/></button><button onClick={() => jumpMatch(matchIndex + 1)} disabled={!matches.length} aria-label="Next matching line"><ArrowDown size={13}/></button><button onClick={() => setFind('')} aria-label="Clear source search"><X size={13}/></button></>}</div></div>
          </>}
          <div className="source-code" ref={viewer} onScroll={onScroll} tabIndex={0} role="region" aria-label={file ? `Source code: ${file.path}` : 'Source code'} aria-busy={loading}>
            {loading ? <div className="source-code-message"><Loader2 className="tool-spin" size={20}/> Loading source…</div> : sourceError ? <div className="source-code-message" role="alert">{sourceError}</div> : <div className="source-code-canvas" style={{ height: totalHeight }}>
              {tokens.slice(firstLine, lastLine).map((line, offset) => { const n = firstLine + offset + 1; return <div key={n} className={`source-code-line ${n === selectedLine ? 'active' : ''} ${find && matches.includes(n) ? 'matched' : ''}`} style={{ top: offsets[n - 1] }} data-line={n}><button className="source-line-number" onClick={() => chooseLine(n)} aria-label={`Link to line ${n}`}>{n}</button><code>{line.map((part, tokenIndex) => <span className={`syntax-${part.kind}`} key={tokenIndex}>{part.text}</span>)}</code></div>; })}
            </div>}
          </div>
          <div className="source-status"><span>{file ? `SHA-256 ${file.sha256.slice(0, 12)}` : 'Select a tool or file'}<span className="source-line-status"> · Line {selectedLine}</span></span></div>
        </div>
      </div>
    </div>
    <div className="source-footnote"><p>Source counts include endpoint implementations, service engines, models, comments, docstrings, and blank lines. They are measured from API {release}; {paperRelease ? 'paper coverage' : 'coverage'} measures executable statements. The catalog also includes {helperCount} shared utility and authentication helpers.</p></div>
  </div>;
}
