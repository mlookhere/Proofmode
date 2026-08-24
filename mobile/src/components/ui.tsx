import type { PropsWithChildren, ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing, typography } from "@/theme";

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function Screen({ children, scroll = true, contentStyle }: ScreenProps) {
  if (!scroll) {
    return <SafeAreaView style={styles.safe}>{children}</SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, contentStyle]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function SectionLabel({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

export function Pill({ children }: PropsWithChildren) {
  return <Text style={styles.pill}>{children}</Text>;
}

type PrimaryButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function PrimaryButton({ children, onPress, style, textStyle }: PrimaryButtonProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.primaryButton, style]}>
      <Text style={[styles.primaryButtonText, textStyle]}>{children}</Text>
    </Pressable>
  );
}

export function Surface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.hot,
    marginTop: spacing.md,
  },
  sectionLabel: {
    ...typography.eyebrow,
    color: colors.muted,
  },
  pill: {
    color: colors.text,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 10,
    overflow: "hidden",
    backgroundColor: colors.panel,
    fontWeight: "800",
  },
  primaryButton: {
    backgroundColor: colors.hot,
    borderRadius: radius.pill,
    padding: 13,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.bg,
    fontWeight: "900",
  },
  surface: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
});
