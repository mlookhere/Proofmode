import Link from "next/link";

export function Nav() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="brand" href="/"><span className="logo-mark">P</span>ProofMode</Link>
        <nav className="nav-links" aria-label="Main navigation">
          <Link href="/feed">ProofTV</Link>
          <Link href="/explore">Explore</Link>
          <Link href="/drops">Drops</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
          <Link className="btn btn-primary" href="/onboarding?mode=drop">Launch a Drop</Link>
        </nav>
      </div>
    </header>
  );
}
