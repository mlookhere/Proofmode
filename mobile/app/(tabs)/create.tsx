import { Pressable, StyleSheet, Text, View } from "react-native";
import { postModes } from "@/data";
import { colors, radius, spacing } from "@/theme";
import { Eyebrow, Screen } from "@/components/ui";
import { AuthRequired } from "@/components/auth-required";
import { useAuth } from "@/auth/session";

export default function Create() {
  const { session, isLoading } = useAuth();

  if (isLoading) return <Screen />;
  if (!session) return <AuthRequired title="POST YOUR PROOF." message="Sign in when you are ready to publish. Browsing stays open without an account." />;

  return (
    <Screen>
      <Eyebrow>POST WITHOUT PRETENDING</Eyebrow>
      <Text style={styles.h1}>WHAT{"\n"}HAPPENED?</Text>
      <Text style={styles.lede}>The camera flow branches by story type, but always returns to one fast publish screen.</Text>

      {postModes.map((mode) => (
        <Pressable key={mode.title} accessibilityRole="button" style={styles.mode}>
          <Text style={styles.icon}>{mode.icon}</Text>
          <View style={styles.modeCopy}>
            <Text style={styles.title}>{mode.title.toUpperCase()}</Text>
            <Text style={styles.help}>{mode.help}</Text>
          </View>
        </Pressable>
      ))}

      <Pressable accessibilityRole="button" style={styles.bored}>
        <Text style={styles.boredSmall}>NO CHALLENGE YET?</Text>
        <Text style={styles.boredTitle}>{"I'M BORED."}</Text>
        <Text style={styles.boredHelp}>Give me a challenge I can start right now.</Text>
        <Text style={styles.boredCta}>SURPRISE ME →</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 58, lineHeight: 52, fontWeight: "900", letterSpacing: -3.5, marginTop: 10 },
  lede: { color: colors.muted, lineHeight: 21, marginVertical: spacing.lg },
  mode: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 19, padding: 14, marginBottom: 9, flexDirection: "row", alignItems: "center", gap: 13 },
  modeCopy: { flex: 1 },
  icon: { width: 46, height: 46, textAlign: "center", textAlignVertical: "center", backgroundColor: colors.bg, borderRadius: 13, overflow: "hidden", color: colors.hot, fontSize: 23, fontWeight: "900", lineHeight: 46 },
  title: { color: colors.text, fontSize: 17, fontWeight: "900" },
  help: { color: colors.muted, marginTop: 3 },
  bored: { marginTop: spacing.md, borderRadius: radius.lg, padding: 22, backgroundColor: colors.hot },
  boredSmall: { color: colors.bg, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  boredTitle: { color: colors.bg, fontSize: 42, fontWeight: "900", letterSpacing: -2.5, marginTop: spacing.sm },
  boredHelp: { color: colors.bg, marginTop: 3, opacity: 0.8 },
  boredCta: { color: colors.bg, fontWeight: "900", marginTop: 22 },
});
