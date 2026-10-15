import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { COMPANY } from "./company";
import { ApiError } from "./api";
import { useI18n } from "./i18n";

/**
 * "← Back" button. Goes to the previous page in this site; if the page was opened
 * directly (link from WhatsApp, refresh, new tab) it goes to `fallback` instead,
 * so the button never takes people off the site.
 */
export function BackButton({ fallback = "/" }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const goBack = () => {
    const cameFromThisSite = (window.history.state?.idx ?? 0) > 0;
    if (cameFromThisSite) navigate(-1);
    else navigate(fallback);
  };
  return (
    <button type="button" className="btn sm back-btn" onClick={goBack}>
      <span aria-hidden="true">←</span> {t("common.back")}
    </button>
  );
}

/** Where "Back" goes when there is no previous page. */
function backFallback(pathname) {
  if (pathname.startsWith("/admin/requests/")) return "/admin/requests";
  if (pathname.startsWith("/admin")) return "/admin";
  return "/";
}

/** Shows the Back button on every page except the start pages. */
export function BackBar({ hideOn = [] }) {
  const { pathname } = useLocation();
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (hideOn.includes(clean)) return null;
  return (
    <div className="back-bar">
      <BackButton fallback={backFallback(clean)} />
    </div>
  );
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label="Language / भाषा">
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">
        English
      </button>
      <button type="button" aria-pressed={lang === "hi"} onClick={() => setLang("hi")} lang="hi">
        हिन्दी
      </button>
    </div>
  );
}

export function StatusBadge({ status }) {
  const { t } = useI18n();
  return <span className={`badge ${status}`}>{t(`status.${status}`)}</span>;
}

export function PayBadge({ status }) {
  const { t } = useI18n();
  return <span className={`badge pay-${status}`}>{t(`pay.status.${status}`)}</span>;
}

export const Spinner = () => <div className="spinner" role="status" aria-label="Loading" />;

