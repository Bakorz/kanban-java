import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createApi } from './api.js';
import { useAuth } from './Auth.jsx';
import { ConfirmDelete, ErrorMessage, Field, Page, useOperation } from './ui.jsx';

function useApi() {
  const { client, clear, getScope } = useAuth();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // getScope is a stable ref accessor updated synchronously by SDK auth events,
  // so requests cannot outlive an account switch even before React re-renders.
  return useMemo(() => createApi({ client, onAuthFailure: clear, getScope, isActive: () => active.current }), [client, clear, getScope]);
}
function useResource(path) {
  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError(null);
    try { const result = await api(path); if (sequence.current === current) setData(result); return result; }
    catch (err) { if (sequence.current === current) { setError(err); setData(null); } throw err; }
    finally { if (sequence.current === current) setLoading(false); }
  }, [api, path]);
  useEffect(() => { void load().catch(() => {}); return () => { sequence.current++; }; }, [load]);
  return { api, data, error, loading, load };
}
function ResourceState({ resource, children }) {
  if (resource.loading && !resource.data) return <progress aria-label="Loading workspace" />;
  if (resource.error) return <><ErrorMessage error={resource.error} /><button type="button" onClick={() => { void resource.load().catch(() => {}); }}>Try again</button></>;
  return children;
}

function BoardForm({ board, onSave, onCancel, onBusy, formBusy = false, headingId, focusFirstField = false }) {
  const op = useOperation();
  useEffect(() => { onBusy?.(op.pending); return () => onBusy?.(false); }, [op.pending, onBusy]);
  const title = board ? 'Edit board' : 'Create board';
  const heading = useRef(null);
  const form = useRef(null);
  useEffect(() => {
    if (focusFirstField) form.current?.querySelector('input[name="name"]')?.focus();
    else heading.current?.focus();
  }, [focusFirstField]);
  return <form ref={form} className="editor" method="post" aria-label={title} onSubmit={(event) => {
    event.preventDefault();
    if (formBusy) return;
    const form = new FormData(event.currentTarget);
    void op.run(() => onSave({ name: String(form.get('name')).trim(), description: String(form.get('description')).trim() || null }));
  }}><h2 id={headingId} ref={heading} tabIndex={-1}>{title}</h2>
    <Field label="Board name (required)" name="name" required maxLength={100} pattern=".*\S.*" defaultValue={board?.name || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.name} />
    <Field label="Description (optional, up to 2,000 characters)" name="description" multiline maxLength={2000} defaultValue={board?.description || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.description} />
    <ErrorMessage error={op.error} />
    <div className="actions"><button type="submit" className="primary" disabled={op.pending || formBusy}>{op.pending ? 'Saving…' : board ? 'Save board' : 'Create board'}</button><button type="button" disabled={op.pending || formBusy} onClick={onCancel}>Cancel</button></div>
  </form>;
}

const EMPTY_BOARDS = [];
const TONE_ORDER = ['todo', 'progress', 'done'];
const TONE_LABELS = { todo: 'to do', progress: 'in progress', done: 'done' };

function statusTone(name, index) {
  const value = String(name || '').toLowerCase();
  if (/(done|complete|shipped|closed)/.test(value)) return 'done';
  if (/(progress|doing|review|active)/.test(value)) return 'progress';
  if (/(to do|todo|backlog|next|planned|queue)/.test(value)) return 'todo';
  return TONE_ORDER[index] || 'todo';
}

function countTasks(columns) {
  const counts = { todo: 0, progress: 0, done: 0 };
  let total = 0;
  columns.forEach((column, index) => {
    const count = Array.isArray(column.cards) ? column.cards.length : 0;
    counts[statusTone(column.name, index)] += count;
    total += count;
  });
  return { counts, total };
}

function taskCountText(count) {
  if (!count) return 'No tasks yet';
  return `${count} task${count === 1 ? '' : 's'}`;
}

function previewSummary(preview) {
  if (!preview) return 'Board preview is loading.';
  if (preview.error) return 'Board preview is unavailable.';
  const columns = Array.isArray(preview.columns) ? preview.columns : [];
  const { counts, total } = countTasks(columns);
  if (!total) return 'No tasks.';
  const parts = TONE_ORDER.filter((tone) => counts[tone]).map((tone) => `${counts[tone]} ${TONE_LABELS[tone]}`);
  return `${taskCountText(total)}: ${parts.join(', ')}.`;
}

