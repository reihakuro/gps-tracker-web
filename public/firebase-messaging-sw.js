// File: firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// 1. Khởi tạo lại Firebase trong luồng chạy ngầm
firebase.initializeApp({
    apiKey: "AIzaSyAsWiIz-UJ-z0HuXBZ3yZMnB2dgVNv1VFY",
    authDomain: "esp32-gps-tracker-f60da.firebaseapp.com",
    databaseURL: "https://esp32-gps-tracker-f60da-default-rtdb.firebaseio.com",
    projectId: "esp32-gps-tracker-f60da",
    storageBucket: "esp32-gps-tracker-f60da.appspot.com",
    messagingSenderId: "847848429624",
    appId: "1:847848429624:web:b6d02dab7ddfebedd52ecd"
});

const messaging = firebase.messaging();

// 2. Lắng nghe tin nhắn khi web ĐÃ BỊ TẮT
messaging.onBackgroundMessage(function(payload) {
    console.log('Đã nhận cảnh báo ngầm: ', payload);
    
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/564/564276.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/564/564276.png',
        vibrate: [500, 200, 500, 200, 500, 200, 500], // Rung bần bật
        requireInteraction: true // Bắt buộc user bấm vào mới tắt thông báo
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});