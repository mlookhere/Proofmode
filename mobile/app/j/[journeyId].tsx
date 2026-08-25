import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator } from "react-native";
import { Screen } from "@/components/ui";
import { captureCanonicalOpen } from "@/sharing";
import { colors } from "@/theme";

export default function CanonicalJourneyLink() {
  const router = useRouter();
  const { journeyId, src } = useLocalSearchParams<{ journeyId: string; src?: string }>();

  useEffect(() => {
    if (!journeyId) return;
    const path = `/j/${journeyId}`;
    void captureCanonicalOpen({ source: src || "journey_link", path }).finally(() => {
      router.replace({ pathname: "/journey/[id]", params: { id: journeyId, src: src || "journey_link" } });
    });
  }, [journeyId, router, src]);

  return <Screen contentStyle={{ flexGrow: 1, justifyContent: "center" }}><ActivityIndicator color={colors.hot} /></Screen>;
}
