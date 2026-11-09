/**
 * Nghe Bài 2 (汉语听力教程 第二课) · BTVN Bài tập 2 & 3 — nhận bài + Bảng vàng (Sheet riêng của bài này)
 * Dán toàn bộ đoạn này vào: Google Sheet → Tiện ích mở rộng → Apps Script
 * Triển khai: Triển khai → Tùy chọn triển khai mới → Ứng dụng web
 *   - Thực thi dưới dạng: Tôi
 *   - Người có quyền truy cập: Bất kỳ ai
 */
var HEADERS = ["Thời gian nộp","Lớp","Học sinh","Điểm (/10)","Thời gian làm (giây)","Thời gian làm",
  "Số ô đúng","Bài tập 2 (/21 ô)","Bài tập 3 (/12 ô)","Lần nộp","Chi tiết bài làm"];

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
// "2,4/3" → 2.4 (ghi dạng số để Sheet không hiểu nhầm thành ngày tháng)
function so_(v) { return Number(String(v || "0").split("/")[0].replace(",", ".")) || 0; }

function doPost(e) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var p = e.parameter, sh = sheet_();
    sh.appendRow([new Date(), p.lop || "", p.hoc_sinh || "", +p.diem || 0, +p.giay || 0, mmss_(p.giay),
      "'" + (p.so_cau_dung || ""), so_(p.phan1), so_(p.phan2), +p.lan_nop || 1, p.chi_tiet || ""]);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  } finally { lock.releaseLock(); }
}

/** GET ?lop=K1  → Bảng vàng của lớp (mỗi học sinh tính LẦN NỘP ĐẦU TIÊN). Không có lop → danh sách lớp. */
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
  var out = {lops: Object.keys(classes).sort()};
  if (p.lop) {
    out.lop = key(p.lop);
    out.bxh = Object.keys(first).map(function(k){ return first[k]; })
      .filter(function(x){ return x.lop === out.lop; })
      .sort(function(a,b){ return b.diem - a.diem || a.giay - b.giay; });
  }
  var json = JSON.stringify(out);
  if (p.callback) return ContentService.createTextOutput(p.callback + "(" + json + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
