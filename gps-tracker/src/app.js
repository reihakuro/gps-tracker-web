import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import './style.css';

import { firebaseConfig, i18n, appVersion } from './config.js';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { initializeDataService, loadHistoryData, loadFallData, exportHistoryToExcel, exportFailsToExcel } from './dataService.js';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

L.Routing.Localization = L.Routing.Localization || {};
L.Routing.Localization['vi'] = {
    directions: {
        N: 'bắc', NE: 'đông bắc', E: 'đông', SE: 'đông nam', S: 'nam', SW: 'tây nam', W: 'tây', NW: 'tây bắc',
        SlightRight: 'Hơi rẽ phải', Right: 'Rẽ phải', SharpRight: 'Rẽ ngoặt phải',
        SlightLeft: 'Hơi rẽ trái', Left: 'Rẽ trái', SharpLeft: 'Rẽ ngoặt trái',
        Uturn: 'Quay đầu', Continue: 'Chạy tiếp', Head: 'Đi về hướng',
        DestinationReached: 'Đã đến đích', Roundabout: 'Đi vào vòng xoay',
        WaypointReached: 'Đã đến điểm dừng'
    },
    formatOrder: function(n) { return n; }
};

let currentLang = 'vi';

// TÍNH NĂNG CHỐNG TẮT MÀN HÌNH (WAKE LOCK API)
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Màn hình sẽ luôn sáng để nhận cảnh báo!');
        }
    } catch (err) {
        console.error(`Lỗi WakeLock: ${err.name}, ${err.message}`);
    }
}

// Cấp lại quyền chống tắt màn hình nếu người dùng đổi qua tab khác rồi quay lại
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
    }
});

// Initialize Firebase Auth
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const messaging = getMessaging(app);
initializeDataService(db);

// Hàm yêu cầu quyền và lấy token FCM
async function setupFCM() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            
            // Lấy VAPID key từ Firebase Console
            // Project Settings > Cloud Messaging > Web configuration > Web Push certificates
            const token = await getToken(messaging, { vapidKey: 'BBb6jJYU9g3GhTnTIgcftV_52w5_zx8ZnSbuEpF8q8RSl54IdvEY8kud5LpCLZNKrUI9qRWXTtwc2uvObLJffaU' });

            if (token) {
                console.log('FCM Token:', token);
                // QUAN TRỌNG: Bạn cần gửi token này về server và lưu lại cùng với thông tin user.
                // Backend sẽ dùng token này để gửi push notification đến đúng thiết bị này.
            } else {
                console.log('Không thể lấy token. Hãy chắc chắn bạn đã cấp quyền thông báo.');
            }
        } else {
            console.log('Không được cấp quyền nhận thông báo.');
        }
    } catch (err) {
        console.error('Lỗi khi lấy token FCM: ', err);
    }
}

// Lắng nghe tin nhắn khi người dùng đang mở app (foreground)
onMessage(messaging, (payload) => {
    console.log('Đã nhận tin nhắn (foreground): ', payload);
    const { title, body } = payload.notification;
    // Hiển thị thông báo
    new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/564/564276.png' });
});

// Ánh xạ username sang tên hiển thị đầy đủ
const nameMappings = {
    'trungkien': 'Trung Kien',
    'dinhkhang': 'Dinh Khang',
    'thanhtu': 'Thanh Tu',
    'baophuc': 'Bao Phuc',
    'tranhuy': 'Tran Huy',
};

/**
 * Lấy tên đã được định dạng của người dùng để hiển thị.
 * Ưu tiên: displayName > ánh xạ trong nameMappings > viết hoa chữ cái đầu của username.
 * @param {object} user - Đối tượng người dùng từ Firebase Auth.
 * @returns {string} Tên đã định dạng.
 */
function getFormattedName(user) {
    if (!user) return '';
    if (user.displayName) return user.displayName;

    if (user.email) {
        const username = user.email.split('@')[0];
        if (nameMappings[username]) return nameMappings[username];
        return username.charAt(0).toUpperCase() + username.slice(1);
    }
    return ''; // Trả về chuỗi rỗng nếu không có thông tin
}

