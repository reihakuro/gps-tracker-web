import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import './style.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { firebaseConfig, i18n, appVersion } from './config.js';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get } from "firebase/database";
import { getAuth, signOut, onAuthStateChanged } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { initializeDataService, loadFallData, exportFailsToExcel } from './dataService.js';

const getEl = id => document.getElementById(id);

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

// Wake lock
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

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
    }
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const messaging = getMessaging(app);
initializeDataService(db);

async function setupFCM() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            const token = await getToken(messaging, { vapidKey: 'BBb6jJYU9g3GhTnTIgcftV_52w5_zx8ZnSbuEpF8q8RSl54IdvEY8kud5LpCLZNKrUI9qRWXTtwc2uvObLJffaU' });
            if (token) console.log('FCM Token:', token);
            else console.log('Không thể lấy token.');
        } else {
            console.log('Không được cấp quyền nhận thông báo.');
        }
    } catch (err) { console.error('Lỗi khi lấy token FCM: ', err); }
}

onMessage(messaging, (payload) => {
    console.log('Đã nhận tin nhắn (foreground): ', payload);
    const { title, body } = payload.notification || {};
    if (title) new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/564/564276.png' });
});

const nameMappings = {
    'trungkien': 'Trung Kien',
    'dinhkhang': 'Dinh Khang',
    'thanhtu': 'Thanh Tu',
    'baophuc': 'Bao Phuc',
    'tranhuy': 'Tran Huy',
};

function getFormattedName(user) {
    if (!user) return '';
    if (user.displayName) return user.displayName;
    if (user.email) {
        const username = user.email.split('@')[0];
        if (nameMappings[username]) return nameMappings[username];
        return username.charAt(0).toUpperCase() + username.slice(1);
    }
    return '';
}

let map = null;
let marker = null;
let esp32Pos = [10.762622, 106.660172];
let routingControl = null;
let offlineTimer;
let isFalling = false;
let currentSpeedVal = 0;

// Auth guard: redirect to login if not authenticated
onAuthStateChanged(auth, (user) => {
    const welcomeEl = getEl('welcome-text');
    if (user) {
        const prefix = currentLang === 'vi' ? "Xin chào, " : "Hello, ";
        if (welcomeEl) welcomeEl.innerText = prefix + getFormattedName(user) + "!";
        if (map) setTimeout(() => map.invalidateSize(), 400);
        requestWakeLock();
        setupFCM();
    } else {
        // Not logged in → redirect to login page
        window.location.href = '/login.html';
    }
});

// Logout handler
const logoutBtn = getEl('logout-btn');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        try {
            await signOut(auth);
            window.location.href = '/login.html';
        } catch (error) {
            console.error("Logout error:", error);
        }
    }
}

function updateUI() {
    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.getAttribute('data-key');
        if (i18n[currentLang][key]) {
            if (el.tagName === 'OPTION') el.text = i18n[currentLang][key];
            else el.innerHTML = i18n[currentLang][key];
        }
    });
    const langToggle = getEl('lang-toggle'); if (langToggle) langToggle.innerText = currentLang === 'vi' ? 'EN' : 'VI';
    const user = auth.currentUser;
    const welcomeEl = getEl('welcome-text'); if (user && welcomeEl) { const prefix = currentLang === 'vi' ? "Xin chào, " : "Hello, "; welcomeEl.innerText = prefix + getFormattedName(user) + "!"; }
    const dwellEl = getEl('dwell-val'); if (dwellEl) {
        const dv = dwellEl.innerText; if (dv === "Moving" || dv === "Đang di chuyển") dwellEl.innerText = currentLang === 'vi' ? "Đang di chuyển" : "Moving";
    }
    
    // Sync 3D telemetry and hover labels on language change
    const telemetryTrunk = document.getElementById('telemetry-trunk');
    if (telemetryTrunk) {
        telemetryTrunk.innerText = trunkOpen ? (currentLang === 'vi' ? 'Mở' : 'Open') : (currentLang === 'vi' ? 'Đóng' : 'Closed');
    }
    const telemetryStatus = document.getElementById('telemetry-status');
    if (telemetryStatus) {
        telemetryStatus.innerText = isFalling ? (currentLang === 'vi' ? 'ĐỔ NGÃ!' : 'FALLEN!') : (currentLang === 'vi' ? 'Cân bằng' : 'Balanced');
    }
    const hoverTip = document.getElementById('hover-tip-text');
    if (hoverTip) {
        hoverTip.innerText = currentLang === 'vi' ? 'Nhấp chuột trái & kéo để xoay xe' : 'Left-click & drag to rotate vehicle';
    }
    const circName = document.getElementById('circuit-comp-name');
    if (circName && (circName.innerText === 'Chọn linh kiện' || circName.innerText === 'Select Component' || circName.innerText === '')) {
        circName.innerText = currentLang === 'vi' ? 'Chọn linh kiện' : 'Select Component';
    }
    const circDesc = document.getElementById('circuit-comp-desc');
    if (circDesc && (circDesc.innerText.includes('Di chuột') || circDesc.innerText.includes('Hover over') || circDesc.innerText.includes('Nhấp chọn') || circDesc.innerText.includes('Click on') || circDesc.innerText === '')) {
        circDesc.innerText = currentLang === 'vi' ? 'Nhấp chọn linh kiện trên sơ đồ để xem vai trò và thông tin kết nối chi tiết.' : 'Click on a component in the schematic to view its role and detailed connection pinouts.';
    }
    
    if (routingControl) startNavigation();
}

// Modal handlers (only if present)
let infoModal = getEl('info-modal'); 
if (getEl('open-info')) getEl('open-info').onclick = () => { if (infoModal) { infoModal.style.display = 'flex'; setTimeout(() => infoModal.style.opacity = '1', 10); } };
if (getEl('close-info')) getEl('close-info').onclick = () => { if (infoModal) { infoModal.style.opacity = '0'; setTimeout(() => infoModal.style.display = 'none', 300); } };

let fallModal = getEl('fall-modal'); 
if (getEl('fall-btn')) getEl('fall-btn').onclick = () => { if (fallModal) { fallModal.style.display = 'flex'; setTimeout(() => fallModal.style.opacity = '1', 10); loadFallData(); } };
if (getEl('close-fall')) getEl('close-fall').onclick = () => { if (fallModal) { fallModal.style.opacity = '0'; setTimeout(() => fallModal.style.display = 'none', 300); } };

window.addEventListener('click', (e) => {
    if (infoModal && e.target == infoModal) { infoModal.style.opacity = '0'; setTimeout(() => infoModal.style.display = 'none', 300); }
    if (fallModal && e.target == fallModal) { fallModal.style.opacity = '0'; setTimeout(() => fallModal.style.display = 'none', 300); }
});

// Initialize map only if #map exists on the page
if (getEl('map')) {
    try {
        let container = L.DomUtil.get('map');
        if (container != null && container._leaflet_id) {
            container._leaflet_id = null;
        }
        map = L.map('map', { zoomControl: false }).setView([10.762622, 106.660172], 16);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        marker = L.marker(esp32Pos, { icon: L.divIcon({ html: `<div style="background:var(--primary, #71A5DE); width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`, className: '', iconSize:[20,20] }) }).addTo(map);
        
        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 500);
    } catch (err) {
        console.error("Leaflet initialization error:", err);
    }
}

