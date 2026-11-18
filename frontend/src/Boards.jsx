import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createApi } from './api.js';
import { useAuth } from './Auth.jsx';
import { ErrorMessage, Field, Modal, Page, WorkspaceLoading, useOperation } from './ui.jsx';

const RELOAD_WARNING = 'The change was saved, but the latest board could not be loaded. Use Try again to reload; do not repeat the change.';

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
  return { api, data, error, loading, load, setData };
}
function ResourceState({ resource, children, loading }) {
  if (resource.loading && !resource.data) return loading;
  if (resource.error) return <><ErrorMessage error={resource.error} /><button type="button" onClick={() => { void resource.load().catch(() => {}); }}>Try again</button></>;
  return children;
}

function BoardForm({ board, onSave, onCancel, onBusy, formBusy = false, headingId }) {
  const op = useOperation();
  useEffect(() => { onBusy?.(op.pending); return () => onBusy?.(false); }, [op.pending, onBusy]);
  const title = board ? 'Edit board' : 'Create board';
  return <form className="editor" method="post" aria-label={title} onSubmit={(event) => {
    event.preventDefault();
    if (formBusy) return;
    const form = new FormData(event.currentTarget);
    void op.run(() => onSave({ name: String(form.get('name')).trim(), description: String(form.get('description')).trim() || null }));
  }}><h2 id={headingId}>{title}</h2>
    <Field label="Board name (required)" name="name" required maxLength={100} pattern=".*\S.*" defaultValue={board?.name || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.name} />
    <Field label="Description (optional, up to 2,000 characters)" name="description" multiline maxLength={2000} defaultValue={board?.description || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.description} />
    <ErrorMessage error={op.error} />
    <div className="actions"><button type="submit" className="primary" disabled={op.pending || formBusy}>{op.pending ? 'Saving…' : board ? 'Save board' : 'Create board'}</button><button type="button" disabled={op.pending || formBusy} onClick={onCancel}>Cancel</button></div>
  </form>;
}

const EMPTY_BOARDS = [];
const TONE_ORDER = ['todo', 'progress', 'done'];
const TONE_LABELS = { todo: 'to do', progress: 'in progress', done: 'done' };
const PRIORITY_LABELS = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

function priorityName(value) {
  const priority = String(value || '').toUpperCase();
  return PRIORITY_LABELS[priority] ? priority : 'MEDIUM';
}

