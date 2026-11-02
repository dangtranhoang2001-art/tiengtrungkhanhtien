/**
 * BTVN Bài 7 你吃什么 (nâng cao) — nhận bài + CHẤM & SỬA ĐOẠN VĂN BẰNG AI + Bảng vàng
 *
 * CÀI ĐẶT (làm 1 lần):
 * 1. Tạo Google Sheet mới (VD: "BTVN Bài 7") → Tiện ích mở rộng → Apps Script → xoá hết, dán toàn bộ file này → Lưu.
 * 2. Cài khoá AI: Apps Script → ⚙️ Cài đặt dự án → Thuộc tính tập lệnh → Thêm thuộc tính:
 *      ANTHROPIC_API_KEY = sk-ant-...      (khoá Claude, lấy ở console.anthropic.com)
 *    HOẶC (miễn phí, giới hạn lượt):
 *      GEMINI_API_KEY    = AIza...         (khoá Gemini, lấy ở aistudio.google.com → Get API key)
 *    Không bắt buộc: AI_MODEL (Claude, mặc định claude-sonnet-5-5) / GEMINI_MODEL (mặc định gemini-flash-latest)
 * 3. Chạy thử hàm testAI một lần (chọn testAI → ▶ Chạy → cấp quyền) để kiểm tra khoá.
 * 4. Triển khai → Tùy chọn triển khai mới → Ứng dụng web
 *      - Thực thi dưới dạng: Tôi
 *      - Người có quyền truy cập: Bất kỳ ai
 *    → Sao chép URL (…/exec) và dán vào biến SEND_URL trong bai7-btvn.html.
 * Không có khoá AI: bài vẫn được ghi vào Sheet, đoạn văn để trống điểm cho giáo viên chấm.
 */
var HEADERS = ["Thời gian nộp","Lớp","Học sinh","Điểm (/100)","Thời gian làm (giây)","Thời gian làm",
  "Bài 1 Điền từ (/20)","Bài 2 Chọn câu đúng (/20)","Bài 3 Sắp xếp (/20)","Bài 4 Đọc hiểu (/20)","Bài 5 Viết đoạn (/20)",
  "Lần nộp","Đoạn văn của học sinh","Bản sửa (AI)","Lỗi & nhận xét (AI)","Chi tiết bài làm"];

var W7 = ["中午","食堂","馒头","米饭","鸡蛋","汤","啤酒","这些","那些","一些","饺子","包子","面条","碗","个","要","吃","饭"];

function sheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sh.getLastRow() === 0 || sh.getRange(1,1).getValue() !== HEADERS[0]) {
    if (sh.getLastRow() > 0) sh.insertRowBefore(1);
    sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]).setFontWeight("bold").setBackground("#2f5d62").setFontColor("#ffffff");
    sh.setFrozenRows(1);
  }
  return sh;
}
function mmss_(s) { s = Math.round(+s || 0); return Math.floor(s/60) + ":" + ("0" + (s%60)).slice(-2); }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// ---------- CHẤM ĐOẠN VĂN ----------
var SYS = [
  "Bạn là giáo viên tiếng Trung chấm bài viết của học sinh Việt Nam trình độ sơ cấp (Giáo trình Hán ngữ quyển 1, đã học đến bài 7 «你吃什么»).",
  "Đề bài: Viết một đoạn văn 5–8 câu (60–120 chữ Hán) kể hôm qua bạn đã ăn gì (昨天你吃什么？), dùng ít nhất 5 từ của bài 7.",
  "Từ vựng bài 7: 中午、吃、饭、食堂、馒头、米饭、米、要、个、碗、鸡蛋、鸡、蛋、汤、啤酒、酒、这些、些、一些、那些、饺子、包子、面条.",
  "Ngữ pháp trọng tâm: câu hỏi với 什么; Số/几 + lượng từ (个/碗) + danh từ; 这些/那些; 喝汤/喝啤酒 (không nói 吃汤); phủ định 不 + động từ.",
  "Học sinh CHƯA học 了: không trừ điểm khi thiếu 了; nếu dùng 了 đúng thì chấp nhận, dùng sai thì sửa.",
  "",
  "CHẤM THEO THANG CỐ ĐỊNH (chỉ cho số nguyên):",
  "1) noi_dung (0–5): đúng chủ đề hôm qua ăn gì, đủ ý, đủ số câu. 5 = đúng chủ đề, ≥5 câu, có địa điểm/món ăn/đồ uống/số lượng; 3 = đúng chủ đề nhưng ít ý hoặc 3–4 câu; 1 = rất ngắn hoặc lạc đề một phần; 0 = lạc đề.",
  "2) tu_vung (0–5): dùng đúng và đa dạng từ bài 7. 5 = ≥6 từ dùng đúng; 4 = 5 từ; 3 = 3–4 từ; 1–2 = 1–2 từ hoặc dùng sai nhiều; 0 = không có.",
  "3) ngu_phap (0–6): 6 = không lỗi; trừ 1 điểm cho mỗi lỗi ngữ pháp (lượng từ, trật tự từ, 吃/喝, 不, câu hỏi…), lỗi lặp lại cùng loại chỉ trừ 1 lần; tối thiểu 0.",
  "4) chu_han (0–4): 4 = viết đúng chữ Hán và dấu câu; trừ 1 điểm cho mỗi 2 lỗi chữ sai/thiếu dấu câu tiếng Trung (。，？); có pinyin/chữ Latinh thay cho chữ Hán thì tối đa 2.",
  "",
  "SỬA BÀI: giữ nguyên ý và cách viết của học sinh, chỉ sửa chỗ sai; không viết lại cả đoạn theo ý mình. Mỗi lỗi ghi: sai (cụm sai nguyên văn), sua (cụm đã sửa), giai_thich (tiếng Việt, ngắn, dễ hiểu cho học sinh).",
  "nhan_xet: 2–3 câu tiếng Việt, khen điểm tốt cụ thể rồi nêu 1 điều cần cải thiện.",
  "",
  "CHỈ TRẢ LỜI BẰNG JSON đúng mẫu, không thêm chữ nào khác:",
  '{"diem":{"noi_dung":0,"tu_vung":0,"ngu_phap":0,"chu_han":0},"loi":[{"sai":"","sua":"","giai_thich":""}],"ban_sua":"","nhan_xet":""}'
].join("\n");

