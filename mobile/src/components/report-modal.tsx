import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { reportReasons, submitReport, type ReportReason, type ReportTargetType } from "@/api/social";
import { colors, radius, spacing } from "@/theme";

type ReportModalProps = {
  visible: boolean;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
};

function reasonLabel(reason: ReportReason) {
  return reason.replaceAll("_", " ").toUpperCase();
}

export function ReportModal({ visible, targetType, targetId, onClose }: ReportModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function report(reason: ReportReason) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await submitReport(targetType, targetId, reason);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit report.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>REPORT {targetType.toUpperCase()}</Text>
            <Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.close}>CLOSE</Text></Pressable>
          </View>
          <Text style={styles.copy}>Choose the reason that best fits.</Text>
          <ScrollView contentContainerStyle={styles.reasons}>
            {reportReasons.map((reason) => (
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                key={reason}
                onPress={() => void report(reason)}
                style={styles.reason}
              >
                <Text style={styles.reasonText}>{reasonLabel(reason)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {isSubmitting ? <ActivityIndicator color={colors.hot} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  sheet: { maxHeight: "82%", backgroundColor: colors.panel, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderColor: colors.line, borderWidth: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: 20, fontWeight: "900" },
  close: { color: colors.hot, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  copy: { color: colors.muted, marginTop: spacing.sm, marginBottom: spacing.md },
  reasons: { gap: spacing.sm, paddingBottom: spacing.sm },
  reason: { backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13 },
  reasonText: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  error: { color: colors.danger, marginTop: spacing.md, lineHeight: 20 },
});
