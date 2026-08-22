import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Eyebrow, PrimaryButton, Screen } from "@/components/ui";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme";

type Mode = "sign-in" | "sign-up";

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const client = requireSupabase();
      const result = mode === "sign-in"
        ? await client.auth.signInWithPassword({ email: normalizedEmail, password })
        : await client.auth.signUp({ email: normalizedEmail, password });

      if (result.error) throw result.error;

      if (result.data.session) {
        router.replace("/(tabs)/you");
        return;
      }

      setMessage("Check your email to confirm your account, then sign in.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <Screen contentStyle={styles.centered}>
        <Eyebrow>BACKEND NOT CONFIGURED</Eyebrow>
        <Text style={styles.title}>AUTH IS READY.</Text>
        <Text style={styles.copy}>Add the Supabase URL and publishable key to the mobile environment before testing sign-in.</Text>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen contentStyle={styles.centered}>
        <Eyebrow>{mode === "sign-in" ? "WELCOME BACK" : "MAKE IT REAL"}</Eyebrow>
        <Text style={styles.title}>{mode === "sign-in" ? "SIGN IN." : "JOIN PROOFMODE."}</Text>
        <Text style={styles.copy}>Your feed stays public. An account is only required when you want to post, join, or keep your own proof history.</Text>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}

          <PrimaryButton onPress={isSubmitting ? undefined : submit}>
            {isSubmitting ? <ActivityIndicator color={colors.bg} /> : mode === "sign-in" ? "SIGN IN" : "CREATE ACCOUNT"}
          </PrimaryButton>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setMessage(null);
          }}
        >
          <Text style={styles.switch}>{mode === "sign-in" ? "NEW HERE? CREATE AN ACCOUNT" : "ALREADY HAVE AN ACCOUNT? SIGN IN"}</Text>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: "center", flexGrow: 1 },
  title: { color: colors.text, fontSize: 44, lineHeight: 42, fontWeight: "900", letterSpacing: -2.5, marginTop: spacing.sm },
  copy: { color: colors.muted, lineHeight: 22, marginTop: spacing.md },
  form: { gap: spacing.md, marginTop: spacing.xl },
  input: { color: colors.text, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16 },
  error: { color: colors.danger, lineHeight: 20 },
  success: { color: colors.hot, lineHeight: 20 },
  switch: { color: colors.text, textAlign: "center", fontSize: 11, fontWeight: "900", letterSpacing: 0.7, marginTop: spacing.xl },
});
