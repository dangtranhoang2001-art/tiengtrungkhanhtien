/**
 * BTVN Bài 1 (第一课 · 看图说话) — ĐỌC & GHI ÂM: 15 từ đơn / từ đôi + bài thơ 春晓
 * Nhận bản ghi âm → AI (Gemini) nghe & chấm → lưu điểm vào Sheet, lưu file ghi âm vào Google Drive → Bảng vàng.
 *
 * CÀI ĐẶT (làm 1 lần, khoảng 5 phút):
 * 1. Tạo Google Sheet mới (VD: "BTVN Bài 1 – Ghi âm") → Tiện ích mở rộng → Apps Script → xoá hết, dán toàn bộ file này → Lưu.
 * 2. Lấy khoá Gemini MIỄN PHÍ: vào aistudio.google.com → Get API key → Create API key → sao chép (dạng AIza...).
 *    Apps Script → ⚙️ Cài đặt dự án → Thuộc tính tập lệnh → Thêm thuộc tính:
 *      GEMINI_API_KEY = AIza...
 *    (Không bắt buộc) GEMINI_MODEL = gemini-flash-latest   ← mặc định
 *    Lưu ý: Claude chưa nghe được file âm thanh nên phần chấm phát âm dùng Gemini.
 * 3. Chọn hàm testSetup → ▶ Chạy → cấp quyền (Sheet + Drive + gọi mạng). Xem Nhật ký: phải thấy "OK".
 * 4. Triển khai → Tùy chọn triển khai mới → Ứng dụng web
 *      - Thực thi dưới dạng: Tôi
 *      - Người có quyền truy cập: Bất kỳ ai
 *    → Sao chép URL (…/exec) và dán vào biến SEND_URL trong docs/bai1-doc-ghi-am.html.
 * File ghi âm của học sinh được lưu trong thư mục Drive "BTVN Bài 1 – Ghi âm" (chỉ giáo viên xem được).
 */
var HEADERS = ["Thời gian nộp","Lớp","Học sinh","Điểm (/100)","Thời gian làm (giây)","Thời gian làm",
  "Phần 1 – 15 từ (/60)","Phần 2 – Bài thơ (/40)","Lỗi bật hơi","Lỗi thanh 4","Lần nộp","Số lần phải đọc lại",
  "Nguồn chấm","Nhận xét","Chi tiết","Ghi âm 15 từ","Ghi âm bài thơ"];

// Phải khớp với mảng SYL trong trang HTML (cùng thứ tự)
var SYL = [
 {py:"pà", hz:"怕", sy:[{py:"pà",tone:4,ini:"p"}]},
 {py:"kàn", hz:"看", sy:[{py:"kàn",tone:4,ini:"k"}]},
 {py:"tàng", hz:"烫", sy:[{py:"tàng",tone:4,ini:"t"}]},
 {py:"mèng", hz:"梦", sy:[{py:"mèng",tone:4,ini:"m"}]},
 {py:"fēng", hz:"风", sy:[{py:"fēng",tone:1,ini:"f"}]},
 {py:"bàn", hz:"半", sy:[{py:"bàn",tone:4,ini:"b"}]},
 {py:"kěpà", hz:"可怕", sy:[{py:"kě",tone:3,ini:"k"},{py:"pà",tone:4,ini:"p"}]},
 {py:"tóuténg", hz:"头疼", sy:[{py:"tóu",tone:2,ini:"t"},{py:"téng",tone:2,ini:"t"}]},
 {py:"dàngāo", hz:"蛋糕", sy:[{py:"dàn",tone:4,ini:"d"},{py:"gāo",tone:1,ini:"g"}]},
 {py:"hànbǎo", hz:"汉堡", sy:[{py:"hàn",tone:4,ini:"h"},{py:"bǎo",tone:3,ini:"b"}]},
 {py:"kělè", hz:"可乐", sy:[{py:"kě",tone:3,ini:"k"},{py:"lè",tone:4,ini:"l"}]},
 {py:"gōnggòng", hz:"公共", sy:[{py:"gōng",tone:1,ini:"g"},{py:"gòng",tone:4,ini:"g"}]},
 {py:"bāngmáng", hz:"帮忙", sy:[{py:"bāng",tone:1,ini:"b"},{py:"máng",tone:2,ini:"m"}]},
 {py:"nǔlì", hz:"努力", sy:[{py:"nǔ",tone:3,ini:"n"},{py:"lì",tone:4,ini:"l"}]},
 {py:"ménkǒu", hz:"门口", sy:[{py:"mén",tone:2,ini:"m"},{py:"kǒu",tone:3,ini:"k"}]}
];
var ASP = {p:1, t:1, k:1}, UNASP = {b:1, d:1, g:1};
var POEM = "春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。";
var POEM_PY = "chūn mián bù jué xiǎo, chùchù wén tí niǎo. yè lái fēng yǔ shēng, huā luò zhī duō shǎo.";

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
function folder_() {
  var name = "BTVN Bài 1 – Ghi âm", it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
/** Ghép 15 file WAV (16 kHz, 16-bit, mono) thành 1 file, cách nhau 0,5 giây. */
function concatWav_(list) {
  var data = [], gap = new Array(16000).fill(0);
  list.forEach(function(b){ if (!b) return; var x = Utilities.base64Decode(b); data = data.concat(x.slice(44), gap); });
  var le = function(n, len){ var o = []; for (var i = 0; i < len; i++) { var v = (n >> (8*i)) & 255; o.push(v > 127 ? v - 256 : v); } return o; };
  var str = function(s){ return s.split("").map(function(c){ return c.charCodeAt(0); }); };
  var head = [].concat(str("RIFF"), le(36 + data.length, 4), str("WAVEfmt "), le(16, 4), le(1, 2), le(1, 2), le(16000, 4), le(32000, 4), le(2, 2), le(16, 2), str("data"), le(data.length, 4));
  return Utilities.base64Encode(head.concat(data));
}
function saveAudio_(b64, fname) {
  if (!b64) return "";
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), "audio/wav", fname);
    return folder_().createFile(blob).getUrl();
  } catch (err) { return "Lỗi lưu: " + String(err).slice(0, 80); }
}

