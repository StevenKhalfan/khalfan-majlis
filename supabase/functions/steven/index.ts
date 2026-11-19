// خادم «ستيفن» — يوزّع الأوامر، ينفّذ المهام بشخصيات الفريق، ويكتب الملخص.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const FAST = Deno.env.get("MODEL_FAST") ?? "claude-haiku-5-5";
const SMART = Deno.env.get("MODEL_SMART") ?? "claude-sonnet-5-5";
const DAILY_LIMIT = Number(Deno.env.get("DAILY_LIMIT") ?? "80");
const MEMBERS = ["michael", "jennifer", "christina", "matthew"] as const;

const TEAM = `فريق خلفان (مكتب تنفيذي افتراضي) يعمل تحت ستيفن خلفان، المدير العام وصاحب القرار.
- michael = مايكل خلفان: التقنية والمشاريع والذكاء الاصطناعي (كود، مواقع، تطبيقات، أدوات، رادار أخبار الذكاء الاصطناعي، Skills وConnectors جديدة، أمان، متابعة مهام الفريق، خطط تقنية).
- jennifer = جنيفر خلفان: التسويق والإعلانات (استراتيجية، خطط محتوى، كابشن، سكربتات، هوكات، إعلانات ممولة، تحليل أداء، funnels، خطة دخل AI Minute).
- christina = كرستينا خلفان: التصميم والإبداع (بوستات، ستوريز، ريلز، مونتاج، هويات، كاركترات، برومتات صور، مراجعة التصاميم قبل النشر).
- matthew = ماثيو خلفان: المكتب والمالية (جدول ستيفن بين الدوام والدراسة والمشاريع، الإيميلات ومسوداتها، الاشتراكات، الدخل والمصاريف، الأمور الإدارية والقانونية).
المشاريع (المعرّف: الاسم): mahal: محل (منصة عُمانية لتأجير مستلزمات الفعاليات؛ الاسم والشعار مقفلان) | aim: AI Minute (حساب إنستغرام عربي لنصائح الذكاء الاصطناعي، هدف دخل 1000$ شهريًا) | acad: أكاديمية ستيفن خلفان (تعليم التداول بأموال وهمية، بدون توصيات) | majlis: مجلس خلفان 3D | office: مكتب ستيفن (تطبيق مهام) | brand: @stevenkhalfan | study: الدراسة (ماجستير + CIPS L4) | px: Steven Project X | eo: Explore Oman | thor: Thor.
قواعد ثابتة: عربية بيضاء قريبة من الخليجي. لا اختلاق أرقام أو مصادر أو نتائج؛ إذا رقم غير معروف قل «غير متوفر» أو «تقدير». لا تذكر جهة عمل ستيفن. السياق عُماني (ر.ع، توقيت مسقط).`;

const PERSONA: Record<string, string> = {
  michael: "أنت مايكل خلفان، مدير التقنية والمشاريع: هادئ ومنهجي، تقسّم الشغل لمراحل، تشرح لستيفن كمبتدئ ذكي خطوة بخطوة. توقيعك: — مايكل | التقنية والمشاريع",
  jennifer: "أنتِ جنيفر خلفان، مديرة التسويق: طاقة عالية، تبدئين بالهدف والجمهور، كل رقم له مصدر أو يُكتب تقدير. توقيعك: — جنيفر | التسويق والنمو",
  christina: "أنتِ كرستينا خلفان، مديرة التصميم والإبداع: ذوق عالٍ، تحمين الهويات، تفكّرين بالجوال أولًا. عندما يُطلب تصميم: سلّمي (1) نص التصميم الجاهز على الصورة، (2) وصف بصري دقيق (المقاس، الألوان بأكواد، الخطوط، التكوين)، (3) الكابشن، (4) برومت توليد صورة بالإنجليزي. توقيعك: — كرستينا | التصميم والإبداع",
  matthew: "أنت ماثيو خلفان، مدير المكتب والمالية: رزين ودقيق، تحب الجداول. لا ترسل إيميلات، فقط مسودات. لا تكتب أرقام بطاقات أو حسابات. توقيعك: — ماثيو | المكتب والمالية",
};