function stats_(text) {
  var hz = (text.match(/[一-鿿]/g) || []).length;
  var sent = text.split(/[。！？!?]/).filter(function(s){ return /[一-鿿]/.test(s); }).length;
  var used = W7.filter(function(w){ return text.indexOf(w) > -1; });
  var latin = (text.match(/[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g) || []).length;
  return {hz: hz, sent: sent, used: used, latin: latin};
}

function parseJson_(t) {
  t = String(t || ""); var a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("AI không trả JSON");
  return JSON.parse(t.slice(a, b + 1));
}

function callClaude_(key, user) {
  var model = PropertiesService.getScriptProperties().getProperty("AI_MODEL") || "claude-sonnet-5-5";
  function req(withTemp) {
    var body = {model: model, max_tokens: 2500, system: SYS, messages: [{role: "user", content: user}]};
    if (withTemp) body.temperature = 0;
    return UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post", contentType: "application/json", muteHttpExceptions: true,
      headers: {"x-api-key": key, "anthropic-version": "2023-06-01"}, payload: JSON.stringify(body)});
  }
  var r = req(true);
  if (r.getResponseCode() === 400 && /temperature/i.test(r.getContentText())) r = req(false);
  if (r.getResponseCode() !== 200) throw new Error("Claude " + r.getResponseCode() + ": " + r.getContentText().slice(0, 300));
  var d = JSON.parse(r.getContentText());
  return (d.content || []).filter(function(c){ return c.type === "text"; }).map(function(c){ return c.text; }).join("");
}

function callGemini_(key, user) {
  var model = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL") || "gemini-flash-latest";
  var r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key), {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({systemInstruction: {parts: [{text: SYS}]}, contents: [{role: "user", parts: [{text: user}]}],
      generationConfig: {temperature: 0, responseMimeType: "application/json"}})});
  if (r.getResponseCode() !== 200) throw new Error("Gemini " + r.getResponseCode() + ": " + r.getContentText().slice(0, 300));
  var d = JSON.parse(r.getContentText());
  return d.candidates[0].content.parts.map(function(p){ return p.text || ""; }).join("");
}

function clamp_(v, max) { v = Math.round(+v || 0); return Math.max(0, Math.min(max, v)); }

