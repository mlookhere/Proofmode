import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { buildAuthRedirectUrl } from "@/auth/deep-link";
import { useAuth } from "@/auth/session";
import { Eyebrow, PrimaryButton, Screen } from "@/components/ui";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme";

export default function AuthScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { session, authError, clearAuthError } = useAuth();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace(returnTo || "/(tabs)/you");
  }, [router, session]);

  async function sendMagicLink() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    clearAuthError();

    try {
      const { error: signInError } = await requireSupabase().auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: buildAuthRedirectUrl(returnTo) },
      });
      if (signInError) throw signInError;
      setMessage("Check your email for your ProofMode sign-in link.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send sign-in link.");
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
        <Eyebrow>WELCOME TO PROOFMODE</Eyebrow>
        <Text style={styles.title}>SIGN IN.</Text>
        <Text style={styles.copy}>Enter your email and we’ll send one secure sign-in link. New here? The same link creates your account.</Text>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={isSubmitting ? undefined : sendMagicLink}
            returnKeyType="send"
            style={styles.input}
          />

          {error || authError ? <Text style={styles.error}>{error ?? authError}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}

          <PrimaryButton onPress={isSubmitting ? undefined : sendMagicLink}>
            {isSubmitting ? <ActivityIndicator color={colors.bg} /> : "EMAIL ME A SIGN-IN LINK"}
          </PrimaryButton>
        </View>
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
});