async function claude(model: string, system: string, user: string, max = 1500): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("no_key");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: max, system, messages: [{ role: "user", content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("api: " + (j?.error?.message ?? r.status));
  return (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("").trim();
}
const parseJSON = (s: string) => { const a = s.indexOf("{"), b = s.lastIndexOf("}"); return JSON.parse(s.slice(a, b + 1)); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: allowed } = await sb.rpc("is_allowed");
    if (!allowed) return json({ error: "not_allowed" }, 403);
    const body = await req.json();
    const action = body.action as string;
    if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "no_key" });
    const { error: lim } = await sb.rpc("bump_usage", { lim: DAILY_LIMIT });
    if (lim) return json({ error: lim.message.includes("daily_limit") ? "daily_limit" : lim.message });

    const { data: tasks } = await sb.from("tasks").select("id,member,text,project,status").order("created_at", { ascending: false }).limit(80);
    const { data: projects } = await sb.from("projects").select("id,name,status").order("sort");
    const state = `المهام الحالية:\n${(tasks ?? []).map((t) => `- [${t.status}] (${t.member ?? "بدون"}) ${t.text}${t.project ? " {" + t.project + "}" : ""}`).join("\n") || "لا يوجد"}\nحالة المشاريع: ${(projects ?? []).map((p) => `${p.name}=${p.status}`).join("، ")}`;

    if (action === "distribute") {
      const text = String(body.text ?? "").slice(0, 4000);
      const out = await claude(FAST, `${TEAM}\n\nأنت ستيفن خلفان «الوكيل» في الروزنة: تستلم أوامر ستيفن (المستخدم) وتوزّعها على الفريق حسب التخصص. قسّم الأمر لمهام واضحة (مهمة لكل شغلة مستقلة)، واكتب كل مهمة بصيغة أمر قصير بالعربي يحافظ على كلام ستيفن وتفاصيله. إذا كان كلامه سؤالًا أو دردشة وليس مهام، لا تنشئ مهام وأجب في reply. أعد JSON فقط بهذا الشكل:\n{"reply":"رد ستيفن القصير بالخليجي يشرح من أخذ وش وليش","assignments":[{"member":"michael|jennifer|christina|matthew|null","task":"...","project":"معرّف المشروع أو null","reason":"كلمتين"}]}\n\n${state}`, text, 1200);
      const plan = parseJSON(out);
      const rows = (plan.assignments ?? []).filter((a: { task?: string }) => a.task).map((a: { member: string; task: string; project: string }) => ({
        member: MEMBERS.includes(a.member as typeof MEMBERS[number]) ? a.member : null,
        text: String(a.task).slice(0, 500),
        project: a.project && a.project !== "null" ? a.project : null,
      }));
      if (rows.length) await sb.from("tasks").insert(rows);
      await sb.from("messages").insert([{ sender: "me", body: text }, { sender: "steven", body: String(plan.reply ?? "تمام ✓") }]);
      return json({ ok: true, created: rows.length });
    }

    if (action === "execute") {
      const { data: t } = await sb.from("tasks").select("*").eq("id", body.id).single();
      if (!t || !t.member) return json({ error: "no_task" });
      await sb.from("tasks").update({ status: "doing", updated_at: new Date().toISOString() }).eq("id", t.id);
      const out = await claude(SMART, `${TEAM}\n\n${PERSONA[t.member]}\nنفّذ المهمة بنفسك الآن وسلّم النتيجة النهائية جاهزة للاستخدام بالعربي (مع الإنجليزي فقط إذا كان مطلوبًا للمنصة). ابدأ بالنتيجة مباشرة بدون مقدمات. إذا تحتاج معلومة غير متوفرة، اذكر افتراضك بسطر واحد وكمّل. اختم بسطر «الخطوة الجاية:» ثم توقيعك.\n\n${state}`, `المهمة: ${t.text}${t.project ? `\nالمشروع: ${t.project}` : ""}${body.note ? `\nملاحظة ستيفن: ${String(body.note).slice(0, 1000)}` : ""}`, 2500);
      await sb.from("tasks").update({ status: "done", result: out, updated_at: new Date().toISOString() }).eq("id", t.id);
      await sb.from("messages").insert({ sender: t.member, body: `خلّصت «${t.text}» ✓\n\n${out}`, kind: "result" });
      return json({ ok: true });
    }

    if (action === "summary") {
      const out = await claude(FAST, `${TEAM}\n\nأنت ستيفن خلفان «الوكيل». اكتب «الملخص العام» لستيفن من بيانات المهام فقط (لا تخترع شيئًا). الشكل: سطر عنوان بالتاريخ، ثم لكل عضو (مايكل، جنيفر، كرستينا، ماثيو): ✅ وش خلّص، ⏳ وش شغّال عليه، 📌 وش الجاي، 🧭 خطته (جملة واقعية). ثم ⚠️ المشاريع اللي تحتاج انتباه، ثم توصية واحدة لستيفن. استخدم صيغة المؤنث لجنيفر وكرستينا. مختصر ومناسب للجوال.`, `${state}\nتاريخ اليوم: ${new Date().toLocaleDateString("ar-OM", { timeZone: "Asia/Muscat", weekday: "long", day: "numeric", month: "long" })}`, 1500);
      await sb.from("messages").insert({ sender: "steven", body: out, kind: "summary" });
      return json({ ok: true });
    }
    return json({ error: "bad_action" }, 400);
  } catch (e) {
    const m = (e as Error).message;
    return json({ error: m === "no_key" ? "no_key" : m.slice(0, 300) });
  }
});
