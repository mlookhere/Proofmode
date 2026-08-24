import type { Metadata } from "next";
import { AttributionCapture } from "@/components/attribution-capture";
import { OpenInApp } from "@/components/open-in-app";
import { ShareButton } from "@/components/share-button";
import { canonicalUrl } from "@/lib/sharing";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const path = `/c/${slug}`;
  return { alternates: { canonical: path }, openGraph: { url: canonicalUrl(path) } };
}

export default async function DropShareLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const path = `/c/${slug}`;
  const title = slug.replaceAll("-", " ").replace(/\b\w/g, (value) => value.toUpperCase());
  return <>
    <div className="app-wrap wide-wrap" style={{ paddingBottom: 0 }}>
      <AttributionCapture source="drop_link" path={path} />
      <div className="actions">
        <OpenInApp path={path} source="drop_link" label="Open Drop in app →" />
        <ShareButton title={title} text={`Join my Drop: ${title}. Receipts required.`} path={path} source="drop_share" />
      </div>
    </div>
    {children}
  </>;
}
