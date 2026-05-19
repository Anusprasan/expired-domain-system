const SESSION_DURATION_MS = 30 * 60 * 1000;

export const saveSession = ({ token, user }) => {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem(
    "sessionExpiresAt",
    String(Date.now() + SESSION_DURATION_MS)
  );
  window.dispatchEvent(new Event("sessionChange"));
};

export const clearSession = (notify = true) => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("sessionExpiresAt");

  if (notify) {
    window.dispatchEvent(new Event("sessionChange"));
  }
};

export const getSessionExpiresAt = () =>
  Number(localStorage.getItem("sessionExpiresAt") || 0);

export const hasSessionExpired = () => {
  const expiresAt = getSessionExpiresAt();

  return Boolean(expiresAt && Date.now() > expiresAt);
};

export const getSessionUser = () => {
  const expiresAt = getSessionExpiresAt();

  if (!expiresAt || Date.now() > expiresAt) {
    clearSession(false);
    return null;
  }

  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    clearSession(false);
    return null;
  }
};

export const getSessionToken = () => {
  const user = getSessionUser();

  return user ? localStorage.getItem("token") : null;
};