function dueDateLabel(value) {
  if (!value) return '';
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

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

function DashboardLoading() {
  return <div className="dash-loading">
    <div className="board-grid board-grid--loading" aria-hidden="true">
      {[0, 1, 2].map((index) => <div className="board-card" key={index}>
        <div className="board-card__preview"><PreviewSkeleton /></div>
        <div className="board-card__body">
          <span className="bp-skel dash-skel--title" />
          <span className="bp-skel dash-skel--meta" />
        </div>
      </div>)}
    </div>
    <WorkspaceLoading label="Loading your boards…" />
  </div>;
}

export function Dashboard() {
  const resource = useResource('/api/boards');
  const boards = resource.data?.boards;
  const previews = useBoardPreviews(boards);
  const [search, setSearch] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const newBoardButton = useRef(null);
  const wasCreating = useRef(false);
  const searchId = useId();
  const query = search.trim();
  const filteredBoards = useMemo(() => {
    const list = boards || EMPTY_BOARDS;
    const needle = query.toLocaleLowerCase();
    if (!needle) return list;
    return list.filter((board) => `${board.name} ${board.description || ''}`.toLocaleLowerCase().includes(needle));
  }, [boards, query]);

  useEffect(() => {
    if (!query || !boards?.length) {
      setResultMessage('');
      return;
    }
    const count = filteredBoards.length;
    const timer = setTimeout(() => setResultMessage(`${count} board${count === 1 ? '' : 's'} found.`), 250);
    return () => clearTimeout(timer);
  }, [query, boards, filteredBoards.length]);

  useEffect(() => {
    if (wasCreating.current && !creating) newBoardButton.current?.focus();
    wasCreating.current = creating;
  }, [creating]);

  function closeCreate() {
    if (formBusy) return;
    setCreating(false);
  }

  return <Page title="My boards" className="dash-main" actions={
    <button ref={newBoardButton} type="button" className="dash-create primary" onClick={() => setCreating(true)}>
      <PlusIcon />New board
    </button>
  }>
    <div className="dash-search" role="search">
      <label className="sr-only" htmlFor={searchId}>Search boards</label>
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.6" cy="8.6" r="5.6" /><path d="m13 13 4.2 4.2" /></svg>
      <input id={searchId} name="q" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search boards" autoComplete="off" />
    </div>
    <p className="sr-only" role="status" aria-atomic="true">{resultMessage}</p>
    <div className="dash-results" data-ready={Boolean(resource.data)}>
      <ResourceState resource={resource} loading={<DashboardLoading />}>
        {boards?.length === 0
          ? <div className="dash-empty"><span className="dash-empty__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16M15 4v16" /></svg></span><h2>No boards yet</h2><p>Use New board to create your first board.</p></div>
          : filteredBoards.length === 0
            ? <div className="dash-empty"><span className="dash-empty__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg></span><h2>No boards match</h2><p>Nothing matches “{query}”. Try another search.</p></div>
            : <ul className="board-grid" role="list">{filteredBoards.map((board) => <BoardCard board={board} preview={previews[board.id]} key={board.id} />)}</ul>}
      </ResourceState>
    </div>
    {creating && <Modal labelledBy="dash-create-board-title" onClose={closeCreate}>
      <BoardForm headingId="dash-create-board-title" onBusy={setFormBusy} onCancel={closeCreate} onSave={async (payload) => {
        await resource.api('/api/boards', { method: 'POST', body: payload });
        setCreating(false);
        setSearch('');
        await resource.load().catch(() => {}); // The board exists now; retry only the list, never the create.
      }} />
    </Modal>}
  </Page>;
}

function PlusIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>;
}

function PencilIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 13.8-.7 3 3-.7L16.4 6a1.8 1.8 0 0 0-2.5-2.5L4 13.8Z" /><path d="m12.6 4.9 2.5 2.5" /></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M8 5.5V3.8h4v1.7M5.5 5.5l.7 10.2h7.6l.7-10.2M8.4 9v3.7M11.6 9v3.7" /></svg>;
}

function ArrowUpIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" /></svg>;
}

function ArrowDownIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" /></svg>;
}

function GripIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true">{[5, 10, 15].map((y) => <g key={y}><circle cx="7" cy={y} r="1.25" /><circle cx="13" cy={y} r="1.25" /></g>)}</svg>;
}

function BoardSkeleton() {
  return <div className="board-columns board-columns--loading" role="status" aria-label="Loading board">
    {[3, 2, 1].map((column) => <div className="board-column board-column--skeleton" key={column} aria-hidden="true">
      <div className="board-column__head"><span className="board-skel board-skel--dot" /><span className="board-skel board-skel--title" /><span className="board-skel board-skel--add" /></div>
      <div className="board-skeleton__cards">{Array.from({ length: column }, (_, card) => <span className={`board-skel board-skel--card${card === column - 1 ? ' board-skel--short' : ''}`} key={card} />)}</div>
    </div>)}
  </div>;
}

function dropPosition(source, target) {
  return target.index - Number(source.columnId === target.columnId && source.index < target.index);
}

// Pick a lane only if the pointer is inside its natural-height bounds. Within
// the lane, pass the midpoint of a card to insert after it. The source never
// leaves the flow during a drag, so these measurements don't shift around.
function boardCollision({ active, pointerCoordinates: point, droppableContainers, droppableRects }) {
  if (!point) return [];
  const inside = (rect) => rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  const lane = droppableContainers.find(({ id, data }) => data.current?.type === 'lane' && inside(droppableRects.get(id)));
  if (!lane) return [];
  let target;
  let firstIndex = Infinity;
  for (const candidate of droppableContainers) {
    const card = candidate.data.current;
    const rect = droppableRects.get(candidate.id);
    if (card?.type !== 'card' || card.columnId !== lane.data.current.columnId || card.cardId === active.id || !rect) continue;
    if (point.y < (rect.top + rect.bottom) / 2 && card.index < firstIndex) {
      target = candidate;
      firstIndex = card.index;
    }
  }
  return [{ id: (target || lane).id }];
}

