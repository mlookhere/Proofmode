import { StyleSheet, Text } from "react-native";
import { useAuth } from "@/auth/session";
import { AuthRequired } from "@/components/auth-required";
import { Eyebrow, Screen, Surface } from "@/components/ui";
import { colors, spacing } from "@/theme";

export default function Crews() {
  const { session, isLoading } = useAuth();

  if (isLoading) return <Screen />;
  if (!session) return <AuthRequired title="YOUR CREWS LIVE HERE." message="Sign in to see private crews, team streaks, and challenges tied to your account." />;

  return (
    <Screen>
      <Eyebrow>YOUR ROOMS</Eyebrow>
      <Text style={styles.h1}>CREWS.</Text>
      <Text style={styles.lede}>Challenge groups, team streaks, and friendly pressure live here.</Text>
      <Surface style={styles.empty}>
        <Text style={styles.emptyTitle}>YOUR CREWS WILL APPEAR HERE.</Text>
        <Text style={styles.emptyCopy}>Once your first crew is active, it will show up here.</Text>
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 60, fontWeight: "900", letterSpacing: -4, marginTop: spacing.sm },
  lede: { color: colors.muted, lineHeight: 21, marginBottom: 20 },
  empty: { padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.7 },
  emptyCopy: { color: colors.muted, lineHeight: 21, marginTop: spacing.sm },
});
