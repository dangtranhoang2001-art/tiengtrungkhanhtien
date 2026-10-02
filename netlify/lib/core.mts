import { getStore, getDeployStore } from "@netlify/blobs";

/* ---------- Lưu trữ ---------- */
let storeOverride: any = null;
export function _setStoreForTest(s: any) { storeOverride = s; }

export function db(): any {
  if (storeOverride) return storeOverride;
  const g: any = globalThis as any;
  const ctx = g.Netlify?.context?.deploy?.context;
  if (ctx && ctx !== "production") return getDeployStore({ name: "khanhtien", consistency: "strong" } as any);
  return getStore({ name: "khanhtien", consistency: "strong" });
}

export function env(k: string): string {
  const g: any = globalThis as any;
  return (g.Netlify?.env?.get?.(k) ?? process.env[k] ?? "") as string;
}

export async function listJSON(prefix: string): Promise<any[]> {
  const s = db();
  const { blobs } = await s.list({ prefix });
  const out = await Promise.all(blobs.map((b: any) => s.get(b.key, { type: "json" })));
  return out.filter(Boolean);
}

/* ---------- Tiện ích ---------- */
export const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export const bad = (msg: string, status = 400) => json({ error: msg }, status);

export function slug(name: string): string {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
export function rid(n = 10): string {
  const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
export function classCode(): string {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s = "";
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export function isTeacher(req: Request): boolean {
  const pw = env("TEACHER_PASSWORD");
  return !!pw && req.headers.get("x-teacher-key") === pw;
}

/* ---------- Đề thi: bản gửi cho học sinh (ẩn đáp án) ---------- */
export function publicQuestion(q: any) {
  const base = { id: q.id, type: q.type, prompt: q.prompt || "", points: q.points || 1 };
  if (q.type === "mcq" || q.type === "fill") return { ...base, options: q.options };
  if (q.type === "order") {
    const c = [...q.chunks];
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    if (c.join("|") === q.chunks.join("|") && c.length > 1) c.reverse();
    return { ...base, chunks: c };
  }
  return base; // short, essay
}

/* ---------- Chấm tự động ---------- */
const normZh = (s: string) => String(s ?? "").replace(/[\s\u3000]/g, "")
  .replace(/[。，、！？；：,.!?;:"'“”‘’（）()]/g, "").toLowerCase();

export function autoGrade(exam: any, answers: Record<string, any>) {
  const items: Record<string, any> = {};
  let score = 0, max = 0, pendingEssay = 0;
  for (const q of exam.questions) {
    const pts = Number(q.points) || 1; max += pts;
    const a = answers?.[q.id];
    let ok: boolean | null = null;
    if (q.type === "mcq" || q.type === "fill") ok = Number(a) === Number(q.correct);
    else if (q.type === "order") {
      const got = Array.isArray(a) ? a.join("") : "";
      const accepts = [q.chunks.join(""), ...((q.accept || []) as string[])].map(normZh);
      ok = got !== "" && accepts.includes(normZh(got));
    } else if (q.type === "short") {
      ok = (q.answers || []).map(normZh).includes(normZh(a)) && normZh(a) !== "";
    } else if (q.type === "essay") { pendingEssay++; items[q.id] = { auto: false, score: null, max: pts }; continue; }
    const s = ok ? pts : 0; score += s;
    items[q.id] = { auto: true, ok, score: s, max: pts };
  }
  return { items, autoScore: score, maxScore: max, pendingEssay };
}

/* ---------- Gọi AI (Anthropic API) ---------- */
export async function callClaude(system: string, user: string, maxTokens = 2500): Promise<any> {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw new Error("NO_KEY");
  const model = env("AI_MODEL") || "claude-sonnet-5-5";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error("API_" + r.status + ": " + (await r.text()).slice(0, 300));
  const d: any = await r.json();
  const text = (d.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  return JSON.parse(clean.slice(start, end + 1));
}

export const GRADER_SYSTEM = `Bạn là giáo viên tiếng Trung giàu kinh nghiệm, chấm bài tự luận cho học sinh người Việt.
Nguyên tắc:
- Chấm theo đúng yêu cầu đề và thang điểm giáo viên đưa ra; điểm từ 0 đến điểm tối đa, bước 0,5.
- Chỉ ra lỗi cụ thể: chữ Hán sai/viết nhầm, pinyin/thanh điệu, trật tự từ, lượng từ, dùng từ, ngữ pháp, thiếu ý.
- Chú ý lỗi điển hình của người Việt (đặt trạng ngữ sau động từ, bỏ lượng từ, dùng 是 với tính từ, thêm 吗 vào câu có từ để hỏi...).
- Không bịa lỗi. Nếu một câu có nhiều cách diễn đạt đúng thì chấp nhận. Nếu không chắc chắn, đặt "can_gv_xem": true.
- Nhận xét bằng tiếng Việt, ngắn gọn, thân thiện, mang tính khích lệ, phù hợp học sinh.
Chỉ trả về JSON hợp lệ, không thêm chữ nào khác, theo dạng:
{"items":[{"id":"<id câu>","score":<số>,"loi":[{"loai":"<loại lỗi>","chi_tiet":"<học sinh viết gì, sai ở đâu>","sua":"<cách sửa đúng>"}],"nhan_xet":"<1-2 câu>","can_gv_xem":<true|false>}],"nhan_xet_chung":"<2-3 câu nhận xét cả bài>"}`;

export async function aiGradeSubmission(exam: any, sub: any) {
  const essays = exam.questions.filter((q: any) => q.type === "essay");
  if (!essays.length) return null;
  const payload = essays.map((q: any) => ({
    id: q.id, de_bai: q.prompt, yeu_cau_cham: q.rubric || "", dap_an_tham_khao: q.sample || "",
    diem_toi_da: Number(q.points) || 1, bai_lam: String(sub.answers?.[q.id] ?? "").slice(0, 3000),
  }));
  const res = await callClaude(GRADER_SYSTEM, `Đề: ${exam.title}\nCác câu tự luận cần chấm:\n${JSON.stringify(payload, null, 2)}`);
  const out: Record<string, any> = {};
  for (const q of essays) {
    const it = (res.items || []).find((x: any) => x.id === q.id) || {};
    const max = Number(q.points) || 1;
    let s = Math.round(Number(it.score) * 2) / 2; if (!isFinite(s)) s = 0;
    s = Math.max(0, Math.min(max, s));
    out[q.id] = { score: s, max, loi: Array.isArray(it.loi) ? it.loi : [], nhan_xet: it.nhan_xet || "", can_gv_xem: !!it.can_gv_xem };
  }
  return { items: out, nhan_xet_chung: res.nhan_xet_chung || "" };
}

export function totals(exam: any, sub: any) {
  let score = 0, max = 0;
  for (const q of exam.questions) {
    const it = sub.grading?.items?.[q.id]; const pts = Number(q.points) || 1; max += pts;
    if (!it) continue;
    if (q.type === "essay") {
      const t = sub.teacherScores?.[q.id];
      const v = t != null ? Number(t) : (sub.ai?.items?.[q.id]?.score ?? null);
      if (v != null) score += v;
    } else score += it.score || 0;
  }
  return { score, max };
}

/* ---------- Tài khoản giáo viên ---------- */
import { pbkdf2Sync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

export function hashPw(pw: string, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: pbkdf2Sync(String(pw), salt, 100_000, 32, "sha256").toString("hex") };
}
export function checkPw(pw: string, salt: string, hash: string) {
  const h = pbkdf2Sync(String(pw), salt, 100_000, 32, "sha256");
  const ref = Buffer.from(hash, "hex");
  return ref.length === h.length && timingSafeEqual(h, ref);
}
const TOKEN_DAYS = 30;
function sign(payload: string) { return createHmac("sha256", "kt-session:" + env("TEACHER_PASSWORD")).update(payload).digest("base64url"); }
export function makeToken(id: string) {
  const p = Buffer.from(JSON.stringify({ id, exp: Date.now() + TOKEN_DAYS * 864e5 })).toString("base64url");
  return p + "." + sign(p);
}
/** Trả về {id, role, name} hoặc null */
export async function auth(req: Request): Promise<any> {
  const m = (req.headers.get("authorization") || "").match(/^Bearer (.+)$/);
  if (!m || !env("TEACHER_PASSWORD")) return null;
  const [p, sig] = m[1].split(".");
  if (!p || !sig || sign(p) !== sig) return null;
  let d: any; try { d = JSON.parse(Buffer.from(p, "base64url").toString()); } catch { return null; }
  if (!d.id || Date.now() > d.exp) return null;
  if (d.id === "admin") return { id: "admin", role: "admin", name: env("ADMIN_NAME") || "Quản trị" };
  const t = await db().get(`teacher/${d.id}`, { type: "json" });
  if (!t || t.disabled) return null;
  return { id: t.id, role: "teacher", name: t.name };
}
export const ownerOf = (x: any) => x?.ownerId || "admin";
export const canSee = (me: any, x: any) => me.role === "admin" || ownerOf(x) === me.id;
