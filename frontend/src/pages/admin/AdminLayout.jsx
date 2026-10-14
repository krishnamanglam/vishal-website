import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, authToken } from "../../api";
import { COMPANY } from "../../company";
import { LangToggle, Spinner } from "../../components";
import { useI18n } from "../../i18n";

export default function AdminLayout() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const toLogin = () => navigate("/admin/login", { replace: true });
    window.addEventListener("ssn-auth-expired", toLogin);

    if (!authToken.get()) toLogin();
    else
      api
        .me()
        .then(() => setReady(true))
        .catch(toLogin);

    return () => window.removeEventListener("ssn-auth-expired", toLogin);
  }, [navigate]);

  const logout = () => {
    authToken.clear();
    navigate("/admin/login", { replace: true });
  };

  if (!ready) return <Spinner />;

  const link = ({ isActive }) => `side-link ${isActive ? "active" : ""}`;

  return (
    <div className="admin-shell">
      <aside className="clay sidebar" aria-label="Admin">
        <div className="sidebar-brand" style={{ marginBottom: 12 }}>
          <strong>{COMPANY.name[lang]}</strong>
          <div className="muted small">{t("admin.dashboard")}</div>
        </div>
        <NavLink to="/admin" end className={link}>
          📊 {t("admin.dashboard")}
        </NavLink>
        <NavLink to="/admin/requests" className={link}>
          📋 {t("admin.requests")}
        </NavLink>
        <NavLink to="/admin/services" className={link}>
          🧩 {t("admin.services")}
        </NavLink>
        <NavLink to="/admin/account" className={link}>
          🔐 {t("admin.account")}
        </NavLink>
        <Link to="/" className="side-link">
          🌐 {t("admin.view_site")}
        </Link>
        <button type="button" className="side-link" onClick={logout}>
          🚪 {t("admin.logout")}
        </button>
        <div style={{ marginTop: 12 }}>
          <LangToggle />
        </div>
      </aside>

      <main className="admin-main" id="main">
        <Outlet />
      </main>
    </div>
  );
}
