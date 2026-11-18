import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './landing.css';

const FONTS = 'https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400..700&family=IBM+Plex+Mono:wght@400;500&display=swap';

const KIT_CSS = [
  '/assets/system.css',
  '/assets/ui/cards.css',
  '/assets/motion/motion.css',
  '/assets/layout/layout.css',
  '/landing-tokens.css',
];

const KIT_JS = [
  '/assets/system.js',
  '/assets/motion/motion.js',
];

const COLUMNS = [
  {
    name: 'To Do',
    tone: 'todo',
    count: 3,
    cards: [
      { title: 'Rewrite the pricing page', desc: 'Plain plans, one comparison table.', priority: 'High', due: '21 Nov' },
      { title: 'Collect customer notes', desc: 'Ask five people what they use it for.', priority: 'Medium', due: '24 Nov' },
      { title: 'Set up analytics', desc: 'Page views and sign-ups.', priority: 'Low', due: null },
    ],
  },
  {
    name: 'In Progress',
    tone: 'doing',
    count: 3,
    cards: [
      { title: 'Draft the launch email', desc: 'First note to the list on Thursday.', priority: 'High', due: '19 Nov' },
      { title: 'Fix the mobile nav', desc: 'The menu overlaps the hero on a phone.', priority: 'Medium', due: null },
      { title: 'Test the sign-up form', desc: 'Email, password and recovery.', priority: 'Medium', due: '22 Nov' },
    ],
  },
  {
    name: 'Done',
    tone: 'done',
    count: 3,
    cards: [
      { title: 'Pick a typeface', desc: 'Familjen Grotesk for headings.', priority: 'Low', due: null },
      { title: 'Write the homepage copy', desc: 'One claim, one line, one action.', priority: 'Low', due: null },
      { title: 'Set the color tokens', desc: 'One blue, one neutral ramp.', priority: 'Low', due: null },
    ],
  },
];

function Mark() {
  return <span className="mark" data-mark="stack" aria-hidden="true" />;
}

function Arrow() {
  return (
    <svg className="m-arrow" viewBox="0 0 12 12" aria-hidden="true">
      <path className="m-arrow__stem" d="M1 6h8" />
      <path className="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5" />
    </svg>
  );
}

