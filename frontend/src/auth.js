const USER_KEY = "telemetryx_user";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  return Boolean(getUser());
}

export function loginWithCredentials(username, password) {
  const name = (username || "").trim();
  const pass = (password || "").trim();
  if (!name || !pass) {
    throw new Error("Username and password are required.");
  }
  setUser({ login: name, name, provider: "local" });
  return getUser();
}

export function signUpWithCredentials(username, password, confirmPassword) {
  const name = (username || "").trim();
  const pass = (password || "").trim();
  const confirm = (confirmPassword || "").trim();
  if (!name || !pass) {
    throw new Error("Username and password are required.");
  }
  if (pass !== confirm) {
    throw new Error("Passwords do not match.");
  }
  if (pass.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  setUser({ login: name, name, provider: "local" });
  return getUser();
}

export function loginWithGitHub() {
  const oauthUrl =
    import.meta.env.VITE_GITHUB_OAUTH_URL || `${API_BASE}/oauth/github`;
  window.location.href = oauthUrl;
}

export async function logoutUser() {
  clearUser();
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // ignore network errors on logout
  }
}
