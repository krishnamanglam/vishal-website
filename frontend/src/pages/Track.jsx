import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Alert, PayBadge, StatusBadge, errorText } from "../components";
import { formatDate, money, useI18n } from "../i18n";

const STEPS = ["received", "working", "ready", "delivered"];
const STEP_INDEX = { new: 0, in_progress: 1, waiting_customer: 1, done: 2, delivered: 3 };

export default function Track() {
  const { t, pick, lang } = useI18n();
  const [params] = useSearchParams();
  const [id, setId] = useState(params.get("id") || "");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setBusy(true);
    try {
      setResult(await api.track({ tracking_id: id, phone }));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const step = result ? STEP_INDEX[result.status] : -1;
  const payPath = result?.pay_url ? new URL(result.pay_url).pathname : null;

  return (
    <div className="stack-lg">
      <section className="clay stack" aria-labelledby="track-title">
        <h1 id="track-title">{t("track.title")}</h1>
        <p className="muted">{t("track.subtitle")}</p>
        <form onSubmit={submit} className="stack">
          <Alert>{error}</Alert>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="t-id">{t("track.id")}</label>
              <input
                id="t-id"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                required
                maxLength={30}
                autoCapitalize="characters"
                placeholder="SSS-XXXXXXXX"
              />
            </div>
            <div className="field">
              <label htmlFor="t-phone">{t("common.phone")}</label>
              <input
                id="t-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength={16}
                autoComplete="tel"
              />
            </div>
          </div>
          <div>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? t("track.checking") : t("track.check")}
            </button>
          </div>
        </form>
      </section>

      {result && (
        <section className="clay tone-1 stack" aria-live="polite" aria-labelledby="result-title">
          <div className="row between">
            <div className="row">
              <div className="icon-bubble" aria-hidden="true">
                {result.icon}
              </div>
              <div>
                <h2 id="result-title" style={{ marginBottom: 0 }}>
                  {pick({ name_en: result.service_name_en, name_hi: result.service_name_hi }, "name")}
                </h2>
                <span className="mono muted">{result.tracking_id}</span>
              </div>
            </div>
            <StatusBadge status={result.status} />
          </div>

          {result.status === "rejected" ? (
            <Alert>{t("track.rejected")}</Alert>
          ) : (
            <ol className="progress" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {STEPS.map((s, i) => (
                <li key={s} className={`step ${i <= step ? "on" : ""}`} aria-current={i === step ? "step" : undefined}>
                  {t(`step.${s}`)}
                </li>
              ))}
            </ol>
          )}

          <dl className="kv">
            <dt>{t("track.submitted")}</dt>
            <dd>{formatDate(result.created_at, lang)}</dd>
            <dt>{t("track.updated")}</dt>
            <dd>{formatDate(result.updated_at, lang)}</dd>
            {result.payment_status !== "none" && (
              <>
                <dt>{t("track.amount")}</dt>
                <dd>
                  {money(result.fee)} <PayBadge status={result.payment_status} />
                </dd>
              </>
            )}
          </dl>

          {payPath && (
            <div>
              <Link to={payPath} className="btn primary">
                {t("track.pay_now")} · {money(result.fee)}
              </Link>
            </div>
          )}
          {result.payment_status === "paid" && <Alert kind="success">{t("track.paid")}</Alert>}
        </section>
      )}
    </div>
  );
}
