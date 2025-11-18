let BASE_URL = "http://localhost:5000";
try {
  const Constants = require('expo-constants');
  const dbg = Constants.manifest && (Constants.manifest.debuggerHost || Constants.manifest.packagerOpts && Constants.manifest.packagerOpts.host);
  if (dbg && typeof dbg === 'string') {
    const host = dbg.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      BASE_URL = `http://${host}:5000`;
    }
  }
} catch (_e) {

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

export const geocodeApi = async (query) => {
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(`${BASE_URL}/api/geocode?query=${q}`);
    if (!res.ok) throw new Error('Geocode failed');
    return await res.json();
  } catch (err) {
    console.error('geocodeApi error:', err);
    return { suggestions: [] };
  }
};

export const getDirectionsApi = async (fromLonLat, toLonLat, profiles = ['driving','walking'], mapFor, extraParams = '') => {
  try {
    const profilesParam = profiles.join(',');
    const mapForParam = mapFor ? `&mapFor=${encodeURIComponent(mapFor)}` : '';
      const res = await fetch(`${BASE_URL}/api/directions?from=${fromLonLat}&to=${toLonLat}&profiles=${profilesParam}${mapForParam}${extraParams}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Directions failed');
    }
    return await res.json();
  } catch (err) {
    console.error('getDirectionsApi error:', err);
    return { routes: [], mapImage: null };
  }
};

export const getMapboxTokenApi = async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/mapbox-token`);
    if (!res.ok) return null;
    const j = await res.json();
    return j.token || null;
  } catch (err) {
    console.error('getMapboxTokenApi error:', err);
    return null;
  }
};

export const getBusDirectionsApi = async (fromLatLon, toLatLon, date, time) => {
  try {
    const fromParts = fromLatLon.split(',').map(Number);
    const toParts = toLatLon.split(',').map(Number);
    const from = `${fromParts[1]},${fromParts[0]}`;
    const to = `${toParts[1]},${toParts[0]}`;
    let url = `${BASE_URL}/api/bus-directions?from=${from}&to=${to}`;
    if (date) url += `&date=${date}`;
    if (time) url += `&time=${time}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Bus directions failed');
    }
    return await res.json();
  } catch (err) {
    console.error('getBusDirectionsApi error:', err);
    return { routes: [] };
  }
};
