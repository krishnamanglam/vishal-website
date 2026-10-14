import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../../api";
import { Alert, PayBadge, Spinner, StatusBadge, errorText } from "../../components";
import { formatDate, money, useI18n } from "../../i18n";

const COLORS = ["#3f8c66", "#e08a4b", "#4a90c2", "#d1a82a", "#8a78c8", "#d9607f", "#6aa84f"];
const legendText = (v) => <span style={{ color: "#1b2a25", fontWeight: 600 }}>{v}</span>;
const tooltipStyle = { borderRadius: 16, border: 0, boxShadow: "5px 5px 12px rgba(70,105,88,.28)", background: "#ffffff" };

function Stat({ label, value, hint, tone }) {
  return (
    <div className={`clay sm stat ${tone}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { t, pick, lang } = useI18n();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.stats(), api.requests({ page_size: 8 })])
      .then(([s, r]) => {
        setStats(s);
        setRecent(r.items);
      })
      .catch((e) => setError(errorText(e, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!stats) return <Spinner />;

  const { totals } = stats;
  const serviceData = stats.by_service.map((s) => ({ name: pick(s, "name"), value: s.count }));
  const serviceTotal = serviceData.reduce((a, b) => a + b.value, 0);
  const statusData = stats.by_status.map((s) => ({ name: t(`status.${s.status}`), value: s.count }));
  const trend = stats.trend.map((d) => ({
    ...d,
    label: new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${d.date}T00:00:00Z`),
    ),
  }));

  return (
    <div className="stack-lg">
      <h1>{t("dash.title")}</h1>

      <div className="grid cols-3">
        <Stat label={t("dash.total")} value={totals.total} tone="tone-1" />
        <Stat label={t("dash.today")} value={totals.today} tone="tone-5" />
        <Stat label={t("dash.open")} value={totals.open} tone="tone-4" />
        <Stat label={t("dash.done")} value={totals.done} tone="tone-3" />
        <Stat label={t("dash.revenue")} value={money(totals.revenue)} tone="tone-3" />
        <Stat
          label={t("dash.awaiting")}
          value={money(totals.awaiting_amount)}
          hint={t("dash.awaiting_hint", { n: totals.awaiting_count })}
          tone="tone-2"
        />
      </div>

      <section className="clay" aria-labelledby="trend-t">
        <h2 id="trend-t">{t("dash.trend")}</h2>
        <div className="chart-box" role="img" aria-label={t("dash.trend")}>
          <ResponsiveContainer>
            <ComposedChart data={trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="#cfdcd3" />
              <XAxis dataKey="label" interval={4} tick={{ fill: "#465750", fontSize: 12 }} />
              <YAxis yAxisId="l" allowDecimals={false} tick={{ fill: "#465750", fontSize: 12 }} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: "#465750", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend formatter={legendText} />
              <Bar yAxisId="l" dataKey="requests" name={t("dash.series.requests")} fill="#3f8c66" radius={[10, 10, 4, 4]} />
              <Line yAxisId="r" dataKey="revenue" name={t("dash.series.revenue")} stroke="#e08a4b" strokeWidth={4} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid cols-2">
        <section className="clay tone-2" aria-labelledby="svc-t">
          <h2 id="svc-t">{t("dash.by_service")}</h2>
          {serviceTotal === 0 ? (
            <p className="muted">{t("dash.empty")}</p>
          ) : (
            <div className="chart-box" role="img" aria-label={t("dash.by_service")}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={serviceData} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="80%" paddingAngle={3} cornerRadius={8}>
                    {serviceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend formatter={legendText} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="clay tone-5" aria-labelledby="st-t">
          <h2 id="st-t">{t("dash.by_status")}</h2>
          <div className="chart-box" role="img" aria-label={t("dash.by_status")}>
            <ResponsiveContainer>
              <BarChart data={statusData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 6" stroke="#b3cbdc" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "#465750", fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#1b2a25", fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" name={t("dash.series.requests")} radius={[4, 10, 10, 4]}>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="clay" aria-labelledby="recent-t">
        <div className="row between">
          <h2 id="recent-t">{t("dash.recent")}</h2>
          <Link to="/admin/requests" className="btn sm">
            {t("dash.view_all")}
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted">{t("dash.empty")}</p>
        ) : (
          <div className="table-wrap">
            <table className="clay-table">
              <thead>
                <tr>
                  <th>{t("req.col.id")}</th>
                  <th>{t("req.col.service")}</th>
                  <th>{t("req.col.customer")}</th>
                  <th>{t("req.col.date")}</th>
                  <th>{t("req.col.status")}</th>
                  <th>{t("req.col.payment")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link className="row-link mono" to={`/admin/requests/${r.id}`}>
                        {r.tracking_id}
                      </Link>
                    </td>
                    <td style={{ minWidth: 190 }}>
                      {r.service.icon} {pick(r.service, "name")}
                    </td>
                    <td>
                      {r.name}
                      <div className="muted small">{r.phone}</div>
                    </td>
                    <td className="nowrap">{formatDate(r.created_at, lang)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      <PayBadge status={r.payment_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


