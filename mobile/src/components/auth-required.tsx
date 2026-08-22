import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Eyebrow, PrimaryButton, Screen } from "@/components/ui";
import { colors, spacing } from "@/theme";

export function AuthRequired({ title, message }: { title: string; message: string }) {
  const router = useRouter();

  return (
    <Screen contentStyle={styles.content}>
      <Eyebrow>PROOFMODE ACCOUNT</Eyebrow>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <PrimaryButton onPress={() => router.push("/auth")}>SIGN IN OR CREATE ACCOUNT</PrimaryButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: "center", flexGrow: 1 },
  title: { color: colors.text, fontSize: 42, lineHeight: 40, fontWeight: "900", letterSpacing: -2.5, marginTop: spacing.sm },
  message: { color: colors.muted, fontSize: 16, lineHeight: 23, marginVertical: spacing.lg },
});