// Listen for authentication state changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-overlay').style.display = 'none';
        const prefix = currentLang === 'vi' ? "Xin chào, " : "Hello, ";
        document.getElementById('welcome-text').innerText = prefix + getFormattedName(user) + "!";
        
        setTimeout(() => {
            map.invalidateSize();
        }, 400); 

        requestWakeLock();
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('login-overlay').style.opacity = '1';
        document.getElementById('welcome-text').innerText = '';
        if (wakeLock !== null) { wakeLock.release(); wakeLock = null; } 
    }
});

document.getElementById('login-btn').onclick = async () => {
    let email = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const err = document.getElementById('login-error');

    // Tự động thêm đuôi @gps.com nếu người dùng chỉ nhập username
    if (email && !email.includes('@')) {
        email += '@gps.com';
    }

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        // If successful, onAuthStateChanged will handle UI updates
        setupFCM(); // Yêu cầu quyền và lấy token sau khi đăng nhập
        requestWakeLock(); // Kích hoạt chống tắt màn hình
        setTimeout(() => { document.getElementById('login-overlay').style.display = 'none'; }, 500); 
        err.style.display = 'none'; // Hide error if previous attempt failed
    } catch (error) {
        console.error("Login error:", error.code, error.message);
        if (currentLang === 'vi') {
            err.innerText = `Đăng nhập với email "${email}" không thành công. Vui lòng kiểm tra lại.`;
        } else {
            err.innerText = `Login failed for "${email}". Please check your credentials.`;
        }
        err.style.display = 'block';
        err.style.animation = 'none';
        setTimeout(() => err.style.animation = 'shake 0.4s', 10);
    } 
}

document.getElementById('password').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
});

document.getElementById('logout-btn').onclick = async () => {
    try {
        await signOut(auth);
        // onAuthStateChanged will handle UI updates
    } catch (error) {
        console.error("Logout error:", error);
    }
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('login-error').style.display = 'none';
};

function updateUI() {
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.getAttribute('data-key');
        if (el.tagName === 'OPTION') el.text = i18n[currentLang][key];
        else el.innerHTML = i18n[currentLang][key];
    });
    document.getElementById('lang-toggle').innerText = currentLang === 'vi' ? 'EN' : 'VI';
    const user = auth.currentUser; // Get current authenticated user
    if (user) { 
        const prefix = currentLang === 'vi' ? "Xin chào, " : "Hello, "; 
        document.getElementById('welcome-text').innerText = prefix + getFormattedName(user) + "!"; 
    } else { document.getElementById('welcome-text').innerText = ''; }
    const dwellVal = document.getElementById('dwell-val').innerText;
    if (dwellVal === "Moving" || dwellVal === "Đang di chuyển") { document.getElementById('dwell-val').innerText = currentLang === 'vi' ? "Đang di chuyển" : "Moving"; }
    if (routingControl) startNavigation();
}

const infoModal = document.getElementById('info-modal');
document.getElementById('open-info').onclick = () => infoModal.style.display = 'flex';
document.getElementById('close-info').onclick = () => infoModal.style.display = 'none';

const histModal = document.getElementById('history-modal');
document.getElementById('history-btn').onclick = () => { histModal.style.display = 'flex'; loadHistoryData(); };
document.getElementById('close-history').onclick = () => histModal.style.display = 'none';

const fallModal = document.getElementById('fall-modal');
document.getElementById('fall-btn').onclick = () => { fallModal.style.display = 'flex'; loadFallData(); };
document.getElementById('close-fall').onclick = () => fallModal.style.display = 'none';

window.onclick = (e) => { 
    if(e.target == infoModal) infoModal.style.display = 'none'; 
    if(e.target == histModal) histModal.style.display = 'none'; 
    if(e.target == fallModal) fallModal.style.display = 'none'; 
}

