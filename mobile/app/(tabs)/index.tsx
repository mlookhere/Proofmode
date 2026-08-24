import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewToken } from "react-native";
import { useFocusEffect } from "expo-router";
import type { FeedPost } from "@/domain";
import { posts as previewPosts } from "@/data";
import { fetchFeedPage, type FeedCursor } from "@/api/feed";
import { FeedCard } from "@/components/feed-card";
import { isSupabaseConfigured } from "@/lib/supabase";
import { colors } from "@/theme";
import { Screen } from "@/components/ui";

const TAB_BAR_HEIGHT = 76;
const HEADER_HEIGHT = 64;

function appendUnique(current: readonly FeedPost[], incoming: readonly FeedPost[]) {
  const ids = new Set(current.map((post) => post.id));
  return [...current, ...incoming.filter((post) => !ids.has(post.id))];
}

export default function Home() {
  const { height } = useWindowDimensions();
  const cardHeight = Math.max(560, height - TAB_BAR_HEIGHT - HEADER_HEIGHT);
  const [posts, setPosts] = useState<readonly FeedPost[]>(isSupabaseConfigured ? [] : previewPosts);
  const [nextCursor, setNextCursor] = useState<FeedCursor | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [feedFocused, setFeedFocused] = useState(false);
  const loadingMoreRef = useRef(false);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<FeedPost>[] }) => {
    const next = viewableItems.find((token) => token.isViewable && token.item?.media?.kind === "video")?.item?.id ?? null;
    setActivePostId(next);
  }).current;

  useFocusEffect(useCallback(() => {
    setFeedFocused(true);
    return () => setFeedFocused(false);
  }, []));

  const load = useCallback(async (refresh = false) => {
    if (!isSupabaseConfigured || (refresh && loadingMoreRef.current)) return;

    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    setLoadMoreError(false);

    try {
      const page = await fetchFeedPage();
      setPosts(page.items);
      setNextCursor(page.nextCursor);
    } catch {
      setError("Could not load the live feed.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!isSupabaseConfigured || !nextCursor || loadingMoreRef.current || isLoading || isRefreshing) return;

    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(false);

    try {
      const page = await fetchFeedPage(nextCursor);
      setPosts((current) => appendUnique(current, page.items));
      setNextCursor(page.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [isLoading, isRefreshing, nextCursor]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <Text style={styles.brand}>
          PROOF<Text style={styles.brandAccent}>MODE</Text>
        </Text>
        <View style={styles.tabs}>
          <Text style={styles.muted}>Following</Text>
          <Text style={styles.active}>For You</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.state}><ActivityIndicator color={colors.hot} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.retry}>RETRY</Text></Pressable>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.state}><Text style={styles.stateText}>No public proofs yet.</Text></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          pagingEnabled
          refreshing={isRefreshing}
          onRefresh={isSupabaseConfigured ? () => void load(true) : undefined}
          onEndReached={isSupabaseConfigured ? () => void loadMore() : undefined}
          onEndReachedThreshold={0.5}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footer}><ActivityIndicator color={colors.hot} /></View>
            ) : loadMoreError ? (
              <Pressable accessibilityRole="button" style={styles.footer} onPress={() => void loadMore()}>
                <Text style={styles.retry}>RETRY MORE</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => <FeedCard item={item} height={cardHeight} active={feedFocused && activePostId === item.id} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { height: HEADER_HEIGHT, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: colors.text, fontSize: 19, fontWeight: "900" },
  brandAccent: { color: colors.hot },
  tabs: { flexDirection: "row", gap: 18 },
  muted: { color: colors.muted, fontWeight: "800" },
  active: { color: colors.text, fontWeight: "900", borderBottomColor: colors.hot, borderBottomWidth: 2, paddingBottom: 5 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  stateText: { color: colors.muted, textAlign: "center" },
  retry: { color: colors.hot, fontWeight: "900", letterSpacing: 1 },
  footer: { minHeight: 72, alignItems: "center", justifyContent: "center" },
});
