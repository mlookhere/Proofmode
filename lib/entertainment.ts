export type FeedPostKind = "proof" | "fail" | "almost" | "comeback" | "pr" | "chaos" | "bts" | "reset";

export type FeedPost = {
  id: string;
  kind: FeedPostKind;
  handle: string;
  displayName: string;
  avatar: string;
  challenge: string;
  dayLabel: string;
  caption: string;
  reactions: string;
  comments: string;
  action: string;
  visual: string;
  accent: string;
  journeyStep?: string;
};

export const feedKindLabels: Record<FeedPostKind, string> = {
  proof: "PROOF",
  fail: "FAIL",
  almost: "ALMOST",
  comeback: "COMEBACK",
  pr: "PR",
  chaos: "CHAOS",
  bts: "BEHIND THE SCENES",
  reset: "RESET",
};

export const demoFeed: FeedPost[] = [
  {
    id: "kyle-275-fail",
    kind: "fail",
    handle: "kylelifts",
    displayName: "Kyle",
    avatar: "K",
    challenge: "Road to 275",
    dayLabel: "DAY 19",
    caption: "275 said absolutely not. Posting it anyway. Tomorrow gets another vote.",
    reactions: "18.4K",
    comments: "1.2K",
    action: "RUN IT BACK",
    visual: "275",
    accent: "#ff7a86",
    journeyStep: "19 / 30",
  },
  {
    id: "maya-rain-run",
    kind: "proof",
    handle: "mayamoves",
    displayName: "Maya",
    avatar: "M",
    challenge: "Run 1 Mile",
    dayLabel: "DAY 63",
    caption: "Rain tried. Streak stayed.",
    reactions: "42.8K",
    comments: "2.7K",
    action: "TRY THIS",
    visual: "1.0 MI",
    accent: "#d7ff3f",
    journeyStep: "63 DAYS",
  },
  {
    id: "noah-cooking-chaos",
    kind: "chaos",
    handle: "noahcooksbadly",
    displayName: "Noah",
    avatar: "N",
    challenge: "Cook at Home",
    dayLabel: "DAY 4",
    caption: "Smoke alarm: 1. Me: 0. Meal somehow edible.",
    reactions: "67.1K",
    comments: "4.1K",
    action: "JOIN THE CHAOS",
    visual: "🔥🍳",
    accent: "#ffb55e",
    journeyStep: "4 / 7",
  },
  {
    id: "tori-comeback",
    kind: "comeback",
    handle: "torirestarts",
    displayName: "Tori",
    avatar: "T",
    challenge: "45 Minute Lock-In",
    dayLabel: "RESET #3",
    caption: "Missed two days. Did not delete the app. Back at the desk.",
    reactions: "31.6K",
    comments: "3.4K",
    action: "FOLLOW JOURNEY",
    visual: "45:00",
    accent: "#84a8ff",
    journeyStep: "COMEBACK",
  },
];

export type ExploreTemplate = {
  id: string;
  category: string;
  title: string;
  promise: string;
  duration: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  proof: string;
  people: string;
  emoji: string;
  flavor: string;
};

export const exploreTemplates: ExploreTemplate[] = [
  { id: "run-mile", category: "MOVE", title: "RUN 1 MILE", promise: "One mile. Every day. No overthinking.", duration: "7 DAYS", difficulty: "EASY", proof: "Photo or activity screenshot", people: "82K", emoji: "🏃", flavor: "Start today" },
  { id: "bad-cooking", category: "UNHINGED", title: "COOK WITHOUT PANICKING", promise: "Try a recipe. Success and failure both make the feed.", duration: "7 DAYS", difficulty: "MEDIUM", proof: "Photo or video", people: "18K", emoji: "🔥", flavor: "Going viral" },
  { id: "ship-daily", category: "BUILD", title: "SHIP ONE THING", promise: "Make something real every day.", duration: "14 DAYS", difficulty: "MEDIUM", proof: "Link, screenshot or photo", people: "31K", emoji: "🚀", flavor: "Builder favorite" },
  { id: "touch-grass", category: "EASY WIN", title: "TOUCH GRASS", promise: "Actually go outside once a day.", duration: "7 DAYS", difficulty: "EASY", proof: "Outdoor photo", people: "106K", emoji: "🌱", flavor: "Low pressure" },
  { id: "write-500", category: "CREATE", title: "WRITE 500 WORDS", promise: "Make the blank page lose.", duration: "14 DAYS", difficulty: "MEDIUM", proof: "Word-count screenshot", people: "24K", emoji: "⌨️", flavor: "Creator mode" },
  { id: "sales-20", category: "BUSINESS", title: "20 SALES CALLS", promise: "Do the reps. Keep private info private.", duration: "7 DAYS", difficulty: "HARD", proof: "Redacted call log", people: "9K", emoji: "📞", flavor: "Hard mode" },
];

export const createModes = [
  { kind: "proof", label: "PROOF", helper: "I did the thing.", icon: "✓" },
  { kind: "fail", label: "FAIL", helper: "It went badly. Post it anyway.", icon: "×" },
  { kind: "almost", label: "ALMOST", helper: "Close enough to make tomorrow interesting.", icon: "…" },
  { kind: "comeback", label: "COMEBACK", helper: "I disappeared. I came back.", icon: "↗" },
  { kind: "pr", label: "PR", helper: "A new personal best.", icon: "↑" },
  { kind: "reset", label: "RESET", helper: "New attempt. Same story, better chapter.", icon: "↻" },
] as const;
