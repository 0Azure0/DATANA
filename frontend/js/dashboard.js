// frontend/js/dashboard.js

let ALL_DATA = [];
let CURRENT_SESSION_ID = null;
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();

    // Lấy Session ID
    let raw = localStorage.getItem('datana_last_analysis');
    if (raw) {
        try {
            const analysis = JSON.parse(raw);
            ALL_DATA = analysis.raw_data || [];
            if (analysis.session_id) {
                CURRENT_SESSION_ID = analysis.session_id;
                localStorage.setItem('datana_session_id', CURRENT_SESSION_ID);
            }
        } catch (e) { console.error(e); }
    }

    // Nếu không có dữ liệu thật -> Tạo giả
    if (!ALL_DATA || ALL_DATA.length === 0) {
        ALL_DATA = generateMockData();
    }

    updateDashboard(ALL_DATA);
});

// --- XỬ LÝ NÚT PHÂN TÍCH AI & XUẤT PDF ---

// 1. Hàm gọi AI (Dùng cho cả nút bấm và khi xuất PDF)
async function triggerAIAnalysis() {
    const aiDiv = document.getElementById('aiForecastResult');
    const btn = document.getElementById('btnAiForecast');
    
    // Nếu đang không có session ID (dữ liệu giả)
    if (!CURRENT_SESSION_ID) {
        aiDiv.innerHTML = `<div style="padding:20px; border:1px dashed #f59e0b; color:#f59e0b; border-radius:8px;">
            ⚠️ Đang xem dữ liệu mẫu. Vui lòng <strong>Tải lên file Excel</strong> để AI phân tích thật.
        </div>`;
        return false;
    }

    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang suy nghĩ...';
    }
    
    aiDiv.innerHTML = `<div style="text-align:center; padding:30px; color:#94a3b8;">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
        <p style="margin-top:10px">AI đang đọc dữ liệu và viết báo cáo...</p>
    </div>`;

    try {
        const response = await fetch('/api/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: CURRENT_SESSION_ID })
        });
        const data = await response.json();
        
        if (data.html_content) {
            aiDiv.innerHTML = data.html_content;
            if(btn) { btn.disabled = false; btn.innerHTML = '✨ Phân tích lại'; }
            return true; // Thành công
        } else {
            aiDiv.innerHTML = `<p style="color:red">Lỗi: ${data.error || 'AI không trả lời'}</p>`;
        }
    } catch (e) {
        aiDiv.innerHTML = `<p style="color:red">Lỗi kết nối: ${e.message}</p>`;
    }
    
    if(btn) { btn.disabled = false; btn.innerHTML = '✨ Phân tích ngay'; }
    return false;
}

// 2. Hàm Xuất PDF (Sửa lỗi thiếu nội dung)
async function handleExportPDF() {
    const loader = document.getElementById('loadingOverlay');
    const btn = document.getElementById('printPreviewBtn');
    
    // Bật màn hình chờ
    if (loader) {
        loader.classList.add('active');
        loader.querySelector('.loading-text').innerText = "🔄 Đang chuẩn bị dữ liệu báo cáo...";
    }
    if (btn) btn.disabled = true;

    // Tắt animation biểu đồ để in cho nét
    Object.values(charts).forEach(c => { c.options.animation = false; c.update(); });

    // Kiểm tra xem AI đã phân tích chưa, nếu chưa thì gọi AI trước
    const aiContent = document.getElementById('aiForecastResult').innerText.trim();
    if (aiContent.length < 50 || aiContent.includes("Bấm nút")) {
        if (loader) loader.querySelector('.loading-text').innerText = "🧠 AI đang viết báo cáo chiến lược...";
        await triggerAIAnalysis(); // Đợi AI viết xong
    }

    // Đợi 1 giây để trình duyệt render lại HTML (Bảng + AI)
    setTimeout(() => {
        if (loader) loader.querySelector('.loading-text').innerText = "🖨️ Đang mở bảng in...";
        
        window.print(); // Gọi lệnh in

        // Sau khi in xong
        if (loader) loader.classList.remove('active');
        if (btn) btn.disabled = false;
        
        // Bật lại animation
        Object.values(charts).forEach(c => { c.options.animation = true; c.update(); });
    }, 1500);
}

