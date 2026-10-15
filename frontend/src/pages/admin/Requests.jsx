import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { Alert, PayBadge, Spinner, StatusBadge, errorText } from "../../components";
import { formatDate, formatShort, money, useI18n } from "../../i18n";

const STATUSES = ["new", "in_progress", "waiting_customer", "done", "delivered", "rejected"];
const EMPTY = { q: "", service: "", status: "", payment: "", date_from: "", date_to: "" };
const PAGE_SIZE = 20;
const BOARD_LIMIT = 50; // cards loaded per column
const VIEW_KEY = "ssn_requests_view";

const newestFirst = (a, b) => b.created_at.localeCompare(a.created_at);

export default function Requests() {
  const { t, pick } = useI18n();
  const [view, setView] = useState(() => (localStorage.getItem(VIEW_KEY) === "list" ? "list" : "board"));
  const [filters, setFilters] = useState(EMPTY);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [services, setServices] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => localStorage.setItem(VIEW_KEY, view), [view]);

  useEffect(() => {
    api.adminServices().then(setServices).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(id);
  }, [filters.q]);

  const params = { ...filters, q: debouncedQ };
  // On the board every column is a status, so the status filter does not apply.
  const viewParams = view === "board" ? { ...params, status: "" } : params;
  const onError = (e) => setError(errorText(e, t));
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{t("req.title")}</h1>
        <div className="row">
          <div className="seg" role="group" aria-label={t("req.view")}>
            <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>
              ▦ {t("req.board")}
            </button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
              ☰ {t("req.list")}
            </button>
          </div>
          <button type="button" className="btn sm" onClick={() => api.exportCsv(viewParams).catch(onError)}>
            ⬇ {t("req.export")}
          </button>
        </div>
      </div>

      <section className="clay sm filters" aria-label={t("req.filters")}>
        <div className="filter-grid">
          <div className="field search-field">
            <label htmlFor="rq">{t("common.search")}</label>
            <input id="rq" type="search" value={filters.q} onChange={set("q")} placeholder={t("req.search")} />
          </div>
          <div className="field">
            <label htmlFor="rs">{t("req.service")}</label>
            <select id="rs" value={filters.service} onChange={set("service")}>
              <option value="">{t("common.all")}</option>
              {services.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {pick(s, "name")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rp">{t("req.payment")}</label>
            <select id="rp" value={filters.payment} onChange={set("payment")}>
              <option value="">{t("common.all")}</option>
              {["none", "pending", "paid"].map((s) => (
                <option key={s} value={s}>
                  {t(`pay.status.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rf">{t("req.from")}</label>
            <input id="rf" type="date" value={filters.date_from} onChange={set("date_from")} />
          </div>
          <div className="field">
            <label htmlFor="rt">{t("req.to")}</label>
            <input id="rt" type="date" value={filters.date_to} onChange={set("date_to")} />
          </div>
          {view === "list" && (
            <div className="field">
              <label htmlFor="rst">{t("req.status")}</label>
              <select id="rst" value={filters.status} onChange={set("status")}>
                <option value="">{t("common.all")}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field filter-actions">
            <button type="button" className="btn sm" onClick={() => setFilters(EMPTY)}>
              {t("common.reset")}
            </button>
          </div>
        </div>
      </section>

      <Alert>{error}</Alert>

      {view === "board" ? (
        <Board params={viewParams} onError={onError} clearError={() => setError("")} />
      ) : (
        <ListView params={viewParams} onError={onError} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Board: one column per status. Drag cards, or use the ⋯ menu.        */
/* ------------------------------------------------------------------ */

function Board({ params, onError, clearError }) {
  const { t } = useI18n();
  const [cols, setCols] = useState(null); // { status: { items, total } }
  const [drag, setDrag] = useState(null); // { id, from }
  const [over, setOver] = useState(null);
  const [notice, setNotice] = useState("");
  const key = JSON.stringify(params);

  useEffect(() => {
    let stale = false;
    Promise.all(STATUSES.map((s) => api.requests({ ...params, status: s, page_size: BOARD_LIMIT })))
      .then((res) => {
        if (stale) return;
        setCols(Object.fromEntries(STATUSES.map((s, i) => [s, { items: res[i].items, total: res[i].total }])));
      })
      .catch((e) => !stale && onError(e));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Close open card menus on outside click, scroll or Escape.
  useEffect(() => {
    const closeAll = (except) =>
      document.querySelectorAll("details.card-menu[open]").forEach((d) => d !== except && d.removeAttribute("open"));
    const onClick = (e) => closeAll(e.target.closest?.("details.card-menu"));
    const onScroll = (e) => {
      if (!e.target.closest?.(".card-menu-list")) closeAll(null);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const open = document.querySelector("details.card-menu[open]");
      if (open) {
        open.removeAttribute("open");
        open.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(id);
  }, [notice]);

  const shift = (c, card, from, to) => ({
    ...c,
    [from]: { items: c[from].items.filter((x) => x.id !== card.id), total: c[from].total - 1 },
    [to]: { items: [{ ...card, status: to }, ...c[to].items].sort(newestFirst), total: c[to].total + 1 },
  });

  const move = async (id, from, to) => {
    if (!cols || from === to) return;
    const card = cols[from].items.find((x) => x.id === id);
    if (!card) return;
    clearError();
    setCols((c) => shift(c, card, from, to)); // show the move straight away
    try {
      await api.patchRequest(id, { status: to });
      setNotice(t("req.moved", { id: card.tracking_id, status: t(`status.${to}`) }));
    } catch (e) {
      setCols((c) => shift(c, card, to, from)); // put it back
      onError(e);
    }
  };

  if (!cols) return <Spinner />;

  return (
    <>
      <div className="board-bar">
        <p className="muted small" style={{ margin: 0 }}>
          {t("req.hint")}
        </p>
        <p className="board-notice" role="status" aria-live="polite">
          {notice}
        </p>
      </div>

      <div className="board">
        {STATUSES.map((s) => {
          const col = cols[s];
          return (
            <section
              key={s}
              className={`board-col ${over === s ? "drop" : ""}`}
              aria-labelledby={`col-${s}`}
              onDragOver={(e) => {
                if (!drag || drag.from === s) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== s) setOver(s);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o === s ? null : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (drag) move(drag.id, drag.from, s);
                setDrag(null);
              }}
            >
              <header className="board-col-head">
                <span className={`dot ${s}`} aria-hidden="true" />
                <h2 id={`col-${s}`}>{t(`status.${s}`)}</h2>
                <span className="count">{col.total}</span>
              </header>
              <div className="board-col-body">
                {col.items.length === 0 && <p className="board-empty">{t("req.empty_col")}</p>}
                {col.items.map((r) => (
                  <TicketCard
                    key={r.id}
                    r={r}
                    status={s}
                    dragging={drag?.id === r.id}
                    onDragStart={() => setDrag({ id: r.id, from: s })}
                    onDragEnd={() => {
                      setDrag(null);
                      setOver(null);
                    }}
                    onMove={(to) => move(r.id, s, to)}
                  />
                ))}
                {col.total > col.items.length && (
                  <p className="board-more">{t("req.more", { n: col.total - col.items.length })}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function TicketCard({ r, status, dragging, onDragStart, onDragEnd, onMove }) {
  const { t, pick, lang } = useI18n();
  const navigate = useNavigate();
  const open = () => navigate(`/admin/requests/${r.id}`);

  return (
    <article
      className={`ticket ${dragging ? "dragging" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", r.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if (!e.target.closest("a, button, summary, details")) open();
      }}
    >
      <div className="ticket-top">
        <span className={`svc-tag svc-${r.service.slug}`}>
          <span aria-hidden="true">{r.service.icon}</span> {pick(r.service, "name")}
        </span>
        <CardMenu current={status} onMove={onMove} />
      </div>
      <Link to={`/admin/requests/${r.id}`} className="ticket-id">
        {r.tracking_id}
      </Link>
      <div className="ticket-name">
        {r.name} <span className="muted">· {r.phone}</span>
      </div>
      {r.summary && <div className="ticket-summary">{r.summary}</div>}
      <div className="ticket-foot">
        <time dateTime={r.created_at}>{formatShort(r.created_at, lang)}</time>
        {r.payment_status !== "none" ? (
          <span className={`badge pay-${r.payment_status}`} title={t(`pay.status.${r.payment_status}`)}>
            {money(r.fee)}
            <span className="sr-only"> · {t(`pay.status.${r.payment_status}`)}</span>
          </span>
        ) : (
          r.fee != null && <span>{money(r.fee)}</span>
        )}
      </div>
    </article>
  );
}

/** "⋯" menu to move a card without dragging (keyboard and phone friendly). */
function CardMenu({ current, onMove }) {
  const { t } = useI18n();
  const ref = useRef(null);

  // Fixed position so the menu is never cut off by the scrolling board.
  const place = () => {
    const d = ref.current;
    if (!d?.open) return;
    const btn = d.querySelector("summary").getBoundingClientRect();
    const list = d.querySelector(".card-menu-list");
    const h = list.offsetHeight;
    const w = list.offsetWidth;
    const top = btn.bottom + 4 + h > window.innerHeight ? Math.max(8, btn.top - 4 - h) : btn.bottom + 4;
    list.style.top = `${top}px`;
    list.style.left = `${Math.max(8, Math.min(btn.right - w, window.innerWidth - w - 8))}px`;
  };

  return (
    <details ref={ref} className="card-menu" onToggle={place}>
      <summary aria-label={t("req.move_to")} title={t("req.move_to")}>
        ⋯
      </summary>
      <div className="card-menu-list">
        <div className="card-menu-title">{t("req.move_to")}</div>
        {STATUSES.filter((s) => s !== current).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              ref.current?.removeAttribute("open");
              onMove(s);
            }}
          >
            <span className={`dot ${s}`} aria-hidden="true" /> {t(`status.${s}`)}
          </button>
        ))}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* List view: compact table with paging.                               */
/* ------------------------------------------------------------------ */

function ListView({ params, onError }) {
  const { t, pick, lang } = useI18n();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const key = JSON.stringify(params);

  useEffect(() => setPage(1), [key]);

  useEffect(() => {
    let stale = false;
    api
      .requests({ ...params, page, page_size: PAGE_SIZE })
      .then((r) => !stale && setData(r))
      .catch((e) => !stale && onError(e));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);

  if (!data) return <Spinner />;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <section className="clay sm" aria-live="polite">
      <p className="muted small">{t("req.found", { n: data.total })}</p>
      {data.items.length === 0 ? (
        <p>{t("req.empty")}</p>
      ) : (
        <div className="table-wrap">
          <table className="clay-table compact">
            <thead>
              <tr>
                <th>{t("req.col.id")}</th>
                <th>{t("req.col.date")}</th>
                <th>{t("req.col.service")}</th>
                <th>{t("req.col.customer")}</th>
                <th>{t("req.col.details")}</th>
                <th>{t("req.col.status")}</th>
                <th>{t("req.col.payment")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr
                  key={r.id}
                  className="clickable"
                  onClick={(e) => {
                    if (!e.target.closest("a")) navigate(`/admin/requests/${r.id}`);
                  }}
                >
                  <td>
                    <Link className="row-link mono" to={`/admin/requests/${r.id}`}>
                      {r.tracking_id}
                    </Link>
                  </td>
                  <td className="nowrap">{formatDate(r.created_at, lang)}</td>
                  <td className="nowrap">
                    {r.service.icon} {pick(r.service, "name")}
                  </td>
                  <td className="nowrap">
                    {r.name}
                    <div className="muted small">{r.phone}</div>
                  </td>
                  <td className="muted small" style={{ maxWidth: 240 }}>
                    {r.summary}
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>
                    <PayBadge status={r.payment_status} />
                    {r.fee != null && <div className="small">{money(r.fee)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="pagination" aria-label="Pagination">
          <button type="button" className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← {t("req.prev")}
          </button>
          <span className="small">{t("req.page", { p: page, n: pages })}</span>
          <button type="button" className="btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            {t("req.next")} →
          </button>
        </nav>
      )}
    </section>
  );
}