function useBoardPreviews(boards) {
  const api = useApi();
  const [previews, setPreviews] = useState({});
  useEffect(() => {
    const list = boards || EMPTY_BOARDS;
    if (!list.length) { setPreviews({}); return undefined; }
    let cancelled = false;
    setPreviews({});
    for (const board of list) {
      void api(`/api/boards/${encodeURIComponent(board.id)}`).then((detail) => {
        if (cancelled) return;
        setPreviews((current) => ({ ...current, [board.id]: { columns: Array.isArray(detail?.columns) ? detail.columns : [] } }));
      }).catch(() => {
        if (cancelled) return;
        setPreviews((current) => ({ ...current, [board.id]: { error: true } }));
      });
    }
    return () => { cancelled = true; };
  }, [api, boards]);
  return previews;
}

function PreviewSkeleton() {
  return <div className="bp-columns bp-columns--loading">
    {[0, 1, 2].map((column) => <div className="bp-col bp-col--loading" key={column}>
      <div className="bp-head"><span className="bp-skel bp-skel--dot" /><span className="bp-skel bp-skel--head" /><span className="bp-skel bp-skel--count" /></div>
      <div className="bp-cards"><span className="bp-skel bp-skel--card" /><span className="bp-skel bp-skel--card" /><span className="bp-skel bp-skel--card bp-skel--short" /></div>
    </div>)}
  </div>;
}

function BoardPreview({ preview }) {
  if (!preview) return <PreviewSkeleton />;
  if (preview.error) return <div className="bp-fallback">Preview unavailable</div>;
  const columns = Array.isArray(preview.columns) ? preview.columns.slice(0, 3) : [];
  if (!columns.length) return <div className="bp-fallback">Preview unavailable</div>;
  return <div className="bp-columns">{columns.map((column, index) => {
    const cards = Array.isArray(column.cards) ? column.cards : [];
    const tone = statusTone(column.name, index);
    return <div className={`bp-col bp-col--${tone}`} key={column.id || index}>
      <div className="bp-head"><span className="bp-dot" /><span className="bp-name">{column.name}</span><span className="bp-count">{cards.length}</span></div>
      <div className="bp-cards">
        {cards.slice(0, 3).map((card, cardIndex) => <div className="bp-card" key={card.id || cardIndex}>{card.title}</div>)}
        {cards.length > 3 && <span className="bp-more">+{cards.length - 3} more</span>}
        {!cards.length && <span className="bp-none">Empty</span>}
      </div>
    </div>;
  })}</div>;
}

function BoardCard({ board, preview }) {
  const columns = Array.isArray(preview?.columns) ? preview.columns : [];
  const { counts, total } = countTasks(columns);
  return <li className="board-card-item">
    <Link className="board-card" to={`/boards/${board.id}`} aria-describedby={`board-summary-${board.id}`}>
      <div className="board-card__preview" aria-hidden="true"><BoardPreview preview={preview} /></div>
      <div className="board-card__body">
        <h2 className="board-card__title">{board.name}</h2>
        <p className="board-card__meta" aria-hidden="true">
          <span>{!preview ? 'Loading tasks' : preview.error ? 'Preview unavailable' : taskCountText(total)}</span>
          {preview && !preview.error && total > 0 && <span className="board-card__meter">
            {TONE_ORDER.filter((tone) => counts[tone]).map((tone) => <span className={`board-card__seg board-card__seg--${tone}`} style={{ flexGrow: counts[tone] }} key={tone} />)}
          </span>}
        </p>
      </div>
    </Link>
    <span className="sr-only" id={`board-summary-${board.id}`}>{previewSummary(preview)}</span>
  </li>;
}