// --- SETUP SỰ KIỆN ---
function setupEventListeners() {
    // Dropdown
    const dropdownBtn = document.getElementById('regionDropdownBtn');
    if (dropdownBtn) {
        dropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('regionList').classList.toggle('show'); });
    }
    window.addEventListener('click', () => { document.getElementById('regionList')?.classList.remove('show'); });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).style.display = 'block';
            e.target.classList.add('active');
            setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 100);
        });
    });

    // Nút Xuất PDF
    const printBtn = document.getElementById('printPreviewBtn');
    if(printBtn) printBtn.addEventListener('click', handleExportPDF);

    // Nút AI (SỬA LỖI KHÔNG BẤM ĐƯỢC)
    const aiBtn = document.getElementById('btnAiForecast');
    if(aiBtn) aiBtn.addEventListener('click', triggerAIAnalysis);
}

// --- CÁC HÀM VẼ CHART & BẢNG (GIỮ NGUYÊN) ---
function updateDashboard(data) {
    if(!data || data.length === 0) return;
    
    // Tính toán
    const totalRev = data.reduce((s, r) => s + (r.revenue||0), 0);
    const totalProf = data.reduce((s, r) => s + (r.profit||0), 0);
    
    const prodMap = {}; const timeMap = {}; const regMap = {}; const categoryMap = {}; const brandMap = {}; const profitMap = {};

    data.forEach(r => {
        prodMap[r.product] = (prodMap[r.product]||0) + (r.revenue||0);
        if(!profitMap[r.product]) profitMap[r.product] = { qty: 0, profit: 0 };
        profitMap[r.product].qty += (r.quantity||0);
        profitMap[r.product].profit += (r.profit||0);
        if(r.month) timeMap[r.month] = (timeMap[r.month]||0) + r.revenue;
        regMap[r.region||'Khác'] = (regMap[r.region||'Khác']||0) + r.revenue;
        categoryMap[r.category||'Khác'] = (categoryMap[r.category||'Khác']||0) + (r.quantity||0);
        brandMap[r.brand||'Khác'] = (brandMap[r.brand||'Khác']||0) + (r.quantity||0);
    });

    safeSetText('kpi_rev', fmtMoney(totalRev));
    safeSetText('kpi_profit', fmtMoney(totalProf));
    safeSetText('kpi_topprod', Object.keys(prodMap).sort((a,b) => prodMap[b]-prodMap[a])[0] || '-');

    // Vẽ
    const months = Object.keys(timeMap).sort((a, b) => parseInt(a.replace('Tháng ', '')) - parseInt(b.replace('Tháng ', '')));
    drawChart('chartLine', 'line', months, months.map(m=>timeMap[m]), 'Doanh thu');
    drawChart('chartBar', 'bar', Object.keys(regMap), Object.values(regMap), 'Doanh thu vùng');
    drawChart('chartDonut', 'doughnut', processTop5(prodMap).labels, processTop5(prodMap).values, 'Sản phẩm');
    drawChart('chartBrandPie', 'pie', processTop5(brandMap).labels, processTop5(brandMap).values, 'Thị phần');
    drawChart('chartCategoryBar', 'bar', Object.keys(categoryMap), Object.values(categoryMap), 'Số lượng bán');
    
    const scatterData = data.slice(0, 50).map(r => ({ x: r.quantity, y: r.revenue }));
    drawScatterChart('chartScatterPrice', scatterData, 'Số lượng', 'Doanh thu');
    const scatterProfit = data.slice(0, 50).map(r => ({ x: r.quantity, y: r.profit }));
    drawScatterChart('chartScatterProfit', scatterProfit, 'Số lượng', 'Lợi nhuận');

    updateTables(data, prodMap, profitMap, categoryMap, brandMap, totalRev);
}

