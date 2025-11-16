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
import { joinApi } from "../../api/api";
import { colors } from "../theme";

export default function CreateAccount() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});

  const validateField = (field, value) => {
    const newErrors = { ...errors };
    switch (field) {
      case "username":
        if (value && value.length < 3) newErrors.username = "Username must be at least 3 characters";
        else delete newErrors.username;
        break;
      case "name":
        if (value && value.length < 3) newErrors.name = "Name must be at least 3 characters";
        else delete newErrors.name;
        break;
      case "password":
        if (value && value.length < 6) newErrors.password = "Password must be at least 6 characters";
        else delete newErrors.password;
        break;
      case "email":
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (value && !emailRegex.test(value)) newErrors.email = "Invalid email address";
        else delete newErrors.email;
        break;
      default:
        break;
    }
    setErrors(newErrors);
  };

  const createAccount = async () => {
    setErrors({});
    if (!username || !email || !name || !password || !confirmPassword) {
      setErrors({ form: "All fields are required" });
      return;
    }
    if (username.length < 3) {
      setErrors({ form: "Username must be at least 3 characters" });
      return;
    }
    if (name.length < 3) {
      setErrors({ form: "Name must be at least 3 characters" });
      return;
    }
    if (password !== confirmPassword) {
      setErrors({ form: "Passwords do not match" });
      return;
    }
    if (password.length < 6) {
      setErrors({ form: "Password is not at least 6 characters" });
      return;
    }

    const data = { username, email, name, password };
    try {
      const res = await joinApi(data);
      if (res.token && res.user) {
        await AsyncStorage.setItem("@user_token", res.token);
        await AsyncStorage.setItem("@user_data", JSON.stringify(res.user));
        Alert.alert("Success", "Account created!");
        router.replace("/dashboard");
      }
    } catch (error) {
      const errorMessage = error.message || "Failed to create account";
      setErrors({ form: errorMessage });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.box}>
        <Text style={[styles.title]}>Create Account</Text>

        {errors.form && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errors.form}</Text>
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={(value) => {
              setUsername(value);
              validateField("username", value);
            }}
            autoCapitalize="none"
          />
          {errors.username && <Text style={styles.fieldError}>{errors.username}</Text>}
        </View>

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
          />
          {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(value) => {
              setName(value);
              validateField("name", value);
            }}
          />
          {errors.name && <Text style={styles.fieldError}>{errors.name}</Text>}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            secureTextEntry
            onChangeText={(value) => {
              setPassword(value);
              validateField("password", value);
            }}
          />
          {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            secureTextEntry
            onChangeText={setConfirmPassword}
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={createAccount}>
          <Text style={styles.buttonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/auth/login")}
        >
          <Text style={styles.secondaryText}>Already have an account? Login</Text>
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
    marginBottom: 16,
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
