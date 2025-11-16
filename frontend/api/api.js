// Default to localhost, but when running inside Expo on a device/emulator
// detect the dev host and use its IP so the app can reach the local backend.
let BASE_URL = "http://localhost:5000";
try {
  // dynamic require so this file still works in environments without expo-constants
  // (e.g., server-side tools). If present, derive the machine IP from debuggerHost.
  const Constants = require('expo-constants');
  const dbg = Constants.manifest && (Constants.manifest.debuggerHost || Constants.manifest.packagerOpts && Constants.manifest.packagerOpts.host);
  if (dbg && typeof dbg === 'string') {
    const host = dbg.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      BASE_URL = `http://${host}:5000`;
    }
  }
} catch (_e) {
  // ignore when expo-constants not available
}
export { BASE_URL };

export const joinApi = async (data) => {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Registration failed");
    }

    return await res.json();
  } catch (error) {
    console.error("joinApi error:", error);
    throw error;
  }
};

export const loginApi = async (data) => {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Login failed");
    }

    return await res.json();
  } catch (error) {
    console.error("loginApi error:", error);
    throw error;
  }
};

export const forgotPasswordApi = async (email) => {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Password reset failed");
    }

    return await res.json();
  } catch (error) {
    console.error("forgotPasswordApi error:", error);
    throw error;
  }
};

export const resetPasswordApi = async (email, newPassword) => {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, newPassword }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Password reset failed");
    }

    return await res.json();
  } catch (error) {
    console.error("resetPasswordApi error:", error);
    throw error;
  }
};

export const getUserDataApi = async (userId) => {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/user/${userId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to fetch user data");
    }

    return await res.json();
  } catch (error) {
    console.error("getUserDataApi error:", error);
    throw error;
  }
};

export const updatePreferencesApi = async (userId, preferences) => {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/preferences/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to update preferences");
    }

    return await res.json();
  } catch (error) {
    console.error("updatePreferencesApi error:", error);
    throw error;
  }
};

export const addRouteFeedbackApi = async (userId, routeId, feedback, token) => {
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}/api/auth/user/${userId}/route/${routeId}/feedback`, {
      method: "POST",
      headers,
      body: JSON.stringify(feedback),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to submit feedback");
    }

    return await res.json();
  } catch (error) {
    console.error("addRouteFeedbackApi error:", error);
    throw error;
  }
};

export const createAlertApi = async (alert) => {
  try {
    const res = await fetch(`${BASE_URL}/api/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create alert');
    }
    return await res.json();
  } catch (err) {
    console.error('createAlertApi error:', err);
    throw err;
  }
};
