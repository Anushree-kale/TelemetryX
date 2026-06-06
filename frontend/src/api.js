const STORAGE_KEY = "telemetryx_api_key";

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_API_KEY || "";
}

export function setApiKey(value) {
  const trimmed = (value || "").trim();
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function apiHeaders(extra = {}) {
  const headers = { ...extra };
  const key = getApiKey();
  if (key) {
    headers["X-API-Key"] = key;
  }
  return headers;
}

export async function apiFetch(apiBase, path, options = {}) {
  const base = apiBase.replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...options,
    headers: apiHeaders(options.headers || {}),
  });
}
