// FILE: frontend/js/dashboard.js

// --- BIẾN TOÀN CỤC ---
let ALL_DATA = [];
let CURRENT_SESSION_ID = null;
let charts = {}; 
let FORECAST_DATA_CACHE = null; 

// Bảng màu (Chart.js)
const CHART_COLORS = ['#8b5cf6', '#10b981', '#f43f5e', '#3b82f6', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#84cc16', '#d946ef'];

// --- 1. KHỞI TẠO ---
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    let raw = localStorage.getItem('datana_last_analysis');
    if (raw) {
        try {
            const analysis = JSON.parse(raw);
            ALL_DATA = analysis.raw_data || [];
            if (analysis.smart_summary && analysis.smart_summary.forecast_data) FORECAST_DATA_CACHE = analysis.smart_summary.forecast_data;
            if (analysis.session_id) { CURRENT_SESSION_ID = analysis.session_id; localStorage.setItem('datana_session_id', CURRENT_SESSION_ID); }
        } catch (e) { console.error(e); }
    }
    if (!ALL_DATA || ALL_DATA.length === 0) ALL_DATA = generateMockData();
    updateDashboard(ALL_DATA);
});

// --- 2. SỰ KIỆN ---
function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.getAttribute('data-tab') || e.target.closest('.tab-btn').getAttribute('data-tab')));
    });
    const printBtn = document.getElementById('printPreviewBtn');
    if(printBtn) printBtn.addEventListener('click', handleExportPDF);
    const aiBtn = document.getElementById('btnAiForecast');
    if(aiBtn) aiBtn.addEventListener('click', triggerAIAnalysis);
}

// --- 3. CHUYỂN TAB ---
function switchTab(tabName) {
    if(!tabName) return;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(tabName)?.classList.add('active');
    setTimeout(() => { window.dispatchEvent(new Event('resize')); Object.values(charts).forEach(c => c.resize()); }, 50);
}

// --- 4. CẬP NHẬT DASHBOARD ---
function updateDashboard(data) {
    if(!data || data.length === 0) return;
    
    // A. TÍNH TOÁN
    const totalRev = data.reduce((s, r) => s + (r.revenue||0), 0);
    const totalProf = data.reduce((s, r) => s + (r.profit||0), 0);
    
    const prodMap = {}, timeMap = {}, timeProfitMap = {}, regMap = {}, categoryMap = {}, profitMap = {}, brandMetrics = {}; 

    data.forEach(r => {
        const rev = r.revenue||0; const prof = r.profit||0; const qty = r.quantity||0;
        const month = r.month || 'N/A'; const brand = r.brand || 'Khác';

        prodMap[r.product] = (prodMap[r.product]||0) + rev;
        if(!profitMap[r.product]) profitMap[r.product] = { qty: 0, profit: 0 };
        profitMap[r.product].qty += qty; profitMap[r.product].profit += prof;
        
        timeMap[month] = (timeMap[month]||0) + rev;
        timeProfitMap[month] = (timeProfitMap[month]||0) + prof;
        regMap[r.region||'Khác'] = (regMap[r.region||'Khác']||0) + rev;
        categoryMap[r.category||'Khác'] = (categoryMap[r.category||'Khác']||0) + qty;

        if (!brandMetrics[brand]) brandMetrics[brand] = { revenue: 0, profit: 0, quantity: 0 };
        brandMetrics[brand].revenue += rev; brandMetrics[brand].profit += prof; brandMetrics[brand].quantity += qty;
    });

    safeSetText('kpi_rev', fmtMoney(totalRev));
    safeSetText('kpi_profit', fmtMoney(totalProf));
    safeSetText('kpi_topprod', Object.keys(prodMap).sort((a,b) => prodMap[b]-prodMap[a])[0] || '-');

    const sortedMonths = Object.keys(timeMap).sort(); 
    if (FORECAST_DATA_CACHE && FORECAST_DATA_CACHE.labels && FORECAST_DATA_CACHE.forecast) drawForecastChart(FORECAST_DATA_CACHE);
    else drawChart('chartLine', 'line', sortedMonths, sortedMonths.map(m=>timeMap[m]), 'Doanh thu');

    drawChart('chartBar', 'bar', Object.keys(regMap), Object.values(regMap), 'Doanh thu vùng');
    const top5Prod = processTop5(prodMap);
    drawChart('chartDonut', 'doughnut', top5Prod.labels, top5Prod.values, 'Sản phẩm');
    
    const maxQty = Math.max(...Object.values(brandMetrics).map(m => m.quantity), 1);
    const bubbleDataSets = Object.keys(brandMetrics).map((brand, index) => {
        const item = brandMetrics[brand]; let radius = (item.quantity / maxQty) * 35; 
        return { label: brand, data: [{ x: item.revenue, y: item.profit, r: Math.max(radius, 6), originalQty: item.quantity }], backgroundColor: CHART_COLORS[index % CHART_COLORS.length] + 'B3', borderColor: '#1e293b', borderWidth: 1 };
    });
    drawBubbleChart('chartBrandBubble', bubbleDataSets);
    drawDualAxisChart('chartRevProfitDual', sortedMonths, sortedMonths.map(m=>timeMap[m]), sortedMonths.map(m=>timeProfitMap[m]));
    
    const topProfitKeys = Object.keys(profitMap).sort((a, b) => profitMap[b].profit - profitMap[a].profit).slice(0, 5);
    drawChart('chartProfitBar', 'bar', topProfitKeys, topProfitKeys.map(k => profitMap[k].profit), 'Lợi nhuận'); 

    updateTables(data);
}

