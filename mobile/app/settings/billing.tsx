import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/session";
import {
  fetchServerEntitlements,
  loadBillingPackages,
  purchaseBillingPackage,
  restorePurchases,
  type BillingPackage,
  type EntitlementState,
} from "@/billing/revenuecat";
import { PrimaryButton, Screen, Surface } from "@/components/ui";
import { publicEnv } from "@/config/env";
import { colors, radius, spacing } from "@/theme";

const emptyEntitlements: EntitlementState = {
  plan: "free",
  proof_plus: false,
  creator: false,
  black: false,
  management_url: null,
};

function tierName(tier: BillingPackage["tier"]) {
  return tier === "creator" ? "CREATOR" : "PROOF+";
}

export default function BillingSettings() {
  const { session } = useAuth();
  const [packages, setPackages] = useState<readonly BillingPackage[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementState>(emptyEntitlements);
  const [loading, setLoading] = useState(true);
  const [busyPackage, setBusyPackage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [nextPackages, nextEntitlements] = await Promise.all([
        loadBillingPackages(session.user.id),
        fetchServerEntitlements(),
      ]);
      setPackages(nextPackages);
      setEntitlements(nextEntitlements);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load subscriptions.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const planName = useMemo(() => {
    if (entitlements.black) return "BLACK";
    if (entitlements.creator) return "CREATOR";
    if (entitlements.proof_plus) return "PROOF+";
    return "FREE";
  }, [entitlements]);

  async function purchase(item: BillingPackage) {
    if (!session || busyPackage || restoring) return;
    setBusyPackage(item.identifier);
    setError(null);
    setMessage(null);
    try {
      const customerInfo = await purchaseBillingPackage(session.user.id, item);
      if (!customerInfo) return;
      const next = await fetchServerEntitlements();
      setEntitlements(next);
      setMessage(`${tierName(item.tier)} is active.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Purchase could not be completed.");
    } finally {
      setBusyPackage(null);
    }
  }

  async function restore() {
    if (!session || restoring || busyPackage) return;
    setRestoring(true);
    setError(null);
    setMessage(null);
    try {
      await restorePurchases(session.user.id);
      setEntitlements(await fetchServerEntitlements());
      setMessage("Purchases restored.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Purchases could not be restored.");
    } finally {
      setRestoring(false);
    }
  }

  async function manage() {
    const url = entitlements.management_url || `${publicEnv.appUrl}/dashboard`;
    await Linking.openURL(url);
  }

  if (!session) return <Screen />;

  return (
    <Screen>
      <Text style={styles.eyebrow}>MEMBERSHIP</Text>
      <Text style={styles.title}>POWER IS OPTIONAL.</Text>
      <Text style={styles.lede}>ProofMode stays useful for free. Paid plans add identity, convenience, and creator tools. They never change Proof Score, verification, or earned history.</Text>

      <Surface style={styles.current}>
        <Text style={styles.label}>CURRENT PLAN</Text>
        <Text style={styles.currentPlan}>{planName}</Text>
        {entitlements.black ? <Text style={styles.muted}>Invitation-only. Black inherits Creator and Proof+ access.</Text> : null}
      </Surface>

      {loading ? <ActivityIndicator color={colors.hot} style={styles.spinner} /> : null}
      {!loading && packages.length === 0 && !entitlements.black ? (
        <Text style={styles.muted}>Purchases are not configured for this build yet.</Text>
      ) : null}

      <View style={styles.packageList}>
        {packages.map((item) => (
          <Surface key={`${item.identifier}:${item.revenueCatPackage.product.identifier}`} style={styles.packageCard}>
            <Text style={styles.label}>{tierName(item.tier)}</Text>
            <Text style={styles.packageTitle}>{item.title}</Text>
            <Text style={styles.price}>{item.priceString}</Text>
            {item.period ? <Text style={styles.muted}>{item.period}</Text> : null}
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            <PrimaryButton onPress={() => void purchase(item)}>
              {busyPackage === item.identifier ? "WORKING…" : `CHOOSE ${tierName(item.tier)}`}
            </PrimaryButton>
          </Surface>
        ))}
      </View>

      <Surface style={styles.blackCard}>
        <Text style={styles.label}>PROOFMODE BLACK</Text>
        <Text style={styles.packageTitle}>INVITATION-ONLY</Text>
        <Text style={styles.muted}>There is no public purchase or application flow.</Text>
      </Surface>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => void restore()}>
          <Text style={styles.link}>{restoring ? "RESTORING…" : "RESTORE PURCHASES"}</Text>
        </Pressable>
        {(entitlements.proof_plus || entitlements.creator || entitlements.black) ? (
          <Pressable accessibilityRole="button" onPress={() => void manage()}>
            <Text style={styles.link}>MANAGE SUBSCRIPTION</Text>
          </Pressable>
        ) : null}
      </View>

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 1.3, marginTop: spacing.md },
  title: { color: colors.text, fontSize: 36, lineHeight: 38, fontWeight: "900", letterSpacing: -1.5, marginTop: spacing.sm },
  lede: { color: colors.muted, lineHeight: 21, marginTop: spacing.md },
  current: { padding: spacing.lg, marginTop: spacing.xl },
  label: { color: colors.hot, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  currentPlan: { color: colors.text, fontSize: 34, fontWeight: "900", marginTop: 5 },
  muted: { color: colors.muted, lineHeight: 19, marginTop: 5 },
  spinner: { marginVertical: spacing.xl },
  packageList: { gap: spacing.md, marginTop: spacing.lg },
  packageCard: { padding: spacing.lg, gap: spacing.sm },
  packageTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  price: { color: colors.text, fontSize: 30, fontWeight: "900" },
  description: { color: colors.muted, lineHeight: 19, marginBottom: spacing.sm },
  blackCard: { padding: spacing.lg, marginTop: spacing.md, borderStyle: "dashed" },
  actions: { gap: spacing.lg, alignItems: "center", marginTop: spacing.xl },
  link: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, padding: 8 },
  success: { color: colors.text, backgroundColor: colors.panel2, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.lg },
});
