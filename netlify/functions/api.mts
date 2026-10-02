import { db, env, json, bad, slug, rid, classCode, isTeacher, listJSON, publicQuestion, autoGrade, totals } from "../lib/core.mts";

const GRACE_MS = 90_000;

async function trigger(req: Request, fn: string, body: any) {
  try {
    await fetch(new URL(`/.netlify/functions/${fn}`, req.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-teacher-key": env("TEACHER_PASSWORD") },
      body: JSON.stringify(body),
    });
  } catch (e) { console.error("trigger failed", fn, e); }
}

function examWindow(exam: any, now = Date.now()) {
  if (!exam.published) return "hidden";
  if (exam.openAt && now < Date.parse(exam.openAt)) return "upcoming";
  if (exam.dueAt && now > Date.parse(exam.dueAt)) return "closed";
  return "open";
}

/* Kết quả học sinh được phép xem */
function studentView(exam: any, sub: any) {
  const reviewed = sub.status === "reviewed";
  const essayVisible = reviewed || (exam.showAI && sub.status === "ai_done");
  const t = totals(exam, sub);
  const hasEssay = exam.questions.some((q: any) => q.type === "essay");
  const detail = exam.questions.map((q: any) => {
    const it = sub.grading?.items?.[q.id] || {};
    const row: any = { id: q.id, type: q.type, prompt: q.prompt, points: q.points || 1, answer: sub.answers?.[q.id] ?? null };
    if (q.type === "essay") {
      if (essayVisible) {
        const ai = sub.ai?.items?.[q.id];
        row.score = sub.teacherScores?.[q.id] ?? ai?.score ?? null;
        row.loi = ai?.loi || []; row.nhan_xet = sub.teacherComments?.[q.id] || ai?.nhan_xet || "";
      } else row.pending = true;
    } else {
      row.ok = it.ok; row.score = it.score;
      if (q.type === "mcq" || q.type === "fill") row.options = q.options;
      if (exam.showAnswers) {
        if (q.type === "mcq" || q.type === "fill") row.correct = q.correct;
        if (q.type === "order") row.correctText = q.chunks.join("");
        if (q.type === "short") row.correctText = (q.answers || [])[0] || "";
        row.explain = q.explain || "";
      }
    }
    return row;
  });
  return {
    status: sub.status, late: !!sub.late, submittedAt: sub.submittedAt,
    autoScore: sub.grading?.autoScore ?? 0,
    score: hasEssay && !essayVisible ? null : t.score, max: t.max,
    comment: essayVisible ? (sub.teacherNote || sub.ai?.nhan_xet_chung || "") : (reviewed ? sub.teacherNote || "" : ""),
    detail,
  };
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const m = req.method;
  const s = db();
  let body: any = {};
  if (m === "POST" || m === "PUT") { try { body = await req.json(); } catch { body = {}; } }

  try {
    /* ================= HỌC SINH ================= */
    if (p[0] === "class" && m === "GET" && p[1]) {
      const code = p[1].toUpperCase();
      const cls = await s.get(`class/${code}`, { type: "json" });
      if (!cls) return bad("Không tìm thấy lớp. Kiểm tra lại mã lớp.", 404);
      const who = slug(url.searchParams.get("student") || "");
      const exams = (await listJSON(`exam/`)).filter((e: any) => e.classCode === code && e.published)
        .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      const rows = await Promise.all(exams.map(async (e: any) => {
        const sub = who ? await s.get(`sub/${e.id}/${who}`, { type: "json" }) : null;
        return {
          id: e.id, title: e.title, durationMin: e.durationMin, openAt: e.openAt || null, dueAt: e.dueAt || null,
          count: e.questions.length, state: examWindow(e),
          my: sub ? { status: sub.status, score: sub.status === "doing" ? null : studentView(e, sub).score, max: totals(e, sub).max } : null,
        };
      }));
      return json({ code, name: cls.name, exams: rows });
    }

    if (p[0] === "start" && m === "POST") {
      const { examId, student } = body;
      const name = String(student || "").trim().slice(0, 60); const key = slug(name);
      if (!key) return bad("Em hãy nhập họ tên.");
      const exam = await s.get(`exam/${examId}`, { type: "json" });
      if (!exam || !exam.published) return bad("Không tìm thấy bài.", 404);
      if (String(body.classCode || "").toUpperCase() !== exam.classCode) return bad("Bài này không thuộc lớp của em.", 403);
      let sub = await s.get(`sub/${examId}/${key}`, { type: "json" });
      if (sub && sub.status !== "doing") return json({ submitted: true, result: studentView(exam, sub) });
      const st = examWindow(exam);
      if (!sub && st !== "open") return bad(st === "upcoming" ? "Bài chưa mở." : "Bài đã hết hạn nộp.", 403);
      if (!sub) {
        const now = Date.now();
        let deadline = now + (Number(exam.durationMin) || 15) * 60_000;
        if (exam.dueAt) deadline = Math.min(deadline, Date.parse(exam.dueAt));
        sub = { id: key, examId, classCode: exam.classCode, student: name, status: "doing",
          startedAt: new Date(now).toISOString(), deadline: new Date(deadline).toISOString(), answers: {} };
        await s.setJSON(`sub/${examId}/${key}`, sub);
      }
      return json({ submitted: false, sub: { id: sub.id, startedAt: sub.startedAt, deadline: sub.deadline, answers: sub.answers || {} },
        exam: { id: exam.id, title: exam.title, questions: exam.questions.map(publicQuestion) }, serverNow: new Date().toISOString() });
    }

    if (p[0] === "save" && m === "POST") { // lưu nháp giữa chừng
      const { examId, subId, answers } = body;
      const sub = await s.get(`sub/${examId}/${slug(subId)}`, { type: "json" });
      if (!sub || sub.status !== "doing") return json({ ok: false });
      sub.answers = answers || {}; await s.setJSON(`sub/${examId}/${sub.id}`, sub);
      return json({ ok: true });
    }

    if (p[0] === "submit" && m === "POST") {
      const { examId, subId, answers } = body;
      const exam = await s.get(`exam/${examId}`, { type: "json" });
      const sub = await s.get(`sub/${examId}/${slug(subId)}`, { type: "json" });
      if (!exam || !sub) return bad("Không tìm thấy bài làm.", 404);
      if (sub.status !== "doing") return json({ result: studentView(exam, sub) });
      const now = Date.now();
      sub.answers = answers || sub.answers || {};
      sub.submittedAt = new Date(now).toISOString();
      sub.late = now > Date.parse(sub.deadline) + GRACE_MS;
      sub.grading = autoGrade(exam, sub.answers);
      const aiOn = !!env("ANTHROPIC_API_KEY");
      sub.status = sub.grading.pendingEssay ? (aiOn ? "waiting_ai" : "waiting_teacher") : "done";
      await s.setJSON(`sub/${examId}/${sub.id}`, sub);
      if (sub.status === "waiting_ai") await trigger(req, "grade-background", { examId, subId: sub.id });
      return json({ result: studentView(exam, sub) });
    }

    if (p[0] === "result" && m === "GET") {
      const examId = url.searchParams.get("examId") || ""; const who = slug(url.searchParams.get("student") || "");
      const exam = await s.get(`exam/${examId}`, { type: "json" });
      const sub = await s.get(`sub/${examId}/${who}`, { type: "json" });
      if (!exam || !sub || sub.status === "doing") return bad("Chưa có kết quả.", 404);
      if (String(url.searchParams.get("classCode") || "").toUpperCase() !== exam.classCode) return bad("Sai mã lớp.", 403);
      return json({ title: exam.title, result: studentView(exam, sub) });
    }

    /* ================= GIÁO VIÊN ================= */
    if (p[0] === "t") {
      if (!env("TEACHER_PASSWORD")) return bad("Chưa cài mật khẩu giáo viên (TEACHER_PASSWORD) trên Netlify.", 500);
      if (!isTeacher(req)) return bad("Sai mật khẩu giáo viên.", 401);
      const r = p[1];

      if (r === "overview" && m === "GET") {
        const classes = (await listJSON("class/")).sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
        const exams = (await listJSON("exam/")).sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        return json({ classes, exams, aiEnabled: !!env("ANTHROPIC_API_KEY") });
      }
      if (r === "class" && m === "POST") {
        const name = String(body.name || "").trim(); if (!name) return bad("Nhập tên lớp.");
        let code = classCode(); while (await s.get(`class/${code}`)) code = classCode();
        const cls = { code, name, createdAt: new Date().toISOString() };
        await s.setJSON(`class/${code}`, cls); return json(cls);
      }
      if (r === "class" && m === "DELETE" && p[2]) { await s.delete(`class/${p[2].toUpperCase()}`); return json({ ok: true }); }

      if (r === "exam" && m === "POST") {
        const e = body; if (!e.title || !e.classCode) return bad("Đề cần tên và lớp.");
        if (!Array.isArray(e.questions) || !e.questions.length) return bad("Đề chưa có câu hỏi.");
        const id = e.id || rid();
        const old = e.id ? await s.get(`exam/${id}`, { type: "json" }) : null;
        const exam = {
          id, title: String(e.title).slice(0, 120), classCode: String(e.classCode).toUpperCase(),
          durationMin: Math.max(1, Math.min(300, Number(e.durationMin) || 15)),
          openAt: e.openAt || null, dueAt: e.dueAt || null, published: !!e.published,
          showAnswers: !!e.showAnswers, showAI: !!e.showAI,
          questions: e.questions.map((q: any) => ({ ...q, id: q.id || rid(6), points: Number(q.points) || 1 })),
          createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        await s.setJSON(`exam/${id}`, exam); return json(exam);
      }
      if (r === "exam" && m === "DELETE" && p[2]) { await s.delete(`exam/${p[2]}`); return json({ ok: true }); }

      if (r === "subs" && m === "GET") {
        const examId = url.searchParams.get("examId") || "";
        const exam = await s.get(`exam/${examId}`, { type: "json" });
        const subs = (await listJSON(`sub/${examId}/`)).map((x: any) => ({ ...x, total: exam ? totals(exam, x) : null }));
        return json({ exam, subs });
      }
      if (r === "review" && m === "POST") {
        const { examId, subId, teacherScores, teacherComments, teacherNote } = body;
        const exam = await s.get(`exam/${examId}`, { type: "json" });
        const sub = await s.get(`sub/${examId}/${subId}`, { type: "json" });
        if (!exam || !sub) return bad("Không tìm thấy bài.", 404);
        sub.teacherScores = teacherScores || {}; sub.teacherComments = teacherComments || {};
        sub.teacherNote = String(teacherNote || ""); sub.status = "reviewed"; sub.reviewedAt = new Date().toISOString();
        await s.setJSON(`sub/${examId}/${subId}`, sub); return json({ ...sub, total: totals(exam, sub) });
      }
      if (r === "regrade" && m === "POST") {
        if (!env("ANTHROPIC_API_KEY")) return bad("Chưa cài API key AI.");
        const sub = await s.get(`sub/${body.examId}/${body.subId}`, { type: "json" });
        if (!sub) return bad("Không tìm thấy bài.", 404);
        sub.status = "waiting_ai"; delete sub.aiError; await s.setJSON(`sub/${body.examId}/${body.subId}`, sub);
        await trigger(req, "grade-background", { examId: body.examId, subId: body.subId }); return json({ ok: true });
      }
      if (r === "sub" && m === "DELETE") { // cho học sinh làm lại
        await s.delete(`sub/${url.searchParams.get("examId")}/${url.searchParams.get("subId")}`); return json({ ok: true });
      }
      if (r === "progress" && m === "GET") {
        const code = (url.searchParams.get("classCode") || "").toUpperCase();
        const exams = (await listJSON("exam/")).filter((e: any) => e.classCode === code)
          .sort((a: any, b: any) => (a.createdAt || "").localeCompare(b.createdAt || ""));
        const students: Record<string, any> = {};
        const wrongStats: Record<string, any> = {};
        for (const e of exams) {
          for (const sub of await listJSON(`sub/${e.id}/`)) {
            if (sub.status === "doing") continue;
            const st = students[sub.id] ||= { id: sub.id, name: sub.student, results: {} };
            const t = totals(e, sub);
            st.results[e.id] = { pct: t.max ? Math.round((t.score / t.max) * 100) : 0, score: t.score, max: t.max, status: sub.status, late: !!sub.late, at: sub.submittedAt };
            for (const q of e.questions) {
              const it = sub.grading?.items?.[q.id]; if (!it || !it.auto) continue;
              const w = wrongStats[e.id + ":" + q.id] ||= { examId: e.id, exam: e.title, prompt: q.prompt, type: q.type, wrong: 0, total: 0 };
              w.total++; if (!it.ok) w.wrong++;
            }
          }
        }
        const reports = await listJSON(`report/${code}/`);
        const hard = Object.values(wrongStats).filter((w: any) => w.total >= 2 && w.wrong / w.total >= 0.5)
          .sort((a: any, b: any) => b.wrong / b.total - a.wrong / a.total).slice(0, 10);
        return json({ exams: exams.map((e: any) => ({ id: e.id, title: e.title, createdAt: e.createdAt })), students: Object.values(students), reports, hard });
      }
      if (r === "report" && m === "POST") {
        if (!env("ANTHROPIC_API_KEY")) return bad("Chưa cài API key AI.");
        const code = String(body.classCode || "").toUpperCase(), sid = slug(body.studentId || "");
        await s.setJSON(`report/${code}/${sid}`, { studentId: sid, status: "working", at: new Date().toISOString() });
        await trigger(req, "report-background", { classCode: code, studentId: sid }); return json({ ok: true });
      }
    }
    return bad("Không có đường dẫn này.", 404);
  } catch (e: any) {
    console.error(e);
    return bad("Lỗi máy chủ: " + (e?.message || e), 500);
  }
};

export const config = { path: "/api/*" };
