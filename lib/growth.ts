export type DropTemplate = {
  id: string;
  category: "fitness" | "sports" | "build" | "work" | "business" | "creative" | "art" | "mind" | "study" | "social" | "food" | "outdoors" | "self_improvement" | "funny";
  title: string;
  tagline: string;
  rule: string;
  duration: 7 | 14 | 30 | 60 | 100;
  emoji: string;
  hook: string;
};

export const dropTemplates: DropTemplate[] = [
  {
    id: "ship-daily",
    category: "build",
    title: "SHIP DAILY",
    tagline: "One visible thing out the door every day.",
    rule: "Publish, deploy, send, or release one concrete piece of work and post a screenshot or link before midnight.",
    duration: 14,
    emoji: "⚡",
    hook: "For builders who are done polishing in private."
  },
  {
    id: "30-strong",
    category: "fitness",
    title: "30 DAYS STRONG",
    tagline: "Thirty minutes. Every day. Receipts required.",
    rule: "Move for at least 30 minutes and post a workout photo, activity screenshot, or session summary before midnight.",
    duration: 30,
    emoji: "🏁",
    hook: "Simple enough to start. Public enough to finish."
  },
  {
    id: "deep-work-14",
    category: "work",
    title: "DEEP WORK 14",
    tagline: "One protected focus block every day.",
    rule: "Complete one distraction-free 60-minute focus block and post a timer, calendar, or finished-output receipt.",
    duration: 14,
    emoji: "◼",
    hook: "Make focus visible instead of aspirational."
  },
  {
    id: "100-sketches",
    category: "creative",
    title: "100 SKETCHES",
    tagline: "Quantity first. Taste catches up.",
    rule: "Make one original sketch and post a photo of it every day. Studies and rough work count; reposts do not.",
    duration: 100,
    emoji: "✎",
    hook: "A portfolio built in public, one receipt at a time."
  },
  {
    id: "read-20",
    category: "mind",
    title: "READ 20",
    tagline: "Twenty pages before the feed gets you.",
    rule: "Read at least 20 pages of a book and post the page range plus one sentence you want to remember.",
    duration: 30,
    emoji: "↗",
    hook: "Turn reading into a social streak without turning it into homework."
  },
  {
    id: "reach-out-7",
    category: "social",
    title: "REACH OUT 7",
    tagline: "Seven days of being the person who texts first.",
    rule: "Reach out meaningfully to one person each day and post a privacy-safe receipt that does not reveal private message content.",
    duration: 7,
    emoji: "+",
    hook: "A tiny IRL-social reset with no performative posting required."
  }
];

export const categoryLabels: Record<DropTemplate["category"] | "other", string> = {
  fitness: "Movement",
  sports: "Sports",
  build: "Build",
  work: "Focus",
  business: "Business",
  creative: "Creative",
  art: "Art",
  mind: "Mind",
  study: "Study",
  social: "Social",
  food: "Food",
  outdoors: "Outdoors",
  self_improvement: "Reset",
  funny: "Unhinged",
  other: "Other"
};

export function templateById(id?: string) {
  return dropTemplates.find((template) => template.id === id);
}

export function proofScore(receipts: number, verifiedReceipts: number, invites = 0) {
  return verifiedReceipts * 10 + receipts * 2 + invites * 5;
}