function TaskCard({ card, column, index, busy, onOpen, dropId }) {
  const priority = priorityName(card.priority);
  const data = { columnId: column.id, columnName: column.name, index, title: card.title };
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, transform } = useDraggable({ id: card.id, data, disabled: busy });
  const slotId = `slot:${card.id}`;
  const drop = useDroppable({ id: slotId, data: { ...data, type: 'card', cardId: card.id } });
  return <li className="task-list__item" ref={drop.setNodeRef} data-drop={dropId === slotId ? 'before' : undefined} data-dragging={isDragging || undefined}>
    <article className="task-card" ref={setNodeRef} style={isDragging && transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}>
      <h3 className="task-card__title"><button type="button" className="task-card__edit" aria-label={`Edit card ${card.title}`} disabled={busy} onClick={() => onOpen()}>{card.title}</button></h3>
      <button type="button" id={`move-card-${card.id}`} className="task-card__grip" ref={setActivatorNodeRef} {...listeners}
        aria-label={`Move card ${card.title}`} aria-describedby={attributes['aria-describedby']} aria-haspopup="dialog"
        title="Drag to move, or open move controls" disabled={busy} onClick={() => onOpen(true)}><GripIcon /></button>
      {card.description && <p className="task-card__desc">{card.description}</p>}
      <p className="task-card__meta">
        <span className={`task-card__priority task-card__priority--${priority.toLowerCase()}`}>{PRIORITY_LABELS[priority]}</span>
        {card.dueDate && <time dateTime={card.dueDate}>Due {dueDateLabel(card.dueDate)}</time>}
      </p>
    </article>
  </li>;
}

function BoardColumn({ column, index, busy, onAdd, onEdit, dropId }) {
  const cards = Array.isArray(column.cards) ? column.cards : [];
  const headingId = `column-title-${column.id}`;
  const laneId = `lane:${column.id}`;
  const drop = useDroppable({ id: laneId, data: { type: 'lane', columnId: column.id, columnName: column.name, index: cards.length } });
  return <section ref={drop.setNodeRef} className={`board-column board-column--${statusTone(column.name, index)}`} aria-labelledby={headingId} data-drop={dropId === laneId ? 'end' : undefined}>
    <header className="board-column__head">
      <h2 id={headingId}>
        <span className="board-column__dot" aria-hidden="true" />
        <span className="board-column__name">{column.name}</span>
      </h2>
      <span className="board-column__count" aria-label={`${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`}>{cards.length}</span>
      <button type="button" className="board-column__add" aria-label={`Add card to ${column.name}`} title={`Add card to ${column.name}`} disabled={busy} onClick={onAdd}><PlusIcon /></button>
    </header>
    {cards.length
      ? <ol className="task-list" role="list">{cards.map((card, cardIndex) => <TaskCard key={card.id} card={card} column={column} index={cardIndex} busy={busy}
        dropId={dropId} onOpen={(moveFirst) => onEdit(card, cardIndex, moveFirst)} />)}</ol>
      : <p className="board-column__empty">{dropId === laneId ? 'Drop card here' : 'No cards yet'}</p>}
  </section>;
}

const dragAccessibility = {
  restoreFocus: false,
  screenReaderInstructions: { draggable: 'Drag a card by its handle. To move without dragging, activate the handle to open the Move card controls.' },
  announcements: {
    onDragStart: ({ active }) => `Picked up ${active.data.current.title}.`,
    onDragOver: ({ active, over }) => over ? `${over.data.current.columnName}, position ${dropPosition(active.data.current, over.data.current) + 1}.` : 'Not over a column.',
    onDragEnd: () => '', // Only confirm a move after the server has saved it.
    onDragCancel: () => 'Card move cancelled.',
  },
};

