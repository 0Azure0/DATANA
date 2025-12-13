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

    if (!ALL_DATA || ALL_DATA.length === 0) {
        ALL_DATA = generateMockData();
    }

    updateDashboard(ALL_DATA);
});

// --- XỬ LÝ NÚT PHÂN TÍCH AI ---
async function triggerAIAnalysis() {
    const aiDiv = document.getElementById('aiForecastResult');
    const btn = document.getElementById('btnAiForecast');
    
    if (!CURRENT_SESSION_ID) {
        aiDiv.innerHTML = `<div style="padding:20px; border:1px dashed #f59e0b; color:#f59e0b; border-radius:8px;">⚠️ Đang xem dữ liệu mẫu. Vui lòng <strong>Tải lên file Excel</strong> để AI phân tích thật.</div>`;
        return false;
    }

    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang suy nghĩ...'; }
    
    aiDiv.innerHTML = `<div style="text-align:center; padding:30px; color:#94a3b8;"><div class="typing-indicator"><span></span><span></span><span></span></div><p style="margin-top:10px">AI đang đọc dữ liệu và viết báo cáo...</p></div>`;

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
            return true;
        } else {
            aiDiv.innerHTML = `<p style="color:red">Lỗi: ${data.error || 'AI không trả lời'}</p>`;
        }
    } catch (e) {
        aiDiv.innerHTML = `<p style="color:red">Lỗi kết nối: ${e.message}</p>`;
    }
    
    if(btn) { btn.disabled = false; btn.innerHTML = '✨ Phân tích ngay'; }
    return false;
}

