import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return {
    rules: { userAgent: "*", allow: ["/", "/feed", "/explore", "/drops", "/c/", "/u/", "/journeys/"], disallow: ["/dashboard", "/api/", "/proofs/", "/login"] },
    sitemap: `${base}/sitemap.xml`
  };
}
