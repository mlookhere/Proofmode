import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ChallengeTemplate } from "@/domain";
import { exploreCategories, templates as previewTemplates } from "@/data";
import { fetchTemplates } from "@/api/templates";
import { isSupabaseConfigured } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme";
import { Eyebrow, Pill, PrimaryButton, Screen, SectionLabel, Surface } from "@/components/ui";

export default function Explore() {
  const [templates, setTemplates] = useState<readonly ChallengeTemplate[]>(isSupabaseConfigured ? [] : previewTemplates);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setIsLoading(true);
    setError(null);

    try {
      setTemplates(await fetchTemplates());
    } catch {
      setError("Could not load challenges.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      <Eyebrow>FIND SOMETHING WORTH TRYING</Eyebrow>
      <Text style={styles.h1}>WHAT ARE YOU{"\n"}FEELING?</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {exploreCategories.map((category) => <Pill key={category}>{category}</Pill>)}
      </ScrollView>

      <SectionLabel style={styles.section}>TRENDING NOW</SectionLabel>
      {isLoading ? <ActivityIndicator color={colors.hot} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {error ? <PrimaryButton onPress={() => void load()} style={styles.retry}>RETRY</PrimaryButton> : null}
      {!isLoading && !error && templates.length === 0 ? <Text style={styles.empty}>No challenges are published yet.</Text> : null}

      {!error && templates.map((template) => (
        <Surface key={template.id} style={styles.card}>
          <Text style={styles.emoji}>{template.emoji}</Text>
          <Text style={styles.title}>{template.title}</Text>
          <Text style={styles.promise}>{template.promise}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>{template.duration}</Text>
          </View>
          <PrimaryButton>JOIN →</PrimaryButton>
        </Surface>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 50, fontWeight: "900", letterSpacing: -3, lineHeight: 46, marginTop: 13 },
  pills: { gap: spacing.sm, paddingVertical: 20 },
  section: { marginBottom: 10 },
  loader: { marginVertical: spacing.xl },
  error: { color: colors.danger, marginBottom: spacing.md },
  retry: { alignSelf: "stretch", marginBottom: spacing.lg },
  empty: { color: colors.muted, marginVertical: spacing.lg },
  card: { padding: 19, marginBottom: spacing.md },
  emoji: { fontSize: 34 },
  title: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -1.2, marginTop: spacing.lg },
  promise: { color: colors.muted, lineHeight: 20, marginTop: spacing.xs },
  meta: { flexDirection: "row", gap: spacing.sm, marginVertical: 16 },
  metaText: { color: colors.text, backgroundColor: colors.panel2, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, fontSize: 10, fontWeight: "900", overflow: "hidden" },
});