// --- XỬ LÝ XUẤT PDF (CÓ TRANG BÌA) ---
async function handleExportPDF() {
    const loader = document.getElementById('loadingOverlay');
    const btn = document.getElementById('printPreviewBtn');
    
    // 1. CẬP NHẬT NỘI DUNG TRANG BÌA
    const titleInput = document.getElementById('reportTitleInput').value;
    const printTitle = document.getElementById('printTitleDisplay');
    const printDate = document.getElementById('printDateDisplay');
    
    // Nếu không nhập thì lấy mặc định
    printTitle.innerText = titleInput.trim() !== "" ? titleInput : "BÁO CÁO HIỆU QUẢ KINH DOANH";
    
    // Cập nhật ngày
    const today = new Date();
    printDate.innerText = `Ngày xuất bản: ${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;

    // 2. HIỆN LOADER
    if (loader) {
        loader.classList.add('active');
        loader.querySelector('.loading-text').innerText = "🔄 Đang chuẩn bị trang bìa & dữ liệu...";
    }
    if (btn) btn.disabled = true;

    // 3. TẮT ANIMATION CHART
    Object.values(charts).forEach(c => { c.options.animation = false; c.update(); });

    // 4. KIỂM TRA AI (Gọi nếu chưa có)
    const aiContent = document.getElementById('aiForecastResult').innerText.trim();
    if (aiContent.length < 50 || aiContent.includes("Bấm nút")) {
        if (loader) loader.querySelector('.loading-text').innerText = "🧠 AI đang viết báo cáo chiến lược...";
        await triggerAIAnalysis(); 
    }

    // 5. IN
    setTimeout(() => {
        if (loader) loader.querySelector('.loading-text').innerText = "🖨️ Đang mở bảng in...";
        window.print(); 

        // Reset sau khi in
        if (loader) loader.classList.remove('active');
        if (btn) btn.disabled = false;
        Object.values(charts).forEach(c => { c.options.animation = true; c.update(); });
    }, 1500);
}

// --- SETUP SỰ KIỆN ---
function setupEventListeners() {
    const dropdownBtn = document.getElementById('regionDropdownBtn');
    if (dropdownBtn) {
        dropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('regionList').classList.toggle('show'); });
    }
    window.addEventListener('click', () => { document.getElementById('regionList')?.classList.remove('show'); });

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

    const printBtn = document.getElementById('printPreviewBtn');
    if(printBtn) printBtn.addEventListener('click', handleExportPDF);

    const aiBtn = document.getElementById('btnAiForecast');
    if(aiBtn) aiBtn.addEventListener('click', triggerAIAnalysis);
}

// --- LOGIC DỮ LIỆU & VẼ BIỂU ĐỒ ---
function updateDashboard(data) {
    if(!data || data.length === 0) return;
    
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

    const months = Object.keys(timeMap).sort((a, b) => parseInt(a.replace('Tháng ', '')) - parseInt(b.replace('Tháng ', '')));
    drawChart('chartLine', 'line', months, months.map(m=>timeMap[m]), 'Doanh thu');
    drawChart('chartBar', 'bar', Object.keys(regMap), Object.values(regMap), 'Doanh thu vùng');
    drawChart('chartDonut', 'doughnut', processTop5(prodMap).labels, processTop5(prodMap).values, 'Sản phẩm');
    drawChart('chartCategoryBar', 'bar', Object.keys(categoryMap), Object.values(categoryMap), 'Số lượng bán');
    
    // Gọi hàm cập nhật bảng mới
    updateTables(data);
}

// --- HÀM CẬP NHẬT BẢNG CHI TIẾT (MỚI) ---
function updateTables(data) {
    if (!data || data.length === 0) return;

    // 1. Khởi tạo
    let statsBrand = {};
    let statsCategory = {};
    let statsProduct = {};
    let statsRegion = {};
    let statsPriceRange = {
        'low': { label: 'Dưới 5 triệu', profit: 0, revenue: 0 },
        'mid': { label: 'Từ 5 - 15 triệu', profit: 0, revenue: 0 },
        'high': { label: 'Trên 15 triệu', profit: 0, revenue: 0 }
    };

    // 2. Tính toán gom nhóm
    data.forEach(r => {
        const rev = r.revenue || 0;
        const prof = r.profit || 0;
        const qty = r.quantity || 0;
        const brand = r.brand || 'Khác';
        const cat = r.category || 'Khác';
        const prod = r.product || 'Unknown';
        const region = r.region || 'Chưa xác định';
        
        const unitPrice = qty > 0 ? (rev / qty) : 0;

        // Brand
        if (!statsBrand[brand]) statsBrand[brand] = { rev: 0, prof: 0 };
        statsBrand[brand].rev += rev;
        statsBrand[brand].prof += prof;

        // Category
        if (!statsCategory[cat]) statsCategory[cat] = { qty: 0, rev: 0, prof: 0 };
        statsCategory[cat].qty += qty;
        statsCategory[cat].rev += rev;
        statsCategory[cat].prof += prof;

        // Product
        if (!statsProduct[prod]) statsProduct[prod] = { qty: 0, rev: 0, prof: 0 };
        statsProduct[prod].qty += qty;
        statsProduct[prod].rev += rev;
        statsProduct[prod].prof += prof;

        // Region
        if (!statsRegion[region]) statsRegion[region] = { qty: 0, rev: 0, prof: 0 };
        statsRegion[region].qty += qty;
        statsRegion[region].rev += rev;
        statsRegion[region].prof += prof;

        // Price Range
        if (unitPrice < 5000000) {
            statsPriceRange.low.profit += prof;
            statsPriceRange.low.revenue += rev;
        } else if (unitPrice <= 15000000) {
            statsPriceRange.mid.profit += prof;
            statsPriceRange.mid.revenue += rev;
        } else {
            statsPriceRange.high.profit += prof;
            statsPriceRange.high.revenue += rev;
        }
    });

    // 3. Render ra HTML

    // Bảng 1: Thương hiệu
    const sortedBrands = Object.entries(statsBrand).sort((a, b) => b[1].rev - a[1].rev);
    renderTable('tbl_brand', sortedBrands, (key, val) => `
        <tr>
            <td>${key}</td>
            <td class="text-right">${fmtMoney(val.rev)}</td>
            <td class="text-right" style="color:${val.prof>0?'#34d399':'#ef4444'}">${fmtMoney(val.prof)}</td>
        </tr>
    `);

    // Bảng 2: Danh mục
    const sortedCats = Object.entries(statsCategory).sort((a, b) => b[1].rev - a[1].rev);
    renderTable('tbl_category', sortedCats, (key, val) => `
        <tr>
            <td>${key}</td>
            <td class="text-center">${val.qty}</td>
            <td class="text-right">${fmtMoney(val.rev)}</td>
            <td class="text-right">${fmtMoney(val.prof)}</td>
        </tr>
    `);

    // Bảng 3: Lợi nhuận SP
    const sortedByProfit = Object.entries(statsProduct).sort((a, b) => b[1].prof - a[1].prof).slice(0, 10);
    renderTable('tbl_profit_product', sortedByProfit, (key, val) => `
        <tr>
            <td>${key}</td>
            <td class="text-right"><span class="badge-profit">${fmtMoney(val.prof)}</span></td>
            <td class="text-right">${fmtMoney(val.rev)}</td>
            <td class="text-center">${val.qty}</td>
        </tr>
    `);

    // Bảng 4: Bán chạy nhất
    const sortedByQty = Object.entries(statsProduct).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
    renderTable('tbl_bestseller', sortedByQty, (key, val) => {
        const avgPrice = val.qty > 0 ? val.rev / val.qty : 0;
        return `
        <tr>
            <td>${key}</td>
            <td class="text-center"><span class="badge-hot">${val.qty}</span></td>
            <td class="text-right">${fmtMoney(avgPrice)}</td>
            <td class="text-right">${fmtMoney(val.prof)}</td>
        </tr>`;
    });

    // Bảng 5: Giá trị TB
    const sortedByRev = Object.entries(statsProduct).sort((a, b) => b[1].rev - a[1].rev).slice(0, 10);
    renderTable('tbl_avg', sortedByRev, (key, val) => {
        const avgPrice = val.qty > 0 ? val.rev / val.qty : 0;
        const avgProf = val.qty > 0 ? val.prof / val.qty : 0;
        return `
        <tr>
            <td>${key}</td>
            <td class="text-right">${fmtMoney(avgPrice)}</td>
            <td class="text-right" style="color:#6ee7b7">${fmtMoney(avgProf)}</td>
        </tr>`;
    });

    // Bảng 6: Phân khúc giá
    renderTable('tbl_price_range', Object.values(statsPriceRange), (item) => `
        <tr>
            <td>${item.label}</td>
            <td class="text-right"><span class="badge-profit">${fmtMoney(item.profit)}</span></td>
            <td class="text-right">${fmtMoney(item.revenue)}</td>
        </tr>
    `, true);

    // Bảng 7: Khu vực
    const sortedRegions = Object.entries(statsRegion).sort((a, b) => b[1].rev - a[1].rev);
    renderTable('tbl_region', sortedRegions, (key, val) => `
        <tr>
            <td>${key}</td>
            <td class="text-right">${fmtMoney(val.rev)}</td>
            <td class="text-right">${fmtMoney(val.prof)}</td>
            <td class="text-center">${val.qty}</td>
        </tr>
    `);
}

// Helper render
function renderTable(elementId, dataArray, rowGenerator, isSimpleArray = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = '';
    
    if (dataArray.length === 0) {
        el.innerHTML = '<tr><td colspan="4" class="text-center">Chưa có dữ liệu</td></tr>';
        return;
    }

    let html = '';
    dataArray.forEach(item => {
        if (isSimpleArray) html += rowGenerator(item);
        else html += rowGenerator(item[0], item[1]);
    });
    el.innerHTML = html;
}

function drawChart(id, type, labels, dataArr, label) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: dataArr,
                backgroundColor: ['#8b5cf6', '#10b981', '#f43f5e', '#3b82f6', '#f59e0b', '#ec4899', '#6366f1'],
                borderColor: '#1e293b', 
                borderWidth: 2,
                tension: 0.4,
                fill: type === 'line'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: type.includes('pie') || type.includes('doughnut'),
                    position: 'right',
                    labels: { color: '#fff', padding: 20 }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    padding: 12,
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            let val = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
                            let formattedVal = fmtMoney(val);
                            
                            // TÍNH % CHO PIE/DONUT
                            if (type === 'pie' || type === 'doughnut') {
                                let dataset = context.dataset;
                                let total = dataset.data.reduce((prev, curr) => prev + curr, 0);
                                let percentage = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ${percentage}% (${formattedVal})`;
                            }
                            return ` ${context.label}: ${formattedVal}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    display: !type.includes('pie') && !type.includes('doughnut')
                },
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { display: false },
                    display: !type.includes('pie') && !type.includes('doughnut')
                }
            }
        }
    });
}

function generateMockData() { return []; }
function safeSetText(id, t) { const e = document.getElementById(id); if(e) e.innerText = t; }
function processTop5(m) { const s = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5); return { labels: s.map(i=>i[0]), values: s.map(i=>i[1]) }; }
function fmtMoney(n) { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n); }