function startNavigation() {
    if (!map) return;
    navigator.geolocation.getCurrentPosition(pos => {
        if (routingControl) map.removeControl(routingControl);
        const modeEl = getEl('travel-mode'); if (!modeEl) return;
        const mode = modeEl.value;
        let routeColor = '#71A5DE';
        if (mode === 'driving') routeColor = '#E05252'; else if (mode === 'cycling') routeColor = '#71A5DE'; else if (mode === 'walking') routeColor = '#4CAF7D';

        routingControl = L.Routing.control({
            waypoints: [L.latLng(pos.coords.latitude, pos.coords.longitude), L.latLng(esp32Pos[0], esp32Pos[1])],
            router: L.Routing.osrmv1({ serviceUrl: `https://router.project-osrm.org/route/v1`, profile: mode, language: currentLang }),
            lineOptions: { styles: [{ color: routeColor, opacity: 0.8, weight: 6 }] }, addWaypoints: false,
            formatter: new L.Routing.Formatter({ language: currentLang, formatTime: function(t) {
                const m = Math.round(t / 60); const unitMin = currentLang === 'vi' ? ' phút' : ' min'; const unitHour = currentLang === 'vi' ? ' giờ ' : ' h ';
                if (m === 0) return currentLang === 'vi' ? 'Vừa tới' : 'Arrived'; if (m < 60) return m + unitMin;
                return Math.floor(m / 60) + unitHour + (m % 60) + unitMin;
            }})
        });

        routingControl.on('routesfound', function(e) {
            const routes = e.routes; let minsPerKm = 3.5; if (mode === 'driving') minsPerKm = 5; if (mode === 'walking') minsPerKm = 15;
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
                            inst.name = n; inst.road = n;
                        }
                    });
                }
            });
        });

        routingControl.addTo(map);
    });
}

if (getEl('find-way')) getEl('find-way').onclick = startNavigation;
if (getEl('lang-toggle')) getEl('lang-toggle').onclick = () => { currentLang = currentLang === 'vi' ? 'en' : 'vi'; updateUI(); };
if (getEl('theme-toggle')) getEl('theme-toggle').onclick = () => { 
    document.body.classList.toggle('dark-mode'); 
    if (getEl('theme-toggle')) getEl('theme-toggle').innerText = document.body.classList.contains('dark-mode') ? '☀️' : '🌙'; 
    if (typeof update3DTheme === 'function') update3DTheme();
};
if (getEl('buzzer-btn')) getEl('buzzer-btn').onclick = () => { set(ref(db, 'tracker/action/ring'), true); alert(currentLang === 'vi' ? "Đã gửi tín hiệu bật còi tìm phương tiện!" : "Sent buzzer trigger to vehicle!"); };

let lastLat = null, lastLng = null; let stayStartTime = null;
function checkDwellTime(lat, lng) {
    if (!getEl('dwell-val')) return;
    if (lastLat === null || lastLng === null) { lastLat = lat; lastLng = lng; stayStartTime = Date.now(); return; }
    const threshold = 0.00015; const distance = Math.sqrt(Math.pow(lat - lastLat, 2) + Math.pow(lng - lastLng, 2));
    if (distance < threshold) {
        const diffSecs = Math.floor((Date.now() - stayStartTime) / 1000);
        const h = String(Math.floor(diffSecs / 3600)).padStart(2, '0');
        const m = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, '0');
        const s = String(diffSecs % 60).padStart(2, '0');
        getEl('dwell-val').innerText = `${h}:${m}:${s}`;
    } else {
        lastLat = lat; lastLng = lng; stayStartTime = Date.now(); getEl('dwell-val').innerText = currentLang === 'vi' ? "Đang di chuyển" : "Moving";
    }
}

onValue(ref(db, 'tracker/live'), (snapshot) => {
    const data = snapshot.val();
    const connDot = getEl('connection-dot');
    if (!data) { if (connDot) connDot.classList.remove('online'); return; }
    if (connDot) connDot.classList.add('online');
    clearTimeout(offlineTimer);
    offlineTimer = setTimeout(() => { if (connDot) connDot.classList.remove('online'); }, 5000);
    if (data.gps && data.gps.lat && data.gps.lng) {
        esp32Pos = [data.gps.lat, data.gps.lng]; if (marker) marker.setLatLng(esp32Pos);
        currentSpeedVal = data.gps.speed || 0; checkDwellTime(data.gps.lat, data.gps.lng);

        // Update 3D telemetry
    }
    if (data.mpu) {
        const mpuX = data.mpu.gForceX || 0; const mpuY = data.mpu.gForceY || 0;
        
        // Compute tilt angle in radians
        const angle = Math.atan2(mpuX, 1.0);
        currentTiltVal = angle;

        const telemetryAngle = document.getElementById('telemetry-angle');
        if (telemetryAngle) {
            telemetryAngle.innerText = Math.abs(angle * 180 / Math.PI).toFixed(1) + '°';
        }

        const telemetryStatus = document.getElementById('telemetry-status');
        if (telemetryStatus) {
            telemetryStatus.innerText = isFalling ? (currentLang === 'vi' ? 'ĐỔ NGÃ!' : 'FALLEN!') : (currentLang === 'vi' ? 'Cân bằng' : 'Balanced');
            telemetryStatus.className = 'telemetry-val ' + (isFalling ? 'font-danger' : 'font-success');
        }

        const tiltCard = getEl('tilt-warning'), tiltText = getEl('tilt-text');
        if ((tiltCard && tiltText) && (Math.abs(mpuX) > 0.7 || Math.abs(mpuY) > 0.7)) {
            tiltCard.classList.add('alert-danger'); tiltText.innerText = i18n[currentLang].st_fall; document.body.classList.add('falling-alert');
            
            const prevFalling = isFalling;
            isFalling = true;
            
            if (!prevFalling) {
                if ("Notification" in window && Notification.permission === "granted") {
                    const msgTitle = currentLang === 'vi' ? 'CẢNH BÁO TỪ WPS TRACKER!' : 'WPS TRACKER ALERT!';
                    const msgBody = currentLang === 'vi' ? 'Hệ thống vừa phát hiện sự cố té ngã/đổ xe!' : 'A fall/crash has been detected!';
                    new Notification(msgTitle, { body: msgBody, icon: 'https://cdn-icons-png.flaticon.com/512/564/564276.png', vibrate: [200,100,200,100,200,100,200] });
                }
                const timeStr = new Date().toLocaleString('vi-VN');
                set(ref(db, 'tracker/fall_history/' + Date.now()), { timestamp: timeStr, lat: esp32Pos[0], lng: esp32Pos[1] });
            }
        } else {
            if (tiltCard) tiltCard.classList.remove('alert-danger'); if (tiltText) tiltText.innerText = i18n[currentLang].st_ok; document.body.classList.remove('falling-alert'); isFalling = false;
        }
    }
});

let lastSavedLat = null; let lastSavedLng = null;
setInterval(() => {
    if (auth.currentUser && esp32Pos[0]) {
        if (currentSpeedVal > 1 || lastSavedLat !== esp32Pos[0] || lastSavedLng !== esp32Pos[1]) {
            const timeStr = new Date().toLocaleString('vi-VN');
            set(ref(db, 'tracker/history/' + Date.now()), { timestamp: timeStr, lat: esp32Pos[0], lng: esp32Pos[1] });
            lastSavedLat = esp32Pos[0]; lastSavedLng = esp32Pos[1];
        }
    }
}, 30000);

const exportFallBtn = getEl('export-fall-excel-btn'); if (exportFallBtn) exportFallBtn.onclick = exportFailsToExcel;

// Hiển thị phiên bản ứng dụng lên giao diện
document.addEventListener('DOMContentLoaded', () => { 
    const versionDisplay = document.getElementById('app-version-display');
    if (versionDisplay) {
        versionDisplay.innerText = 'Version v' + appVersion; 
    }

    // Khởi tạo tab chuyển đổi và sơ đồ mạch tương tác
    setupTabSwitching();
    setupCircuitSchematicInteractions();
});

// ==========================================
// --- 3D ENGINE & SCHEMATIC INTEGRATION ---
// ==========================================