// ---------- AI NGHE & CHẤM ----------
var SYS = [
  "Bạn là giám khảo phát âm tiếng Trung phổ thông, chấm bài đọc của học sinh Việt Nam mới học xong bài ngữ âm đầu tiên.",
  "Bạn nhận 16 đoạn ghi âm. Đoạn 1–15: mỗi đoạn là MỘT từ (từ đơn 1 âm tiết hoặc từ đôi 2 âm tiết) đọc riêng, có ghi phiên âm mục tiêu. Đoạn 16: bài thơ 春晓 (4 câu, 20 chữ).",
  "Hãy nghe thật kỹ từng đoạn và chấm NGHIÊM TÚC nhưng công bằng. Hai trọng tâm của bài này:",
  "(1) ÂM BẬT HƠI: p, t, k (và q, ch trong bài thơ) phải có luồng hơi bật mạnh rõ rệt; b, d, g KHÔNG bật hơi. Lỗi người Việt hay gặp: đọc p/t/k thiếu hơi nghe giống b/d/g; đọc d thành 'đ' Việt; đọc k thành 'kh' Việt (cọ xát).",
  "(2) THANH 4: phải rơi mạnh, dứt khoát từ cao nhất xuống thấp nhất. Lỗi người Việt hay gặp: đọc thành thanh nặng (thấp, ngắn, không bắt đầu từ cao), thành dấu huyền (thấp và bằng), hoặc rơi quá ít.",
  "Các lỗi khác cũng ghi nhận: sai vận mẫu (an/ang, en/eng, ong đọc như 'ong' Việt...), sai thanh 1/2/3, h phải gần 'kh' Việt. Từ đôi có thanh 3 đứng trước thanh khác thì thanh 3 đọc nửa (thấp, không lên) là ĐÚNG.",
  "",
  "Trường ro (rõ): chỉ đặt false khi KHÔNG đủ nghe để chấm — quá nhỏ, quá ồn, bị cắt, không có tiếng người, hoặc rè méo. Nếu nghe được mà đọc sai thì ro = true và ghi lỗi.",
  "Với mỗi từ, liệt kê MỌI âm tiết đọc sai trong mảng loi: am (phiên âm âm tiết mục tiêu), loai là một trong 'bat_hoi' (sai bật hơi), 'thanh4' (âm tiết thanh 4 đọc sai thanh), 'thanh_dieu' (sai thanh khác), 'phu_am' (sai phụ âm khác), 'van' (sai vận mẫu), 'bo_sot' (thiếu âm tiết). Đọc đúng thì loi = [].",
  "nhan_xet: tiếng Việt, ngắn (tối đa 15 từ), cụ thể; nếu tốt thì khen ngắn.",
  "",
  "Bài thơ (đoạn 16): văn bản chuẩn " + POEM + " Phiên âm: " + POEM_PY,
  "Liệt kê MỌI chữ đọc sai, loai dùng cùng danh sách trên (thay am bằng chu).",
  "luu_loat (0–6): 6 = trôi chảy, ngắt nhịp đúng (2/3 chữ mỗi câu), không vấp; 4 = khá, vấp 1–2 chỗ; 2 = đọc từng chữ, vấp nhiều; 0 = không đọc được.",
  "",
  "CHỈ TRẢ LỜI BẰNG JSON đúng mẫu, không thêm chữ nào khác:",
  '{"tu":[{"so":1,"ro":true,"loi":[{"am":"","loai":""}],"nhan_xet":""}],' +
  '"bai_tho":{"ro":true,"loi":[{"chu":"","loai":"","mo_ta":""}],"luu_loat":0,"nhan_xet":""},"nhan_xet_chung":""}',
  "Mảng tu phải có đủ 15 phần tử, so từ 1 đến 15."
].join("\n");

