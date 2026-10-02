import { db, isTeacher, aiGradeSubmission } from "../lib/core.mts";

export default async (req: Request) => {
  if (!isTeacher(req)) return;
  const { examId, subId } = await req.json();
  const s = db();
  const exam = await s.get(`exam/${examId}`, { type: "json" });
  const sub = await s.get(`sub/${examId}/${subId}`, { type: "json" });
  if (!exam || !sub) return;
  try {
    sub.ai = await aiGradeSubmission(exam, sub);
    sub.status = "ai_done";
    delete sub.aiError;
  } catch (e: any) {
    console.error("AI grading failed", e);
    sub.status = "waiting_teacher";
    sub.aiError = String(e?.message || e).slice(0, 300);
  }
  const latest = await s.get(`sub/${examId}/${subId}`, { type: "json" });
  if (latest && latest.status === "reviewed") return; // GV đã duyệt trong lúc chờ: không ghi đè
  await s.setJSON(`sub/${examId}/${subId}`, sub);
};