const map = L.map('map').setView([10.762622, 106.660172], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
let esp32Pos = [10.762622, 106.660172];
const marker = L.marker(esp32Pos, { icon: L.divIcon({ html: `<div style="background:#0a84ff; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`, className: '', iconSize:[20,20] }) }).addTo(map);

let routingControl = null;

function startNavigation() {
    navigator.geolocation.getCurrentPosition(pos => {
        if (routingControl) map.removeControl(routingControl);
        
        const mode = document.getElementById('travel-mode').value;
        let routeColor = '#0a84ff';

        if (mode === 'driving') routeColor = '#ff453a'; 
        else if (mode === 'cycling') routeColor = '#0a84ff'; 
        else if (mode === 'walking') routeColor = '#32d74b'; 

        routingControl = L.Routing.control({
            waypoints: [L.latLng(pos.coords.latitude, pos.coords.longitude), L.latLng(esp32Pos[0], esp32Pos[1])],
            router: L.Routing.osrmv1({ 
                serviceUrl: `https://router.project-osrm.org/route/v1`, 
                profile: mode,
                language: currentLang
            }),
            lineOptions: { styles: [{ color: routeColor, opacity: 0.8, weight: 6 }] },
            addWaypoints: false,
            formatter: new L.Routing.Formatter({
                language: currentLang,
                formatTime: function(t) {
                    const m = Math.round(t / 60);
                    const unitMin = currentLang === 'vi' ? ' phút' : ' min';
                    const unitHour = currentLang === 'vi' ? ' giờ ' : ' h ';
                    if (m === 0) return currentLang === 'vi' ? 'Vừa tới' : 'Arrived';
                    if (m < 60) return m + unitMin;
                    return Math.floor(m / 60) + unitHour + (m % 60) + unitMin;
                }
            })
        });

        routingControl.on('routesfound', function(e) {
            const routes = e.routes;
            
            let minsPerKm = 3.5;                    // Xe máy (trung bình 3-4 phút/km)
            if (mode === 'driving') minsPerKm = 5;  // Xe hơi (trung bình 4-6 phút/km)
            if (mode === 'walking') minsPerKm = 15; // Đi bộ (15 phút/km)

            const secsPerMeter = (minsPerKm * 60) / 1000;

            routes.forEach(route => {
                route.summary.totalTime = route.summary.totalDistance * secsPerMeter;
                if (route.instructions) {
                    route.instructions.forEach(inst => {
                        inst.time = inst.distance * secsPerMeter;
                        
                        if (currentLang === 'en' && inst.name) {
                            let n = inst.name;
                            if (n.indexOf('Đường ') === 0) n = n.replace('Đường ', '') + ' Street';
                            else if (n.indexOf('Hẻm ') === 0) n = n.replace('Hẻm ', 'Alley ');
                            else if (n.indexOf('Đại lộ ') === 0) n = n.replace('Đại lộ ', '') + ' Avenue';
                            else if (n.indexOf('Phố ') === 0) n = n.replace('Phố ', '') + ' Street';
                            else if (n.indexOf('Cầu ') === 0) n = n.replace('Cầu ', '') + ' Bridge';
                            else if (n.indexOf('Vòng xoay ') === 0) n = n.replace('Vòng xoay ', 'Roundabout ');
                            n = n.replace(/Số /g, 'No. ');
                            inst.name = n;
                            inst.road = n;
                        }
                    });
                }
            });
        });

        routingControl.addTo(map);
    });
}

document.getElementById('find-way').onclick = startNavigation;
document.getElementById('lang-toggle').onclick = () => { currentLang = currentLang === 'vi' ? 'en' : 'vi'; updateUI(); };
document.getElementById('theme-toggle').onclick = () => { document.body.classList.toggle('light-mode'); document.getElementById('theme-toggle').innerText = document.body.classList.contains('light-mode') ? '☀️' : '🌙'; };

document.getElementById('buzzer-btn').onclick = () => {
    set(ref(db, 'tracker/action/ring'), true);
    alert(currentLang === 'vi' ? "Đã gửi tín hiệu bật còi tìm phương tiện!" : "Sent buzzer trigger to vehicle!");
};

let lastLat = null, lastLng = null;
let stayStartTime = null;
function checkDwellTime(lat, lng) {
    if (lastLat === null || lastLng === null) { lastLat = lat; lastLng = lng; stayStartTime = Date.now(); return; }
    const threshold = 0.00015; 
    const distance = Math.sqrt(Math.pow(lat - lastLat, 2) + Math.pow(lng - lastLng, 2));

    if (distance < threshold) {
        const diffSecs = Math.floor((Date.now() - stayStartTime) / 1000);
        const h = String(Math.floor(diffSecs / 3600)).padStart(2, '0');
        const m = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, '0');
        const s = String(diffSecs % 60).padStart(2, '0');
        document.getElementById('dwell-val').innerText = `${h}:${m}:${s}`;
    } else {
        lastLat = lat; lastLng = lng; stayStartTime = Date.now();
        document.getElementById('dwell-val').innerText = currentLang === 'vi' ? "Đang di chuyển" : "Moving";
    }
}

