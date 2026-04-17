import { ref, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

let db;

/**
 * Khởi tạo data service với đối tượng database của Firebase.
 * @param {Database} database - Đối tượng database của Firebase.
 */
export function initializeDataService(database) {
    db = database;
}

/**
 * Tải và hiển thị dữ liệu lịch sử di chuyển trong modal.
 */
export function loadHistoryData() {
    const tbody = document.getElementById('history-body');
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Đang tải dữ liệu...</td></tr>`;
    get(ref(db, 'tracker/history')).then((snapshot) => {
        if (snapshot.exists()) {
            let htmlString = '';
            snapshot.forEach((child) => {
                const row = child.val();
                // Lưu ý: Dữ liệu vận tốc được lưu nhưng không được hiển thị ở đây trong code gốc.
                htmlString += `<tr><td>${row.timestamp || '-'}</td><td>${row.lat || '-'}</td><td>${row.lng || '-'}</td></tr>`;
            });
            tbody.innerHTML = htmlString;
        } else {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-muted);">Chưa có dữ liệu</td></tr>`;
        }
    }).catch(error => {
        console.error("Lỗi tải dữ liệu lịch sử:", error);
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: red;">Lỗi tải dữ liệu.</td></tr>`;
    });
}

/**
 * Tải và hiển thị dữ liệu lịch sử té ngã trong modal.
 */
export function loadFallData() {
    const tbody = document.getElementById('fall-body');
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Đang tải dữ liệu...</td></tr>`;
    get(ref(db, 'tracker/fall_history')).then((snapshot) => {
        tbody.innerHTML = '';
        if (snapshot.exists()) {
            snapshot.forEach((child) => { const row = child.val(); tbody.innerHTML += `<tr><td>${row.timestamp || '-'}</td><td>${row.lat || '-'}</td><td>${row.lng || '-'}</td></tr>`; });
        } else tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-muted);">Chưa có ghi nhận sự cố nào.</td></tr>`;
    }).catch(error => {
        console.error("Lỗi tải dữ liệu sự cố:", error);
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: red;">Lỗi tải dữ liệu.</td></tr>`;
    });
}

export function exportHistoryToExcel() {
    // Giả định thư viện XLSX đã được tải toàn cục qua thẻ <script>.
    const wb = XLSX.utils.table_to_book(document.getElementById('history-table'), { sheet: "LichSu" }); XLSX.writeFile(wb, "Lich_Su_Di_Chuyen.xlsx");
}

export function exportFailsToExcel() {
    // Giả định thư viện XLSX đã được tải toàn cục qua thẻ <script>.
    const wb = XLSX.utils.table_to_book(document.getElementById('fall-table'), { sheet: "TeNga" }); XLSX.writeFile(wb, "Lich_Su_Te_Nga.xlsx");
}