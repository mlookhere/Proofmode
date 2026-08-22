import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { colors } from "@/theme";

type TabIconProps = {
  symbol: string;
  color: ColorValue;
};

function TabIcon({ symbol, color }: TabIconProps) {
  return <Text style={{ color, fontSize: 20, fontWeight: "900" }}>{symbol}</Text>;
}

const sharedTabOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.hot,
  tabBarInactiveTintColor: colors.muted,
  tabBarStyle: { backgroundColor: "#0b0c0f", borderTopColor: colors.line, height: 76, paddingTop: 7 },
  tabBarLabelStyle: { fontWeight: "800" as const, paddingBottom: 6 },
};

export default function TabsLayout() {
  return (
    <Tabs screenOptions={sharedTabOptions}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <TabIcon symbol="▶" color={color} /> }} />
      <Tabs.Screen name="explore" options={{ title: "Explore", tabBarIcon: ({ color }) => <TabIcon symbol="⌕" color={color} /> }} />
      <Tabs.Screen name="create" options={{ title: "Post", tabBarIcon: ({ color }) => <TabIcon symbol="＋" color={color} /> }} />
      <Tabs.Screen name="crews" options={{ title: "Crews", tabBarIcon: ({ color }) => <TabIcon symbol="◉" color={color} /> }} />
      <Tabs.Screen name="you" options={{ title: "You", tabBarIcon: ({ color }) => <TabIcon symbol="P" color={color} /> }} />
    </Tabs>
  );
}
