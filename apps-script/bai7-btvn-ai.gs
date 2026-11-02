/**
 * BTVN Bài 7 你吃什么 (nâng cao) — nhận bài + Bảng vàng + TRẢ KẾT QUẢ BÀI VIẾT DO CLAUDE CHẤM
 *
 * Google Sheet có 2 trang (tab):
 *  - "Bài nộp": mỗi lần học sinh nộp bài = 1 dòng (Bài 1–4 có điểm ngay, kèm đoạn văn Bài 5).
 *  - "Kết quả bài viết": Claude chấm & sửa đoạn văn theo thang tiêu chí → mỗi bài 1 dòng,
 *    có điểm từng tiêu chí, điểm Bài 5, TỔNG ĐIỂM cả bài, bản sửa, lỗi, nhận xét.
 * Claude (tác vụ định kỳ) tạo file "BTVN-Bai7-KETQUA…" trên Google Drive; script tự nhập vào trang
 * "Kết quả bài viết" khi học sinh bấm "Xem kết quả bài viết", khi mở Bảng vàng, hoặc khi chạy importResults.
 *
 * CÀI ĐẶT (làm 1 lần):
 * 1. Tạo Google Sheet mới, đặt tên: BTVN Bài 7 你吃什么
 * 2. Tiện ích mở rộng → Apps Script → xoá hết, dán toàn bộ file này → Lưu.
 * 3. Chọn hàm importResults → ▶ Chạy → cấp quyền (Sheet + Drive). Hai trang sẽ tự được tạo.
 * 4. Triển khai → Tùy chọn triển khai mới → Ứng dụng web
 *      - Thực thi dưới dạng: Tôi
 *      - Người có quyền truy cập: Bất kỳ ai
 *    → Sao chép URL (…/exec) để dán vào SEND_URL trong bai7-btvn.html.
 * (Không cần khoá API.)
 */
var SUB = "Bài nộp", RES = "Kết quả bài viết", RESULT_PREFIX = "BTVN-Bai7-KETQUA";
var H_SUB = ["Thời gian nộp","Lớp","Học sinh","Điểm Bài 1–4 (/80)","Thời gian làm (giây)","Thời gian làm",
  "Bài 1 Điền từ (/20)","Bài 2 Chọn câu đúng (/20)","Bài 3 Sắp xếp (/20)","Bài 4 Đọc hiểu (/20)",
  "Lần nộp","Mã bài","Đoạn văn của học sinh (Bài 5)","Chi tiết bài làm"];
var H_RES = ["Chấm lúc","Lớp","Học sinh","Mã bài","Nội dung (/5)","Từ vựng (/5)","Ngữ pháp (/6)","Chữ Hán & dấu câu (/4)",
  "Bài 5 (/20)","Bài 1–4 (/80)","TỔNG ĐIỂM (/100)","Đoạn văn gốc","Bản sửa","Lỗi","Nhận xét","Dữ liệu (không sửa)"];

