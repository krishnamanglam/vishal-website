const TOKEN_KEY = "ssn_admin_token";

// Empty = same address as the website (local dev proxy, Render). Set VITE_API_URL at build
// time when the API lives at a different address (for example a separate Vercel project).
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export const authToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : "api_error");
    this.status = status;
    this.detail = detail;
  }
  /** Per-field error codes from the server, e.g. { from_city: "required" } */
  get fieldErrors() {
    return this.detail && typeof this.detail === "object" && !Array.isArray(this.detail)
      ? this.detail.errors || {}
      : {};
  }
}

async function request(path, { method = "GET", body, admin = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (admin && authToken.get()) headers.Authorization = `Bearer ${authToken.get()}`;

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network");
  }

  if (res.status === 401 && admin) {
    authToken.clear();
    window.dispatchEvent(new Event("ssn-auth-expired"));
  }
  if (!res.ok) {
    let detail = "error";
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return res;
}

const json = async (path, opts) => (await request(path, opts)).json();

const qs = (params = {}) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export const api = {
  // public
  services: () => json("/services"),
  createRequest: (body) => json("/requests", { method: "POST", body }),
  track: (body) => json("/track", { method: "POST", body }),
  payInfo: (token) => json(`/pay/${encodeURIComponent(token)}`),

  // auth
  login: (body) => json("/auth/login", { method: "POST", body }),
  me: () => json("/auth/me", { admin: true }),
  changePassword: (body) => json("/auth/change-password", { method: "POST", body, admin: true }),

  // admin
  stats: () => json("/admin/stats", { admin: true }),
  requests: (params) => json(`/admin/requests${qs(params)}`, { admin: true }),
  requestById: (id) => json(`/admin/requests/${id}`, { admin: true }),
  patchRequest: (id, body) => json(`/admin/requests/${id}`, { method: "PATCH", body, admin: true }),
  sendPaymentLink: (id, channel) =>
    json(`/admin/requests/${id}/payment-link`, { method: "POST", body: { channel }, admin: true }),
  markPaid: (id) => json(`/admin/requests/${id}/mark-paid`, { method: "POST", admin: true }),
  adminServices: () => json("/admin/services", { admin: true }),
  createService: (body) => json("/admin/services", { method: "POST", body, admin: true }),
  updateService: (id, body) => json(`/admin/services/${id}`, { method: "PUT", body, admin: true }),
  async exportCsv(params) {
    const res = await request(`/admin/requests/export.csv${qs(params)}`, { admin: true });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "requests.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
};
