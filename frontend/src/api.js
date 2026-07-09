export async function apiFetch(apiBase, path, options = {}) {
  const base = apiBase.replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, options);
}