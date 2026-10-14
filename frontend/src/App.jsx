import { Suspense, lazy } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { PublicLayout, Spinner } from "./components";
import { useI18n } from "./i18n";
import Apply from "./pages/Apply";
import Home from "./pages/Home";
import Pay from "./pages/Pay";
import Track from "./pages/Track";
import Account from "./pages/admin/Account";
import AdminLayout from "./pages/admin/AdminLayout";
import Login from "./pages/admin/Login";
import RequestDetail from "./pages/admin/RequestDetail";
import Requests from "./pages/admin/Requests";
import Services from "./pages/admin/Services";

// Charts library is large, so the dashboard is loaded only when the admin opens it.
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));

function NotFound() {
  const { t } = useI18n();
  return (
    <section className="clay stack center">
      <h1>{t("nf.title")}</h1>
      <p className="muted">{t("nf.text")}</p>
      <div>
        <Link to="/" className="btn primary">
          {t("nav.home")}
        </Link>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="apply/:slug" element={<Apply />} />
        <Route path="track" element={<Track />} />
        <Route path="pay/:token" element={<Pay />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="admin/login" element={<Login />} />
      <Route path="admin" element={<AdminLayout />}>
        <Route
          index
          element={
            <Suspense fallback={<Spinner />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route path="requests" element={<Requests />} />
        <Route path="requests/:id" element={<RequestDetail />} />
        <Route path="services" element={<Services />} />
        <Route path="account" element={<Account />} />
      </Route>
    </Routes>
  );
}
