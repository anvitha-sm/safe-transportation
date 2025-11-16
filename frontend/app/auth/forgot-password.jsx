import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { forgotPasswordApi, resetPasswordApi } from "../../api/api";
import { colors } from "../theme";

export default function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  const requestPasswordReset = async () => {
    setErrors({});

    if (!email) {
      setErrors({ form: "Email is required" });
      return;
    }

    setLoading(true);

    try {
      console.log("Requesting password reset for email:", email);
      const res = await forgotPasswordApi(email);
      console.log("Reset request response:", res);
      
      Alert.alert("Success", res.message || "Reset instructions sent to your email");
      setStep(2);
    } catch (error) {
      const errorMessage = error.message || "Failed to request password reset";
      setErrors({ form: errorMessage });
      console.error("Request reset error:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setErrors({});

    if (!newPassword || !confirmPassword) {
      setErrors({ form: "Both password fields are required" });
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrors({ form: "Passwords do not match" });
      return;
    }

    if (newPassword.length < 6) {
      setErrors({ form: "Password must be at least 6 characters" });
      return;
    }

    setLoading(true);

    try {
      console.log("Resetting password for email:", email);
      const res = await resetPasswordApi(email, newPassword);
      console.log("Reset response:", res);
      
      Alert.alert("Success", "Password reset successfully! Redirecting to login...");
      setTimeout(() => {
        router.push("/auth/login");
      }, 1500);
    } catch (error) {
      const errorMessage = error.message || "Failed to reset password";
      setErrors({ form: errorMessage });
      console.error("Reset password error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
      <View style={styles.box}>
        <Text style={styles.title}>Reset Password</Text>

        {errors.form && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errors.form}</Text>
          </View>
        )}

        {step === 1 ? (
          <>
            <Text style={styles.stepText}>Step 1 of 2: Verify your email</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address</Text>
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
                placeholder="Enter your email"
              />
              {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
            </View>

            <TouchableOpacity 
              style={[styles.button, loading && styles.buttonDisabled]} 
              onPress={requestPasswordReset}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? "Sending..." : "Send Reset Email"}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.stepText}>Step 2 of 2: Create new password</Text>
            
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>Email: <Text style={styles.emailText}>{email}</Text></Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={(value) => {
                  setNewPassword(value);
                  validateField("password", value);
                }}
                secureTextEntry
                editable={!loading}
                placeholder="Enter new password"
              />
              {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!loading}
                placeholder="Confirm new password"
              />
            </View>

            <TouchableOpacity 
              style={[styles.button, loading && styles.buttonDisabled]} 
              onPress={resetPassword}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? "Resetting..." : "Reset Password"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setStep(1)}
              disabled={loading}
            >
              <Text style={styles.secondaryText}>Back to step 1</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/auth/login")}
          disabled={loading}
        >
          <Text style={styles.secondaryText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginBottom: 12,
    color: colors.primaryDark,
  },

  stepText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 20,
    fontStyle: "italic",
  },

  infoBox: {
    backgroundColor: colors.gradientOverlay,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primaryDark,
  },

  infoText: {
    fontSize: 14,
    color: colors.primaryDark,
    fontWeight: "600",
  },

  emailText: {
    color: colors.negative,
    fontWeight: "700",
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

