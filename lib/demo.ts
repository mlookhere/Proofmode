export type DemoProof = {
  id: string;
  user: string;
  handle: string;
  challenge: string;
  day: number;
  image: string;
  caption: string;
  verifiedBy: number;
};

export const demoProofs: DemoProof[] = [
  {
    id: "p1",
    user: "Maya",
    handle: "@mayamoves",
    challenge: "30 Days Strong",
    day: 19,
    image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1000&q=80",
    caption: "6:12am. Did not want to. Did it anyway.",
    verifiedBy: 4
  },
  {
    id: "p2",
    user: "Jules",
    handle: "@shipdaily",
    challenge: "Ship 1 Thing Daily",
    day: 11,
    image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1000&q=80",
    caption: "Landing page v3 is live. Tiny ship > perfect plan.",
    verifiedBy: 3
  },
  {
    id: "p3",
    user: "Noah",
    handle: "@noahdraws",
    challenge: "100 Sketches",
    day: 37,
    image: "https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=1000&q=80",
    caption: "Thirty-seven. Finally getting faster with hands.",
    verifiedBy: 6
  }
];

export const demoMembers = [
  { name: "Maya", initials: "MY", streak: 19 },
  { name: "Chris", initials: "CR", streak: 18 },
  { name: "Dani", initials: "DN", streak: 18 },
  { name: "Leo", initials: "LE", streak: 15 }
];