export function Dashboard() {
  const resource = useResource('/api/boards');
  const boards = resource.data?.boards;
  const previews = useBoardPreviews(boards);
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const newBoardButton = useRef(null);
  const dialog = useRef(null);
  const wasCreating = useRef(false);
  const searchId = useId();
  const filteredBoards = useMemo(() => {
    const list = boards || EMPTY_BOARDS;
    const needle = query.toLocaleLowerCase();
    if (!needle) return list;
    return list.filter((board) => `${board.name} ${board.description || ''}`.toLocaleLowerCase().includes(needle));
  }, [boards, query]);
  const resultMessage = query ? `${filteredBoards.length} board${filteredBoards.length === 1 ? '' : 's'} found.` : '';

  useEffect(() => {
    if (!creating) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [creating]);

  useEffect(() => {
    if (wasCreating.current && !creating) newBoardButton.current?.focus();
    wasCreating.current = creating;
  }, [creating]);

  function closeCreate() {
    if (formBusy) return;
    setCreating(false);
  }

  function onDialogKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeCreate(); return; }
    if (event.key !== 'Tab') return;
    const candidates = [...(dialog.current?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
    if (!candidates.length) return;
    const active = document.activeElement;
    if (!candidates.includes(active)) {
      event.preventDefault();
      (event.shiftKey ? candidates[candidates.length - 1] : candidates[0]).focus();
    } else if (!event.shiftKey && active === candidates[candidates.length - 1]) {
      event.preventDefault(); candidates[0].focus();
    } else if (event.shiftKey && active === candidates[0]) {
      event.preventDefault(); candidates[candidates.length - 1].focus();
    }
  }

  return <Page title="My boards" className="dash-main">
    <div className="dash-toolbar">
      <form className="dash-search" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(searchDraft.trim()); }}>
        <label className="sr-only" htmlFor={searchId}>Search boards</label>
        <div className="dash-search__field">
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.6" cy="8.6" r="5.6" /><path d="m13 13 4.2 4.2" /></svg>
          <input id={searchId} name="q" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search boards" autoComplete="off" />
        </div>
        <button type="submit" className="dash-search__submit">Search</button>
      </form>
      <button ref={newBoardButton} type="button" className="dash-create" aria-label="New board" title="New board" onClick={() => setCreating(true)}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
      </button>
    </div>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{resultMessage}</p>
    <div className="dash-results">
      <ResourceState resource={resource}>
        {boards?.length === 0
          ? <div className="dash-empty"><span className="dash-empty__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16M15 4v16" /></svg></span><h2>No boards yet</h2><p>Use the + button to create your first board.</p></div>
          : filteredBoards.length === 0
            ? <div className="dash-empty"><span className="dash-empty__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg></span><h2>No boards match</h2><p>Nothing matches “{query}”. Try another search.</p></div>
            : <ul className="board-grid" role="list">{filteredBoards.map((board) => <BoardCard board={board} preview={previews[board.id]} key={board.id} />)}</ul>}
      </ResourceState>
    </div>
    {creating && <div className="dash-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}>
      <div className="dash-dialog" role="dialog" aria-modal="true" aria-labelledby="dash-create-board-title" ref={dialog} onKeyDown={onDialogKeyDown}>
        <BoardForm headingId="dash-create-board-title" focusFirstField onBusy={setFormBusy} onCancel={closeCreate} onSave={async (payload) => {
          await resource.api('/api/boards', { method: 'POST', body: payload });
          setCreating(false);
          setSearchDraft('');
          setQuery('');
          await resource.load().catch(() => {}); // The board exists now; retry only the list, never the create.
        }} />
      </div>
    </div>}
  </Page>;
}

function CardForm({ card, column, onSave, onCancel, onBusy, formBusy = false }) {
  const op = useOperation();
  useEffect(() => { onBusy?.(op.pending); return () => onBusy?.(false); }, [op.pending, onBusy]);
  const priorityId = `priority-${card?.id || column.id}`;
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <form className="editor" aria-label={card ? `Edit card ${card.title}` : `Add card to ${column.name}`} method="post" onSubmit={(event) => {
    event.preventDefault(); if (formBusy) return; const form = new FormData(event.currentTarget);
    const body = { title: String(form.get('title')).trim(), description: String(form.get('description')).trim() || null, priority: String(form.get('priority')), dueDate: String(form.get('dueDate')) || null };
    void op.run(() => onSave(body));
  }}><h2 ref={heading} tabIndex={-1}>{card ? 'Edit card' : `Add card to ${column.name}`}</h2>
    <Field label="Title (required)" name="title" required maxLength={200} pattern=".*\S.*" defaultValue={card?.title || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.title} />
    <Field label="Description (optional, up to 5,000 characters)" name="description" multiline maxLength={5000} defaultValue={card?.description || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.description} />
    <div className="field"><label htmlFor={priorityId}>Priority</label><select id={priorityId} name="priority" defaultValue={card?.priority || 'MEDIUM'} disabled={op.pending || formBusy}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div>
    <Field label="Due date (optional)" name="dueDate" type="date" defaultValue={card?.dueDate || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.dueDate} />
    <ErrorMessage error={op.error} /><div className="actions"><button className="primary" type="submit" disabled={op.pending || formBusy}>{op.pending ? 'Saving…' : card ? 'Save card' : 'Create card'}</button><button type="button" disabled={op.pending || formBusy} onClick={onCancel}>Cancel</button></div>
  </form>;
}

