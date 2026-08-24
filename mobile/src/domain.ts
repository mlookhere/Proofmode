export const postKinds = ["proof", "fail", "almost", "comeback", "pr", "chaos", "bts", "reset"] as const;
export type PostKind = (typeof postKinds)[number];

export type FeedMedia = Readonly<{
  kind: "image" | "video";
  url: string;
}>;

export type FeedReaction = "proven" | "respect" | "lol" | "run_it_back" | "im_next";

export type FeedPost = Readonly<{
  id: string;
  userId: string;
  kind: PostKind;
  day: string;
  user: string;
  handle: string;
  challengeId: string | null;
  challengeSlug: string | null;
  challenge: string;
  value: string;
  caption: string;
  accent: string;
  reactions: number;
  comments: number;
  viewerFollows: boolean;
  viewerReaction: FeedReaction | null;
  action: string;
  media?: FeedMedia;
}>;

export type ChallengeTemplate = Readonly<{
  id: string;
  emoji: string;
  title: string;
  promise: string;
  duration: string;
}>;

export type PostMode = Readonly<{
  icon: string;
  title: Extract<PostKind, "proof" | "fail" | "almost" | "comeback" | "pr" | "reset">;
  help: string;
}>;
