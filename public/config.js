// File: config.js

export const firebaseConfig = {
    apiKey: "AIzaSyAsWiIz-UJ-z0HuXBZ3yZMnB2dgVNv1VFY", // This key is intended to be public. Secure your app with Firebase Security Rules.
    authDomain: "esp32-gps-tracker-f60da.firebaseapp.com",
    databaseURL: "https://esp32-gps-tracker-f60da-default-rtdb.firebaseio.com",
    projectId: "esp32-gps-tracker-f60da",
    storageBucket: "esp32-gps-tracker-f60da.appspot.com",
    messagingSenderId: "847848429624",
    appId: "1:847848429624:web:b6d02dab7ddfebedd52ecd",
};

export const appVersion = "2.2.172"; 

export const i18n = {
    vi: { 
        lbl_dwell: "Đang ở đây", st_ok: "Cân bằng", 
        st_fall: "ĐỔ NGÃ!", st_label: "Trạng thái", btn_find: "TÌM ĐƯỜNG", 
        mode_bike: "🏍️ Xe máy", mode_car: "🚗 Xe hơi", mode_foot: "🚶 Đi bộ", 
        about_title: "Thông tin dự án", about_subject: "Môn học:", 
        val_subject: "Cơ sở và ứng dụng IoTs", about_by: "Thiết kế bởi:", 
        val_group: "Nhóm 7 tại HCM-UTE", btn_close: "Đóng", 
        val_quote: '"Chia sẻ là cách tốt nhất để học tập"', btn_buzzer: "🔊 Tìm xe", 
        btn_history: "📜 Lịch sử", btn_fall: "🔔 Té ngã", history_title: "Lịch sử di chuyển", 
        fall_title: "Lịch sử sự cố", btn_export: "Tải file Excel", 
        th_time: "Thời gian", th_lat: "Vĩ độ (Lat)", th_lng: "Kinh độ (Lng)", btn_logout: "Thoát" 
    },
    en: { 
        lbl_dwell: "Dwell Time", st_ok: "Balanced", 
        st_fall: "FALLEN!", st_label: "Status", btn_find: "DIRECTIONS", 
        mode_bike: "🏍️ Motorcycle", mode_car: "🚗 Car", mode_foot: "🚶 Walking", 
        about_title: "Project Information", about_subject: "Subject:", 
        val_subject: "Fundamentals & Applications of IoTs", about_by: "Designed by:", 
        val_group: "Group 7 at HCM-UTE", btn_close: "Close", 
        val_quote: '"Sharing is the best way of learning"', btn_buzzer: "🔊 Find Vehicle", 
        btn_history: "📜 History", btn_fall: "🔔 Falls", history_title: "Travel History", 
        fall_title: "Fall Detection History", btn_export: "Download Excel", 
        th_time: "Time", th_lat: "Latitude", th_lng: "Longitude", btn_logout: "Logout" 
    }
};