// --- 5. LOGIC BẢNG CHI TIẾT (FULL DATA) ---
function updateTables(data) {
    if (!data || data.length === 0) return;

    let statsBrand = {}, statsCategory = {}, statsProduct = {}, statsMonth = {};

    data.forEach(r => {
        const rev = r.revenue || 0; const prof = r.profit || 0; const qty = r.quantity || 0;
        const cat = r.category || 'Khác'; const month = r.month || 'N/A';

        const add = (obj, key, extra = {}) => { 
            if(!obj[key]) obj[key] = {rev:0, prof:0, qty:0, ...extra}; 
            obj[key].rev += rev; obj[key].prof += prof; obj[key].qty += qty; 
        };

        add(statsBrand, r.brand || 'Khác'); 
        add(statsCategory, cat); 
        add(statsProduct, r.product || 'Unknown', { category: cat });
        add(statsMonth, month);
    });

    renderTable('tbl_brand', Object.entries(statsBrand).sort((a,b)=>b[1].rev - a[1].rev), (k,v) => `<tr><td>${k}</td><td class="text-right">${fmtMoney(v.rev)}</td><td class="text-right" style="color:${v.prof>0?'#34d399':'#ef4444'}">${fmtMoney(v.prof)}</td></tr>`);
    renderTable('tbl_category', Object.entries(statsCategory).sort((a,b)=>b[1].rev - a[1].rev), (k,v) => `<tr><td>${k}</td><td class="text-center">${v.qty}</td><td class="text-right">${fmtMoney(v.rev)}</td><td class="text-right">${fmtMoney(v.prof)}</td></tr>`);
    renderTable('tbl_bestseller', Object.entries(statsProduct).sort((a,b)=>b[1].qty - a[1].qty).slice(0,5), (k,v) => `<tr><td>${k}</td><td class="text-center"><span class="badge-hot">${v.qty}</span></td><td class="text-right">${fmtMoney(v.rev/v.qty)}</td><td class="text-right">${fmtMoney(v.prof)}</td></tr>`);

    // BẢNG 1: FULL SẢN PHẨM (TÍNH BIÊN LỢI NHUẬN)
    const fullProductList = Object.entries(statsProduct).map(([name, data]) => ({ name, ...data, margin: data.rev > 0 ? (data.prof / data.rev) * 100 : 0 }));
    fullProductList.sort((a, b) => b.rev - a.rev);
    
    renderTable('tbl_full_products', fullProductList, (item) => {
        let marginColor = '#64748b'; 
        if (item.margin >= 30) marginColor = '#10b981'; else if (item.margin < 0) marginColor = '#ef4444'; else if (item.margin < 10) marginColor = '#f59e0b';
        return `<tr><td style="font-weight:500;">${item.name}</td><td style="color:#94a3b8; font-size:0.85rem;">${item.category}</td><td class="text-center">${fmtNumber(item.qty)}</td><td class="text-right">${fmtMoney(item.rev)}</td><td class="text-right" style="${item.prof<0?'color:red':''}">${fmtMoney(item.prof)}</td><td class="text-center" style="color:${marginColor}; font-weight:bold;">${item.margin.toFixed(1)}%</td></tr>`;
    }, true);

    // BẢNG 2: TĂNG TRƯỞNG THÁNG (MOM)
    const sortedMonths = Object.keys(statsMonth).sort(); 
    let prevRev = 0;
    renderTable('tbl_monthly_growth', sortedMonths, (m) => {
        const d = statsMonth[m];
        let growthHtml = '<span style="color:#94a3b8">-</span>';
        if (prevRev > 0) {
            const growth = ((d.rev - prevRev) / prevRev) * 100;
            if (growth > 0) growthHtml = `<span style="color:#10b981; font-weight:bold;">▲ ${growth.toFixed(1)}%</span>`;
            else if (growth < 0) growthHtml = `<span style="color:#ef4444; font-weight:bold;">▼ ${Math.abs(growth).toFixed(1)}%</span>`;
            else growthHtml = `<span style="color:#f59e0b; font-weight:bold;">0%</span>`;
        } else if (prevRev === 0 && d.rev > 0) growthHtml = `<span style="color:#10b981; font-weight:bold;">Start</span>`;
        
        prevRev = d.rev;
        return `<tr><td style="font-weight:600;">${m}</td><td class="text-right">${fmtMoney(d.rev)}</td><td class="text-right">${fmtMoney(d.prof)}</td><td class="text-center">${fmtNumber(d.qty)}</td><td class="text-center">${growthHtml}</td></tr>`;
    }, true);
}

