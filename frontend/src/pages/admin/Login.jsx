import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, authToken } from "../../api";
import { Alert, BrandMark, LangToggle, errorText } from "../../components";
import { useI18n } from "../../i18n";

export default function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.login({ username, password });
      authToken.set(res.token);
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t("admin.bad_login") : errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="row between" style={{ marginBottom: 28 }}>
        <BrandMark />
        <LangToggle />
      </div>
      <main id="main" className="clay stack" style={{ maxWidth: 440, margin: "0 auto" }}>
        <h1>{t("admin.login")}</h1>
        <p className="muted">{t("admin.login_sub")}</p>
        <form onSubmit={submit} className="stack">
          <Alert>{error}</Alert>
          <div className="field">
            <label htmlFor="u">{t("admin.username")}</label>
            <input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="p">{t("admin.password")}</label>
            <input
              id="p"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn primary block" type="submit" disabled={busy}>
            {busy ? t("admin.signing") : t("admin.signin")}
          </button>
        </form>
        <Link to="/" className="muted small">
          ← {t("admin.view_site")}
        </Link>
      </main>
    </div>
  );
}
