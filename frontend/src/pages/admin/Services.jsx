import { useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import { Alert, Spinner, errorText } from "../../components";
import { useI18n } from "../../i18n";

const TYPES = ["text", "textarea", "number", "date", "select", "tel", "passengers"];

const blankField = () => ({
  key: "", type: "text", label_en: "", label_hi: "", required: false,
  optionsText: "", min_value: "", max_value: "", show_key: "", show_equals: "", count_from: "",
});

const blankService = () => ({
  id: null, slug: "", icon: "📄", name_en: "", name_hi: "", desc_en: "", desc_hi: "",
  active: true, sort_order: 0, fields: [],
});

function toDraft(s) {
  return {
    ...s,
    fields: s.fields.map((f) => ({
      key: f.key, type: f.type, label_en: f.label_en, label_hi: f.label_hi, required: !!f.required,
      optionsText: (f.options || []).map((o) => `${o.value} | ${o.label_en} | ${o.label_hi}`).join("\n"),
      min_value: f.min_value ?? "", max_value: f.max_value ?? "",
      show_key: f.show_if?.key ?? "", show_equals: f.show_if?.equals ?? "",
      count_from: f.count_from ?? "",
    })),
  };
}

function toPayload(d) {
  const num = (v) => (v === "" || v === null ? null : Number(v));
  return {
    slug: d.slug.trim(), icon: d.icon || "📄",
    name_en: d.name_en.trim(), name_hi: d.name_hi.trim(),
    desc_en: d.desc_en, desc_hi: d.desc_hi,
    active: d.active, sort_order: Number(d.sort_order) || 0,
    fields: d.fields.map((f) => {
      const options =
        f.type === "select"
          ? f.optionsText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
              const [value, label_en, label_hi] = l.split("|").map((p) => p.trim());
              if (!value || !label_en || !label_hi) throw new Error("options");
              return { value, label_en, label_hi };
            })
          : [];
      return {
        key: f.key.trim(), type: f.type, label_en: f.label_en.trim(), label_hi: f.label_hi.trim(),
        required: f.required, options,
        min_value: f.type === "number" ? num(f.min_value) : null,
        max_value: f.type === "number" ? num(f.max_value) : null,
        show_if: f.show_key ? { key: f.show_key, equals: f.show_equals } : null,
        count_from: f.type === "passengers" ? f.count_from : null,
      };
    }),
  };
}

