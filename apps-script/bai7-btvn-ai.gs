/**
 * BTVN Bài 7 你吃什么 (nâng cao) — nhận bài + Bảng vàng + TRẢ KẾT QUẢ BÀI VIẾT DO CLAUDE CHẤM
 *
 * Cách hoạt động:
 *  - Học sinh nộp bài → ghi vào Sheet (Bài 1–4 có điểm ngay, Bài 5 để trống).
 *  - Claude (tác vụ định kỳ) đọc Sheet này trên Google Drive, chấm & sửa đoạn văn theo thang tiêu chí,
 *    rồi tạo file kết quả tên bắt đầu bằng "BTVN-Bai7-KETQUA" trong Google Drive.
 *  - Khi học sinh bấm "Xem kết quả bài viết" (hoặc khi mở Bảng vàng), script tự nhập các file kết quả
 *    vào Sheet: điền điểm Bài 5, cập nhật tổng điểm, bản sửa, lỗi, nhận xét.
 *
 * CÀI ĐẶT (làm 1 lần):
 * 1. Tạo Google Sheet mới, đặt tên đúng: BTVN Bài 7 你吃什么
 * 2. Tiện ích mở rộng → Apps Script → xoá hết, dán toàn bộ file này → Lưu.
 * 3. Chọn hàm importResults → ▶ Chạy → cấp quyền (Sheet + Drive).
 * 4. Triển khai → Tùy chọn triển khai mới → Ứng dụng web
 *      - Thực thi dưới dạng: Tôi
 *      - Người có quyền truy cập: Bất kỳ ai
 *    → Sao chép URL (…/exec) gửi để dán vào SEND_URL trong bai7-btvn.html.
 * (Không cần khoá API.)
 */
var HEADERS = ["Thời gian nộp","Lớp","Học sinh","Điểm (/100)","Thời gian làm (giây)","Thời gian làm",
  "Bài 1 Điền từ (/20)","Bài 2 Chọn câu đúng (/20)","Bài 3 Sắp xếp (/20)","Bài 4 Đọc hiểu (/20)","Bài 5 Viết đoạn (/20)",
  "Lần nộp","Mã bài","Đoạn văn của học sinh","Bản sửa","Lỗi","Nhận xét","Chấm lúc","Chi tiết bài làm"];
var C = {}; HEADERS.forEach(function(h, i){ C[h] = i + 1; });
var RESULT_PREFIX = "BTVN-Bai7-KETQUA";

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
  var essay = String(p.essay || "").trim();
  var b = [+p.b1 || 0, +p.b2 || 0, +p.b3 || 0, +p.b4 || 0];
  var b5 = essay ? "" : 0;
  var total = Math.round((b[0] + b[1] + b[2] + b[3]) * 10) / 10;
  var row = [new Date(), p.lop || "", p.hoc_sinh || "", total, +p.giay || 0, mmss_(p.giay),
    b[0], b[1], b[2], b[3], b5, +p.lan_nop || 1, p.id || "", essay, "", "", "", "", p.chi_tiet || ""];
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { sheet_().appendRow(row); } finally { lock.releaseLock(); }
  return reply_({ok: true, id: p.id || "", tong: total, cho_cham: !!essay});
}

// ---------- NHẬP KẾT QUẢ CLAUDE ĐÃ CHẤM ----------
function importResults() {
  var sh = sheet_(), last = sh.getLastRow(); if (last < 2) return 0;
  var ids = sh.getRange(2, C["Mã bài"], last - 1, 1).getValues().map(function(r){ return String(r[0]); });
  var files = DriveApp.searchFiles('title contains "' + RESULT_PREFIX + '" and trashed = false'), n = 0;
  while (files.hasNext()) {
    var f = files.next(), data;
    try { data = JSON.parse(f.getBlob().getDataAsString("UTF-8")); } catch (err) { continue; }
    (data.ket_qua || []).forEach(function(k){
      var i = ids.indexOf(String(k.id)); if (i < 0) return;
      var r = i + 2;
      if (sh.getRange(r, C["Chấm lúc"]).getValue()) return;          // đã nhập rồi
      var d = k.diem || {}, tong = Math.max(0, Math.min(20, Math.round(+k.tong || 0)));
      var obj = sh.getRange(r, C["Bài 1 Điền từ (/20)"], 1, 4).getValues()[0].reduce(function(a, x){ return a + (+x || 0); }, 0);
      var loi = (k.loi || []).map(function(x){ return "• " + x.sai + " → " + x.sua + (x.loai ? " [" + x.loai + "]" : "") + " — " + x.giai_thich; }).join("\n");
      sh.getRange(r, C["Bài 5 Viết đoạn (/20)"]).setValue(tong);
      sh.getRange(r, C["Điểm (/100)"]).setValue(Math.round((obj + tong) * 10) / 10);
      sh.getRange(r, C["Bản sửa"]).setValue(k.ban_sua || "");
      sh.getRange(r, C["Lỗi"]).setValue(loi + "\nND " + (d.noi_dung != null ? d.noi_dung : "") + "/5 · TV " + (d.tu_vung != null ? d.tu_vung : "") + "/5 · NP " + (d.ngu_phap != null ? d.ngu_phap : "") + "/6 · CH " + (d.chu_han != null ? d.chu_han : "") + "/4");
      sh.getRange(r, C["Nhận xét"]).setValue(k.nhan_xet || "");
      sh.getRange(r, C["Chấm lúc"]).setValue(data.cham_luc || new Date());
      PropertiesService.getScriptProperties().setProperty("kq_" + k.id, JSON.stringify(k));
      n++;
    });
  }
  return n;
}

// ---------- TRA CỨU ----------
/** GET ?kq=1&lop=K67&ten=...  (hoặc &id=...) → kết quả bài viết mới nhất của học sinh.
 *  GET ?lop=K67 → Bảng vàng (mỗi học sinh tính LẦN NỘP ĐẦU TIÊN). Không có lop → danh sách lớp. */
function doGet(e) {
  var p = e.parameter || {};
  try { importResults(); } catch (err) {}
  var sh = sheet_(), last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
  if (p.kq) {
    var found = null;
    for (var i = rows.length - 1; i >= 0; i--) {
      var r = rows[i];
      if (p.id ? String(r[C["Mã bài"] - 1]) === String(p.id)
               : (key_(r[1]) === key_(p.lop || "") && key_(r[2]) === key_(p.ten || "") && String(r[C["Đoạn văn của học sinh"] - 1]).trim())) { found = r; break; }
    }
    if (!found) return reply_({found: false}, p.callback);
    var id = String(found[C["Mã bài"] - 1]), saved = PropertiesService.getScriptProperties().getProperty("kq_" + id);
    return reply_({found: true, graded: !!saved, essay: found[C["Đoạn văn của học sinh"] - 1], tong: found[3],
      ai: saved ? JSON.parse(saved) : null, nop_luc: found[0]}, p.callback);
  }
  var classes = {}, first = {};
  rows.forEach(function(r){
    var lop = key_(r[1]); if (!lop || !r[2]) return;
    classes[lop] = true;
    var id = lop + "|" + key_(r[2]);
    if (!first[id]) first[id] = {lop: lop, ten: String(r[2]).trim(), diem: +r[3], giay: +r[4]};
  });
  var res = {lops: Object.keys(classes).sort()};
  if (p.lop) {
    res.lop = key_(p.lop);
    res.bxh = Object.keys(first).map(function(k){ return first[k]; })
      .filter(function(x){ return x.lop === res.lop; })
      .sort(function(a, b){ return b.diem - a.diem || a.giay - b.giay; });
  }
  return reply_(res, p.callback);
}
