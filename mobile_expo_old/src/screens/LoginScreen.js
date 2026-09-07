import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { Button, Screen } from "../components/ui";
import { colors, spacing } from "../lib/theme";

export default function LoginScreen() {
  const { login, submit2FA } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [requires2fa, setRequires2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      if (requires2fa) {
        await submit2FA(email, code);
      } else {
        const result = await login(email, password);
        if (result.requires2fa) setRequires2fa(true);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={styles.title}>FleetIntel</Text>
        <Text style={styles.subtitle}>{requires2fa ? "Enter your 2FA code" : "Sign in"}</Text>

        {!requires2fa && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              testID="login-email"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              testID="login-password"
            />
          </>
        )}

        {requires2fa && (
          <TextInput
            style={styles.input}
            placeholder="6-digit code or recovery code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            value={code}
            onChangeText={setCode}
            testID="login-2fa-code"
          />
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Button
          title={requires2fa ? "Verify" : "Sign in"}
          onPress={handleSubmit}
          loading={loading}
          disabled={requires2fa ? !code : !email || !password}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "center", padding: spacing.xl },
  title: { fontSize: 32, fontWeight: "800", color: colors.text, marginBottom: spacing.xs },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.xl },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.md,
    color: colors.text, marginBottom: spacing.md, fontSize: 15,
  },
  error: { color: colors.danger, marginBottom: spacing.md, fontSize: 13 },
});