function Card({ card, column, columns, index, busy, onEdit, onDelete, onMove }) {
  const [target, setTarget] = useState(column.id);
  const selectId = `move-${card.id}`;
  useEffect(() => setTarget(column.id), [column.id]);
  return <article className="card"><h3>{card.title}</h3>{card.description && <p className="preserve-text">{card.description}</p>}
    <p className="card-meta">Priority: {card.priority.toLowerCase()}{card.dueDate && <> · Due <time dateTime={card.dueDate}>{card.dueDate}</time></>}</p>
    <div className="actions"><button type="button" disabled={busy} aria-label={`Edit card ${card.title}`} onClick={onEdit}>Edit</button><button type="button" disabled={busy} aria-label={`Delete card ${card.title}`} onClick={onDelete}>Delete</button></div>
    <form className="move-form" aria-label={`Move ${card.title}`} onSubmit={(event) => { event.preventDefault(); if (!busy && target !== column.id) onMove(target, columns.find((c) => c.id === target).cards.length); }}>
      <label htmlFor={selectId}>Move to column</label><select id={selectId} value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)}>{columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="submit" disabled={busy || target === column.id} aria-label={`Move ${card.title} to selected column`}>Move</button>
    </form>
    <div className="actions reorder"><button type="button" disabled={busy || index === 0} aria-label={`Move ${card.title} up`} onClick={() => onMove(column.id, index - 1)}>Move up</button><button type="button" disabled={busy || index === column.cards.length - 1} aria-label={`Move ${card.title} down`} onClick={() => onMove(column.id, index + 1)}>Move down</button></div>
  </article>;
}

export function Board() {
  const { boardId } = useParams();
  const resource = useResource(`/api/boards/${encodeURIComponent(boardId)}`);
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [editingBoard, setEditingBoard] = useState(false);
  const [status, setStatus] = useState('');
  const op = useOperation();
  const navigate = useNavigate();
  const board = resource.data?.board;
  const columns = resource.data?.columns || [];
  async function mutate(path, options, message) {
    setStatus(''); await resource.api(path, options); setEditor(null); setDeleting(null);
    try { await resource.load(); setStatus(message); }
    catch { setStatus('The change was saved, but the latest board could not be loaded. Use Try again to reload; do not repeat the change.'); }
  }
  return <Page title={board?.name || 'Board'}><p><Link to="/dashboard">Back to my boards</Link></p><p role="status">{status}</p><ResourceState resource={resource}>
    {board && <>
      {board.description && <p className="intro preserve-text">{board.description}</p>}
      <div className="actions"><button type="button" disabled={op.pending || formBusy || resource.loading} onClick={() => { setEditingBoard(true); setEditor(null); }}>Edit board</button><button type="button" disabled={op.pending || formBusy || resource.loading} onClick={() => setDeleting({ type: 'board', ...board })}>Delete board</button></div>
      {editingBoard && <BoardForm onBusy={setFormBusy} formBusy={op.pending} board={board} onCancel={() => setEditingBoard(false)} onSave={async (body) => { await resource.api(`/api/boards/${board.id}`, { method: 'PUT', body }); setEditingBoard(false); await resource.load().catch(() => {}); }} />}
      <ErrorMessage error={op.error} />
      {deleting && <ConfirmDelete board={deleting.type === 'board'} name={deleting.title || deleting.name} pending={op.pending || formBusy} onCancel={() => setDeleting(null)} onConfirm={() => { void op.run(async () => {
        if (deleting.type === 'board') { await resource.api(`/api/boards/${board.id}`, { method: 'DELETE' }); navigate('/dashboard'); }
        else await mutate(`/api/cards/${deleting.id}`, { method: 'DELETE' }, 'Card deleted.');
      }); }} />}
      {editor && <CardForm onBusy={setFormBusy} formBusy={op.pending} key={editor.card?.id || editor.column.id} card={editor.card} column={editor.column} onCancel={() => setEditor(null)} onSave={async (body) => {
        await mutate(editor.card ? `/api/cards/${editor.card.id}` : `/api/columns/${editor.column.id}/cards`, { method: editor.card ? 'PUT' : 'POST', body }, editor.card ? 'Card updated.' : 'Card created.');
      }} />}
      <section className="board-section"><h2>Board columns</h2><p>Use the column selector or Move up / Move down to organize cards. No dragging required.</p><div className="columns">{columns.map((column) => <section className="column" key={column.id}><h2>{column.name} <span className="count">({column.cards.length})</span></h2><button type="button" disabled={op.pending || formBusy || resource.loading} onClick={() => { setEditingBoard(false); setEditor({ column }); }}>Add card to {column.name}</button>
        {!column.cards.length && <p className="column-empty">No cards yet.</p>}
        <ol className="card-list" role="list">{column.cards.map((card, index) => <li key={card.id}><Card card={card} column={column} columns={columns} index={index} busy={op.pending || formBusy || resource.loading} onEdit={() => { setEditingBoard(false); setEditor({ column, card }); }} onDelete={() => setDeleting({ type: 'card', ...card })} onMove={(targetColumnId, newPosition) => { void op.run(() => mutate(`/api/cards/${card.id}/move`, { method: 'POST', body: { targetColumnId, newPosition } }, 'Card moved.')); }} /></li>)}</ol>
      </section>)}</div></section>
    </>}
  </ResourceState></Page>;
}