function BoardColumns({ columns, busy, onAdd, onEdit, onDrop }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [drag, setDrag] = useState(null);
  const [target, setTarget] = useState(null);

  const dropId = drag && target && (drag.columnId !== target.columnId || drag.index !== dropPosition(drag, target)) ? target.id : null;

  return <DndContext sensors={sensors} collisionDetection={boardCollision} accessibility={dragAccessibility}
    onDragStart={({ active }) => setDrag({ id: active.id, ...active.data.current })}
    onDragOver={({ over }) => setTarget(over && { id: over.id, ...over.data.current })}
    onDragCancel={() => { setDrag(null); setTarget(null); }}
    onDragEnd={({ active, over }) => {
      setDrag(null);
      setTarget(null);
      if (!over || busy) return;
      const source = active.data.current;
      const target = over.data.current;
      const position = dropPosition(source, target);
      if (target.columnId !== source.columnId || position !== source.index) onDrop(active.id, source.title, target.columnId, target.columnName, position);
    }}>
    <div className="board-columns" data-drag-active={Boolean(drag)}>
      {columns.map((column, index) => <BoardColumn key={column.id} column={column} index={index} busy={busy}
        dropId={dropId}
        onAdd={() => onAdd(column)} onEdit={(card, cardIndex, moveFirst) => onEdit(column, card, cardIndex, moveFirst)} />)}
    </div>
  </DndContext>;
}

