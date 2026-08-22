import type { ChallengeTemplate } from "@/domain";
import { requireSupabase } from "@/lib/supabase";

type TemplateRow = Readonly<{
  id: string;
  title: string;
  promise: string;
  duration_days: number;
  cover_emoji: string | null;
}>;

export async function fetchTemplates(limit = 12): Promise<ChallengeTemplate[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("challenge_templates")
    .select("id,title,promise,duration_days,cover_emoji")
    .order("is_featured", { ascending: false })
    .order("sort_rank", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as TemplateRow[]).map((template) => ({
    id: template.id,
    emoji: template.cover_emoji || "⚡",
    title: template.title,
    promise: template.promise,
    duration: `${template.duration_days} ${template.duration_days === 1 ? "DAY" : "DAYS"}`,
  }));
}
