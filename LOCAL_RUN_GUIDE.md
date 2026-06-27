# HƯỚNG DẪN CÀI ĐẶT VÀ VẬN HÀNH DỰ ÁN LOCAL (LOCAL RUN GUIDE)

Tài liệu này hướng dẫn chi tiết cách cài đặt, chạy thử nghiệm môi trường phát triển (Development) và vận hành dự án **WPS Tracker Web Dashboard** ngay trên máy tính cá nhân (local).

---

## 📌 1. Yêu Cầu Hệ Thống (Prerequisites)

Để vận hành ứng dụng một cách trơn tru, máy tính của bạn cần được cài đặt sẵn:
- **Node.js**: Phiên bản **18.x** trở lên (Khuyến nghị bản LTS mới nhất). Bạn có thể tải tại [nodejs.org](https://nodejs.org/).
- **NPM** (đi kèm khi cài đặt Node.js).
- **Trình duyệt Web hiện đại**: Google Chrome, Microsoft Edge, Brave hoặc Firefox (hỗ trợ đầy đủ WebGL phục vụ dựng hình 3D).
- **Kết nối Internet**: Cần thiết để tải thư viện bản đồ Leaflet, Map tiles, và truyền dữ liệu thời gian thực từ Firebase.

---

## 🚀 2. Các Bước Cài Đặt & Chạy Local (Installation)

Thực hiện lần loạt các bước sau bằng Terminal (cmd, PowerShell hoặc Git Bash):

### Bước 1: Di chuyển vào thư mục dự án chính
Mở terminal tại thư mục gốc của dự án (`gps-tracker-web`) và di chuyển vào thư mục ứng dụng `gps-tracker`:
```bash
cd gps-tracker
```

### Bước 2: Cài đặt các thư viện phụ thuộc (Dependencies)
Tải và cài đặt tất cả các thư viện cần thiết (Three.js, Leaflet, Firebase, Chart.js, XLSX...):
```bash
npm install
```

### Bước 3: Khởi chạy Máy chủ Phát triển (Development Server)
Khởi chạy dự án bằng Vite để chạy thử local:
```bash
npm run dev
```

Sau khi chạy lệnh trên, terminal sẽ hiển thị địa chỉ truy cập cục bộ, thông thường là:
👉 **`http://localhost:5173/`** hoặc **`http://localhost:5174/`**

Nhấn giữ phím `Ctrl` và click vào liên kết hoặc copy địa chỉ dán vào trình duyệt web để bắt đầu vận hành hệ thống.

---

## 🛠️ 3. Các Lệnh Vận Hành Khả Dụng (Available Commands)

Trong thư mục `gps-tracker/`, bạn có thể thực thi các lệnh sau:

| Lệnh | Chức năng | Đầu ra / Ghi chú |
| :--- | :--- | :--- |
| `npm run dev` | Chạy local server cho lập trình viên. | Hot Reload (tự động tải lại trang khi sửa code). |
| `npm run build` | Đóng gói sản phẩm cho Production. | Tạo thư mục tĩnh tối ưu hóa tại `gps-tracker/dist/`. |
| `npm run preview` | Chạy thử bản đóng gói tĩnh tại local. | Kiểm tra hiệu năng thực tế của thư mục `dist`. |

---

## ⚙️ 4. Cấu Hình Kết Nối Firebase (Firebase Settings)

Dự án đã được cấu hình sẵn cơ sở dữ liệu Firebase Realtime Database mặc định hoạt động trực tuyến. Tuy nhiên, nếu bạn muốn vận hành trên hệ thống Firebase riêng của mình:

1. Mở tệp tin cấu hình: [src/config.js](file:///c:/KhangLab/gps-tracker-web/gps-tracker/src/config.js)
2. Thay đổi giá trị hằng số `firebaseConfig` bằng các thông số ứng dụng của bạn lấy từ Firebase Console:
```javascript
export const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
};
```

---

## 🎮 5. Hướng Dẫn Vận Hành & Tương Tác Trên Giao Diện

### 🔐 A. Màn hình Đăng nhập (Authentication)
- Hệ thống sử dụng cơ chế bảo mật **Firebase Authentication**.
- **Cách đăng nhập:** Nhập Email và Mật khẩu của tài khoản đã được cấp quyền trên hệ thống. 
- *Mẹo nhỏ:* Nếu tài khoản dạng rút gọn không chứa `@` (ví dụ `admin`), hệ thống sẽ tự động thêm đuôi `@gps.com` thành `admin@gps.com` để gửi truy vấn đăng nhập lên Firebase Auth.

### 🗺️ B. Tab Bản đồ Giám sát (Real-time Map)
- **Vị trí trực tuyến:** Điểm định vị của xe hiển thị thời gian thực theo luồng dữ liệu truyền từ thiết bị phần cứng lên Firebase.
- **Trạng thái té ngã (Fall Alert):** Khi xe bị đổ ngã (dữ liệu góc nghiêng từ MPU6050 gửi về vượt ngưỡng an toàn), giao diện sẽ nhấp nháy đỏ cảnh báo liên tục, còi báo động ảo kêu và hệ thống ghi lại lịch sử sự cố.
- **Tìm đường (Directions):** Click chọn phương tiện (Xe máy, Ô tô, Đi bộ) và bấm **Tìm đường** để hiển thị tuyến đường tối ưu từ vị trí của bạn tới xe.
- **Xuất lịch sử (Export Excel):** Xem lịch sử di chuyển/sự cố theo dạng bảng dữ liệu trực quan và tải về máy tính dưới định dạng tệp tin `.xlsx` tiêu chuẩn.

### 🏍️ C. Tab Mô hình 3D (Digital Twin 3D)
Mô hình 3D được hiển thị mượt mà bằng công nghệ WebGL + Three.js với các tương tác thời gian thực:
1. **Xoay mô hình:** Nhấn giữ **chuột trái** và kéo để quay xe 360 độ ngắm các cấu kiện.
2. **Dịch chuyển camera:** Nhấn giữ **chuột phải** và kéo để tịnh tiến khung nhìn.
3. **Phóng to/Thu nhỏ:** Sử dụng nút cuộn trên chuột để Zoom xa/gần.
4. **Thay đổi màu sơn xe ga:** Click chọn trực tiếp bảng màu sơn bóng cao cấp ở góc dưới bên trái (`Màu xanh dương mặc định, Màu đỏ thể thao, Màu vàng gold...`) để đổi màu sơn dàn áo 3D ngay lập tức.
5. **Mở/Đóng cốp xe:** Click chuột trái vào phần **Yên xe** (saddle liền khối Vespa). Yên xe sẽ xoay góc mở lên mượt mà, để lộ lòng cốp rỗng màu đen và thiết bị IoT lắp đặt bên trong.
6. **Xem sơ đồ nguyên lý mạch:** Click chuột trái vào **Hộp thiết bị IoT màu xanh dương** nằm trong cốp. Giao diện sẽ hiển thị bảng sơ đồ nguyên lý mạch kết nối ESP32 - MPU6050 - Active Buzzer - WPS thu nhỏ vô cùng chi tiết. Click lại hộp hoặc bấm nút Đóng để ẩn sơ đồ.
