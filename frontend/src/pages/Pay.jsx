import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Alert, Spinner } from "../components";
import { money, useI18n } from "../i18n";

export default function Pay() {
  const { token } = useParams();
  const { t, pick } = useI18n();
  const [info, setInfo] = useState(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .payInfo(token)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [token]);

  if (info === undefined) return <Spinner />;
  if (info === null)
    return (
      <div className="clay stack">
        <Alert>{t("pay.invalid")}</Alert>
        <div>
          <Link to="/" className="btn">
            {t("common.back")}
          </Link>
        </div>
      </div>
    );

  const copyUpi = async () => {
    try {
      await navigator.clipboard.writeText(info.upi_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const paid = info.payment_status === "paid";

  return (
    <section className="clay tone-2 stack center" style={{ maxWidth: 560, margin: "0 auto" }} aria-labelledby="pay-title">
      <div className="icon-bubble" style={{ margin: "0 auto" }} aria-hidden="true">
        {paid ? "✅" : "💳"}
      </div>
      <h1 id="pay-title">{t("pay.title")}</h1>

      <div>
        <div className="muted small">{t("pay.amount")}</div>
        <div className="big-id">{money(info.fee)}</div>
      </div>

      <dl className="kv" style={{ textAlign: "left" }}>
        <dt>{t("pay.for")}</dt>
        <dd>{pick({ n_en: info.service_name_en, n_hi: info.service_name_hi }, "n")}</dd>
        <dt>{t("pay.customer")}</dt>
        <dd>{info.customer_name}</dd>
        <dt>{t("pay.id")}</dt>
        <dd className="mono">{info.tracking_id}</dd>
      </dl>

      {paid ? (
        <Alert kind="success">{t("pay.paid")}</Alert>
      ) : info.upi_link ? (
        <>
          <a className="btn primary block" href={info.upi_link}>
            {t("pay.upi")} · {money(info.fee)}
          </a>
          <div className="row" style={{ justifyContent: "center" }}>
            <span className="muted">
              {t("pay.upi_id")}: <strong className="mono">{info.upi_id}</strong>
            </span>
            <button type="button" className="btn sm" onClick={copyUpi}>
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
          <p className="muted small">{t("pay.after")}</p>
        </>
      ) : (
        <Alert kind="info">{t("pay.no_upi")}</Alert>
      )}
    </section>
  );
}