function BoardColumns({ compact = false }) {
  return (
    <div className={`kb-cols${compact ? ' kb-cols--compact' : ''}`}>
      {COLUMNS.map((column) => (
        <div className={`kb-col kb-col--${column.tone}`} key={column.name}>
          <div className="kb-col__head">
            <span className="kb-col__dot" aria-hidden="true" />
            <span className="kb-col__name">{column.name}</span>
            <span className="kb-col__count">{column.count}</span>
          </div>
          <div className="kb-col__cards">
            {column.cards.map((card) => (
              <div className="kb-card" key={card.title}>
                <span className={`kb-card__p kb-card__p--${card.priority.toLowerCase()}`}>{card.priority}</span>
                <span className="kb-card__title">{card.title}</span>
                {!compact && <span className="kb-card__desc">{card.desc}</span>}
                {!compact && (
                  <span className="kb-card__foot">
                    {card.due ? `Due ${card.due}` : 'No due date'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HeroBoard() {
  return (
    <div className="ui kb-hero ly-piece" aria-hidden="true">
      <div className="kb-hero__bar">
        <span className="kb-mark"><i /><i /><i /></span>
        <span className="kb-hero__name">Kanban</span>
        <span className="kb-hero__crumb">Website refresh</span>
        <span className="kb-hero__spacer" />
        <span className="kb-hero__avatar">K</span>
      </div>
      <div className="kb-hero__body">
        <BoardColumns compact />
      </div>
    </div>
  );
}

function AppBoard() {
  return (
    <div className="ui kb-window" role="img" aria-label="The Kanban app showing a list of boards and the Website refresh board with To Do, In Progress and Done columns.">
      <div className="kb-chrome">
        <span className="kb-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="kb-brand"><span className="kb-mark"><i /><i /><i /></span>Kanban</span>
        <span className="kb-crumb">My boards <span className="kb-crumb__slash">/</span> Website refresh</span>
        <span className="kb-chrome__spacer" />
        <span className="kb-account">K</span>
      </div>
      <div className="kb-body">
        <aside className="kb-side">
          <div className="kb-side__head">
            <span className="kb-side__title">My boards</span>
            <span className="kb-side__new">New board</span>
          </div>
          <div className="kb-side__list">
            {[
              ['Website refresh', '9 cards', true],
              ['Q1 planning', '4 cards', false],
              ['Reading list', '6 cards', false],
              ['Home admin', '3 cards', false],
            ].map(([name, count, active]) => (
              <div className={`kb-side__row${active ? ' is-on' : ''}`} key={name}>
                <span className="kb-side__dot" aria-hidden="true" />
                <span className="kb-side__name">{name}</span>
                <span className="kb-side__count">{count}</span>
              </div>
            ))}
          </div>
          <div className="kb-side__foot">
            <span className="kb-side__mark">K</span>
            <span className="kb-side__who"><b>Your account</b><small>Only your boards</small></span>
          </div>
        </aside>
        <div className="kb-main">
          <div className="kb-main__head">
            <div>
              <span className="kb-main__title">Website refresh</span>
              <span className="kb-main__desc">Ship the new marketing site by the end of the month.</span>
            </div>
            <span className="kb-main__new">New card</span>
          </div>
          <BoardColumns />
        </div>
      </div>
    </div>
  );
}

function StepPanel({ type }) {
  if (type === 'board') {
    return (
      <div className="ui sui" aria-hidden="true">
        <span className="sui__label">Board name</span>
        <span className="sui__input">Website refresh</span>
        <span className="sui__label">Description</span>
        <span className="sui__input sui__input--area">Ship the new marketing site by the end of the month.</span>
        <span className="sui__btn">Create board</span>
      </div>
    );
  }
  if (type === 'card') {
    return (
      <div className="ui sui" aria-hidden="true">
        <div className="sui__row">
          <span className="sui__label">Title</span>
          <span className="sui__field">Draft the launch email</span>
        </div>
        <div className="sui__row">
          <span className="sui__label">Description</span>
          <span className="sui__field sui__field--area">First note to the list on Thursday.</span>
        </div>
        <div className="sui__two">
          <div><span className="sui__label">Priority</span><span className="sui__field">High</span></div>
          <div><span className="sui__label">Due date</span><span className="sui__field">19 Nov</span></div>
        </div>
        <span className="sui__btn">Save card</span>
      </div>
    );
  }
  return (
    <div className="ui sui" aria-hidden="true">
      <div className="sui__mini">
        <span className="sui__mini-dot" />
        <span className="sui__mini-title">Draft the launch email</span>
        <span className="sui__mini-meta">In Progress</span>
      </div>
      <span className="sui__label">Move to column</span>
      <span className="sui__select">Done <span className="sui__chev">⌄</span></span>
      <div className="sui__actions">
        <span className="sui__btn sui__btn--sm">Move</span>
        <span className="sui__btn sui__btn--ghost">Move up</span>
        <span className="sui__btn sui__btn--ghost">Move down</span>
      </div>
    </div>
  );
}

export function Landing() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const nodes = [];
    const previous = {
      type: html.dataset.type,
      radius: html.dataset.radius,
      buttons: html.dataset.buttons,
      motion: html.dataset.motion,
      className: html.className,
    };

    html.dataset.type = 'software';
    html.dataset.radius = 'soft';
    html.dataset.buttons = 'solid';
    html.dataset.motion = '';
    html.classList.add('m-enter');
    html.classList.remove('m-enter-done');
    body.classList.add('landing-body');

    const addLink = (rel, href) => {
      const existing = [...document.querySelectorAll('link[data-landing-kit]')].find((link) => link.getAttribute('href') === href && link.rel === rel);
      if (existing) { nodes.push(existing); return; }
      const link = document.createElement('link');
      link.rel = rel;
      link.href = href;
      if (rel === 'preconnect') link.crossOrigin = 'anonymous';
      link.dataset.landingKit = '1';
      document.head.appendChild(link);
      nodes.push(link);
    };

    addLink('preconnect', 'https://fonts.googleapis.com');
    addLink('preconnect', 'https://fonts.gstatic.com');
    addLink('stylesheet', FONTS);
    KIT_CSS.forEach((href) => addLink('stylesheet', href));

    KIT_JS.forEach((src) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = src;
      document.body.appendChild(script);
      nodes.push(script);
    });

    const timer = window.setTimeout(() => html.classList.add('m-enter-done'), 700);
    document.title = 'Kanban: a personal board for your tasks';

    const restore = () => {
      // StrictMode mounts, unmounts and mounts again in development. Only take the kit down when
      // the landing page is really gone, so the CSS never blinks off between those two mounts.
      if (document.querySelector('.landing-page')) return;
      nodes.forEach((node) => node.remove());
      body.classList.remove('landing-body');
      html.className = previous.className;
      if (previous.type === undefined) delete html.dataset.type; else html.dataset.type = previous.type;
      if (previous.radius === undefined) delete html.dataset.radius; else html.dataset.radius = previous.radius;
      if (previous.buttons === undefined) delete html.dataset.buttons; else html.dataset.buttons = previous.buttons;
      if (previous.motion === undefined) delete html.dataset.motion; else html.dataset.motion = previous.motion;
      html.classList.remove('m-enter', 'm-enter-done');
    };

    return () => {
      window.clearTimeout(timer);
      window.setTimeout(restore, 0);
    };
  }, []);

  return (
    <div className="landing-page">
      <header className="nav">
        <div className="wrap nav__bar">
          <a className="skip-link" href="#top">Skip to content</a>
          <Link className="nav__logo" to="/"><Mark />Kanban</Link>
          <nav className="nav__links" aria-label="Main">
            <div className="nav__item">
              <a className="nav__link" href="#board">
                Board
                <svg className="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
              <div className="nav__menu">
                <div className="wrap grid">
                  <div className="menu-col span-3">
                    <p className="t-label">The board</p>
                    <a href="#board">Three columns<span>To Do, In Progress, Done</span></a>
                    <a href="#steps">Cards with detail<span>Priority, due date and a note</span></a>
                    <a href="#steps">Moving work<span>Choose a column, no dragging</span></a>
                  </div>
                  <div className="menu-col span-3">
                    <p className="t-label">Your account</p>
                    <a href="#privacy">Personal boards<span>Each account sees its own</span></a>
                    <a href="#questions">Questions<span>The short answers</span></a>
                    <Link to="/login">Log in<span>Return to your boards</span></Link>
                  </div>
                  <a className="menu-card span-3 start-10" href="#board">
                    <div className="panel menu-board">
                      <div className="menu-board__cols" aria-hidden="true">
                        {COLUMNS.map((column) => (
                          <div className="menu-board__col" key={column.name}>
                            <span className={`menu-board__dot menu-board__dot--${column.tone}`} />
                            <span className="menu-board__line menu-board__line--name" />
                            <span className="menu-board__line" />
                            <span className="menu-board__line menu-board__line--short" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <span className="t-card">One board, three columns</span>
                    <span className="t-small muted">The whole week in one look.</span>
                  </a>
                </div>
              </div>
            </div>
            <div className="nav__item"><a className="nav__link" href="#steps">How it works</a></div>
            <div className="nav__item"><a className="nav__link" href="#privacy">Privacy</a></div>
            <div className="nav__item"><a className="nav__link" href="#questions">Questions</a></div>
          </nav>
          <div className="nav__actions">
            <Link className="nav__link" to="/login">Log in</Link>
            <Link className="btn btn--primary" to="/register">Create an account</Link>
          </div>
          <button className="nav__toggle" type="button" aria-expanded="false" aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero hero--centred" data-enter aria-labelledby="hero-h">
          <div className="wrap">
            <div className="hero-text">
              <div className="hero__c">
                <h1 id="hero-h">Personal Kanban for your tasks</h1>
                <p className="hero__lead">3 columns, cards with a priority and a due date, and one clear next step. Built for one person, not a team.</p>
                <div className="btn-row">
                  <Link className="btn btn--primary" to="/register">Create an account<Arrow /></Link>
                  <Link className="btn btn--secondary" to="/login">Log in</Link>
                </div>
              </div>
              <div className="hero__window ui" role="img" aria-label="The Kanban board with To Do, In Progress and Done columns.">
                <HeroBoard />
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="board" aria-labelledby="board-h">
          <div className="wrap">
            <div className="grid grid--top">
              <div className="span-5">
                <h2 id="board-h">The whole board, one screen.</h2>
              </div>
              <div className="span-6 start-7">
                <p className="t-lead">Every board has To Do, In Progress and Done. The count beside each column shows where the work sits, and every card keeps its priority and due date.</p>
                <p className="board-link"><a className="link" href="#steps">See how moving works</a></p>
              </div>
            </div>
            <div className="app-frame">
              <AppBoard />
            </div>
          </div>
        </section>

        <section className="section" id="steps" aria-labelledby="steps-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="steps-h">From empty board to done in 3 steps</h2>
              <p>No templates to learn. A board, its cards and one way to move them forward.</p>
            </div>
            <div className="grid steps">
              {[
                ['1', 'Board setup', 'Start with a project, a week or a move. One board is enough.', 'board'],
                ['2', 'Cards on the board', 'Each card takes a title, a note, a priority and a due date.', 'card'],
                ['3', 'Moving cards on the board', 'Send a card to the next column, or move it up and down. No dragging.', 'move'],
              ].map(([num, title, line, panel]) => (
                <article className="card card--row card--open span-4" key={title}>
                  <span className="step-num">{num}</span>
                  <h3>{title}</h3>
                  <p>{line}</p>
                  <div className="panel"><StepPanel type={panel} /></div>
                </article>
              ))}
            </div>
            <p className="steps__link"><a className="link" href="#board">See the board</a></p>
          </div>
        </section>

        <section className="section ground-inverse" id="privacy" data-moment="word-highlight" aria-labelledby="privacy-h">
          <div className="wrap">
            <div className="grid grid--top privacy">
              <div className="span-5">
                <h2 id="privacy-h" className="mo-wh__text">Only your account can open your boards. No one else sees them.</h2>
                <p className="t-lead">Every request carries the signed-in account, and the Java API checks the board&rsquo;s owner before it reads or writes. A board that is not yours returns the same 404 as one that does not exist.</p>
              </div>
              <div className="span-6 start-7">
                <div className="panel privacy-panel">
                  <div className="ui privacy-flow" role="img" aria-label="Your browser sends a signed-in request to the Java API, which checks the owner and returns only your boards.">
                    <div className="privacy-flow__row"><span className="privacy-flow__dot" aria-hidden="true" /><span className="privacy-flow__name">Your browser</span><span className="privacy-flow__meta">signed in</span></div>
                    <span className="privacy-flow__line" aria-hidden="true" />
                    <div className="privacy-flow__row"><span className="privacy-flow__dot" aria-hidden="true" /><span className="privacy-flow__name">Java API</span><span className="privacy-flow__meta">owner checked</span></div>
                    <span className="privacy-flow__line" aria-hidden="true" />
                    <div className="privacy-flow__row"><span className="privacy-flow__dot" aria-hidden="true" /><span className="privacy-flow__name">Your boards</span><span className="privacy-flow__meta">only yours</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="questions" aria-labelledby="questions-h">
          <div className="wrap">
            <div className="grid grid--top">
              <div className="span-5">
                <h2 id="questions-h">Questions</h2>
                <p className="t-lead">The short answers before you start.</p>
                <div className="ui faq-mini" role="img" aria-label="A small Kanban board with three columns.">
                  <div className="faq-mini__bar"><span className="kb-mark"><i /><i /><i /></span><span>Website refresh</span></div>
                  <div className="faq-mini__cols" aria-hidden="true">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
              <div className="span-6 start-7">
                <div className="faq">
                  <div className="faq__item">
                    <h3>Account for the board</h3>
                    <p>Yes. Sign up with an email and password. Your boards belong to that account.</p>
                  </div>
                  <div className="faq__item">
                    <h3>Sharing a board</h3>
                    <p>No. This is a personal board; each account sees only its own boards.</p>
                  </div>
                  <div className="faq__item">
                    <h3>The board on a phone</h3>
                    <p>Yes. The board adapts to a phone browser. There is no native app.</p>
                  </div>
                  <div className="faq__item">
                    <h3>Deleting a board</h3>
                    <p>The board, its columns and every card in it are deleted. The confirmation says so before you commit.</p>
                  </div>
                  <div className="faq__item">
                    <h3>Moving a board card</h3>
                    <p>Choose the column and press Move, or use Move up and Move down. No dragging.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer closing" id="contact" aria-labelledby="close-h">
        <div className="wrap">
          <div className="closing__cta close--word">
            <div className="section-head--split">
              <div>
                <h2 id="close-h">Start with one board.</h2>
                <p className="t-lead">Create an account, name a board and add the first card.</p>
              </div>
              <Link className="btn btn--primary" to="/register">Create an account<Arrow /></Link>
            </div>
            <p className="close__word" aria-hidden="true">Kanban</p>
          </div>
          <div className="closing__links">
            <div className="grid footer-grid">
              <div className="span-6 stack-4">
                <Link className="nav__logo" to="/"><Mark />Kanban</Link>
                <p className="footer__lede">A personal board for your tasks.</p>
              </div>
              <div className="span-3 footer__col">
                <h3>The board</h3>
                <ul>
                  <li><a href="#board">The board</a></li>
                  <li><a href="#steps">How it works</a></li>
                  <li><a href="#privacy">Privacy</a></li>
                  <li><a href="#questions">Questions</a></li>
                </ul>
              </div>
              <div className="span-3 footer__col">
                <h3>Account</h3>
                <ul>
                  <li><Link to="/register">Create an account</Link></li>
                  <li><Link to="/login">Log in</Link></li>
                </ul>
              </div>
            </div>
            <div className="footer__legal">
              <span>© 2026 Kanban</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