let offlineTimer;
let isFalling = false;
let currentSpeedVal = 0;

onValue(ref(db, 'tracker/live'), (snapshot) => {
    const data = snapshot.val();
    if (!data) { document.getElementById('connection-dot').classList.remove('online'); return; }

    document.getElementById('connection-dot').classList.add('online');
    clearTimeout(offlineTimer);
    offlineTimer = setTimeout(() => { document.getElementById('connection-dot').classList.remove('online'); }, 5000);

    if (data.gps && data.gps.lat && data.gps.lng) { 
        esp32Pos = [data.gps.lat, data.gps.lng]; 
        marker.setLatLng(esp32Pos); 
        currentSpeedVal = data.gps.speed || 0;
        checkDwellTime(data.gps.lat, data.gps.lng);
    }

    if (data.mpu) {
        const mpuX = data.mpu.gForceX || 0;
        const mpuY = data.mpu.gForceY || 0;

        const tiltCard = document.getElementById('tilt-warning'), tiltText = document.getElementById('tilt-text');
        
        if (Math.abs(mpuX) > 0.7 || Math.abs(mpuY) > 0.7) {
            tiltCard.classList.add('alert-danger'); 
            tiltText.innerText = i18n[currentLang].st_fall;
            document.body.classList.add('falling-alert');
            
            if (!isFalling) {
                isFalling = true;
                
                // GHI CHÚ: Đoạn code dưới đây tạo thông báo cục bộ.
                // Nó sẽ trở nên không cần thiết nếu bạn đã có một backend gửi push notification qua FCM,
                // vì listener onMessage ở trên sẽ xử lý việc này. Tuy nhiên, ta có thể giữ lại làm phương án dự phòng.
                if ("Notification" in window && Notification.permission === "granted") {
                    const msgTitle = currentLang === 'vi' ? 'CẢNH BÁO TỪ GPS TRACKER!' : 'GPS TRACKER ALERT!';
                    const msgBody = currentLang === 'vi' ? 'Hệ thống vừa phát hiện sự cố té ngã/đổ xe!' : 'A fall/crash has been detected!';
                    new Notification(msgTitle, {
                        body: msgBody,
                        icon: 'https://cdn-icons-png.flaticon.com/512/564/564276.png',
                        vibrate: [200, 100, 200, 100, 200, 100, 200]
                    });
                }

                const timeStr = new Date().toLocaleString('vi-VN');
                set(ref(db, 'tracker/fall_history/' + Date.now()), {
                    timestamp: timeStr, lat: esp32Pos[0], lng: esp32Pos[1]
                });
            }
        } else {
            tiltCard.classList.remove('alert-danger'); 
            tiltText.innerText = i18n[currentLang].st_ok;
            document.body.classList.remove('falling-alert');
            isFalling = false;
        }
    }
});

let lastSavedLat = null; let lastSavedLng = null;
setInterval(() => {
    if (auth.currentUser && esp32Pos[0]) { // Check if user is authenticated
        if (currentSpeedVal > 1 || lastSavedLat !== esp32Pos[0] || lastSavedLng !== esp32Pos[1]) {
            const timeStr = new Date().toLocaleString('vi-VN');
            set(ref(db, 'tracker/history/' + Date.now()), { timestamp: timeStr, lat: esp32Pos[0], lng: esp32Pos[1] });
            lastSavedLat = esp32Pos[0]; lastSavedLng = esp32Pos[1];
        }
    }
}, 30000);

document.getElementById('export-excel-btn').onclick = exportHistoryToExcel;
document.getElementById('export-fall-excel-btn').onclick = exportFailsToExcel;

// Hiển thị phiên bản ứng dụng lên giao diện
document.addEventListener('DOMContentLoaded', () => { 
    const versionDisplay = document.getElementById('app-version-display');
    if (versionDisplay) {
        versionDisplay.innerText = 'Version v' + appVersion; 
    }
});
