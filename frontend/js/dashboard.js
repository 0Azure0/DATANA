// frontend/js/dashboard.js - Interactive Filtering Version

let ALL_DATA = []; // Biến toàn cục chứa dữ liệu gốc
let charts = {};   // Lưu các instance của Chart.js để update

document.addEventListener('DOMContentLoaded', () => {
    const raw = localStorage.getItem('datana_last_analysis');
    if (!raw) { 
        document.getElementById('tableWrap').innerHTML = '<p class="muted">Chưa có dữ liệu. Vui lòng tải file.</p>'; 
        return; 
    }
    
    const analysis = JSON.parse(raw);
    
    // Lấy dữ liệu chuẩn hóa từ Backend (vị trí số 8 trong tuple trả về)
    // Trong JSON trả về từ API nó là field: raw_data (đã được backend mới map thành universal_data)
    ALL_DATA = analysis.raw_data || []; 

    if (ALL_DATA.length === 0) {
        // Nếu chưa có dữ liệu chuẩn, có thể là file cũ, hiển thị cảnh báo nhẹ
        console.warn("Dữ liệu chưa được chuẩn hóa cho bộ lọc.");
    }

    // 1. Khởi tạo Dropdown
    initFilters();

    // 2. Vẽ Dashboard lần đầu (với toàn bộ dữ liệu)
    updateDashboard(ALL_DATA);

    // 3. Bắt sự kiện thay đổi bộ lọc
    const filterMonth = document.getElementById('filterMonth');
    const filterRegion = document.getElementById('filterRegion');
    const resetBtn = document.getElementById('resetFilterBtn');

    if(filterMonth) filterMonth.addEventListener('change', applyFilters);
    if(filterRegion) filterRegion.addEventListener('change', applyFilters);
    if(resetBtn) resetBtn.addEventListener('click', resetFilters);
});

function initFilters() {
    const months = new Set();
    const regions = new Set();

    ALL_DATA.forEach(row => {
        if (row.month && row.month !== 'N/A') months.add(row.month);
        if (row.region) regions.add(row.region);
    });

    // Populate Month Select (Sort tăng dần)
    const mSelect = document.getElementById('filterMonth');
    if(mSelect) {
        mSelect.innerHTML = '<option value="all">Tất cả thời gian</option>';
        Array.from(months).sort().forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            mSelect.appendChild(opt);
        });
    }

    // Populate Region Select
    const rSelect = document.getElementById('filterRegion');
    if(rSelect) {
        rSelect.innerHTML = '<option value="all">Tất cả khu vực</option>';
        Array.from(regions).sort().forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            rSelect.appendChild(opt);
        });
    }
}

function applyFilters() {
    const selectedMonth = document.getElementById('filterMonth').value;
    const selectedRegion = document.getElementById('filterRegion').value;

    // Lọc dữ liệu
    const filtered = ALL_DATA.filter(row => {
        const matchMonth = (selectedMonth === 'all') || (row.month === selectedMonth);
        const matchRegion = (selectedRegion === 'all') || (row.region === selectedRegion);
        return matchMonth && matchRegion;
    });

    // Vẽ lại Dashboard với dữ liệu đã lọc
    updateDashboard(filtered);
}

function resetFilters() {
    document.getElementById('filterMonth').value = 'all';
    document.getElementById('filterRegion').value = 'all';
    updateDashboard(ALL_DATA);
}