function parseJson_(t) {
  t = String(t || ""); var a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("AI không trả JSON");
  return JSON.parse(t.slice(a, b + 1));
}

function callGemini_(key, parts) {
  var model = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL") || "gemini-flash-latest";
  var r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key), {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({systemInstruction: {parts: [{text: SYS}]}, contents: [{role: "user", parts: parts}],
      generationConfig: {temperature: 0, responseMimeType: "application/json"}})});
  if (r.getResponseCode() !== 200) throw new Error("Gemini " + r.getResponseCode() + ": " + r.getContentText().slice(0, 300));
  var d = JSON.parse(r.getContentText());
  return d.candidates[0].content.parts.map(function(p){ return p.text || ""; }).join("");
}

function listen_(items, poemB64) {
  var key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!key) return null;
  var parts = [];
  SYL.forEach(function(s, i){
    var d = s.sy.map(function(y){ return y.py + " (thanh " + y.tone + (ASP[y.ini] ? ", phải BẬT HƠI" : UNASP[y.ini] ? ", KHÔNG bật hơi" : "") + ")"; }).join(" + ");
    parts.push({text: "Đoạn " + (i+1) + ": từ \"" + s.hz + "\" " + s.py + " = " + d + "."});
    parts.push({inlineData: {mimeType: "audio/wav", data: items[i] || ""}});
  });
  parts.push({text: "Đoạn 16: bài thơ 春晓."});
  parts.push({inlineData: {mimeType: "audio/wav", data: poemB64 || ""}});
  return parseJson_(callGemini_(key, parts));
}

/** Tính điểm cố định từ nhận định của AI (để điểm không phụ thuộc cảm tính). */
function score_(ai) {
  var at = ai.tu || [], bt = ai.bai_tho || {}, nAsp = 0, nT4 = 0;
  var LOAI = {bat_hoi: "sai bật hơi", thanh4: "sai thanh 4", thanh_dieu: "sai thanh điệu", phu_am: "sai phụ âm", van: "sai vận mẫu", bo_sot: "thiếu âm"};
  var rows = SYL.map(function(s, i){
    var a = at.filter(function(x){ return +x.so === i + 1; })[0] || at[i] || {};
    if (a.ro === false) return {so: i+1, diem: 0, ro: false, loi: [], nhan_xet: a.nhan_xet || "Nghe không rõ"};
    var pt = 4, why = [];
    (a.loi || []).filter(function(e){ return e && e.loai; }).forEach(function(e){
      if (e.loai === "bat_hoi") { pt -= 2; nAsp++; } else if (e.loai === "thanh4") { pt -= 2; nT4++; } else pt -= 1;
      why.push((e.am ? e.am + ": " : "") + (LOAI[e.loai] || e.loai));
    });
    return {so: i+1, diem: Math.max(0, pt), ro: true, loi: why, nhan_xet: a.nhan_xet || ""};
  });
  var p1 = rows.reduce(function(t, r){ return t + r.diem; }, 0);
  var loi = (bt.loi || []).filter(function(e){ return e && e.chu; }).slice(0, 25), acc = 34;
  loi.forEach(function(e){
    if (e.loai === "bat_hoi") { acc -= 2; nAsp++; } else if (e.loai === "thanh4") { acc -= 2; nT4++; } else acc -= 1;
  });
  var ll = Math.max(0, Math.min(6, Math.round(+bt.luu_loat || 0)));
  var p2 = bt.ro === false ? 0 : Math.max(0, acc) + ll;
  return {am_tiet: rows, p1: p1, bai_tho: {ro: bt.ro !== false, loi: loi, luu_loat: ll, diem: p2, nhan_xet: bt.nhan_xet || ""},
    p2: p2, tong: p1 + p2, loi_bat_hoi: nAsp, loi_thanh4: nT4, nhan_xet: ai.nhan_xet_chung || ""};
}

