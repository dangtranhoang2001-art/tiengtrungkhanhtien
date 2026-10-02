# Khánh Tiên Online – Hệ thống ra đề, chấm bài, theo dõi tiến độ

- Trang học sinh: /            (vào bằng mã lớp + họ tên)
- Trang giáo viên: /gv.html    (mật khẩu = biến TEACHER_PASSWORD)

## Biến môi trường trên Netlify (Project configuration → Environment variables)
- TEACHER_PASSWORD  (bắt buộc) mật khẩu giáo viên
- ANTHROPIC_API_KEY (không bắt buộc) bật AI chấm tự luận + AI nhận xét tiến độ
- AI_MODEL          (không bắt buộc) mặc định claude-sonnet-5-5

## Cách đưa lên Netlify qua GitHub
1. Tạo kho (repository) mới trên github.com, chọn "uploading an existing file", kéo thả toàn bộ thư mục này.
2. Netlify → dự án khanhtien-tiengtrung → Project configuration → Build & deploy → Link repository → chọn kho vừa tạo.
3. Không cần sửa thiết lập build (đã có trong netlify.toml) → Deploy.
