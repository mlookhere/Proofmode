# ProofMode 2.0 Product Thesis

## Category

**Multiplayer proof network.**

The product is not fundamentally a habit tracker. It is a lightweight social protocol for turning a commitment into evidence, verification, status, and repeatable community programming.

## Atomic objects

### Drop
A time-boxed challenge room with one proof rule, category, duration, optional seat cap, and legitimate Founder cutoff.

### Receipt
Timestamped proof attached to a Drop and user.

### Verification
Peer verdict on a receipt. A user cannot verify their own receipt.

### Proof Board
Ranked view of participation and verified proof.

### Founder
A durable status on a Drop membership awarded based on actual join order.

### Invite attribution
A durable record of which member recruited a new participant into a specific Drop.

### Receipt Passport
A public identity page composed only from public challenge activity. Private crew activity is excluded.

### Proof Score
Explainable public score: 10 × verified receipts + 2 × public receipts + 5 × public attributed recruits.

## Design constraints

1. A checkbox never advances a public proof identity.
2. Self-verification is impossible.
3. Private proof media remains behind RLS + signed URLs.
4. Founder scarcity must be based on actual join order.
5. Public Passport data only derives from public challenges.
6. Referral rewards must not make spam more valuable than real participation.
7. Do not add streak freezes; they conflict with the core promise.
8. Safety filters outrank growth for public challenge discovery.

## Most important next features after 2.0 validation

### 1. Rival notifications
Notify a member when someone directly above/below them on the Proof Board posts or changes rank.

### 2. Weekly Drop recap
Generate a shareable recap: receipts, verification rate, leaderboard movement, founder activity, recruits.

### 3. Creator analytics
Activation cohorts, first-receipt time, D7 receipt retention, share/recruit funnel, repeat participant rate.

### 4. Moderation controls
Host roles, proof removal, participant removal, challenge report queue, category moderation.

### 5. Consent-based creator CRM
Let participants explicitly opt in to creator updates; export only opted-in contact data.

### 6. Paid Drops
Only after creators show repeat hosting. Use Stripe Connect rather than attempting to treat challenge fees as ordinary platform subscription revenue.

## Product moat hypothesis

The defensibility is not the photo upload or streak. It is the graph connecting:

**people ↔ Drops ↔ verified receipts ↔ recruiting relationships ↔ portable public reputation.**

If users care about the history in their Passport and creators care about repeat Drop cohorts, switching costs become social and historical rather than technical.