// ---------- NHẬN BÀI ----------
function doPost(e) {
  var p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return out_({ok: false, err: "Dữ liệu lỗi"}); }
  var vong = +p.vong || 1, items = p.items || [], ai = null, cham = null, aiErr = "";
  try { ai = listen_(items, p.poem); } catch (err) { aiErr = String(err).slice(0, 200); }
  if (ai) {
    // Lần đầu: đoạn nào AI không nghe rõ → yêu cầu học sinh đọc lại (chưa ghi vào Sheet)
    var redo = (ai.tu || []).filter(function(a){ return a.ro === false; }).map(function(a){ return +a.so; });
    var redoPoem = ai.bai_tho && ai.bai_tho.ro === false;
    if ((redo.length || redoPoem) && vong < 2) {
      return out_({ok: true, redo: {am_tiet: redo, bai_tho: !!redoPoem,
        ly_do: (ai.tu || []).filter(function(a){ return a.ro === false; }).map(function(a){ return {so: +a.so, nhan_xet: a.nhan_xet || ""}; }),
        ly_do_tho: redoPoem ? (ai.bai_tho.nhan_xet || "") : ""}});
    }
    cham = score_(ai);
  }
  var local = p.local || {};
  var p1 = cham ? cham.p1 : (+local.p1 || 0), p2 = cham ? cham.p2 : "", total = cham ? cham.tong : p1;
  var detail = cham ? cham.am_tiet.map(function(r, i){ return (i+1) + ". " + SYL[i].hz + " " + SYL[i].py + " " + r.diem + "/4" + (r.loi && r.loi.length ? " (" + r.loi.join(", ") + ")" : "") + (r.nhan_xet ? " – " + r.nhan_xet : ""); }).join("\n") +
      "\nBài thơ: " + cham.p2 + "/40 · lưu loát " + cham.bai_tho.luu_loat + "/6" + (cham.bai_tho.loi.length ? "\nLỗi: " + cham.bai_tho.loi.map(function(x){ return x.chu + " (" + x.loai + (x.mo_ta ? ": " + x.mo_ta : "") + ")"; }).join("; ") : "")
    : (local.chi_tiet || "");
  var stamp = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyyyMMdd-HHmm"), base = (p.lop || "") + "_" + (p.hoc_sinh || "").replace(/\s+/g, "_") + "_" + stamp;
  var f1 = saveAudio_(concatWav_(items), base + "_am-tiet.wav"), f2 = saveAudio_(p.poem, base + "_bai-tho.wav");
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    sheet_().appendRow([new Date(), p.lop || "", p.hoc_sinh || "", total, +p.giay || 0, mmss_(p.giay), p1, p2,
      cham ? cham.loi_bat_hoi : "", cham ? cham.loi_thanh4 : "", +p.lan_nop || 1, +p.doc_lai || 0,
      cham ? "AI (Gemini)" : "Chấm sơ bộ trên máy – GV nghe lại" + (aiErr ? " · " + aiErr : ""),
      cham ? (cham.nhan_xet + (cham.bai_tho.nhan_xet ? "\nThơ: " + cham.bai_tho.nhan_xet : "")) : "", detail, f1, f2]);
  } finally { lock.releaseLock(); }
  return out_({ok: true, cham: cham, err: aiErr});
}

/** GET ?lop=K67 → Bảng vàng (mỗi học sinh tính LẦN NỘP ĐẦU TIÊN). Chỉ tính bài đã chấm đủ bằng AI. */
function doGet(e) {
  var p = e.parameter || {}, sh = sheet_(), last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2,1,last-1,13).getValues() : [];
  var key = function(s){ return String(s).toUpperCase().replace(/\s+/g,""); };
  var classes = {}, first = {};
  rows.forEach(function(r){
    var lop = key(r[1]); if (!lop || !r[2]) return;
    classes[lop] = true;
    if (String(r[12]).indexOf("AI") !== 0) return;
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

/** Chạy 1 lần để cấp quyền và kiểm tra khoá Gemini. Xem kết quả ở Nhật ký thực thi. */
function testSetup() {
  sheet_(); folder_();
  var key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!key) { Logger.log("Chưa có GEMINI_API_KEY – bài vẫn được lưu nhưng chỉ chấm sơ bộ."); return; }
  var t = callGemini_(key, [{text: "Trả lời đúng JSON: {\"tu\":[],\"bai_tho\":{\"ro\":true,\"loi\":[],\"luu_loat\":6,\"nhan_xet\":\"OK\"},\"nhan_xet_chung\":\"OK\"}"}]);
  Logger.log(t.indexOf("OK") > -1 ? "OK – khoá Gemini hoạt động." : "Gemini trả: " + t);
}
