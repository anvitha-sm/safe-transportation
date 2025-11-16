import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Link } from "expo-router";
import { colors } from "./theme";

export default function Index() {
  return (
    <View style={styles.container}>
      <View style={styles.gradientOverlay} />
      
      <View style={styles.headerSection}>
        <Text style={styles.title}>Safe Transportation</Text>
        <Text style={styles.subtitle}>Your journey, our priority</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Link href="/auth/login" asChild>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Login</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/auth/create-account" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Create Account</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: colors.bg,
  },

  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
    backgroundColor: colors.gradientOverlay,
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
  },

  headerSection: {
    alignItems: "center",
    marginBottom: 80,
    zIndex: 10,
  },

  title: {
    fontSize: 38,
    fontWeight: "800",
    marginBottom: 8,
    color: colors.primaryDark,
    textAlign: "center",
  },

  subtitle: {
    fontSize: 16,
    color: colors.subtitle,
    fontWeight: "500",
    textAlign: "center",
  },

  buttonContainer: {
    width: "100%",
    zIndex: 10,
  },

  primaryButton: {
    width: "100%",
    padding: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginBottom: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },

  secondaryButton: {
    width: "100%",
    padding: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginBottom: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },

  tertiaryButton: {
    width: "100%",
    padding: 16,
    backgroundColor: colors.buttonPink,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.subtitle,
    marginBottom: 14,
  },

  tertiaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.negative,
    textAlign: "center",
  },
});
