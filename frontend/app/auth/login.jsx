import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loginApi } from "../../api/api";
import { colors } from "../theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);


  const validateField = (field, value) => {
    const newErrors = { ...errors };
    
    switch (field) {
      case "email":
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (value && !emailRegex.test(value)) {
          newErrors.email = "Invalid email address";
        } else {
          delete newErrors.email;
        }
        break;
      case "password":
        if (value && value.length < 6) {
          newErrors.password = "Password must be at least 6 characters";
        } else {
          delete newErrors.password;
        }
        break;
      default:
        break;
    }
    
    setErrors(newErrors);
  };

  const login = async () => {

    setErrors({});

    if (!email || !password) {
      setErrors({ form: "All fields are required" });
      return;
    }

    if (password.length < 6) {
      setErrors({ form: "Password must be at least 6 characters" });
      return;
    }

    setLoading(true);

    try {
      console.log("Logging in with email:", email);
      const res = await loginApi({ email, password });
      console.log("Login response:", res);
      
      if (res.token && res.user) {

        await AsyncStorage.setItem("@user_token", res.token);
        await AsyncStorage.setItem("@user_data", JSON.stringify(res.user));
        
        Alert.alert("Success", "Logged in!");

        router.replace("/dashboard");
      }
    } catch (error) {
      const errorMessage = error.message || "Login failed";
      setErrors({ form: errorMessage });
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.box}>
        <Text style={styles.title}>Login</Text>

        {errors.form && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errors.form}</Text>
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              validateField("email", value);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
          {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              validateField("password", value);
            }}
            secureTextEntry
            editable={!loading}
          />
          {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={login}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Signing in..." : "Sign In"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/auth/create-account")}
          disabled={loading}
        >
          <Text style={styles.secondaryText}>
            Need an account? Create one
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/auth/forgot-password")}
          disabled={loading}
        >
          <Text style={styles.secondaryText}>
            Forgot Password?
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: colors.bg,
  },

  box: {
    width: "100%",
    padding: 28,
    borderRadius: 20,
    backgroundColor: colors.cardBg,
    elevation: 8,
    shadowColor: colors.negative,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 24,
    color: colors.primaryDark,
  },

  errorContainer: {
    backgroundColor: "#ffe0f0",
    borderLeftWidth: 4,
    borderLeftColor: colors.negative,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },

  errorText: {
    color: colors.negative,
    fontSize: 14,
    fontWeight: "600",
  },

  fieldError: {
    color: colors.negative,
    fontSize: 12,
    marginTop: 6,
    fontWeight: "500",
  },

  formGroup: {
    marginBottom: 18,
  },

  label: {
    fontSize: 15,
    marginBottom: 8,
    fontWeight: "700",
    color: colors.primaryDark,
  },

  input: {
    borderWidth: 2,
    borderColor: colors.gradientOverlay,
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    backgroundColor: colors.offWhite,
    color: colors.textDark,
  },

  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 10,
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  buttonDisabled: {
    backgroundColor: "#d4a5d1",
    opacity: 0.7,
  },

  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },

  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
  },

  secondaryText: {
    textAlign: "center",
    fontSize: 14,
    color: colors.negative,
    fontWeight: "600",
  },
});