// --- 3D ENGINE VARIABLES ---
let scene, camera, renderer, controls;
let motorcycleGroup, trunkLidGroup, iotDeviceMesh, bodyMaterial;
let trunkOpen = false;
let targetTrunkRotation = 0;
let currentTrunkRotation = 0;
let is3DInitialized = false;
let animationFrameId = null;
let currentTiltVal = 0;

// Khởi động Engine 3D
function init3D() {
    if (is3DInitialized) return;
    
    const container = document.getElementById('canvas-3d');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    // 1. Tạo Scene
    const isDark = document.body.classList.contains('dark-mode');
    const bgColor = isDark ? 0x121620 : 0xf8f9fb;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, 0.05);

    // 2. Tạo Camera
    camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 100);
    camera.position.set(5, 3, 6);

    // 3. Tạo Renderer
    renderer = new THREE.WebGLRenderer({ canvas: container, antialias: true });
    renderer.setSize(rect.width, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    // 4. Tạo Controls (Điều khiển xoay camera)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Không xoay xuống dưới sàn
    controls.minDistance = 3;
    controls.maxDistance = 15;

    // 5. Thêm Grid & Mặt sàn (Đã loại bỏ theo yêu cầu để chỉ hiển thị xe)

    // 6. Ánh sáng
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x83b0e1, 0.8);
    rimLight.position.set(-6, 5, -5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-2, -5, 2);
    scene.add(fillLight);

    const pointLight = new THREE.PointLight(0x5b8fc8, 1.0, 10);
    pointLight.position.set(-1.2, 2.0, 0); // Đèn LED xanh phía trên cốp xe
    scene.add(pointLight);

    // 7. Dựng mô hình 3D xe máy
    createMotorcycleModel();

    // 8. Đăng ký sự kiện thay đổi kích thước cửa sổ
    window.addEventListener('resize', resize3D);
    
    // 9. Raycasting xử lý sự kiện nhấp chuột
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    container.addEventListener('click', (e) => {
        const canvasRect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
        mouse.y = -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        const clickable = [trunkLidGroup, iotDeviceMesh];
        const intersects = raycaster.intersectObjects(clickable, true);

        if (intersects.length > 0) {
            let clickedObj = intersects[0].object;
            
            // Kiểm tra xem nhấp vào cốp (hoặc yên xe thuộc group cốp) hay thiết bị IoT
            let isTrunk = false;
            let temp = clickedObj;
            while (temp) {
                if (temp === trunkLidGroup) { isTrunk = true; break; }
                temp = temp.parent;
            }

            if (isTrunk) {
                // Đảo trạng thái mở cốp
                trunkOpen = !trunkOpen;
                targetTrunkRotation = trunkOpen ? -Math.PI / 2.2 : 0;
                
                const trunkText = trunkOpen ? (currentLang === 'vi' ? 'Mở' : 'Open') : (currentLang === 'vi' ? 'Đóng' : 'Closed');
                document.getElementById('telemetry-trunk').innerText = trunkText;
                document.getElementById('telemetry-trunk').className = 'telemetry-val ' + (trunkOpen ? 'font-success' : 'font-warning');
            } else if (clickedObj === iotDeviceMesh) {
                // Chỉ mở được mạch điện khi cốp đã mở rộng hoàn toàn (tránh click xuyên qua yên xe khi cốp đang đóng)
                if (trunkOpen && currentTrunkRotation < -1.1) {
                    const circuitModal = document.getElementById('circuit-modal');
                    if (circuitModal) { circuitModal.style.display = 'flex'; setTimeout(() => circuitModal.style.opacity = '1', 10); }
                }
            }
        }
    });

    // Khởi tạo & thiết lập màu sơn xe đã lưu hoặc mặc định
    window.changeVehicleColor = function(colorHex) {
        if (bodyMaterial) {
            bodyMaterial.color.set(colorHex);
        }
        localStorage.setItem('scooter_paint_color', colorHex);
        
        // Cập nhật trạng thái hiển thị của nút
        const buttons = document.querySelectorAll('.color-btn');
        buttons.forEach(btn => {
            if (btn.getAttribute('data-color') === colorHex) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };
    
    // Áp dụng màu sơn lưu trong localStorage hoặc màu xanh dương mặc định
    const savedColor = localStorage.getItem('scooter_paint_color') || '#1d4ed8';
    window.changeVehicleColor(savedColor);
    
    // Đăng ký sự kiện chọn màu sơn xe máy
    const picker = document.querySelector('.color-picker-section');
    if (picker) {
        picker.addEventListener('click', (e) => {
            const btn = e.target.closest('.color-btn');
            if (btn) {
                const colorHex = btn.getAttribute('data-color');
                if (colorHex) {
                    window.changeVehicleColor(colorHex);
                }
            }
        });
    }

    is3DInitialized = true;
}

function resize3D() {
    if (!is3DInitialized || !renderer || !camera) return;
    const container = document.getElementById('canvas-3d').parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
}

function update3DTheme() {
    if (!scene || !is3DInitialized) return;
    const isDark = document.body.classList.contains('dark-mode');
    const bgColor = isDark ? 0x121620 : 0xf8f9fb;
    const floorColor = isDark ? 0x1a2030 : 0xffffff;
    
    scene.background.setHex(bgColor);
    if (scene.fog) {
        scene.fog.color.setHex(bgColor);
    }
    
    scene.traverse((child) => {
        if (child.name === 'floorMesh' && child.material) {
            child.material.color.setHex(floorColor);
        }
    });
}

// Vòng lặp render mô hình
function animate() {
    if (!is3DInitialized) return;
    animationFrameId = requestAnimationFrame(animate);

    // Xoay cốp xe trơn tru (nội suy)
    currentTrunkRotation += (targetTrunkRotation - currentTrunkRotation) * 0.1;
    if (trunkLidGroup) {
        trunkLidGroup.rotation.z = currentTrunkRotation; // xoay quanh trục khớp Z
    }

    // Nhấp nháy đèn LED trên thiết bị IoT
    if (iotDeviceMesh && iotDeviceMesh.parent) {
        const led = iotDeviceMesh.parent.children[1];
        if (led && led.material) {
            led.material.opacity = 0.3 + Math.abs(Math.sin(Date.now() * 0.005)) * 0.7;
            led.material.transparent = true;
        }
    }

    // Nghiêng xe máy thời gian thực theo cảm biến MPU6050
    if (motorcycleGroup) {
        let targetLean = currentTiltVal;
        
        // Nếu đổ ngã, nghiêng xe nằm hẳn ra đất (góc nghiêng khoảng 70 độ)
        if (isFalling) {
            targetLean = 1.2; 
        }
        
        motorcycleGroup.rotation.z += (targetLean - motorcycleGroup.rotation.z) * 0.1;
    }

    controls.update();
    renderer.render(scene, camera);
}

// Xây dựng xe máy 3D bằng các khối nguyên bản
function createMotorcycleModel() {
    motorcycleGroup = new THREE.Group();

    // 1. Khung xe & Các chất liệu
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x374151, // Xám đậm cứng cáp
        metalness: 0.8,
        roughness: 0.2
    });
    const chromeMat = new THREE.MeshStandardMaterial({
        color: 0xf3f4f6,
        metalness: 0.98,
        roughness: 0.03
    });
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.95,
        roughness: 0.08
    });
    const neonMaterial = new THREE.MeshBasicMaterial({
        color: 0x00f3ff // Đèn LED neon xanh ngọc phản quang
    });
    const carbonMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x111827, 
        roughness: 0.6, 
        metalness: 0.1 
    });
    const seatMaterial = new THREE.MeshStandardMaterial({
        color: 0x1f2937, // Da đen anthracite sang trọng
        roughness: 0.9,
        metalness: 0.02
    });
    
    // Khởi tạo bodyMaterial (sử dụng MeshPhysicalMaterial giả lập lớp sơn ô tô bóng bẩy)
    bodyMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x1d4ed8, // Màu mặc định (sẽ được cập nhật từ localStorage)
        metalness: 0.85,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05
    });
    
    // Khung sườn chịu lực chính chạy ngang dưới gầm
    const mainFrameGeom = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8);
    const mainFrame = new THREE.Mesh(mainFrameGeom, frameMaterial);
    mainFrame.rotation.z = Math.PI / 2;
    mainFrame.position.set(-0.2, 0.65, 0);
    motorcycleGroup.add(mainFrame);

    // Cột chạc ba cổ xe (Fork Column) nghiêng về sau nối bánh trước lên ghi đông
    const forkColGeom = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8);
    const forkCol = new THREE.Mesh(forkColGeom, frameMaterial);
    forkCol.rotation.z = 0.38;
    forkCol.position.set(1.6, 1.35, 0);
    motorcycleGroup.add(forkCol);

    // 2. Bánh xe mâm đúc 5 chấu đôi thể thao hiện đại
    const tireMaterial = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.85,
        metalness: 0.02
    });
    const hubMaterial = new THREE.MeshStandardMaterial({
        color: 0xd4d4d8,
        metalness: 0.9,
        roughness: 0.15
    });
    const brakeDiscMaterial = new THREE.MeshStandardMaterial({
        color: 0x9ca3af,
        metalness: 0.95,
        roughness: 0.25
    });
    const caliperMaterial = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        metalness: 0.35,
        roughness: 0.2
    });

    function createDetailedWheel() {
        const wheelGroup = new THREE.Group();
        
        // Lốp xe dạng tròn Torus
        const tireGeom = new THREE.TorusGeometry(0.48, 0.13, 16, 80);
        const tire = new THREE.Mesh(tireGeom, tireMaterial);
        wheelGroup.add(tire);

        // Trục bánh xe (Hub)
        const hubGeom = new THREE.CylinderGeometry(0.11, 0.11, 0.24, 16);
        const hub = new THREE.Mesh(hubGeom, hubMaterial);
        hub.rotation.x = Math.PI / 2;
        wheelGroup.add(hub);

        // Mâm 5 chấu kép chữ V thể thao
        const spokeGeom = new THREE.BoxGeometry(0.03, 0.36, 0.05);
        for (let i = 0; i < 5; i++) {
            const spokeGroup = new THREE.Group();
            spokeGroup.rotation.z = (i * 2 * Math.PI) / 5;
            
            // Nhánh V bên trái
            const spokeL = new THREE.Mesh(spokeGeom, hubMaterial);
            spokeL.position.set(-0.03, 0.22, 0);
            spokeL.rotation.z = 0.15;
            spokeGroup.add(spokeL);
            
            // Nhánh V bên phải
            const spokeR = new THREE.Mesh(spokeGeom, hubMaterial);
            spokeR.position.set(0.03, 0.22, 0);
            spokeR.rotation.z = -0.15;
            spokeGroup.add(spokeR);

            wheelGroup.add(spokeGroup);
        }

        // Đĩa phanh kim loại đục lỗ
        const discGeom = new THREE.CylinderGeometry(0.33, 0.33, 0.012, 24);
        const disc = new THREE.Mesh(discGeom, brakeDiscMaterial);
        disc.rotation.x = Math.PI / 2;
        disc.position.z = 0.07;
        wheelGroup.add(disc);

        // Bổ sung các lỗ đĩa phanh để tăng tính chân thực
        const holeGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6);
        const holeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
        for (let j = 0; j < 12; j++) {
            const angle = (j * 2 * Math.PI) / 12;
            const hole = new THREE.Mesh(holeGeom, holeMat);
            hole.position.set(Math.cos(angle) * 0.24, Math.sin(angle) * 0.24, 0.07);
            hole.rotation.x = Math.PI / 2;
            wheelGroup.add(hole);
        }

        // Cùm phanh Brembo đỏ
        const caliperGeom = new THREE.BoxGeometry(0.08, 0.14, 0.08);
        const caliper = new THREE.Mesh(caliperGeom, caliperMaterial);
        caliper.position.set(0.24, 0.24, 0.08);
        caliper.rotation.z = -Math.PI / 4;
        wheelGroup.add(caliper);

        return wheelGroup;
    }

    // Bánh trước
    const frontWheel = createDetailedWheel();
    frontWheel.position.set(1.9, 0.6, 0); 
    motorcycleGroup.add(frontWheel);

    // Trục bánh trước
    const frontAxleGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.52, 12);
    const frontAxle = new THREE.Mesh(frontAxleGeom, chromeMat);
    frontAxle.rotation.x = Math.PI / 2;
    frontAxle.position.set(1.9, 0.6, 0);
    motorcycleGroup.add(frontAxle);

    // Bánh sau
    const rearWheel = createDetailedWheel();
    rearWheel.position.set(-2.0, 0.6, 0);
    motorcycleGroup.add(rearWheel);

    // Phuộc nhún trước USD kết nối chính xác (Từ cổ xe 1.6, 1.35 xuống bánh xe 1.9, 0.6)
    const usdOuterGeom = new THREE.CylinderGeometry(0.042, 0.042, 0.44, 12);
    const usdInnerGeom = new THREE.CylinderGeometry(0.032, 0.032, 0.44, 12);
    
    // Phuộc trái
    const leftForkGroup = new THREE.Group();
    leftForkGroup.position.set(1.75, 0.975, 0.22);
    leftForkGroup.rotation.z = 0.38;
    const leftForkOuter = new THREE.Mesh(usdOuterGeom, goldMat);
    leftForkOuter.position.y = 0.2; 
    const leftForkInner = new THREE.Mesh(usdInnerGeom, chromeMat);
    leftForkInner.position.y = -0.2; 
    leftForkGroup.add(leftForkOuter, leftForkInner);

    // Phuộc phải
    const rightForkGroup = new THREE.Group();
    rightForkGroup.position.set(1.75, 0.975, -0.22);
    rightForkGroup.rotation.z = 0.38;
    const rightForkOuter = new THREE.Mesh(usdOuterGeom, goldMat);
    rightForkOuter.position.y = 0.2;
    const rightForkInner = new THREE.Mesh(usdInnerGeom, chromeMat);
    rightForkInner.position.y = -0.2;
    rightForkGroup.add(rightForkOuter, rightForkInner);

    motorcycleGroup.add(leftForkGroup, rightForkGroup);

    // 3. Sàn để chân
    const deckBaseGeom = new THREE.BoxGeometry(1.2, 0.08, 0.64);
    const deckBase = new THREE.Mesh(deckBaseGeom, bodyMaterial);
    deckBase.position.set(0.6, 0.75, 0);
    motorcycleGroup.add(deckBase);

    const deckRubberGeom = new THREE.BoxGeometry(1.12, 0.02, 0.58);
    const deckRubber = new THREE.Mesh(deckRubberGeom, carbonMaterial);
    deckRubber.position.set(0.6, 0.8, 0);
    motorcycleGroup.add(deckRubber);

    const deckChromeL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.015, 0.015), chromeMat);
    deckChromeL.position.set(0.6, 0.75, 0.32);
    const deckChromeR = deckChromeL.clone();
    deckChromeR.position.z = -0.32;
    motorcycleGroup.add(deckChromeL, deckChromeR);

    // Tấm che nối gầm dốc (Leg Shield Connector) để không có khe hở giữa sàn và yếm trước
    const floorConnectorGeom = new THREE.BoxGeometry(0.5, 0.08, 0.6);
    const floorConnector = new THREE.Mesh(floorConnectorGeom, bodyMaterial);
    floorConnector.position.set(1.22, 1.02, 0);
    floorConnector.rotation.z = 0.7; // Nghiêng nối lên yếm
    motorcycleGroup.add(floorConnector);

    // 4. Yếm trước dạng tấm gấp 3D thanh thoát (Không dùng khối cầu gây méo dạng bong bóng)
    const frontShieldGroup = new THREE.Group();
    
    // Tấm chắn trung tâm
    const centerShield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.44), bodyMaterial);
    frontShieldGroup.add(centerShield);

    // Nẹp mặt nạ dọc carbon
    const carbonCowl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.85, 0.12), carbonMaterial);
    carbonCowl.position.set(0.05, 0, 0);
    frontShieldGroup.add(carbonCowl);

    // Cánh yếm trái nghiêng 20 độ về sau
    const sideShieldL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.15), bodyMaterial);
    sideShieldL.position.set(-0.03, 0, 0.25);
    sideShieldL.rotation.y = 0.35;
    frontShieldGroup.add(sideShieldL);

    // Cánh yếm phải nghiêng 20 độ về sau
    const sideShieldR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.15), bodyMaterial);
    sideShieldR.position.set(-0.03, 0, -0.25);
    sideShieldR.rotation.y = -0.35;
    frontShieldGroup.add(sideShieldR);

    // Đèn LED định vị neon
    const drlL = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.45, 0.02), neonMaterial);
    drlL.position.set(0.02, 0, 0.18);
    const drlR = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.45, 0.02), neonMaterial);
    drlR.position.set(0.02, 0, -0.18);
    frontShieldGroup.add(drlL, drlR);

    // Đèn xi-nhan trước LED có ốp viền Chrome sang trọng (Đặt làm con của yếm trước để đi theo vị trí)
    const indicatorGeom = new THREE.BoxGeometry(0.02, 0.14, 0.05);
    const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    const leftIndicator = new THREE.Mesh(indicatorGeom, indicatorMat);
    leftIndicator.position.set(0.02, 0.25, 0.22);
    leftIndicator.rotation.y = 0.35;
    const leftIndicatorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.06), chromeMat);
    leftIndicatorHousing.position.set(-0.005, 0, 0);
    leftIndicator.add(leftIndicatorHousing);

    const rightIndicator = new THREE.Mesh(indicatorGeom, indicatorMat);
    rightIndicator.position.set(0.02, 0.25, -0.22);
    rightIndicator.rotation.y = -0.35;
    const rightIndicatorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.06), chromeMat);
    rightIndicatorHousing.position.set(-0.005, 0, 0);
    rightIndicator.add(rightIndicatorHousing);
    
    frontShieldGroup.add(leftIndicator, rightIndicator);

    frontShieldGroup.position.set(1.64, 1.52, 0); // Đưa dàn áo lên cao khớp cổ ghi đông và nhô ra trước
    frontShieldGroup.rotation.z = 0.38;
    motorcycleGroup.add(frontShieldGroup);

    // Chắn bùn trước dạng vòm bán cầu ôm lốp phong cách thể thao
    const mudguardGeom = new THREE.SphereGeometry(0.53, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const mudguard = new THREE.Mesh(mudguardGeom, bodyMaterial);
    mudguard.scale.set(1.2, 0.6, 0.6); // Phồng nhẹ dọc, dẹt 2 bên ôm bánh
    mudguard.position.set(1.9, 0.92, 0);
    mudguard.rotation.z = 0.25; // Xoay nhẹ ôm góc lốp trước kéo ra sau
    motorcycleGroup.add(mudguard);

    // Kính chắn gió thời trang
    const windshieldGeom = new THREE.BoxGeometry(0.02, 0.46, 0.46);
    const windshieldMaterial = new THREE.MeshStandardMaterial({
        color: 0x111827,
        transparent: true,
        opacity: 0.75,
        roughness: 0.05,
        metalness: 0.9
    });
    const windshield = new THREE.Mesh(windshieldGeom, windshieldMaterial);
    windshield.position.set(1.35, 2.38, 0);
    windshield.rotation.z = 0.38;
    motorcycleGroup.add(windshield);

    // 5. Thùng cốp sau thiết kế rỗng (khoang chứa đồ thực tế)
    const rearWallMaterial = new THREE.MeshStandardMaterial({
        color: 0x111827, 
        roughness: 0.6
    });
    const linerMaterial = new THREE.MeshStandardMaterial({
        color: 0x18181b, // Nhựa đen than nhám
        roughness: 0.7,
        metalness: 0.1
    });
    
    const trunkBase = new THREE.Group();
    
    // Thân cốp trung tâm (vỏ ngoài) - ghép từ 5 tấm vỏ tạo thành hốc rỗng
    const wallThickness = 0.04;
    const trunkWidth = 0.66;
    const trunkHeight = 0.72;
    const trunkLength = 1.4;
    
    const bottomWall = new THREE.Mesh(new THREE.BoxGeometry(trunkLength, wallThickness, trunkWidth - wallThickness * 2), bodyMaterial);
    bottomWall.position.set(-0.7, wallThickness / 2, 0);
    
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(trunkLength, trunkHeight, wallThickness), bodyMaterial);
    leftWall.position.set(-0.7, trunkHeight / 2, (trunkWidth - wallThickness) / 2);
    
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(trunkLength, trunkHeight, wallThickness), bodyMaterial);
    rightWall.position.set(-0.7, trunkHeight / 2, -(trunkWidth - wallThickness) / 2);
    
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, trunkHeight, trunkWidth), bodyMaterial);
    backWall.position.set(-0.7 - trunkLength / 2 + wallThickness / 2, trunkHeight / 2, 0);
    
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, trunkHeight, trunkWidth), bodyMaterial);
    frontWall.position.set(-0.7 + trunkLength / 2 - wallThickness / 2, trunkHeight / 2, 0);
    
    trunkBase.add(bottomWall, leftWall, rightWall, backWall, frontWall);

    // Tấm lót lòng cốp (Liner) - Nhựa nhám đen
    const linerThickness = 0.02;
    const linerL = trunkLength - wallThickness * 2 - 0.02;
    const linerW = trunkWidth - wallThickness * 2 - 0.02;
    const linerH = trunkHeight - wallThickness - 0.02;

    const linerBottom = new THREE.Mesh(new THREE.BoxGeometry(linerL, linerThickness, linerW), linerMaterial);
    linerBottom.position.set(-0.7, wallThickness + linerThickness/2, 0);
    
    const linerLeft = new THREE.Mesh(new THREE.BoxGeometry(linerL, linerH, linerThickness), linerMaterial);
    linerLeft.position.set(-0.7, wallThickness + linerH/2, (linerW - linerThickness)/2);
    
    const linerRight = linerLeft.clone();
    linerRight.position.z = -(linerW - linerThickness)/2;
    
    const linerFront = new THREE.Mesh(new THREE.BoxGeometry(linerThickness, linerH, linerW), linerMaterial);
    linerFront.position.set(-0.7 + linerL/2 - linerThickness/2, wallThickness + linerH/2, 0);
    
    const linerBack = new THREE.Mesh(new THREE.BoxGeometry(linerThickness, linerH, linerW), linerMaterial);
    linerBack.position.set(-0.7 - linerL/2 + linerThickness/2, wallThickness + linerH/2, 0);

    trunkBase.add(linerBottom, linerLeft, linerRight, linerFront, linerBack);

    // Vách chắn bùn trong (Giảm bề rộng xuống 0.60 để tránh Z-fighting với 2 sườn cốp vàng)
    const innerFenderGeom = new THREE.BoxGeometry(1.0, 0.2, 0.60);
    const innerFender = new THREE.Mesh(innerFenderGeom, rearWallMaterial);
    innerFender.position.set(-1.6, 0.6, 0);
    trunkBase.add(innerFender);

    // Ốp sườn dẹt bo cong tinh tế khớp chính xác với thùng cốp
    const sidePanelLeftGeom = new THREE.SphereGeometry(0.5, 32, 16);
    const sidePanelLeft = new THREE.Mesh(sidePanelLeftGeom, bodyMaterial);
    sidePanelLeft.scale.set(1.4, 0.72, 0.12); // Trùng tỉ lệ với cốp xe (dài 1.4, cao 0.72)
    sidePanelLeft.position.set(-0.7, 0.36, 0.33);
    trunkBase.add(sidePanelLeft);

    const sidePanelRight = sidePanelLeft.clone();
    sidePanelRight.position.z = -0.33;
    trunkBase.add(sidePanelRight);

    // Viền mạ chrome chạy dọc thân xe ga
    const trimGeom = new THREE.CylinderGeometry(0.015, 0.015, 1.4, 8);
    const trimL = new THREE.Mesh(trimGeom, chromeMat);
    trimL.rotation.z = Math.PI / 2;
    trimL.position.set(-0.7, 0.45, 0.35);
    const trimR = trimL.clone();
    trimR.position.z = -0.35;
    trunkBase.add(trimL, trimR);

    // Logo WPS bằng vàng gold dán nổi hông
    const logoGeom = new THREE.BoxGeometry(0.2, 0.05, 0.01);
    const logoMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.1 });
    const logoL = new THREE.Mesh(logoGeom, logoMat);
    logoL.position.set(-0.7, 0.48, 0.37);
    const logoR = new THREE.Mesh(logoGeom, logoMat);
    logoR.position.set(-0.7, 0.48, -0.37);
    trunkBase.add(logoL, logoR);

    // Đuôi xe dạng chóp bo tròn
    const rearTailGeom = new THREE.ConeGeometry(0.24, 0.4, 4);
    const rearTail = new THREE.Mesh(rearTailGeom, bodyMaterial);
    rearTail.rotation.x = Math.PI / 4; 
    rearTail.rotation.z = Math.PI / 2; 
    rearTail.position.set(-1.6, 0.45, 0);
    rearTail.scale.set(1.0, 1.0, 0.7);
    trunkBase.add(rearTail);
    
    trunkBase.position.set(0, 0.65, 0); 
    motorcycleGroup.add(trunkBase);

    // 6. Cụm nắp cốp xe & Yên phân tầng bọc da đen bo tròn công thái học
    trunkLidGroup = new THREE.Group();
    trunkLidGroup.position.set(0.0, 1.4, 0); 

    // Tấm lót đáy yên
    const lidGeom = new THREE.BoxGeometry(2.1, 0.05, 0.66);
    const lidMesh = new THREE.Mesh(lidGeom, bodyMaterial);
    lidMesh.position.set(-1.05, 0.025, 0); 
    trunkLidGroup.add(lidMesh);

    // Yên xe bọc da liền khối phong cách Vespa sang trọng (Single continuous saddle design)
    const seatShape = new THREE.Shape();
    // Biên dạng yên xe (mặt bên X-Y) từ mũi đến đuôi
    seatShape.moveTo(-0.15, 0.02);
    seatShape.quadraticCurveTo(-0.12, 0.14, -0.22, 0.18); // Độ cong đầu yên
    seatShape.lineTo(-0.75, 0.16); // Yên trước người lái trũng xuống thoải mái
    seatShape.bezierCurveTo(-0.85, 0.16, -0.95, 0.28, -1.1, 0.28); // Dốc chuyển tầng lên yên sau
    seatShape.lineTo(-1.65, 0.27); // Yên sau nâng cao hơn
    seatShape.quadraticCurveTo(-1.78, 0.25, -1.78, 0.02); // Bo tròn đuôi yên xuống
    seatShape.lineTo(-0.15, 0.02); // Đáy yên phẳng

    const extrudeSettings = {
        steps: 1,
        depth: 0.52, // Chiều rộng yên lõi
        bevelEnabled: true,
        bevelThickness: 0.04, // Độ dày bo mép
        bevelSize: 0.04, // Độ vát bo tròn các cạnh
        bevelSegments: 8
    };

    const seatGeom = new THREE.ExtrudeGeometry(seatShape, extrudeSettings);
    seatGeom.translate(0, 0, -0.26); // Căn giữa yên xe theo trục Z

    const mainSeat = new THREE.Mesh(seatGeom, seatMaterial);
    mainSeat.castShadow = true;
    mainSeat.receiveShadow = true;
    trunkLidGroup.add(mainSeat);

    // Đường chỉ khâu màu đỏ thể thao nổi bật làm điểm nhấn giữa yên trước và sau
    const stitchGeom = new THREE.CylinderGeometry(0.006, 0.006, 0.58, 8);
    stitchGeom.rotateX(Math.PI / 2); // Nằm ngang theo trục Z
    const stitchMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const stitch = new THREE.Mesh(stitchGeom, stitchMat);
    stitch.position.set(-0.92, 0.22, 0);
    trunkLidGroup.add(stitch);

    // Tay dắt đuôi xe (Baga) thiết kế ngang, ôm bọc sau yên, không bị đâm xuyên
    const grabRailGeom = new THREE.TorusGeometry(0.38, 0.024, 10, 24, Math.PI);
    const grabRail = new THREE.Mesh(grabRailGeom, chromeMat);
    grabRail.position.set(-1.85, 0.18, 0);
    grabRail.rotation.x = Math.PI / 2; // Nằm ngang song song mặt đất
    grabRail.rotation.y = 0; 
    grabRail.rotation.z = Math.PI / 2; // Xoay vòng cung về phía sau
    trunkLidGroup.add(grabRail);
    
    motorcycleGroup.add(trunkLidGroup);

    // 7. Thiết bị IoT nằm trong cốp (BẢO TOÀN 100% CẤU TRÚC ĐỂ RAYCASTING KHÔNG LỖI)
    const iotDeviceGroup = new THREE.Group();
    const deviceMaterial = new THREE.MeshStandardMaterial({
        color: 0x0ea5e9, 
        metalness: 0.3,
        roughness: 0.2
    });
    const iotBoxGeom = new THREE.BoxGeometry(0.4, 0.2, 0.45);
    iotDeviceMesh = new THREE.Mesh(iotBoxGeom, deviceMaterial);
    iotDeviceMesh.position.set(0, 0.1, 0);
    iotDeviceGroup.add(iotDeviceMesh); // Index 0

    const ledGeom = new THREE.SphereGeometry(0.03, 8, 8);
    const ledMaterial = new THREE.MeshBasicMaterial({ color: 0x22c55e }); 
    const ledMesh = new THREE.Mesh(ledGeom, ledMaterial);
    ledMesh.position.set(0.12, 0.21, 0.12);
    iotDeviceGroup.add(ledMesh); // Index 1

    iotDeviceGroup.position.set(-0.8, 0.7, 0); 
    motorcycleGroup.add(iotDeviceGroup);

    // 8. Cụm ghi đông & Đầu xe ga & Đèn pha chính
    const handlebarGroup = new THREE.Group();
    handlebarGroup.position.set(1.3, 2.1, 0);
    
    // Ghi đông
    const barGeom = new THREE.CylinderGeometry(0.022, 0.022, 0.9, 12);
    const barMesh = new THREE.Mesh(barGeom, chromeMat);
    barMesh.rotation.x = Math.PI / 2;
    handlebarGroup.add(barMesh);

    // Bao tay lái màu đen
    const gripGeom = new THREE.CylinderGeometry(0.032, 0.032, 0.2, 12);
    const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const leftGrip = new THREE.Mesh(gripGeom, gripMaterial);
    leftGrip.position.set(0, 0, 0.38);
    leftGrip.rotation.x = Math.PI / 2;
    const rightGrip = new THREE.Mesh(gripGeom, gripMaterial);
    rightGrip.position.set(0, 0, -0.38);
    rightGrip.rotation.x = Math.PI / 2;
    handlebarGroup.add(leftGrip, rightGrip);

    // Ốp đầu tay lái (Handlebar Cowl) bo tròn tinh tế dạng capsule ngang
    const cowlCylGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.48, 16);
    const cowlCyl = new THREE.Mesh(cowlCylGeom, bodyMaterial);
    cowlCyl.rotation.x = Math.PI / 2;
    cowlCyl.position.set(0.04, 0, 0);
    handlebarGroup.add(cowlCyl);
    
    const cowlSphereGeom = new THREE.SphereGeometry(0.08, 16, 16);
    const cowlCapL = new THREE.Mesh(cowlSphereGeom, bodyMaterial);
    cowlCapL.position.set(0.04, 0, 0.24);
    const cowlCapR = cowlCapL.clone();
    cowlCapR.position.z = -0.24;
    handlebarGroup.add(cowlCapL, cowlCapR);

    // Màn hình hiển thị thông tin LCD
    const screenHolderGeom = new THREE.BoxGeometry(0.03, 0.15, 0.22);
    const screenHolder = new THREE.Mesh(screenHolderGeom, carbonMaterial);
    screenHolder.position.set(-0.05, 0.14, 0);
    screenHolder.rotation.z = -Math.PI / 6; 
    handlebarGroup.add(screenHolder);

    const screenGeom = new THREE.BoxGeometry(0.01, 0.13, 0.20);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff }); 
    const screen = new THREE.Mesh(screenGeom, screenMat);
    screen.position.set(-0.012, 0, 0);
    screenHolder.add(screen);

    // Đèn pha Projector tròn
    const headLightHousingGeom = new THREE.CylinderGeometry(0.07, 0.07, 0.1, 16);
    const headLightHousing = new THREE.Mesh(headLightHousingGeom, chromeMat);
    headLightHousing.rotation.z = Math.PI / 2;
    headLightHousing.position.set(0.13, 0, 0);
    handlebarGroup.add(headLightHousing);

    const headLightLensGeom = new THREE.SphereGeometry(0.066, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const headLightLensMat = new THREE.MeshBasicMaterial({ color: 0xf0fdf4 }); 
    const headLightLens = new THREE.Mesh(headLightLensGeom, headLightLensMat);
    headLightLens.rotation.z = -Math.PI / 2;
    headLightLens.position.set(0.18, 0, 0);
    handlebarGroup.add(headLightLens);

    // Gương chiếu hậu dạng giọt nước nhỏ gọn
    const mirrorStemGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.24, 8);
    const mirrorBodyGeom = new THREE.SphereGeometry(0.05, 16, 16);
    const mirrorGlassGeom = new THREE.PlaneGeometry(0.08, 0.12);
    const mirrorGlassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.05 });

    // Gương trái
    const leftStem = new THREE.Mesh(mirrorStemGeom, chromeMat);
    leftStem.position.set(0, 0.14, 0.3);
    leftStem.rotation.z = -Math.PI / 6;
    leftStem.rotation.x = Math.PI / 6;

    const mirrorBodyL = new THREE.Mesh(mirrorBodyGeom, bodyMaterial);
    mirrorBodyL.scale.set(0.6, 1.2, 1.6);
    mirrorBodyL.rotation.y = Math.PI / 2;
    mirrorBodyL.position.set(0, 0.12, 0); 
    
    const mirrorGlassL = new THREE.Mesh(mirrorGlassGeom, mirrorGlassMat);
    mirrorGlassL.position.set(0, 0, 0.052);
    mirrorBodyL.add(mirrorGlassL);
    leftStem.add(mirrorBodyL);
    handlebarGroup.add(leftStem);

    // Gương phải
    const rightStem = new THREE.Mesh(mirrorStemGeom, chromeMat);
    rightStem.position.set(0, 0.14, -0.3);
    rightStem.rotation.z = -Math.PI / 6;
    rightStem.rotation.x = -Math.PI / 6;

    const mirrorBodyR = new THREE.Mesh(mirrorBodyGeom, bodyMaterial);
    mirrorBodyR.scale.set(0.6, 1.2, 1.6);
    mirrorBodyR.rotation.y = Math.PI / 2;
    mirrorBodyR.position.set(0, 0.12, 0); 
    
    const mirrorGlassR = new THREE.Mesh(mirrorGlassGeom, mirrorGlassMat);
    mirrorGlassR.position.set(0, 0, -0.052);
    mirrorGlassR.rotation.y = Math.PI;
    mirrorBodyR.add(mirrorGlassR);
    rightStem.add(mirrorBodyR);
    handlebarGroup.add(rightStem);

    motorcycleGroup.add(handlebarGroup);

    // 9. Chân chống nghiêng có đế tiếp xúc hoàn hảo mặt đất (y = 0.12 là cao độ mặt đất)
    const standGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.68, 8);
    standGeom.translate(0, -0.34, 0);
    const standMesh = new THREE.Mesh(standGeom, frameMaterial);
    
    const standFootGeom = new THREE.BoxGeometry(0.05, 0.015, 0.07);
    const standFoot = new THREE.Mesh(standFootGeom, frameMaterial);
    standFoot.position.set(0, -0.68, 0);
    
    const standGroup = new THREE.Group();
    // Chuyển sang bên trái (z âm)
    standGroup.position.set(-0.1, 0.65, -0.25);
    standGroup.rotation.x = Math.PI / 5.2; // Ngả ra ngoài bên trái 
    standGroup.rotation.z = -Math.PI / 10;
    standGroup.add(standMesh, standFoot);
    motorcycleGroup.add(standGroup);

    // 10. Đèn hậu LED 3D
    const tailLightGeom = new THREE.BoxGeometry(0.05, 0.08, 0.44);
    const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const tailLight = new THREE.Mesh(tailLightGeom, tailLightMat);
    tailLight.position.set(-1.64, 1.1, 0); 
    motorcycleGroup.add(tailLight);

    // Chắn bùn sau chéo xuôi xuống
    const fenderGeom = new THREE.BoxGeometry(0.04, 0.5, 0.3);
    const fenderMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const fender = new THREE.Mesh(fenderGeom, fenderMat);
    fender.position.set(-1.75, 1.0, 0);
    fender.rotation.z = -Math.PI / 4; 
    motorcycleGroup.add(fender);

    // Pát gắn biển số sau
    const plateHolderGeom = new THREE.BoxGeometry(0.02, 0.22, 0.28);
    const plateHolderMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const plateHolder = new THREE.Mesh(plateHolderGeom, plateHolderMat);
    plateHolder.position.set(-0.03, -0.1, 0); 
    fender.add(plateHolder);
    
    const plateGeom = new THREE.BoxGeometry(0.01, 0.18, 0.24);
    const plateMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.position.set(-0.01, 0, 0);
    plateHolder.add(plate);

    // 11. Giảm xóc sau đôi thể thao Ohlins lò xo đỏ bình dầu
    const shockLeft = new THREE.Group();
    shockLeft.position.set(-1.4, 1.15, 0.26); 
    shockLeft.rotation.z = -0.65;
    
    const pistonGeom = new THREE.CylinderGeometry(0.014, 0.014, 0.72, 8);
    pistonGeom.translate(0, -0.36, 0);
    const piston = new THREE.Mesh(pistonGeom, chromeMat);
    shockLeft.add(piston);
    
    const springGeom = new THREE.CylinderGeometry(0.034, 0.034, 0.38, 12);
    springGeom.translate(0, -0.19, 0);
    const springMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.3, roughness: 0.2 });
    const spring = new THREE.Mesh(springGeom, springMat);
    shockLeft.add(spring);
    
    const reservoirGeom = new THREE.CylinderGeometry(0.032, 0.032, 0.14, 12);
    const reservoir = new THREE.Mesh(reservoirGeom, goldMat);
    reservoir.position.set(0.05, -0.1, 0.0);
    shockLeft.add(reservoir);
    
    motorcycleGroup.add(shockLeft);
    
    const shockRight = shockLeft.clone();
    shockRight.position.z = -0.26;
    motorcycleGroup.add(shockRight);

    // 12. Gắp sau đôi (Swingarm kép) & Trục bánh sau
    const swingarmGroup = new THREE.Group();
    
    const swingarmGeom = new THREE.BoxGeometry(1.2, 0.12, 0.08);
    const swingarmL = new THREE.Mesh(swingarmGeom, frameMaterial);
    swingarmL.position.set(-1.4, 0.62, 0.26); // Khớp với giảm xóc trái
    
    const swingarmR = new THREE.Mesh(swingarmGeom, frameMaterial);
    swingarmR.position.set(-1.4, 0.62, -0.26); // Khớp với giảm xóc phải
    
    swingarmGroup.add(swingarmL, swingarmR);
    
    const rearAxleGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.52, 12);
    const rearAxle = new THREE.Mesh(rearAxleGeom, chromeMat);
    rearAxle.rotation.x = Math.PI / 2;
    rearAxle.position.set(-2.0, 0.6, 0);
    swingarmGroup.add(rearAxle);

    motorcycleGroup.add(swingarmGroup);

    scene.add(motorcycleGroup);
}

