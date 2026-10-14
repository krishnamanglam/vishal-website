import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Alert, PayBadge, Spinner, StatusBadge, errorText } from "../../components";
import { formatDate, money, useI18n } from "../../i18n";

const STATUSES = ["new", "in_progress", "waiting_customer", "done", "delivered", "rejected"];
const EMPTY = { q: "", service: "", status: "", payment: "", date_from: "", date_to: "" };
const PAGE_SIZE = 20;

export default function Requests() {
  const { t, pick, lang } = useI18n();
  const [filters, setFilters] = useState(EMPTY);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [services, setServices] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminServices().then(setServices).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(id);
  }, [filters.q]);

  const params = { ...filters, q: debouncedQ };

  useEffect(() => {
    let stale = false;
    setError("");
    api
      .requests({ ...params, page, page_size: PAGE_SIZE })
      .then((r) => !stale && setData(r))
      .catch((e) => !stale && setError(errorText(e, t)));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filters.service, filters.status, filters.payment, filters.date_from, filters.date_to, page]);

  const set = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value }));
    setPage(1);
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="stack-lg">
      <div className="row between">
        <h1>{t("req.title")}</h1>
        <button type="button" className="btn" onClick={() => api.exportCsv(params).catch((e) => setError(errorText(e, t)))}>
          ⬇ {t("req.export")}
        </button>
      </div>

      <section className="clay sm" aria-label={t("common.search")}>
        <div className="form-grid">
          <div className="field full">
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
          <div className="field" style={{ alignSelf: "end" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setFilters(EMPTY);
                setPage(1);
              }}
            >
              {t("common.reset")}
            </button>
          </div>
        </div>
      </section>

      <Alert>{error}</Alert>
      {!data && !error && <Spinner />}

      {data && (
        <section className="clay" aria-live="polite">
          <p className="muted">{t("req.found", { n: data.total })}</p>
          {data.items.length === 0 ? (
            <p>{t("req.empty")}</p>
          ) : (
            <div className="table-wrap">
              <table className="clay-table">
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
                    <tr key={r.id}>
                      <td>
                        <Link className="row-link mono" to={`/admin/requests/${r.id}`}>
                          {r.tracking_id}
                        </Link>
                      </td>
                      <td className="nowrap">{formatDate(r.created_at, lang)}</td>
                      <td style={{ minWidth: 190 }}>
                        {r.service.icon} {pick(r.service, "name")}
                      </td>
                      <td>
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
              <span>{t("req.page", { p: page, n: pages })}</span>
              <button type="button" className="btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                {t("req.next")} →
              </button>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}

