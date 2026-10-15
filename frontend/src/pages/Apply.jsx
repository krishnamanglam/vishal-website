import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { Alert, DynamicFields, Spinner, blankPerson, errorText, passengerCount } from "../components";
import { useI18n } from "../i18n";

const PHONE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;
const isVisible = (f, values) => !f.show_if || values[f.show_if.key] === f.show_if.equals;

export default function Apply() {
  const { slug } = useParams();
  const { t, pick } = useI18n();
  const [service, setService] = useState(undefined); // undefined = loading, null = missing
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    setService(undefined);
    api
      .services()
      .then((list) => setService(list.find((s) => s.slug === slug) ?? null))
      .catch((e) => {
        setService(null);
        setFormError(errorText(e, t));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const setValue = (key, v) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    // clear this field's error and any per-passenger errors under it
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key && !k.startsWith(`${key}.`))));
  };

  /** Passenger rows exactly as long as the current passenger count (drops stale rows). */
  const buildData = () => {
    const data = { ...values };
    for (const f of service.fields) {
      if (f.type !== "passengers") continue;
      const n = passengerCount(f, service.fields, values);
      data[f.key] = Array.from({ length: n }, (_, i) => values[f.key]?.[i] || blankPerson());
    }
    return data;
  };

  const validate = () => {
    const e = {};
    if (name.trim().length < 2) e.name = "invalid_name";
    if (!PHONE_RE.test(phone.replace(/[\s-]/g, ""))) e.phone = "invalid_phone";
    for (const f of service.fields) {
      if (!isVisible(f, values)) continue;
      if (f.type === "passengers") {
        buildData()[f.key].forEach((p, i) => {
          if (p.name.trim().length < 2) e[`${f.key}.${i}.name`] = p.name.trim() ? "invalid" : "required";
          const age = Number(p.age);
          if (p.age === "" || p.age === null) e[`${f.key}.${i}.age`] = "required";
          else if (!Number.isInteger(age) || age < 0 || age > 120) e[`${f.key}.${i}.age`] = "invalid";
          if (!p.gender) e[`${f.key}.${i}.gender`] = "required";
        });
      } else if (f.required && !String(values[f.key] ?? "").trim()) e[f.key] = "required";
    }
    return e;
  };

  const focusFirstError = (e) => {
    const first = Object.keys(e)[0];
    document.getElementById(`f-${first.replaceAll(".", "-")}`)?.focus();
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setFormError("");
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length) {
      setFormError(t("err.fix_form"));
      focusFirstError(local);
      return;
    }

    setBusy(true);
    try {
      const res = await api.createRequest({ service_slug: slug, name: name.trim(), phone, data: buildData() });
      setDone(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const fromServer = { ...err.fieldErrors };
        if (Array.isArray(err.detail)) {
          for (const d of err.detail) {
            const field = d.loc?.[d.loc.length - 1];
            if (field === "phone") fromServer.phone = "invalid_phone";
            if (field === "name") fromServer.name = "invalid_name";
          }
        }
        setErrors(fromServer);
        setFormError(t("err.fix_form"));
        focusFirstError(fromServer);
      } else {
        setFormError(errorText(err, t));
      }
    } finally {
      setBusy(false);
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(done.tracking_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked; the ID is selectable on screen */
    }
  };

  if (service === undefined) return <Spinner />;
  if (service === null)
    return (
      <div className="clay stack">
        <Alert>{formError || t("apply.missing")}</Alert>
        <Link to="/" className="btn">
          {t("nav.home")}
        </Link>
      </div>
    );

  if (done)
    return (
      <section className="clay tone-3 stack center" aria-live="polite">
        <div className="icon-bubble" style={{ margin: "0 auto" }} aria-hidden="true">
          ✅
        </div>
        <h1>{t("apply.done")}</h1>
        <p>{t("apply.done_text")}</p>
        <div>
          <div className="muted small">{t("apply.id")}</div>
          <div className="big-id mono">{done.tracking_id}</div>
        </div>
        <p className="muted">{t("apply.save_id")}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn" onClick={copyId}>
            {copied ? t("common.copied") : t("common.copy")}
          </button>
          <Link to={`/track?id=${done.tracking_id}`} className="btn primary">
            {t("apply.track_it")}
          </Link>
          <Link to="/" className="btn">
            {t("apply.another")}
          </Link>
        </div>
      </section>
    );

  return (
    <section className="clay stack" aria-labelledby="apply-title">
      <div className="row">
        <div className="icon-bubble" aria-hidden="true">
          {service.icon}
        </div>
        <div>
          <h1 id="apply-title" style={{ marginBottom: 0 }}>
            {t("apply.title", { service: pick(service, "name") })}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {pick(service, "desc")}
          </p>
        </div>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate className="stack-lg">
        <Alert>{formError}</Alert>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>
            <h2>{t("apply.yours")}</h2>
          </legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="f-name">
                {t("common.name")}
                <span className="req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="f-name"
                value={name}
                maxLength={100}
                autoComplete="name"
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((p) => ({ ...p, name: undefined }));
                }}
                aria-invalid={errors.name ? "true" : undefined}
                aria-describedby={errors.name ? "f-name-err" : undefined}
              />
              {errors.name && (
                <span id="f-name-err" className="err-text">
                  {t(`err.${errors.name}`)}
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="f-phone">
                {t("common.phone")}
                <span className="req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="f-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                maxLength={16}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setErrors((p) => ({ ...p, phone: undefined }));
                }}
                aria-invalid={errors.phone ? "true" : undefined}
                aria-describedby={errors.phone ? "f-phone-err" : "f-phone-help"}
              />
              {errors.phone ? (
                <span id="f-phone-err" className="err-text">
                  {t(`err.${errors.phone}`)}
                </span>
              ) : (
                <span id="f-phone-help" className="help">
                  {t("common.phone_help")}
                </span>
              )}
            </div>
          </div>
        </fieldset>

        {service.fields.length > 0 && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>
              <h2>{t("apply.about")}</h2>
            </legend>
            <div className="form-grid">
              <DynamicFields fields={service.fields} values={values} onChange={setValue} errors={errors} />
            </div>
          </fieldset>
        )}

        <div className="row">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t("common.submitting") : t("common.submit")}
          </button>
          <Link to="/" className="btn">
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </section>
  );
}

