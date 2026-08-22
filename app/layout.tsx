import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "ProofMode — The participation network", template: "%s · ProofMode" },
  description: "Watch real attempts. Try what looks fun. Post the proof, fail, comeback or chaos—and build a Passport for what you actually did.",
  openGraph: {
    title: "ProofMode — The participation network",
    description: "Don't just watch it. Try it. Proof, fails, comebacks and challenges you can enter.",
    type: "website"
  },
  twitter: { card: "summary_large_image" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