function gradeEssay_(text) {
  var props = PropertiesService.getScriptProperties();
  var ck = props.getProperty("ANTHROPIC_API_KEY"), gk = props.getProperty("GEMINI_API_KEY");
  if (!ck && !gk) return null;
  var st = stats_(text);
  var user = "Thống kê tự động (dùng để đối chiếu, không cần nhắc lại): " + st.hz + " chữ Hán, " + st.sent + " câu, từ bài 7 xuất hiện: " +
    (st.used.join("、") || "không có") + ".\n\nĐOẠN VĂN CỦA HỌC SINH:\n" + text;
  var raw = ck ? callClaude_(ck, user) : callGemini_(gk, user);
  var ai = parseJson_(raw), d = ai.diem || {};
  // Chặn trên khách quan theo thống kê, để điểm không phụ thuộc cảm tính
  var nd = clamp_(d.noi_dung, 5), tv = clamp_(d.tu_vung, 5), np = clamp_(d.ngu_phap, 6), ch = clamp_(d.chu_han, 4);
  if (st.sent < 3 || st.hz < 30) nd = Math.min(nd, 2); else if (st.sent < 5 || st.hz < 50) nd = Math.min(nd, 4);
  var nUsed = st.used.filter(function(w){ return ["吃","饭","个","要"].indexOf(w) < 0; }).length + Math.min(2, st.used.filter(function(w){ return ["吃","饭","个","要"].indexOf(w) > -1; }).length);
  if (nUsed < 2) tv = Math.min(tv, 1); else if (nUsed < 4) tv = Math.min(tv, 3); else if (nUsed < 5) tv = Math.min(tv, 4);
  if (st.latin > 3) ch = Math.min(ch, 2);
  if (st.hz < 15) { np = Math.min(np, 2); ch = Math.min(ch, 2); }
  ai.diem = {noi_dung: nd, tu_vung: tv, ngu_phap: np, chu_han: ch};
  ai.tong = nd + tv + np + ch;
  ai.loi = (ai.loi || []).filter(function(e){ return e && (e.sai || e.sua); }).slice(0, 15);
  ai.ban_sua = String(ai.ban_sua || "");
  ai.nhan_xet = String(ai.nhan_xet || "");
  return ai;
}

// ---------- NHẬN BÀI ----------
function doPost(e) {
  var p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { p = e.parameter || {}; }
  var essay = String(p.essay || "").trim(), ai = null, aiErr = "";
  if (essay) { try { ai = gradeEssay_(essay); } catch (err) { aiErr = String(err).slice(0, 200); } }
  var b = [+p.b1 || 0, +p.b2 || 0, +p.b3 || 0, +p.b4 || 0];
  var b5 = ai ? ai.tong : (essay ? "" : 0);
  var total = Math.round((b[0] + b[1] + b[2] + b[3] + (+b5 || 0)) * 10) / 10;
  var loiTxt = ai ? (ai.loi.map(function(x){ return "• " + x.sai + " → " + x.sua + " (" + x.giai_thich + ")"; }).join("\n") +
    "\nĐiểm: ND " + ai.diem.noi_dung + "/5 · TV " + ai.diem.tu_vung + "/5 · NP " + ai.diem.ngu_phap + "/6 · CH " + ai.diem.chu_han + "/4\n" + ai.nhan_xet)
    : (aiErr ? "Lỗi AI: " + aiErr : (essay ? "Chưa có khoá AI – GV chấm tay" : ""));
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    sheet_().appendRow([new Date(), p.lop || "", p.hoc_sinh || "", total, +p.giay || 0, mmss_(p.giay),
      b[0], b[1], b[2], b[3], b5, +p.lan_nop || 1, essay, ai ? ai.ban_sua : "", loiTxt, p.chi_tiet || ""]);
  } finally { lock.releaseLock(); }
  return out_({ok: true, ai: ai, tong: total});
}

/** GET ?lop=K67 → Bảng vàng của lớp (mỗi học sinh tính LẦN NỘP ĐẦU TIÊN). Không có lop → danh sách lớp. */
function doGet(e) {
  var p = e.parameter || {}, sh = sheet_(), last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2,1,last-1,6).getValues() : [];
  var key = function(s){ return String(s).toUpperCase().replace(/\s+/g,""); };
  var classes = {}, first = {};
  rows.forEach(function(r){
    var lop = key(r[1]); if (!lop || !r[2]) return;
    classes[lop] = true;
    var id = lop + "|" + key(r[2]);
    if (!first[id]) first[id] = {lop: lop, ten: String(r[2]).trim(), diem: +r[3], giay: +r[4]};
  });
  var res = {lops: Object.keys(classes).sort()};
  if (p.lop) {
    res.lop = key(p.lop);
    res.bxh = Object.keys(first).map(function(k){ return first[k]; })
      .filter(function(x){ return x.lop === res.lop; })
      .sort(function(a,b){ return b.diem - a.diem || a.giay - b.giay; });
  }
  var json = JSON.stringify(res);
  if (p.callback) return ContentService.createTextOutput(p.callback + "(" + json + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/** Chạy thử trong trình soạn thảo để kiểm tra khoá AI. Xem kết quả ở Nhật ký thực thi. */
function testAI() {
  var r = gradeEssay_("昨天星期二。中午我去食堂吃饭。我要三包子，一碗鸡蛋汤。我吃汤，我不喝啤酒。我的朋友吃面条。");
  Logger.log(JSON.stringify(r, null, 2));
}