// --- 6. CHART DRAWING ---
function drawBubbleChart(id, datasets) {
    const ctx = document.getElementById(id); if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, { type: 'bubble', data: { datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#fff', boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: DT ${fmtMoney(c.raw.x)}` } } }, scales: { y: { ticks: { color: '#94a3b8', callback: v=>fmtMoney(v,true) }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#94a3b8', callback: v=>fmtMoney(v,true) }, grid: { color: 'rgba(255,255,255,0.05)' } } } } });
}
function drawDualAxisChart(id, labels, revData, profitData) {
    const ctx = document.getElementById(id); if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Lợi nhuận', type: 'line', data: profitData, borderColor: '#f472b6', backgroundColor: '#f472b6', yAxisID: 'y1', tension: 0.4 }, { label: 'Doanh thu', type: 'bar', data: revData, backgroundColor: 'rgba(59, 130, 246, 0.7)', yAxisID: 'y' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } }, scales: { y: { display: true, position: 'left', ticks:{color:'#94a3b8'}, grid:{color:'rgba(255,255,255,0.05)'} }, y1: { display: true, position: 'right', ticks:{color:'#f472b6'}, grid:{drawOnChartArea:false} }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } } } });
}
function drawForecastChart(forecastData) {
    const ctx = document.getElementById('chartLine'); if (!ctx) return;
    if (charts['chartLine']) charts['chartLine'].destroy();
    charts['chartLine'] = new Chart(ctx, { type: 'line', data: { labels: forecastData.labels, datasets: [{ label: 'Thực tế', data: forecastData.history, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.3, fill: true }, { label: 'Dự báo (AI)', data: forecastData.forecast, borderColor: '#f59e0b', borderDash: [5, 5], backgroundColor: 'rgba(245, 158, 11, 0.0)', pointStyle: 'rectRot', pointRadius: 5, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }, scales: { y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } } } });
}
function drawChart(id, type, labels, dataArr, label) {
    const ctx = document.getElementById(id); if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ label: label, data: dataArr, backgroundColor: CHART_COLORS, borderColor: '#1e293b', borderWidth: 2, tension: 0.4, fill: type === 'line' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type.includes('pie') || type.includes('doughnut'), position: 'right', labels: { color: '#fff' } } }, scales: { y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, display: !type.includes('pie') }, x: { ticks: { color: '#94a3b8' }, grid: { display: false }, display: !type.includes('pie') } } } });
}

