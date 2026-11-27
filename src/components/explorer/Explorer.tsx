import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Layers3, ListFilter, LoaderCircle, Search, Shuffle, X } from 'lucide-react';
import type { ExplorerTaskType, MultiverseTask } from '@/types';
import { PAPER_RELEASE, dataRoot, useRelease } from '@/lib/release';
import './explorer.css';

const TaskDetailModal = lazy(() => import('./TaskDetailModal').then(module => ({ default: module.TaskDetailModal })));
const SETTINGS: { code: ExplorerTaskType; label: string }[] = [
  { code: 'ST', label: 'Single turn' },
  { code: 'IF', label: 'Instruction following' },
  { code: 'MT', label: 'Multi-turn' },
  { code: 'MTIF', label: 'Multi-turn + instruction following' },
];
const PAGE_SIZE = 9;
/** A service id as a label: "gridwell_mail" reads "Gridwell Mail". */
function appLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
function taskFromHash(): string | null {
  const match = window.location.hash.match(/^#task=([^&]+)/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

export function Explorer() {
  // The task set of the release selected on the page; the same task can be opened in either release.
  const release = useRelease();
  const [tasks, setTasks] = useState<MultiverseTask[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query.trim().toLowerCase());
  const [setting, setSetting] = useState<ExplorerTaskType | 'all'>('all');
  const [app, setApp] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(taskFromHash);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setPage(1);
    fetch(`${import.meta.env.BASE_URL}${dataRoot(release)}tasks.json`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`Task index could not load (HTTP ${response.status}).`); return response.json(); })
      .then((payload: MultiverseTask[] | { tasks: MultiverseTask[] }) => {
        const data = Array.isArray(payload) ? payload : payload.tasks;
        // The index is the release's validation set; its size comes from the data, not from the code.
        if (!Array.isArray(data) || !data.length || new Set(data.map(task => task.id)).size !== data.length) throw new Error('The validation index must list unique tasks.');
        setTasks(data); setStatus('ready');
      }).catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Task index could not load.'); setStatus('error'); } });
    return () => controller.abort();
  }, [attempt, release]);

  useEffect(() => {
    // A link elsewhere on the page can open a task; the focus returns to that link when the task closes.
    // A task opened from its card has the card recorded already, and by now the focus is inside its dialog.
    const onHash = () => {
      const active = document.activeElement as HTMLElement | null;
      if (taskFromHash() && active && active !== document.body && !active.closest('[role="dialog"]')) previousFocus.current = active;
      setSelectedId(taskFromHash()); setCopied(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const apps = useMemo(() => [...new Set(tasks.flatMap(task => task.tools))].sort((a, b) => appLabel(a).localeCompare(appLabel(b))), [tasks]);
  const counts = useMemo(() => Object.fromEntries(SETTINGS.map(({ code }) => [code, tasks.filter(task => task.taskType === code).length])), [tasks]);
  const filtered = useMemo(() => tasks.filter(task =>
    (setting === 'all' || task.taskType === setting) &&
    (app === 'all' || task.tools.includes(app)) &&
    (!search || [task.title, task.prompt, task.promptPreview, task.id, task.domain, task.taskType,...task.tools, ...task.tools.map(appLabel), ...(task.userGoals || [])].join(' ').toLowerCase().includes(search))
  ), [tasks, search, setting, app]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = tasks.find(task => task.id === selectedId) || null;
  const hasFilters = query !== '' || setting !== 'all' || app !== 'all';

  useEffect(() => {
    if (selectedId && status === 'ready' && !selected) resultsRef.current?.scrollIntoView({ block: 'start' });
  }, [selectedId, selected, status]);

  function openTask(task: MultiverseTask) {
    previousFocus.current = document.activeElement as HTMLElement;
    window.location.hash = `task=${encodeURIComponent(task.id)}`;
    setSelectedId(task.id); setCopied(false); setCopyError(false);
  }
  function closeTask() {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#explorer`);
    setSelectedId(null);
    requestAnimationFrame(() => previousFocus.current?.focus());
  }
  function reset() { setQuery(''); setSetting('all'); setApp('all'); setPage(1); }
  function changePage(next: number) {
    setPage(next);
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function copyLink() {
    // The copied link names the release, so that it opens this version of the task whatever the reader has selected.
    const link = new URL(window.location.href);
    link.searchParams.set('release', release);
    try { await navigator.clipboard.writeText(link.href); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }

  return <div className="mv-explorer">
    <div className="mv-explorer-toolbar">
      <label className="mv-search">
        <Search size={18} aria-hidden="true" />
        <input ref={searchRef} type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search tasks by title, query, or service…" aria-label="Search all validation tasks" />
        <span className="mv-search-hint">{tasks.length ? `${tasks.length} tasks` : 'Validation tasks'}</span>
      </label>
      <label className="mv-app-filter"><ListFilter size={16} aria-hidden="true" /><span className="sr-only">Filter by service</span>
        <select value={app} onChange={event => { setApp(event.target.value); setPage(1); }} aria-label="Filter tasks by service"><option value="all">All services</option>{apps.map(name => <option key={name} value={name}>{appLabel(name)}</option>)}</select>
      </label>
      <button type="button" className="mv-surprise" onClick={() => { if (filtered.length) openTask(filtered[Math.floor(Math.random() * filtered.length)]); }} disabled={!filtered.length} title="Open a random task from the current results"><Shuffle size={16} /><span>Surprise me</span></button>
    </div>
    <div className="mv-filter-row">
      <div className="mv-setting-tabs" role="group" aria-label="Filter tasks by setting">
        <button type="button" aria-pressed={setting === 'all'} onClick={() => { setSetting('all'); setPage(1); }}>All settings <span>{tasks.length || '…'}</span></button>
        {SETTINGS.map(({ code, label }) => <button key={code} type="button" title={label} aria-label={`${code}: ${label}`} aria-pressed={setting === code} onClick={() => { setSetting(code); setPage(1); }}>{code}<span>{counts[code] || (status === 'loading' ? '…' : 0)}</span></button>)}
      </div>
      <span className="mv-cohort-label" data-explorer-release={release} title={release === PAPER_RELEASE ? `The ${tasks.length || ''} validation tasks evaluated in the paper (${release})` : `The ${tasks.length || ''} validation tasks of ${release}`}><span /> {release === PAPER_RELEASE ? `Paper validation set (${release})` : `${release} validation set`}</span>
    </div>
    <div className="mv-results-meta" ref={resultsRef}>
      <p aria-live="polite">{status === 'ready' ? <><strong>{filtered.length}</strong> {filtered.length === 1 ? 'task' : 'tasks'}{hasFilters && <> out of {tasks.length}</>}{setting !== 'all' && <span className="mv-setting-description"> · {SETTINGS.find(item => item.code === setting)?.label}</span>}</> : status === 'loading' ? 'Loading validation tasks…' : 'Task data unavailable'}</p>
      {hasFilters && <button type="button" className="mv-reset" onClick={reset}><X size={13} /> Clear filters</button>}
    </div>
    {status === 'loading' ? <div className="mv-explorer-status" role="status"><LoaderCircle className="animate-spin" size={26} /><p>Opening the validation set</p><span>Task instructions, reference trajectories, and application states.</span></div> : status === 'error' ? <div className="mv-explorer-status" role="alert"><p>We couldn’t load the task explorer.</p><span>{error}</span><button onClick={() => setAttempt(value => value + 1)} className="mv-outline-action">Try again</button></div> : filtered.length === 0 ? <div className="mv-explorer-status"><Search size={28} /><p>No matching tasks</p><span>Try a different keyword, setting, or service.</span><button className="mv-outline-action" onClick={reset}>Clear all filters</button></div> : <>
      <div className="mv-task-grid" aria-label="Validation task results">
        {visible.map((task, index) => <button key={task.id} type="button" className="mv-task-card" onClick={() => openTask(task)} aria-label={`Explore task: ${task.title}`}>
          <div className="mv-task-card-top"><span className={`mv-setting-badge mv-setting-${task.taskType.toLowerCase()}`}>{task.taskType}</span><span className="mv-card-domain">{task.domain || task.category || 'Cross-application task'}</span><ArrowUpRight size={17} className="mv-card-arrow" /></div>
          <h3>{task.title}</h3>
          <p className="mv-task-prompt">{task.promptPreview || task.prompt}</p>
          <div className="mv-task-apps">{task.tools.slice(0, 3).map(tool => <span key={tool}><i aria-hidden="true">{appLabel(tool).slice(0, 1)}</i>{appLabel(tool)}</span>)}{task.tools.length > 3 && <span className="mv-more-apps">+{task.tools.length - 3}</span>}</div>
          <div className="mv-task-card-bottom"><span><Layers3 size={13} />{task.goldSteps} reference steps</span><span className="mv-task-number">{String((safePage - 1) * PAGE_SIZE + index + 1).padStart(3, '0')}</span></div>
        </button>)}
      </div>
      <div className="mv-explorer-footer">
        <p>Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} tasks</p>
        <nav className="mv-pagination" aria-label="Task result pages"><button type="button" onClick={() => changePage(safePage - 1)} disabled={safePage === 1} aria-label="Previous task page"><ChevronLeft size={16} /></button><span>Page <strong>{safePage}</strong> of {totalPages}</span><button type="button" onClick={() => changePage(safePage + 1)} disabled={safePage === totalPages} aria-label="Next task page"><ChevronRight size={16} /></button></nav>
      </div>
    </>}
    {selectedId && status === 'ready' && !selected && <div className="mv-explorer-status" role="alert"><p>This task is not in the validation set.</p><button className="mv-outline-action" onClick={closeTask}>Back to all tasks</button></div>}
    {selected && <Suspense fallback={<div className="mv-task-pending" role="status"><LoaderCircle className="animate-spin" size={24} />Opening task…</div>}><TaskDetailModal key={release} task={selected} onClose={closeTask} footerActions={<><button className="mv-modal-action" type="button" onClick={copyLink}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Link copied' : copyError ? 'Copy URL from address bar' : 'Copy link'}</button></>} /></Suspense>}
  </div>;
}