function ServiceEditor({ initial, onSaved, onCancel }) {
  const { t } = useI18n();
  const [d, setD] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isNew = d.id === null;

  const set = (k) => (e) => setD((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setField = (i, k, v) =>
    setD((p) => ({ ...p, fields: p.fields.map((f, j) => (j === i ? { ...f, [k]: v } : f)) }));
  const move = (i, dir) =>
    setD((p) => {
      const fields = [...p.fields];
      const j = i + dir;
      if (j < 0 || j >= fields.length) return p;
      [fields[i], fields[j]] = [fields[j], fields[i]];
      return { ...p, fields };
    });

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = toPayload(d);
      const saved = isNew ? await api.createService(payload) : await api.updateService(d.id, payload);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) setError(errorText(err, t));
      else {
        const first = Array.isArray(err.detail) ? err.detail[0] : null;
        const hint = first ? ` (${(first.loc || []).slice(1).join(".")}: ${first.msg})` : typeof err.detail === "string" ? ` (${err.detail})` : "";
        setError(t("svc.save_error") + hint);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="clay tone-1 stack-lg" onSubmit={save} aria-labelledby="ed-t">
      <h2 id="ed-t">{isNew ? t("svc.creating") : t("svc.editing")}</h2>
      <Alert>{error}</Alert>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="s-slug">{t("svc.slug")}</label>
          <input id="s-slug" value={d.slug} onChange={set("slug")} disabled={!isNew} required pattern="[a-z][a-z0-9\-]{1,39}" />
        </div>
        <div className="field">
          <label htmlFor="s-icon">{t("svc.icon")}</label>
          <input id="s-icon" value={d.icon} onChange={set("icon")} maxLength={8} />
        </div>
        <div className="field">
          <label htmlFor="s-ne">{t("svc.name_en")}</label>
          <input id="s-ne" value={d.name_en} onChange={set("name_en")} required maxLength={120} lang="en" />
        </div>
        <div className="field">
          <label htmlFor="s-nh">{t("svc.name_hi")}</label>
          <input id="s-nh" value={d.name_hi} onChange={set("name_hi")} required maxLength={120} lang="hi" />
        </div>
        <div className="field">
          <label htmlFor="s-de">{t("svc.desc_en")}</label>
          <input id="s-de" value={d.desc_en} onChange={set("desc_en")} maxLength={400} lang="en" />
        </div>
        <div className="field">
          <label htmlFor="s-dh">{t("svc.desc_hi")}</label>
          <input id="s-dh" value={d.desc_hi} onChange={set("desc_hi")} maxLength={400} lang="hi" />
        </div>
        <div className="field">
          <label htmlFor="s-ord">{t("svc.order")}</label>
          <input id="s-ord" type="number" value={d.sort_order} onChange={set("sort_order")} />
        </div>
        <div className="field">
          <span className="label">{t("svc.active")}</span>
          <label className="row" style={{ minHeight: 48 }}>
            <input type="checkbox" checked={d.active} onChange={set("active")} /> {d.active ? t("common.yes") : t("common.no")}
          </label>
        </div>
      </div>

      <div className="stack">
        <h3>{t("svc.fields")}</h3>
        {d.fields.map((f, i) => (
          <fieldset key={i} className="field-card stack" style={{ border: 0 }}>
            <legend className="sr-only">
              {t("svc.fields")} {i + 1}
            </legend>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`f${i}-key`}>{t("svc.key")}</label>
                <input id={`f${i}-key`} value={f.key} onChange={(e) => setField(i, "key", e.target.value)} required pattern="[a-z][a-z0-9_]{0,39}" />
              </div>
              <div className="field">
                <label htmlFor={`f${i}-type`}>{t("svc.type")}</label>
                <select id={`f${i}-type`} value={f.type} onChange={(e) => setField(i, "type", e.target.value)}>
                  {TYPES.map((x) => (
                    <option key={x} value={x}>
                      {t(`svc.type.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`f${i}-le`}>{t("svc.label_en")}</label>
                <input id={`f${i}-le`} value={f.label_en} onChange={(e) => setField(i, "label_en", e.target.value)} required maxLength={120} lang="en" />
              </div>
              <div className="field">
                <label htmlFor={`f${i}-lh`}>{t("svc.label_hi")}</label>
                <input id={`f${i}-lh`} value={f.label_hi} onChange={(e) => setField(i, "label_hi", e.target.value)} required maxLength={120} lang="hi" />
              </div>
              {f.type === "number" && (
                <>
                  <div className="field">
                    <label htmlFor={`f${i}-min`}>{t("svc.min")}</label>
                    <input id={`f${i}-min`} type="number" value={f.min_value} onChange={(e) => setField(i, "min_value", e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`f${i}-max`}>{t("svc.max")}</label>
                    <input id={`f${i}-max`} type="number" value={f.max_value} onChange={(e) => setField(i, "max_value", e.target.value)} />
                  </div>
                </>
              )}
              {f.type === "passengers" && (
                <div className="field">
                  <label htmlFor={`f${i}-cf`}>{t("svc.count_from")}</label>
                  <select id={`f${i}-cf`} value={f.count_from} onChange={(e) => setField(i, "count_from", e.target.value)} required>
                    <option value="">{t("common.select")}</option>
                    {d.fields.slice(0, i).filter((o) => o.type === "number" && o.key).map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.key}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {f.type === "select" && (
                <div className="field full">
                  <label htmlFor={`f${i}-opt`}>{t("svc.options")}</label>
                  <textarea id={`f${i}-opt`} value={f.optionsText} onChange={(e) => setField(i, "optionsText", e.target.value)} placeholder={"petrol | Petrol | पेट्रोल"} />
                </div>
              )}
              <div className="field">
                <label htmlFor={`f${i}-show`}>{t("svc.show_if")}</label>
                <select id={`f${i}-show`} value={f.show_key} onChange={(e) => setField(i, "show_key", e.target.value)}>
                  <option value="">{t("svc.show_always")}</option>
                  {d.fields.slice(0, i).filter((o) => o.key).map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.key}
                    </option>
                  ))}
                </select>
              </div>
              {f.show_key && (
                <div className="field">
                  <label htmlFor={`f${i}-eq`}>{t("svc.equals")}</label>
                  <input id={`f${i}-eq`} value={f.show_equals} onChange={(e) => setField(i, "show_equals", e.target.value)} required />
                </div>
              )}
              <div className="field">
                <span className="label">{t("svc.required")}</span>
                <label className="row" style={{ minHeight: 48 }}>
                  <input type="checkbox" checked={f.required} onChange={(e) => setField(i, "required", e.target.checked)} />{" "}
                  {f.required ? t("common.yes") : t("common.no")}
                </label>
              </div>
            </div>
            <div className="row">
              <button type="button" className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("svc.up")}>
                ↑
              </button>
              <button type="button" className="btn sm" onClick={() => move(i, 1)} disabled={i === d.fields.length - 1} aria-label={t("svc.down")}>
                ↓
              </button>
              <button
                type="button"
                className="btn sm danger"
                onClick={() => setD((p) => ({ ...p, fields: p.fields.filter((_, j) => j !== i) }))}
              >
                {t("common.remove")}
              </button>
            </div>
          </fieldset>
        ))}
        <div>
          <button type="button" className="btn" onClick={() => setD((p) => ({ ...p, fields: [...p.fields, blankField()] }))}>
            ＋ {t("svc.add_field")}
          </button>
        </div>
      </div>

      <div className="row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

export default function Services() {
  const { t, pick } = useI18n();
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const load = () =>
    api
      .adminServices()
      .then(setList)
      .catch((e) => setError(errorText(e, t)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (s) => {
    try {
      const { id, ...rest } = s;
      await api.updateService(id, { ...rest, active: !s.active });
      load();
    } catch (e) {
      setError(errorText(e, t));
    }
  };

  if (!list && !error) return <Spinner />;

  return (
    <div className="stack-lg">
      <div className="row between">
        <h1>{t("svc.title")}</h1>
        {!editing && (
          <button type="button" className="btn primary" onClick={() => setEditing(blankService())}>
            ＋ {t("svc.new")}
          </button>
        )}
      </div>
      <p className="muted">{t("svc.help")}</p>
      <Alert>{error}</Alert>

      {editing && (
        <ServiceEditor
          key={editing.id ?? "new"}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <div className="grid cols-2">
        {list?.map((s) => (
          <article key={s.id} className={`clay sm ${s.active ? "" : "tone-2"}`}>
            <div className="row between">
              <div className="row">
                <div className="icon-bubble" aria-hidden="true">
                  {s.icon}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{pick(s, "name")}</h3>
                  <span className="muted small">
                    {s.slug} · {t("svc.fields_count", { n: s.fields.length })}
                  </span>
                </div>
              </div>
              <span className={`badge ${s.active ? "done" : "rejected"}`}>{s.active ? t("common.yes") : t("common.no")}</span>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button type="button" className="btn sm" onClick={() => { setEditing(toDraft(s)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                ✎ {t("common.edit")}
              </button>
              <button type="button" className="btn sm" onClick={() => toggle(s)}>
                {s.active ? "🙈" : "👁"} {t("svc.active")}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