export function Alert({ kind = "error", children }) {
  if (!children) return null;
  return (
    <div className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** Turns any thrown error into a friendly translated message. */
export function errorText(err, t) {
  if (err instanceof ApiError) {
    if (err.status === 0) return t("err.network");
    if (err.status === 429) return t("err.too_many");
    if (err.status === 404) return t("err.not_found");
  }
  return t("err.generic");
}

export function BrandMark() {
  const { lang, t } = useI18n();
  return (
    <Link to="/" className="brand" aria-label={COMPANY.name[lang]}>
      <span className="brand-mark" aria-hidden="true">
        🪷
      </span>
      <span>
        <span className="brand-name">{COMPANY.name[lang]}</span>
        <br />
        <span className="brand-sub">{t("brand.tagline")}</span>
      </span>
    </Link>
  );
}

export function PublicLayout() {
  const { lang, t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#main">
        {t("skip")}
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <BrandMark />
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end className="nav-link">
              {t("nav.home")}
            </NavLink>
            <NavLink to="/track" className="nav-link">
              {t("nav.track")}
            </NavLink>
            <LangToggle />
          </nav>
        </div>
      </header>

      <main id="main" className="container" tabIndex={-1}>
        <BackBar hideOn={["/"]} />
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="clay tone-1 row between">
            <div>
              <strong>{COMPANY.name[lang]}</strong>
              <p className="muted small" style={{ margin: 0 }}>
                {t("home.ceo")}: {COMPANY.ceo[lang]} · {COMPANY.address[lang]}
              </p>
            </div>
            <Link to="/admin/login" className="muted small">
              {t("nav.admin")}
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}

const isVisible = (field, values) => !field.show_if || values[field.show_if.key] === field.show_if.equals;

const MAX_PEOPLE = 20;
export const blankPerson = () => ({ name: "", age: "", gender: "" });

/** How many passenger rows to show, taken from the number field this one depends on. */
export function passengerCount(field, fields, values) {
  const source = fields.find((x) => x.key === field.count_from);
  const limit = Math.min(source?.max_value ?? MAX_PEOPLE, MAX_PEOPLE);
  const n = parseInt(values[field.count_from], 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(n, limit)) : 0;
}

/** One card per passenger with name, age and gender. Grows or shrinks with the count. */
function PassengerRows({ field, count, value, onChange, errors, idPrefix }) {
  const { t, pick } = useI18n();
  const rows = Array.from({ length: count }, (_, i) => value?.[i] || blankPerson());
  const setCell = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const idOf = (i, k) => `${idPrefix}-${field.key}-${i}-${k}`;
  const errOf = (i, k) => errors[`${field.key}.${i}.${k}`];

  const err = (i, k) =>
    errOf(i, k) && (
      <span id={`${idOf(i, k)}-err`} className="err-text">
        {t(`err.${errOf(i, k)}`)}
      </span>
    );
  const aria = (i, k) => ({
    "aria-invalid": errOf(i, k) ? "true" : undefined,
    "aria-describedby": errOf(i, k) ? `${idOf(i, k)}-err` : undefined,
  });

  return (
    <fieldset className="passenger-set full">
      <legend className="label">
        {pick(field, "label")}
        {field.required && (
          <span className="req" aria-hidden="true">
            *
          </span>
        )}
      </legend>
      {errors[field.key] && <span className="err-text">{t(`err.${errors[field.key]}`)}</span>}
      {count === 0 ? (
        <p className="help">{t("passenger.hint")}</p>
      ) : (
        <div className="passenger-list">
          {rows.map((row, i) => (
            <div key={i} className="passenger-card">
              <div className="passenger-title">{t("passenger.title", { n: i + 1 })}</div>
              <div className="passenger-grid">
                <div className="field">
                  <label htmlFor={idOf(i, "name")}>{t("passenger.name")}</label>
                  <input
                    id={idOf(i, "name")}
                    value={row.name}
                    maxLength={80}
                    autoComplete="off"
                    onChange={(e) => setCell(i, "name", e.target.value)}
                    {...aria(i, "name")}
                  />
                  {err(i, "name")}
                </div>
                <div className="field">
                  <label htmlFor={idOf(i, "age")}>{t("passenger.age")}</label>
                  <input
                    id={idOf(i, "age")}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="120"
                    value={row.age}
                    onChange={(e) => setCell(i, "age", e.target.value)}
                    {...aria(i, "age")}
                  />
                  {err(i, "age")}
                </div>
                <div className="field">
                  <label htmlFor={idOf(i, "gender")}>{t("passenger.gender")}</label>
                  <select id={idOf(i, "gender")} value={row.gender} onChange={(e) => setCell(i, "gender", e.target.value)} {...aria(i, "gender")}>
                    <option value="">{t("common.select")}</option>
                    {["male", "female", "other"].map((g) => (
                      <option key={g} value={g}>
                        {t(`gender.${g}`)}
                      </option>
                    ))}
                  </select>
                  {err(i, "gender")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** Renders form inputs from a service's field definitions (the "dynamic" part). */
export function DynamicFields({ fields, values, onChange, errors, idPrefix = "f" }) {
  const { t, pick } = useI18n();

  return fields
    .filter((f) => isVisible(f, values))
    .map((f) => {
      if (f.type === "passengers") {
        return (
          <PassengerRows
            key={f.key}
            field={f}
            count={passengerCount(f, fields, values)}
            value={values[f.key]}
            onChange={(rows) => onChange(f.key, rows)}
            errors={errors}
            idPrefix={idPrefix}
          />
        );
      }
      const id = `${idPrefix}-${f.key}`;
      const err = errors[f.key];
      const common = {
        id,
        name: f.key,
        value: values[f.key] ?? "",
        onChange: (e) => onChange(f.key, e.target.value),
        required: f.required,
        "aria-invalid": err ? "true" : undefined,
        "aria-describedby": err ? `${id}-err` : undefined,
      };
      let control;
      if (f.type === "textarea") control = <textarea {...common} maxLength={1000} />;
      else if (f.type === "select")
        control = (
          <select {...common}>
            <option value="">{t("common.select")}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {pick(o, "label")}
              </option>
            ))}
          </select>
        );
      else if (f.type === "number")
        control = <input {...common} type="number" inputMode="numeric" min={f.min_value ?? undefined} max={f.max_value ?? undefined} />;
      else if (f.type === "date") control = <input {...common} type="date" />;
      else if (f.type === "tel") control = <input {...common} type="tel" inputMode="tel" maxLength={20} />;
      else control = <input {...common} type="text" maxLength={200} />;

      return (
        <div key={f.key} className={`field ${f.type === "textarea" ? "full" : ""}`}>
          <label htmlFor={id}>
            {pick(f, "label")}
            {f.required && (
              <span className="req" aria-hidden="true">
                *
              </span>
            )}
          </label>
          {control}
          {err && (
            <span id={`${id}-err`} className="err-text">
              {t(`err.${err}`)}
            </span>
          )}
        </div>
      );
    });
}
