// الروزنة: محادثة ستيفن (المستخدم) مع ستيفن الوكيل — بدخول برقم سري بدل الإيميل.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "https://stevenkhalfan.github.io",
  "Access-Control-Allow-Headers": "content-type, x-rozna-pin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function same(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const PIN = Deno.env.get("ROZNA_PIN");
    if (!PIN) return json({ error: "no_pin_set" });
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: fails } = await sb.from("pin_attempts").select("id", { count: "exact", head: true }).eq("ok", false).gte("at", since);
    if ((fails ?? 0) >= 8) return json({ error: "locked" }, 429);
    const pin = req.headers.get("x-rozna-pin") ?? "";
    if (!same(pin, PIN)) { await sb.from("pin_attempts").insert({ ok: false }); return json({ error: "bad_pin" }, 401); }

    const { data: s } = await sb.from("settings").select("value").eq("key", "owner_id").single();
    const owner = s!.value;
    const body = await req.json().catch(() => ({}));

    if (body.action === "send") {
      const text = String(body.text ?? "").trim().slice(0, 4000);
      if (!text) return json({ error: "empty" }, 400);
      await sb.from("messages").insert({ user_id: owner, sender: "me", body: text, kind: "order", handled: false });
    }
    if (body.action === "decision" && body.id) {
      const st = ["active", "done", "cancelled"].includes(body.status) ? body.status : "done";
      await sb.from("decisions").update({ status: st }).eq("id", body.id).eq("user_id", owner);
    }

    const [msgs, decs, pend, upd, projs, tks] = await Promise.all([
      sb.from("messages").select("id,sender,body,kind,created_at").eq("user_id", owner).in("sender", ["me", "steven"]).order("created_at", { ascending: false }).limit(60),
      sb.from("decisions").select("id,body,status,created_at").eq("user_id", owner).order("created_at", { ascending: false }).limit(40),
      sb.from("messages").select("id", { count: "exact", head: true }).eq("user_id", owner).eq("kind", "order").eq("handled", false),
      sb.from("messages").select("body,created_at").eq("user_id", owner).eq("kind", "update").order("created_at", { ascending: false }).limit(1),
      sb.from("projects").select("id,name,status").eq("user_id", owner).order("sort"),
      sb.from("tasks").select("member,text,status,project").eq("user_id", owner).order("created_at", { ascending: false }).limit(80),
    ]);
    return json({
      messages: (msgs.data ?? []).reverse(),
      decisions: decs.data ?? [],
      pending: pend.count ?? 0,
      update: upd.data?.[0] ?? null,
      projects: projs.data ?? [],
      tasks: tks.data ?? [],
    });
  } catch (e) {
    return json({ error: String((e as Error).message).slice(0, 200) }, 500);
  }
});