function tab_(name, headers, color) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) {
    var first = ss.getSheets()[0];
    if (name === SUB && first.getLastRow() === 0 && ss.getSheets().length === 1) { sh = first; sh.setName(SUB); }
    else sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0 || sh.getRange(1,1).getValue() !== headers[0]) {
    if (sh.getLastRow() > 0) sh.insertRowBefore(1);
    sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight("bold").setBackground(color).setFontColor("#ffffff");
    sh.setFrozenRows(1);
    if (name === RES) sh.hideColumns(headers.length);
  }
  return sh;
}
function subSheet_() { return tab_(SUB, H_SUB, "#2f5d62"); }
function resSheet_() { return tab_(RES, H_RES, "#5e5a93"); }
function mmss_(s) { s = Math.round(+s || 0); return Math.floor(s/60) + ":" + ("0" + (s%60)).slice(-2); }
function key_(s) { return String(s).toUpperCase().replace(/\s+/g, ""); }
function reply_(obj, cb) {
  var json = JSON.stringify(obj);
  if (cb) return ContentService.createTextOutput(cb + "(" + json + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ---------- NHẬN BÀI ----------
function doPost(e) {
  var p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { p = e.parameter || {}; }
  var b = [+p.b1 || 0, +p.b2 || 0, +p.b3 || 0, +p.b4 || 0];
  var obj = Math.round((b[0] + b[1] + b[2] + b[3]) * 10) / 10;
  var row = [new Date(), p.lop || "", p.hoc_sinh || "", obj, +p.giay || 0, mmss_(p.giay),
    b[0], b[1], b[2], b[3], +p.lan_nop || 1, p.id || "", String(p.essay || "").trim(), p.chi_tiet || ""];
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { subSheet_().appendRow(row); } finally { lock.releaseLock(); }
  return reply_({ok: true, id: p.id || ""});
}

// ---------- NHẬP KẾT QUẢ CLAUDE ĐÃ CHẤM → TRANG "Kết quả bài viết" ----------
function importResults() {
  var sub = subSheet_(), res = resSheet_();
  var sl = sub.getLastRow(), subRows = sl > 1 ? sub.getRange(2,1,sl-1,H_SUB.length).getValues() : [];
  var rl = res.getLastRow(), done = {};
  if (rl > 1) res.getRange(2,4,rl-1,1).getValues().forEach(function(r){ done[String(r[0])] = true; });
  var byId = {}; subRows.forEach(function(r){ if (r[11]) byId[String(r[11])] = r; });
  var files = DriveApp.searchFiles('title contains "' + RESULT_PREFIX + '" and trashed = false'), add = [];
  while (files.hasNext()) {
    var data; try { data = JSON.parse(files.next().getBlob().getDataAsString("UTF-8")); } catch (err) { continue; }
    (data.ket_qua || []).forEach(function(k){
      var id = String(k.id), s = byId[id]; if (!s || done[id]) return; done[id] = true;
      var d = k.diem || {}, b5 = Math.max(0, Math.min(20, Math.round(+k.tong || 0))), obj = +s[3] || 0;
      var loi = (k.loi || []).map(function(x){ return "• " + x.sai + " → " + x.sua + (x.loai ? " [" + x.loai + "]" : "") + " — " + x.giai_thich; }).join("\n");
      k.tong = b5;
      add.push([data.cham_luc || new Date(), s[1], s[2], id, d.noi_dung, d.tu_vung, d.ngu_phap, d.chu_han,
        b5, obj, Math.round((obj + b5) * 10) / 10, s[12], k.ban_sua || "", loi, k.nhan_xet || "", JSON.stringify(k)]);
    });
  }
  if (add.length) {
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { res.getRange(res.getLastRow() + 1, 1, add.length, H_RES.length).setValues(add); } finally { lock.releaseLock(); }
  }
  return add.length;
}

function results_() {
  var res = resSheet_(), rl = res.getLastRow(), m = {};
  if (rl > 1) res.getRange(2,1,rl-1,H_RES.length).getValues().forEach(function(r){ m[String(r[3])] = r; });
  return m;
}

// ---------- TRA CỨU ----------
/** GET ?kq=1&lop=K67&ten=...  → kết quả bài viết mới nhất của học sinh.
 *  GET ?lop=K67 → Bảng vàng (mỗi học sinh tính LẦN NỘP ĐẦU TIÊN; tổng = Bài 1–4 + Bài 5 khi đã chấm). */
function doGet(e) {
  var p = e.parameter || {};
  try { importResults(); } catch (err) {}
  var sub = subSheet_(), sl = sub.getLastRow();
  var rows = sl > 1 ? sub.getRange(2,1,sl-1,H_SUB.length).getValues() : [], R = results_();
  if (p.kq) {
    for (var i = rows.length - 1; i >= 0; i--) {
      var r = rows[i];
      if (key_(r[1]) === key_(p.lop || "") && key_(r[2]) === key_(p.ten || "") && String(r[12]).trim()) {
        var g = R[String(r[11])];
        return reply_({found: true, graded: !!g, essay: r[12], tong: g ? g[10] : r[3],
          ai: g ? JSON.parse(g[15]) : null}, p.callback);
      }
    }
    return reply_({found: false}, p.callback);
  }
  var classes = {}, first = {};
  rows.forEach(function(r){
    var lop = key_(r[1]); if (!lop || !r[2]) return;
    classes[lop] = true;
    var id = lop + "|" + key_(r[2]), g = R[String(r[11])];
    if (!first[id]) first[id] = {lop: lop, ten: String(r[2]).trim(), diem: g ? +g[10] : +r[3], giay: +r[4]};
  });
  var out = {lops: Object.keys(classes).sort()};
  if (p.lop) {
    out.lop = key_(p.lop);
    out.bxh = Object.keys(first).map(function(k){ return first[k]; })
      .filter(function(x){ return x.lop === out.lop; })
      .sort(function(a, b){ return b.diem - a.diem || a.giay - b.giay; });
  }
  return reply_(out, p.callback);
}