// Khởi tạo sự kiện chuyển đổi Tab
function setupTabSwitching() {
    const tabMapBtn = document.getElementById('tab-map-btn');
    const tab3dBtn = document.getElementById('tab-3d-btn');
    const mapDiv = document.getElementById('map');
    const d3dDiv = document.getElementById('dashboard-3d');

    if (!tabMapBtn || !tab3dBtn || !mapDiv || !d3dDiv) return;

    tabMapBtn.addEventListener('click', () => {
        tabMapBtn.classList.add('active');
        tab3dBtn.classList.remove('active');
        mapDiv.classList.remove('hidden');
        d3dDiv.classList.add('hidden');
        
        // Dừng vòng lặp vẽ 3D để tối ưu hiệu năng
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // Cập nhật lại Leaflet Map
        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 100);
    });

    tab3dBtn.addEventListener('click', () => {
        tab3dBtn.classList.add('active');
        tabMapBtn.classList.remove('active');
        mapDiv.classList.add('hidden');
        d3dDiv.classList.remove('hidden');

        // Khởi tạo 3D và chạy vòng lặp
        if (!is3DInitialized) {
            init3D();
        }
        resize3D();
        if (!animationFrameId) {
            animate();
        }
    });
}

// Cấu hình tương tác nhấp chọn (click) trên Sơ đồ mạch SVG
function setupCircuitSchematicInteractions() {
    const components = {
        'comp-esp32': {
            nameVi: "VI ĐIỀU KHIỂN ESP32",
            nameEn: "ESP32 MICROCONTROLLER",
            descVi: i18n.vi.circuit_desc_esp32,
            descEn: i18n.en.circuit_desc_esp32,
            traces: ['trace-vcc', 'trace-gnd', 'trace-mpu-sda', 'trace-mpu-scl', 'trace-buzzer']
        },
        'comp-mpu': {
            nameVi: "CẢM BIẾN TỌA ĐỘ MPU6050",
            nameEn: "MPU6050 IMU ACCEL/GYRO",
            descVi: i18n.vi.circuit_desc_mpu,
            descEn: i18n.en.circuit_desc_mpu,
            traces: ['trace-vcc', 'trace-gnd', 'trace-mpu-sda', 'trace-mpu-scl']
        },
        'comp-buzzer': {
            nameVi: "CÒI BÁO ĐỘNG BUZZER",
            nameEn: "ACTIVE BUZZER ALARM",
            descVi: i18n.vi.circuit_desc_buzzer,
            descEn: i18n.en.circuit_desc_buzzer,
            traces: ['trace-vcc', 'trace-gnd', 'trace-buzzer']
        }
    };

    const compName = document.getElementById('circuit-comp-name');
    const compDesc = document.getElementById('circuit-comp-desc');
    const closeBtn = document.getElementById('close-circuit');
    const circuitModal = document.getElementById('circuit-modal');

    let selectedComponentId = null;

    // Reset giao diện và bỏ chọn
    function resetSelection() {
        if (selectedComponentId && components[selectedComponentId]) {
            components[selectedComponentId].traces.forEach(traceClass => {
                const traces = document.querySelectorAll('.' + traceClass);
                traces.forEach(t => {
                    t.classList.remove('highlight');
                    const highlightClass = 'highlight-' + traceClass.replace('trace-', '');
                    t.classList.remove(highlightClass);
                });
            });
            const prevEl = document.getElementById(selectedComponentId);
            if (prevEl) prevEl.classList.remove('selected');
        }
        selectedComponentId = null;
        compName.innerText = currentLang === 'vi' ? "Chọn linh kiện" : "Select Component";
        compDesc.innerText = currentLang === 'vi' ? "Nhấp chọn linh kiện trên sơ đồ để xem vai trò và thông tin kết nối chi tiết." : "Click on a component in the schematic to view its role and detailed connection pinouts.";
    }

    if (closeBtn && circuitModal) {
        closeBtn.onclick = () => {
            circuitModal.style.opacity = '0';
            setTimeout(() => circuitModal.style.display = 'none', 300);
            resetSelection();
        };
    }

    // Đóng và reset khi click ra ngoài vùng modal
    window.addEventListener('click', (e) => {
        if (circuitModal && e.target == circuitModal) {
            circuitModal.style.opacity = '0';
            setTimeout(() => circuitModal.style.display = 'none', 300);
            resetSelection();
        }
    });

    // Gắn sự kiện click (chọn) cho các linh kiện
    Object.keys(components).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const data = components[id];

        el.addEventListener('click', () => {
            // Nếu click lại chính linh kiện đang chọn -> Bỏ chọn (toggle)
            if (selectedComponentId === id) {
                resetSelection();
                return;
            }

            // Reset linh kiện cũ trước đó
            if (selectedComponentId && components[selectedComponentId]) {
                components[selectedComponentId].traces.forEach(traceClass => {
                    const traces = document.querySelectorAll('.' + traceClass);
                    traces.forEach(t => {
                        t.classList.remove('highlight');
                        const highlightClass = 'highlight-' + traceClass.replace('trace-', '');
                        t.classList.remove(highlightClass);
                    });
                });
                const prevEl = document.getElementById(selectedComponentId);
                if (prevEl) prevEl.classList.remove('selected');
            }

            // Gán linh kiện được chọn mới
            selectedComponentId = id;
            el.classList.add('selected');

            // Cập nhật thông tin chi tiết
            compName.innerText = currentLang === 'vi' ? data.nameVi : data.nameEn;
            compDesc.innerText = currentLang === 'vi' ? data.descVi : data.descEn;

            // Làm nổi bật đường dây (highlight traces)
            data.traces.forEach(traceClass => {
                const traces = document.querySelectorAll('.' + traceClass);
                traces.forEach(t => {
                    t.classList.add('highlight');
                    const highlightClass = 'highlight-' + traceClass.replace('trace-', '');
                    t.classList.add(highlightClass);
                });
            });
        });
    });

    // Kích hoạt nhấp nháy LED trên PCB ảo
    const mpuLed = document.getElementById('mpu-led');
    if (mpuLed) mpuLed.classList.add('active');

    // Lắng nghe còi báo từ Firebase để hiển thị sóng âm
    onValue(ref(db, 'tracker/action/ring'), (snapshot) => {
        const ring = snapshot.val();
        const wave1 = document.getElementById('buzzer-wave-1');
        const wave2 = document.getElementById('buzzer-wave-2');
        
        if (wave1 && wave2) {
            if (ring) {
                wave1.classList.add('active');
                wave2.classList.add('active');
                
                // Tự động tắt còi sau 5 giây để mô phỏng bíp bíp
                setTimeout(() => {
                    set(ref(db, 'tracker/action/ring'), false);
                }, 5000);
            } else {
                wave1.classList.remove('active');
                wave2.classList.remove('active');
            }
        }
    });
}
