import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../../api";
import { Alert, PayBadge, Spinner, StatusBadge, errorText } from "../../components";
import { formatDate, formatDay, money, useI18n } from "../../i18n";

const STATUSES = ["new", "in_progress", "waiting_customer", "done", "delivered", "rejected"];

export default function RequestDetail() {
  const { id } = useParams();
  const { t, pick, lang } = useI18n();
  const [req, setReq] = useState(null);
  const [status, setStatus] = useState("new");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null); // {kind, text}
  const [busy, setBusy] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [waUrl, setWaUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const load = (r) => {
    setReq(r);
    setStatus(r.status);
    setFee(r.fee ?? "");
    setNote(r.admin_note || "");
  };

  useEffect(() => {
    setReq(null);
    api
      .requestById(id)
      .then(load)
      .catch((e) => setError(errorText(e, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error && !req) return <Alert>{error}</Alert>;
  if (!req) return <Spinner />;

  const dirty = status !== req.status || String(fee) !== String(req.fee ?? "") || note !== (req.admin_note || "");
  const paid = req.payment_status === "paid";
  const hasFee = req.fee != null && req.fee > 0;

  const run = async (name, fn) => {
    setBusy(name);
    setError("");
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError && typeof e.detail === "string" ? `${errorText(e, t)} (${e.detail})` : errorText(e, t));
    } finally {
      setBusy("");
    }
  };

  const save = () =>
    run("save", async () => {
      const body = {};
      if (status !== req.status) body.status = status;
      if (String(fee) !== String(req.fee ?? "")) body.fee = fee === "" ? 0 : Number(fee);
      if (note !== (req.admin_note || "")) body.admin_note = note;
      load(await api.patchRequest(req.id, body));
      setNotice({ kind: "success", text: t("common.saved") });
    });

  const sendLink = () =>
    run("link", async () => {
      const res = await api.sendPaymentLink(req.id, channel);
      load(res.request);
      setWaUrl(res.whatsapp_url);
      setNotice(
        res.delivery.sent
          ? { kind: "success", text: t("detail.link_sent") }
          : { kind: "info", text: t("detail.link_manual") },
      );
    });

  const markPaid = () => run("paid", async () => load(await api.markPaid(req.id)));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(req.pay_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const fieldMap = Object.fromEntries(req.service.fields.map((f) => [f.key, f]));
  const display = (f, v) => {
    if (!f) return String(v);
    if (f.type === "select") return pick(f.options.find((o) => o.value === v) || { label_en: v }, "label");
    if (f.type === "date") return formatDay(v, lang);
    return String(v);
  };
  const rows = Object.entries(req.data).filter(([k]) => k !== "notes");
  const waPhone = `https://wa.me/91${req.phone}`;

  const eventLabel = (e) => {
    if (e.kind === "status") return e.text.split(" → ").map((s) => t(`status.${s}`)).join(" → ");
    return e.text;
  };

  return (
    <div className="stack-lg">
      <div className="row between">
        <div className="row">
          <h1 style={{ margin: 0 }}>
            {req.service.icon} {pick(req.service, "name")}
          </h1>
        </div>
        <div className="row">
          <span className="mono">{req.tracking_id}</span>
          <StatusBadge status={req.status} />
          <PayBadge status={req.payment_status} />
        </div>
      </div>

      <Alert>{error}</Alert>
      <Alert kind={notice?.kind}>{notice?.text}</Alert>

      <div className="grid cols-2">
        <div className="stack-lg">
          <section className="clay tone-1" aria-labelledby="cust-t">
            <h2 id="cust-t">{t("detail.customer")}</h2>
            <p style={{ fontSize: "1.05rem", fontWeight: 800, marginBottom: 2 }}>{req.name}</p>
            <p className="mono">{req.phone}</p>
            <div className="row">
              <a className="btn sm" href={`tel:+91${req.phone}`}>
                📞 {t("detail.call")}
              </a>
              <a className="btn sm good" href={waPhone} target="_blank" rel="noopener noreferrer">
                💬 {t("detail.whatsapp")}
              </a>
            </div>
            <p className="muted small" style={{ marginTop: 14, marginBottom: 0 }}>
              {t("detail.created")}: {formatDate(req.created_at, lang)}
            </p>
          </section>

          <section className="clay" aria-labelledby="det-t">
            <h2 id="det-t">{t("detail.details")}</h2>
            <dl className="kv">
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{fieldMap[k] ? pick(fieldMap[k], "label") : k}</dt>
                  <dd>
                    {Array.isArray(v) ? (
                      <ol className="people">
                        {v.map((p, i) => (
                          <li key={i}>
                            <strong>{p.name}</strong> · {t("passenger.years", { n: p.age })} · {t(`gender.${p.gender}`)}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      display(fieldMap[k], v)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {req.data.notes && (
              <div className="field-card" style={{ marginTop: 18 }}>
                <div className="label" style={{ fontWeight: 800 }}>
                  {t("detail.reason")}
                </div>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{req.data.notes}</p>
              </div>
            )}
          </section>
        </div>

        <div className="stack-lg">
          <section className="clay tone-5" aria-labelledby="man-t">
            <h2 id="man-t">{t("detail.manage")}</h2>
            <div className="stack">
              <div className="field">
                <label htmlFor="d-status">{t("detail.status")}</label>
                <select id="d-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="d-fee">{t("detail.fee")}</label>
                <input
                  id="d-fee"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="1000000"
                  value={fee}
                  disabled={paid}
                  onChange={(e) => setFee(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="d-note">{t("detail.note")}</label>
                <textarea id="d-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="row">
                <button type="button" className="btn primary" onClick={save} disabled={!dirty || busy === "save"}>
                  {busy === "save" ? t("common.saving") : t("common.save")}
                </button>
                {dirty && <span className="muted small">{t("detail.unsaved")}</span>}
              </div>
            </div>
          </section>

          <section className="clay tone-2" aria-labelledby="pay-t">
            <div className="row between">
              <h2 id="pay-t">{t("detail.payment")}</h2>
              <PayBadge status={req.payment_status} />
            </div>
            {hasFee && <p style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0 0 8px" }}>{money(req.fee)}</p>}

            {paid ? (
              <Alert kind="success">{t("detail.paid_on", { d: formatDate(req.paid_at, lang) })}</Alert>
            ) : (
              <div className="stack">
                {!hasFee && <p className="muted">{t("detail.fee_first")}</p>}
                <div className="field">
                  <label htmlFor="d-chan">{t("detail.channel")}</label>
                  <select id="d-chan" value={channel} onChange={(e) => setChannel(e.target.value)}>
                    <option value="whatsapp">{t("detail.whatsapp")}</option>
                    <option value="sms">{t("detail.sms")}</option>
                  </select>
                </div>
                <div className="row">
                  <button type="button" className="btn primary" onClick={sendLink} disabled={!hasFee || dirty || busy === "link"}>
                    {busy === "link" ? t("detail.sending") : t("detail.send_link")}
                  </button>
                  {waUrl && (
                    <a className="btn good" href={waUrl} target="_blank" rel="noopener noreferrer">
                      💬 {t("detail.open_wa")}
                    </a>
                  )}
                </div>
                {req.pay_url && (
                  <div className="row">
                    <button type="button" className="btn sm" onClick={copyLink}>
                      {copied ? t("common.copied") : t("detail.copy_link")}
                    </button>
                  </div>
                )}
                <div>
                  <button type="button" className="btn good" onClick={markPaid} disabled={!hasFee || busy === "paid"}>
                    ✔ {t("detail.mark_paid")}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="clay" aria-labelledby="tl-t">
        <h2 id="tl-t">{t("detail.timeline")}</h2>
        <ul className="timeline">
          {[...req.events].reverse().map((e) => (
            <li key={e.id}>
              <span className="dot" aria-hidden="true" />
              <div>
                <strong>{t(`event.${e.kind}`)}</strong>: {eventLabel(e)}
                <div className="muted small">
                  {formatDate(e.created_at, lang)} · {e.actor}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

