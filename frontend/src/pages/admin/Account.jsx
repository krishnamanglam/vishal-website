import { useState } from "react";
import { api, ApiError } from "../../api";
import { Alert, errorText } from "../../components";
import { useI18n } from "../../i18n";

export default function Account() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setDone(false);
    setBusy(true);
    try {
      await api.changePassword({ current_password: current, new_password: next });
      setDone(true);
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? t("acct.wrong") : errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <h1>{t("acct.title")}</h1>
      <form className="clay stack" style={{ maxWidth: 480 }} onSubmit={submit}>
        <Alert>{error}</Alert>
        {done && <Alert kind="success">{t("acct.done")}</Alert>}
        <div className="field">
          <label htmlFor="cp">{t("acct.current")}</label>
          <input id="cp" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="np">{t("acct.new")}</label>
          <input id="np" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? t("common.saving") : t("acct.change")}
          </button>
        </div>
      </form>
    </div>
  );
}
