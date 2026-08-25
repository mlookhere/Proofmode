import type { Metadata } from "next";
import { AttributionCapture } from "@/components/attribution-capture";
import { OpenInApp } from "@/components/open-in-app";
import { ShareButton } from "@/components/share-button";
import { canonicalUrl } from "@/lib/sharing";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const path = `/u/${handle}`;
  return { alternates: { canonical: path }, openGraph: { url: canonicalUrl(path) } };
}

export default async function PassportShareLayout({ children, params }: { children: React.ReactNode; params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const path = `/u/${handle}`;
  return <>
    <div className="app-wrap wide-wrap" style={{ paddingBottom: 0 }}>
      <AttributionCapture source="passport_link" path={path} />
      <div className="actions">
        <OpenInApp path={path} source="passport_link" label="Open Passport in app →" />
        <ShareButton title={`@${handle} · ProofMode`} text={`See @${handle}'s public ProofMode Passport.`} path={path} source="passport_share" />
      </div>
    </div>
    {children}
  </>;
}
