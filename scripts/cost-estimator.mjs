#!/usr/bin/env node
// Planning helper using public list prices checked August 2026.
// Re-check docs/ARCHITECTURE_COSTS.md before making purchasing decisions.
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [k,v] = arg.replace(/^--/, '').split('='); return [k, Number(v)];
}));
const stored = args.stored || 0;       // Cloudflare Stream minutes stored
const delivered = args.delivered || 0; // Cloudflare Stream minutes delivered
const r2gb = args.r2gb || 0;           // Standard R2 GB-month
const vercel = args.vercel ?? 20;
const supabase = args.supabase ?? 25;
const expo = args.expo ?? 0;

const streamStorage = stored / 1000 * 5;
const streamDelivery = delivered / 1000 * 1;
const r2 = Math.max(0, r2gb - 10) * 0.015; // simplification: ignores operation pricing and monthly rounding
const subtotal = vercel + supabase + expo + streamStorage + streamDelivery + r2;

console.log(JSON.stringify({
  assumptions: { stored_minutes: stored, delivered_minutes: delivered, r2_gb_month: r2gb, vercel_base: vercel, supabase_base: supabase, expo_base: expo },
  estimate_usd: {
    cloudflare_stream_storage: +streamStorage.toFixed(2),
    cloudflare_stream_delivery: +streamDelivery.toFixed(2),
    r2_storage_simplified: +r2.toFixed(2),
    fixed_inputs: +(vercel + supabase + expo).toFixed(2),
    subtotal_before_other_overages_and_fees: +subtotal.toFixed(2)
  },
  excluded: ["R2 request operations", "Supabase overages", "Vercel usage over base credit", "PostHog/Sentry overages", "RevenueCat fee above free threshold", "app-store commissions/fees", "moderation vendor", "email", "tax/legal/team costs"]
}, null, 2));
