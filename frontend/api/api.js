const BASE_URL = "http://localhost:5000";

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