// --- 7. AI & IN ẤN TỰ ĐỘNG ---
async function triggerAIAnalysis() {
    const aiDiv = document.getElementById('aiForecastResult'); const btn = document.getElementById('btnAiForecast');
    if (!CURRENT_SESSION_ID) { aiDiv.innerHTML = `<div style="color:#f59e0b;">⚠️ Chưa có file.</div>`; return; }
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang suy nghĩ...'; }
    aiDiv.innerHTML = `<div style="text-align:center; padding:20px;">AI đang phân tích chiến lược...</div>`;
    try {
        const res = await fetch('/api/forecast', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({session_id: CURRENT_SESSION_ID}) });
        const data = await res.json();
        if(data.html_content) { aiDiv.innerHTML = data.html_content; if(btn){btn.disabled=false; btn.innerHTML='✨ Phân tích lại';} }
        else aiDiv.innerHTML = 'Lỗi AI';
    } catch(e) { aiDiv.innerHTML = 'Lỗi kết nối'; if(btn) btn.disabled=false; }
}

async function handleExportPDF() {
    const loader = document.getElementById('loadingOverlay'); 
    const btn = document.getElementById('printPreviewBtn');
    const printDate = document.getElementById('printDateDisplay');
    const aiDiv = document.getElementById('aiForecastResult');

    // 1. Cập nhật ngày
    if(printDate) printDate.innerText = `Ngày: ${new Date().toLocaleDateString('vi-VN')}`;

    // 2. Hiện Loading
    if (loader) { loader.style.display = 'flex'; loader.querySelector('.loading-text').innerText = "🤖 Đang gọi AI phân tích & chuẩn bị bản in..."; }
    if (btn) btn.disabled = true;

    // 3. TỰ ĐỘNG GỌI AI NẾU CHƯA CÓ NỘI DUNG
    // Kiểm tra xem AI đã chạy chưa (dựa vào text). Nếu chưa thì chạy luôn.
    if (aiDiv && (aiDiv.innerText.length < 50 || aiDiv.innerText.includes("Bấm nút"))) {
        await triggerAIAnalysis(); // Chờ AI viết xong mới đi tiếp
    }

    // 4. CHUYỂN BIỂU ĐỒ SANG LIGHT MODE (MÀU ĐEN)
    if (loader) loader.querySelector('.loading-text').innerText = "🖨️ Đang tạo bản in...";
    
    Object.values(charts).forEach(c => {
        // Đổi màu trục và chữ sang đen
        if(c.options.scales.x) c.options.scales.x.ticks.color = '#000';
        if(c.options.scales.y) { c.options.scales.y.ticks.color = '#000'; c.options.scales.y.grid.color = '#ccc'; }
        if(c.options.plugins.legend) c.options.plugins.legend.labels.color = '#000';
        c.options.animation = false; c.resize(); c.update();
    });

    // 5. IN (Sau 1s để trình duyệt render kịp)
    setTimeout(() => {
        if (loader) loader.style.display = 'none';
        window.print(); 

        // 6. KHÔI PHỤC LẠI DARK MODE SAU KHI IN
        Object.values(charts).forEach(c => {
            if(c.options.scales.x) c.options.scales.x.ticks.color = '#94a3b8';
            if(c.options.scales.y) { c.options.scales.y.ticks.color = '#94a3b8'; c.options.scales.y.grid.color = 'rgba(255,255,255,0.05)'; }
            if(c.options.plugins.legend) c.options.plugins.legend.labels.color = '#fff';
            c.options.animation = true; c.resize(); c.update();
        });
        if (btn) btn.disabled = false;
    }, 1000);
}

// UTILS
function renderTable(id, data, rowFn, isSimple=false) { const el = document.getElementById(id); if(!el) return; el.innerHTML = data.length ? data.map(i => isSimple?rowFn(i):rowFn(i[0],i[1])).join('') : '<tr><td colspan="6" class="text-center">Chưa có dữ liệu</td></tr>'; }
function safeSetText(id, t) { const e = document.getElementById(id); if(e) e.innerText = t; }
function processTop5(m) { const s = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5); return { labels: s.map(i=>i[0]), values: s.map(i=>i[1]) }; }
function fmtMoney(n, s=false) { if(s){if(n>=1e9)return(n/1e9).toFixed(1)+' tỷ';if(n>=1e6)return(n/1e6).toFixed(0)+' tr';} return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n); }
function fmtNumber(n) { return new Intl.NumberFormat('vi-VN').format(n); }
function generateMockData() { return [{ product: 'Demo', revenue: 0, profit: 0, quantity: 0 }]; }