import type { ChallengeTemplate, FeedPost, PostMode } from "@/domain";

export const posts: readonly FeedPost[] = [
  { id: "1", userId: "preview-kyle", kind: "fail", day: "DAY 19", user: "Kyle", handle: "@kylelifts", challengeId: null, challengeSlug: null, challenge: "Road to 275", value: "275", caption: "275 said absolutely not. Posting it anyway. Tomorrow gets another vote.", accent: "#ff6a77", reactions: 18_400, comments: 1_200, viewerFollows: false, viewerReaction: null, action: "RUN IT BACK" },
  { id: "2", userId: "preview-maya", kind: "proof", day: "DAY 63", user: "Maya", handle: "@mayamoves", challengeId: null, challengeSlug: null, challenge: "Run 1 Mile", value: "1.0 MI", caption: "Rain tried. Streak stayed.", accent: "#d7ff3f", reactions: 42_800, comments: 2_700, viewerFollows: false, viewerReaction: null, action: "TRY THIS" },
  { id: "3", userId: "preview-noah", kind: "chaos", day: "DAY 4", user: "Noah", handle: "@noahcooksbadly", challengeId: null, challengeSlug: null, challenge: "Cook at Home", value: "🔥🍳", caption: "Smoke alarm: 1. Me: 0. Meal somehow edible.", accent: "#ffb55e", reactions: 67_100, comments: 4_100, viewerFollows: false, viewerReaction: null, action: "JOIN CHAOS" },
  { id: "4", userId: "preview-tori", kind: "comeback", day: "RESET #3", user: "Tori", handle: "@torirestarts", challengeId: null, challengeSlug: null, challenge: "45 Minute Lock-In", value: "45:00", caption: "Missed two days. Did not delete the app. Back at the desk.", accent: "#84a8ff", reactions: 31_600, comments: 3_400, viewerFollows: false, viewerReaction: null, action: "FOLLOW" },
];

export const templates: readonly ChallengeTemplate[] = [
  { id: "run-mile", emoji: "🏃", title: "RUN 1 MILE", promise: "One mile. Every day. No overthinking.", duration: "7 DAYS" },
  { id: "bad-cooking", emoji: "🔥", title: "COOK WITHOUT PANICKING", promise: "Try a recipe. Success and failure both make the feed.", duration: "7 DAYS" },
  { id: "ship-daily", emoji: "🚀", title: "SHIP ONE THING", promise: "Make something real every day.", duration: "14 DAYS" },
  { id: "touch-grass", emoji: "🌱", title: "TOUCH GRASS", promise: "Actually go outside once a day.", duration: "7 DAYS" },
  { id: "write-500", emoji: "⌨️", title: "WRITE 500 WORDS", promise: "Make the blank page lose.", duration: "14 DAYS" },
  { id: "sales-20", emoji: "📞", title: "20 SALES CALLS", promise: "Do the reps. Keep private info private.", duration: "7 DAYS" },
];

export const postModes: readonly PostMode[] = [
  { icon: "✓", title: "proof", help: "I did the thing." },
  { icon: "×", title: "fail", help: "It went badly. Post it anyway." },
  { icon: "…", title: "almost", help: "Close enough to make tomorrow interesting." },
  { icon: "↗", title: "comeback", help: "I disappeared. I came back." },
  { icon: "↑", title: "pr", help: "A new personal best." },
  { icon: "↻", title: "reset", help: "New attempt. Better chapter." },
];

export const exploreCategories = [
  "💪 Get fit",
  "😂 Something stupid",
  "🚀 Build",
  "🎨 Create",
  "🌱 Outside",
  "🎲 Surprise me",
] as const;
