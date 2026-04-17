// File: config.js

export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const appVersion = "2.3.17"; 

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