export const postKinds = ["proof", "fail", "almost", "comeback", "pr", "chaos", "bts", "reset"] as const;
export type PostKind = (typeof postKinds)[number];

export type FeedPost = Readonly<{
  id: string;
  kind: PostKind;
  day: string;
  user: string;
  handle: string;
  challenge: string;
  value: string;
  caption: string;
  accent: string;
  reactions: string;
  comments: string;
  action: string;
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