// --- CORE FUNCTION: TÍNH TOÁN & VẼ ---
function updateDashboard(data) {
    // 1. Tính lại KPIs
    const totalRev = data.reduce((sum, r) => sum + (r.revenue || 0), 0);
    const totalProfit = data.reduce((sum, r) => sum + (r.profit || 0), 0);
    
    // Tìm top product trong tập dữ liệu này
    const prodMap = {};
    data.forEach(r => {
        prodMap[r.product] = (prodMap[r.product] || 0) + (r.revenue || 0);
    });
    const topProdName = Object.keys(prodMap).sort((a,b) => prodMap[b] - prodMap[a])[0] || '-';

    // Update UI KPI
    animateValue('kpi_rev', totalRev, ' VNĐ');
    animateValue('kpi_profit', totalProfit, ' VNĐ');
    const kpiProd = document.getElementById('kpi_topprod');
    if(kpiProd) kpiProd.textContent = topProdName;

    // 2. Chuẩn bị dữ liệu cho biểu đồ
    // A. Theo Thời Gian (Line Chart)
    const timeMap = {};
    data.forEach(r => {
        if (!r.month || r.month === 'N/A') return;
        timeMap[r.month] = (timeMap[r.month] || 0) + r.revenue;
    });
    const sortedMonths = Object.keys(timeMap).sort();
    const timeValues = sortedMonths.map(m => timeMap[m]);

    // B. Theo Khu Vực (Bar Chart)
    const regionMap = {};
    data.forEach(r => {
        regionMap[r.region] = (regionMap[r.region] || 0) + r.revenue;
    });
    const regLabels = Object.keys(regionMap);
    const regValues = Object.values(regionMap);

    // C. Top Sản Phẩm (Donut)
    const topProds = Object.entries(prodMap)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 5); // Top 5
    const prodLabels = topProds.map(p => p[0]);
    const prodValues = topProds.map(p => p[1]);

    // 3. Vẽ / Cập nhật Biểu đồ
    updateChart('chartLine', 'line', sortedMonths, timeValues, 'Doanh thu theo tháng');
    updateChart('chartBar', 'bar', regLabels, regValues, 'Doanh thu theo vùng');
    updateChart('chartDonut', 'doughnut', prodLabels, prodValues, 'Tỷ trọng sản phẩm');
    
    // Render bảng chi tiết
    renderTable(data);
}

// Helper: Vẽ hoặc Update Chart.js
function updateChart(canvasId, type, labels, dataArr, labelStr) {
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Nếu chart đã tồn tại -> Hủy để vẽ mới
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const colors = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f97316'];

    charts[canvasId] = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                label: labelStr,
                data: dataArr,
                backgroundColor: (type === 'doughnut') ? colors : 'rgba(99, 102, 241, 0.7)',
                borderColor: '#6366f1',
                borderWidth: 1,
                tension: 0.4,
                fill: type === 'line' // Line chart có fill vùng dưới
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: type === 'doughnut', position: 'right' }
            },
            scales: (type === 'doughnut') ? {} : {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function animateValue(id, value, suffix) {
    const el = document.getElementById(id);
    if(el) el.textContent = new Intl.NumberFormat('vi-VN').format(value) + suffix;
}

function renderTable(data) {
    const tableWrap = document.getElementById('tableWrap');
    if(!tableWrap) return;
    
    if (!data.length) {
        tableWrap.innerHTML = '<p class="muted" style="text-align:center; padding:20px;">Không có dữ liệu phù hợp.</p>';
        return;
    }
    
    // Lấy 20 dòng đầu
    const displayData = data.slice(0, 20);
    const headers = ['date', 'product', 'region', 'revenue', 'profit']; // Các cột chính
    const headerNames = {'date': 'Ngày', 'product': 'Sản phẩm', 'region': 'Khu vực', 'revenue': 'Doanh thu', 'profit': 'Lợi nhuận'};

    let html = '<table class="stats-table"><thead><tr>';
    headers.forEach(h => html += `<th>${headerNames[h]}</th>`);
    html += '</tr></thead><tbody>';
    
    displayData.forEach(r => {
        html += '<tr>';
        headers.forEach(h => {
            let val = r[h];
            if (h === 'revenue' || h === 'profit') val = new Intl.NumberFormat('vi-VN').format(val);
            html += `<td>${val}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    
    if (data.length > 20) {
        html += `<div style="text-align:center; padding:10px; color:#aaa;">... và ${data.length - 20} dòng khác ...</div>`;
    }
    tableWrap.innerHTML = html;
}