import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator } from "react-native";
import { Screen } from "@/components/ui";
import { captureCanonicalOpen } from "@/sharing";
import { colors } from "@/theme";

export default function CanonicalDropLink() {
  const router = useRouter();
  const { slug, src, ref } = useLocalSearchParams<{ slug: string; src?: string; ref?: string }>();

  useEffect(() => {
    if (!slug) return;
    const path = `/c/${slug}`;
    void captureCanonicalOpen({ source: src || "drop_link", path, inviteCode: ref || null }).finally(() => {
      router.replace({ pathname: "/challenge/[slug]", params: { slug, src: src || "drop_link", ref: ref || "" } });
    });
  }, [ref, router, slug, src]);

  return <Screen contentStyle={{ flexGrow: 1, justifyContent: "center" }}><ActivityIndicator color={colors.hot} /></Screen>;
}