function updateTables(data, prodMap, profitMap, categoryMap, brandMap, totalRev) {
    const tbodyProd = document.querySelector('#productTable tbody');
    if (tbodyProd) {
        tbodyProd.innerHTML = '';
        Object.entries(prodMap).sort((a,b)=>b[1]-a[1]).slice(0, 8).forEach(([prod, revenue]) => {
            const pct = totalRev > 0 ? ((revenue/totalRev)*100).toFixed(1) : 0;
            tbodyProd.innerHTML += `<tr><td style="color:#fbbf24">${prod}</td><td class="text-right">-</td><td class="text-right">${fmtMoney(revenue)}</td><td><span class="badge-percent">${pct}%</span></td></tr>`;
        });
    }
    const tbodySales = document.querySelector('#salesTable tbody');
    if (tbodySales) {
        tbodySales.innerHTML = '';
        const summary = {};
        data.forEach(r => { if(!summary[r.product]) summary[r.product]={cat:r.category||'-',qty:0,rev:0}; summary[r.product].qty+=r.quantity; summary[r.product].rev+=r.revenue; });
        Object.entries(summary).sort((a,b)=>b[1].rev-a[1].rev).slice(0,8).forEach(([p,v])=>{
            tbodySales.innerHTML += `<tr><td style="color:#a5b4fc">${v.cat}</td><td>${p}</td><td class="text-right">${v.qty}</td><td class="text-right">${fmtMoney(v.rev)}</td></tr>`;
        });
    }
    // (Giữ nguyên logic các bảng còn lại như code trước)
    const tbodyProfit = document.querySelector('#profitTable tbody');
    if (tbodyProfit) {
        tbodyProfit.innerHTML = '';
        Object.entries(profitMap).sort((a,b)=>b[1].profit-a[1].profit).slice(0,8).forEach(([p,v])=>{
            tbodyProfit.innerHTML += `<tr><td style="color:#f472b6">${p}</td><td class="text-right">${v.qty}</td><td class="text-right">${fmtMoney(v.profit)}</td><td><span class="badge-percent">High</span></td></tr>`;
        });
    }
}

function drawChart(id, type, labels, dataArr, label) {
    const ctx = document.getElementById(id); if(!ctx) return; if(charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: type,
        data: { labels: labels, datasets: [{ label: label, data: dataArr, backgroundColor: ['#8b5cf6','#10b981','#f43f5e','#3b82f6','#f59e0b'], borderColor: '#8b5cf6', borderWidth: 1, tension: 0.4, fill: type==='line' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: {display: type.includes('pie')||type.includes('doughnut'), position:'right', labels:{color:'#fff'}}, tooltip: { callbacks: { label: function(context) { let val = context.parsed.y!==undefined?context.parsed.y:context.parsed; return ` ${context.label}: ${fmtMoney(val)}`; }}} }, scales: { y: {ticks:{color:'#94a3b8'}, grid:{color:'rgba(255,255,255,0.05)'}, display: !type.includes('pie')&&!type.includes('doughnut')}, x: {ticks:{color:'#94a3b8'}, grid:{display:false}, display: !type.includes('pie')&&!type.includes('doughnut')} } }
    });
}
function drawScatterChart(id, data, x, y) {
    const ctx = document.getElementById(id); if(!ctx) return; if(charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, { type: 'scatter', data: { datasets: [{ label: 'Data', data: data, backgroundColor: '#f472b6' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: {display:false} }, scales: { x: {title:{display:true,text:x,color:'#fff'}, grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#94a3b8'}}, y: {title:{display:true,text:y,color:'#fff'}, grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#94a3b8'}} } } });
}
function generateMockData() { return []; }
function safeSetText(id, t) { const e = document.getElementById(id); if(e) e.innerText = t; }
function processTop5(m) { const s = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5); return { labels: s.map(i=>i[0]), values: s.map(i=>i[1]) }; }
function fmtMoney(n) { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n); }