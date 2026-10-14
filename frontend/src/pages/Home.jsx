import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Alert, Spinner, errorText } from "../components";
import { COMPANY } from "../company";
import { useI18n } from "../i18n";

const TONES = ["tone-1", "tone-2", "tone-3", "tone-4", "tone-5"];

export default function Home() {
  const { t, pick, lang } = useI18n();
  const [services, setServices] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .services()
      .then(setServices)
      .catch((e) => setError(errorText(e, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stack-lg">
      <section className="clay hero" aria-labelledby="hero-title">
        <div className="stack">
          <h1 id="hero-title">{t("home.title")}</h1>
          <p className="muted" style={{ fontSize: "1.1rem" }}>
            {t("home.subtitle")}
          </p>
          <div className="row">
            <a href="#services" className="btn primary">
              {t("home.apply")}
            </a>
            <Link to="/track" className="btn">
              {t("home.track")}
            </Link>
          </div>
        </div>
        <div className="art" aria-hidden="true">
          <div className="icon-bubble">🚆</div>
          <div className="icon-bubble">✈️</div>
          <div className="icon-bubble">🛂</div>
          <div className="icon-bubble">🌿</div>
        </div>
      </section>

      <section id="services" aria-labelledby="services-title" className="stack">
        <h2 id="services-title">{t("home.services")}</h2>
        <Alert>{error}</Alert>
        {!services && !error && <Spinner />}
        {services?.length === 0 && <p className="muted">{t("home.empty")}</p>}
        <div className="grid cols-3">
          {services?.map((s, i) => (
            <article key={s.id} className={`clay lift ${TONES[i % TONES.length]} stack`}>
              <div className="icon-bubble" aria-hidden="true">
                {s.icon}
              </div>
              <h3>{pick(s, "name")}</h3>
              <p className="muted">{pick(s, "desc")}</p>
              <Link to={`/apply/${s.slug}`} className="btn primary" aria-label={`${t("home.fill")}: ${pick(s, "name")}`}>
                {t("home.fill")}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-title" className="stack">
        <h2 id="how-title">{t("home.how")}</h2>
        <div className="grid cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="clay sm">
              <div className="step-num" aria-hidden="true">
                {n}
              </div>
              <h3>{t(`home.step${n}.t`)}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {t(`home.step${n}.d`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="clay tone-5" aria-labelledby="visit-title">
        <h2 id="visit-title">{t("home.visit")}</h2>
        <p style={{ margin: 0 }}>
          <strong>{COMPANY.name[lang]}</strong>
          <br />📍 {COMPANY.address[lang]}
          <br />
          {t("home.ceo")}: {COMPANY.ceo[lang]}
        </p>
      </section>
    </div>
  );
}
