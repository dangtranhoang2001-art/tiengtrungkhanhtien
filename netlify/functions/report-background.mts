import { db, isTeacher, listJSON, callClaude, totals } from "../lib/core.mts";

const SYSTEM = `Bạn là giáo viên tiếng Trung, viết nhận xét tiến độ học tập của một học sinh người Việt để giáo viên tham khảo.
Chỉ dựa trên dữ liệu được cung cấp, không suy đoán điều không có trong dữ liệu. Viết tiếng Việt, cụ thể, ngắn gọn.
Chỉ trả về JSON hợp lệ:
{"xu_huong":"<tiến bộ / ổn định / đi xuống / chưa đủ dữ liệu, kèm 1 câu giải thích>","diem_manh":["..."],"can_cai_thien":["..."],"loi_lap_lai":["<lỗi xuất hiện nhiều lần>"],"goi_y":["<2-3 hoạt động luyện tập cụ thể>"],"loi_nhan_cho_hs":"<2 câu khích lệ gửi học sinh>"}`;

export default async (req: Request) => {
  if (!isTeacher(req)) return;
  const { classCode, studentId } = await req.json();
  const s = db();
  const key = `report/${classCode}/${studentId}`;
  try {
    const exams = (await listJSON("exam/")).filter((e: any) => e.classCode === classCode)
      .sort((a: any, b: any) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    const history: any[] = []; let name = studentId;
    for (const e of exams) {
      const sub = await s.get(`sub/${e.id}/${studentId}`, { type: "json" });
      if (!sub || sub.status === "doing") continue;
      name = sub.student; const t = totals(e, sub);
      history.push({
        bai: e.title, ngay: sub.submittedAt, diem: `${t.score}/${t.max}`, nop_muon: !!sub.late,
        cau_sai: e.questions.filter((q: any) => sub.grading?.items?.[q.id]?.auto && !sub.grading.items[q.id].ok)
          .map((q: any) => ({ loai: q.type, de: q.prompt, hs_tra_loi: sub.answers?.[q.id] ?? null })),
        loi_tu_luan: Object.values(sub.ai?.items || {}).flatMap((x: any) => x.loi || []),
      });
    }
    if (!history.length) { await s.setJSON(key, { studentId, status: "error", error: "Học sinh chưa nộp bài nào.", at: new Date().toISOString() }); return; }
    const r = await callClaude(SYSTEM, `Học sinh: ${name}\nLịch sử bài làm (cũ → mới):\n${JSON.stringify(history, null, 1).slice(0, 60000)}`, 1800);
    await s.setJSON(key, { studentId, name, status: "done", report: r, basedOn: history.length, at: new Date().toISOString() });
  } catch (e: any) {
    console.error(e);
    await s.setJSON(key, { studentId, status: "error", error: String(e?.message || e).slice(0, 300), at: new Date().toISOString() });
  }
};