function CardEditor({ card, column, columns, index, moveFirst, onSave, onCancel, onMove, onDelete, onBusy }) {
  const edit = useOperation();
  const move = useOperation();
  const remove = useOperation();
  const [target, setTarget] = useState(column.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cancelDelete = useRef(null);
  const deleteButton = useRef(null);
  const wasConfirming = useRef(false);
  const priorityId = useId();
  const moveId = useId();
  const pending = edit.pending || move.pending || remove.pending;
  const headingId = 'card-dialog-title';
  const cardsInColumn = Array.isArray(column.cards) ? column.cards : [];
  const moveColumns = Array.isArray(columns) ? columns : [column];

  useEffect(() => { onBusy?.(pending); return () => { onBusy?.(false); }; }, [pending, onBusy]);
  useEffect(() => {
    if (confirmingDelete) cancelDelete.current?.focus();
    else if (wasConfirming.current) deleteButton.current?.focus();
    wasConfirming.current = confirmingDelete;
  }, [confirmingDelete]);

  function submitEdit(event) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const body = {
      title: String(form.get('title')).trim(),
      description: String(form.get('description')).trim() || null,
      priority: String(form.get('priority')),
      dueDate: String(form.get('dueDate')) || null,
    };
    void edit.run(() => onSave(body));
  }

  function submitMove(event) {
    event.preventDefault();
    if (pending || target === column.id) return;
    const destination = moveColumns.find((candidate) => candidate.id === target);
    void move.run(() => onMove(target, Array.isArray(destination?.cards) ? destination.cards.length : 0));
  }

  function moveTo(columnId, newPosition) {
    if (pending) return;
    void move.run(() => onMove(columnId, newPosition));
  }

  if (confirmingDelete) {
    return <>
      <h2 id={headingId} className="modal-title">Delete card?</h2>
      <p className="modal-copy">Delete “{card.title}”? This cannot be undone.</p>
      <ErrorMessage error={remove.error} />
      <div className="modal-actions">
        <button ref={cancelDelete} type="button" disabled={remove.pending} onClick={() => setConfirmingDelete(false)}>Cancel deletion</button>
        <button type="button" className="danger" disabled={remove.pending} onClick={() => { void remove.run(() => onDelete()); }}>{remove.pending ? 'Deleting…' : 'Confirm delete'}</button>
      </div>
    </>;
  }

  return <>
    <h2 id={headingId} className="modal-title">{card ? 'Edit card' : `Add card to ${column.name}`}</h2>
    <form className="editor" method="post" aria-label={card ? `Edit card ${card.title}` : `Add card to ${column.name}`} onSubmit={submitEdit}>
      <Field label="Title (required)" name="title" required maxLength={200} pattern=".*\S.*" defaultValue={card?.title || ''} disabled={pending} error={edit.error?.fieldErrors?.title} />
      <Field label="Description (optional, up to 5,000 characters)" name="description" multiline maxLength={5000} defaultValue={card?.description || ''} disabled={pending} error={edit.error?.fieldErrors?.description} />
      <div className="field-row">
        <div className="field"><label htmlFor={priorityId}>Priority</label><select id={priorityId} name="priority" defaultValue={priorityName(card?.priority)} disabled={pending}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div>
        <Field label="Due date (optional)" name="dueDate" type="date" defaultValue={card?.dueDate || ''} disabled={pending} error={edit.error?.fieldErrors?.dueDate} />
      </div>
      <ErrorMessage error={edit.error} />
      <div className="actions">
        <button className="primary" type="submit" disabled={pending}>{edit.pending ? 'Saving…' : card ? 'Save card' : 'Create card'}</button>
        <button type="button" disabled={pending} onClick={onCancel}>Cancel</button>
        {card && <button ref={deleteButton} type="button" className="link-danger" aria-label={`Delete card ${card.title}`} disabled={pending} onClick={() => setConfirmingDelete(true)}>Delete card</button>}
      </div>
    </form>
    {card && <section className="card-move" aria-labelledby="card-move-title">
      <h3 id="card-move-title">Move card</h3>
      <form className="card-move__form" aria-label={`Move ${card.title}`} onSubmit={submitMove}>
        <div className="field">
          <label htmlFor={moveId}>Move to column</label>
          <select id={moveId} data-autofocus={moveFirst || undefined} value={target} disabled={pending} onChange={(event) => setTarget(event.target.value)}>
            {moveColumns.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
        </div>
        <button type="submit" disabled={pending || target === column.id} aria-label={`Move ${card.title} to selected column`}>Move</button>
      </form>
      <div className="card-move__order">
        <span>Order</span>
        <button type="button" disabled={pending || index === 0} aria-label={`Move ${card.title} up`} title={`Move ${card.title} up`} onClick={() => moveTo(column.id, index - 1)}><ArrowUpIcon /></button>
        <button type="button" disabled={pending || index === cardsInColumn.length - 1} aria-label={`Move ${card.title} down`} title={`Move ${card.title} down`} onClick={() => moveTo(column.id, index + 1)}><ArrowDownIcon /></button>
      </div>
      <ErrorMessage error={move.error} />
    </section>}
  </>;
}

export function Board() {
  const { boardId } = useParams();
  const resource = useResource(`/api/boards/${encodeURIComponent(boardId)}`);
  const [cardEditing, setCardEditing] = useState(null);
  const [editingBoard, setEditingBoard] = useState(false);
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [status, setStatus] = useState('');
  const boardDelete = useOperation();
  const dragMove = useOperation();
  const [movedHandle, setMovedHandle] = useState(null);
  const navigate = useNavigate();
  const board = resource.data?.board;
  const columns = Array.isArray(resource.data?.columns) ? resource.data.columns : [];
  const busy = formBusy || boardDelete.pending || dragMove.pending || resource.loading;

  useEffect(() => {
    if (!movedHandle || busy) return;
    // A cross-column move remounts the handle. Respect focus if the user moved it while saving.
    if (document.activeElement === document.body) document.getElementById(movedHandle)?.focus();
    setMovedHandle(null);
  }, [busy, movedHandle]);

  function saveDrop(cardId, title, targetColumnId, columnName, newPosition) {
    const handleId = `move-card-${cardId}`;
    const restoreHandle = document.activeElement?.id === handleId;
    void dragMove.run(async () => {
      setStatus('Moving card…');
      try {
        // The move endpoint returns the canonical board, so don't optimistically
        // reorder or issue another GET that can fail after a successful drop.
        const detail = await resource.api(`/api/cards/${encodeURIComponent(cardId)}/move`, { method: 'POST', body: { targetColumnId, newPosition } });
        resource.setData(detail);
        if (restoreHandle) setMovedHandle(handleId);
        setStatus(`Moved “${title}” to ${columnName}, position ${newPosition + 1}.`);
      } catch (error) {
        setStatus('');
        throw new Error(`Couldn’t move the card. ${error.message}`);
      }
    });
  }

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(''), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  async function mutate(path, options, message) {
    setStatus('');
    await resource.api(path, options);
    setCardEditing(null);
    setFormBusy(false);
    try { await resource.load(); setStatus(message); }
    catch { setStatus(RELOAD_WARNING); }
  }

  const actions = board ? <>
    <button type="button" className="board-iconbtn" aria-label="Edit board" title="Edit board" disabled={busy} onClick={() => setEditingBoard(true)}><PencilIcon /></button>
    <button type="button" className="board-iconbtn board-iconbtn--danger" aria-label="Delete board" title="Delete board" disabled={busy} onClick={() => setDeletingBoard(true)}><TrashIcon /></button>
  </> : null;

  return <Page title={board?.name || 'Board'} className="board-main" back={{ to: '/dashboard', label: 'All boards' }} actions={actions}>
    {board?.description && <p className="board-description preserve-text">{board.description}</p>}
    <ErrorMessage error={dragMove.error} />
    <ResourceState resource={resource} loading={<BoardSkeleton />}>
      {board && (columns.length
        ? <BoardColumns columns={columns} busy={busy} onDrop={saveDrop}
          onAdd={(column) => setCardEditing({ column })}
          onEdit={(column, card, index, moveFirst) => setCardEditing({ column, card, index, moveFirst })} />
        : <p className="board-empty">This board has no columns.</p>)}
    </ResourceState>
    <p className={`board-toast${status ? ' is-visible' : ''}`} role="status" aria-label="Board activity" aria-live="polite" aria-atomic="true">{status}</p>
    {editingBoard && board && <Modal labelledBy="board-edit-title" panelClassName="board-modal" onClose={() => { if (!formBusy) setEditingBoard(false); }}>
      <BoardForm headingId="board-edit-title" board={board} onBusy={setFormBusy} onCancel={() => setEditingBoard(false)} onSave={async (body) => {
        await resource.api(`/api/boards/${board.id}`, { method: 'PUT', body });
        setEditingBoard(false);
        try { await resource.load(); setStatus('Board updated.'); }
        catch { setStatus(RELOAD_WARNING); }
      }} />
    </Modal>}
    {deletingBoard && board && <Modal labelledBy="board-delete-title" panelClassName="board-modal" onClose={() => { if (!boardDelete.pending) setDeletingBoard(false); }}>
      <h2 id="board-delete-title" className="modal-title">Delete board?</h2>
      <p className="modal-copy">Delete “{board.name}”? All columns and cards in this board will also be deleted. This cannot be undone.</p>
      <ErrorMessage error={boardDelete.error} />
      <div className="modal-actions">
        <button type="button" disabled={boardDelete.pending} onClick={() => setDeletingBoard(false)}>Cancel deletion</button>
        <button type="button" className="danger" disabled={boardDelete.pending} onClick={() => { void boardDelete.run(async () => {
          await resource.api(`/api/boards/${board.id}`, { method: 'DELETE' });
          navigate('/dashboard');
        }); }}>{boardDelete.pending ? 'Deleting…' : 'Confirm delete'}</button>
      </div>
    </Modal>}
    {cardEditing && <Modal labelledBy="card-dialog-title" panelClassName="board-modal card-modal" onClose={() => { if (!formBusy) setCardEditing(null); }}>
      <CardEditor
        key={cardEditing.card?.id || cardEditing.column.id}
        card={cardEditing.card}
        column={cardEditing.column}
        columns={columns}
        index={cardEditing.index}
        moveFirst={cardEditing.moveFirst}
        onBusy={setFormBusy}
        onCancel={() => setCardEditing(null)}
        onSave={(body) => mutate(
          cardEditing.card ? `/api/cards/${cardEditing.card.id}` : `/api/columns/${cardEditing.column.id}/cards`,
          { method: cardEditing.card ? 'PUT' : 'POST', body },
          cardEditing.card ? 'Card updated.' : 'Card created.',
        )}
        onMove={(targetColumnId, newPosition) => mutate(
          `/api/cards/${cardEditing.card.id}/move`,
          { method: 'POST', body: { targetColumnId, newPosition } },
          'Card moved.',
        )}
        onDelete={() => mutate(`/api/cards/${cardEditing.card.id}`, { method: 'DELETE' }, 'Card deleted.')}
      />
    </Modal>}
  </Page>;
}
