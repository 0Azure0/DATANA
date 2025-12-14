// --- CẤU HÌNH API ---
// Lưu ý: Backend đang chạy port 5001 trong code app.py của bạn
const API_URL = ''; 

// --- BIẾN TOÀN CỤC ---
let currentSessionId = null; // Quan trọng: Lưu ID phiên để chat với AI
let selectedFile = null;

// --- DOM ELEMENTS ---
const uploadInput = document.getElementById('uploadInput');
const dropArea = document.getElementById('dropArea');
const fileInfo = document.getElementById('fileInfo');
const analyzeBtn = document.getElementById('analyzeBtn');
const uploadMessage = document.getElementById('uploadMessage');
const resultModal = document.getElementById('resultModal');
const resultContent = document.getElementById('resultContent');
const closeResult = document.getElementById('closeResult');
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');

// --- 1. XỬ LÝ MENU MOBILE (Nếu chưa có trong HTML) ---
if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
        mainNav.classList.toggle('active');
        const icon = navToggle.querySelector('i');
        if (icon) {
            if (mainNav.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        }
    });
}

// --- 2. XỬ LÝ UPLOAD & DRAG DROP ---
if (dropArea) {
    dropArea.addEventListener('click', () => uploadInput.click());
    
    ['dragenter', 'dragover'].forEach(ev => dropArea.addEventListener(ev, (e) => {
        e.preventDefault();
        dropArea.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
    }));
    dropArea.addEventListener('drop', (e) => {
        const f = e.dataTransfer.files[0];
        handleFileSelect(f);
    });
}

if (uploadInput) {
    uploadInput.addEventListener('change', (e) => {
        const f = e.target.files[0];
        handleFileSelect(f);
    });
}

function handleFileSelect(file) {
    if (!file) return;
    const allowed = ['.csv', '.xlsx', '.xls'];
    const name = file.name || '';
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    
    if (!allowed.includes(ext)) {
        if (uploadMessage) uploadMessage.textContent = '❌ Chỉ chấp nhận file .xlsx hoặc .csv';
        return;
    }
    
    selectedFile = file;
    if (fileInfo) fileInfo.textContent = `📄 Đã chọn: ${name}`;
    if (uploadMessage) uploadMessage.textContent = '';
}

// --- 3. GỌI API PHÂN TÍCH ---
if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            uploadMessage.textContent = '⚠️ Vui lòng chọn file trước khi phân tích';
            return;
        }

        uploadMessage.textContent = '⏳ Đang gửi file lên server phân tích...';
        
        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const res = await fetch(`${API_URL}/analyze`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (!res.ok) {
                uploadMessage.textContent = `❌ Lỗi: ${data.error || 'Không xác định'}`;
                return;
            }

            // --- QUAN TRỌNG: LƯU SESSION ID ---
            if (data.session_id) {
                currentSessionId = data.session_id;
                console.log("✅ New Session ID:", currentSessionId);
            }

            // Hiển thị kết quả
            showResult(data);
            uploadMessage.textContent = '✅ Phân tích thành công!';
            
        } catch (err) {
            uploadMessage.textContent = '❌ Lỗi kết nối tới server (Kiểm tra xem Backend chạy chưa?)';
            console.error(err);
        }
    });
}

// --- 4. HIỂN THỊ KẾT QUẢ (DÙNG CHART.JS) ---
function showResult(data) {
    if (!resultContent) return;
    resultContent.innerHTML = ''; // Xóa cũ

    const stats = data.statistics || {};
    const time = data.time_analysis || {}; 
    const region = data.revenue_by_region || {};
    const recs = data.recommendations || [];

    // Tóm tắt số liệu
    const summaryHtml = `
        <div class="result-summary">
            <div class="rs-row">💰 <strong>Doanh thu:</strong> ${Number(stats.total_revenue || 0).toLocaleString('vi-VN')} VNĐ</div>
            <div class="rs-row">📦 <strong>Số lượng bán:</strong> ${Number(stats.total_quantity || 0).toLocaleString('vi-VN')}</div>
            <div class="rs-row">📈 <strong>Lợi nhuận:</strong> ${Number(stats.total_profit || 0).toLocaleString('vi-VN')} VNĐ</div>
        </div>
    `;
    resultContent.innerHTML += summaryHtml;

    // Biểu đồ Doanh thu theo Tháng (Line Chart)
    const chartData = data.revenue_by_month || (time.by_month && Object.keys(time.by_month).length ? time.by_month : null);
    if (chartData) {
        const div = document.createElement('div');
        div.style.marginTop = '20px';
        div.innerHTML = '<h4>📅 Xu hướng doanh thu</h4><canvas id="chartMonth"></canvas>';
        resultContent.appendChild(div);
        
        // Cần setTimeout để DOM render xong mới vẽ được
        setTimeout(() => {
            const ctx = document.getElementById('chartMonth');
            if (ctx) drawLineChart(ctx, chartData);
        }, 100);
    }

    // Biểu đồ Theo Vùng (Bar Chart)
    if (Object.keys(region).length) {
        const div = document.createElement('div');
        div.style.marginTop = '20px';
        div.innerHTML = '<h4>🌍 Doanh thu theo khu vực</h4><canvas id="chartRegion"></canvas>';
        resultContent.appendChild(div);

        setTimeout(() => {
            const ctx = document.getElementById('chartRegion');
            if (ctx) drawBarChart(ctx, region);
        }, 100);
    }

    // Gợi ý AI (Recommendations)
    if (recs) {
        const recDiv = document.createElement('div');
        recDiv.className = 'rs-recs';
        recDiv.style.marginTop = '20px';
        recDiv.innerHTML = '<h4>💡 Gợi ý chiến lược AI</h4>';
        
        if (typeof recs === 'object' && !Array.isArray(recs)) {
            if (recs.overall_strategy) recDiv.innerHTML += `<p><strong>Chiến lược chung:</strong></p><ul>${recs.overall_strategy.map(r => `<li>${r}</li>`).join('')}</ul>`;
            if (recs.product_suggestions) recDiv.innerHTML += `<p><strong>Sản phẩm:</strong></p><ul>${recs.product_suggestions.map(r => `<li>${r}</li>`).join('')}</ul>`;
        } else if (Array.isArray(recs)) {
            recDiv.innerHTML += `<ul>${recs.map(r => `<li>${r}</li>`).join('')}</ul>`;
        }
        resultContent.appendChild(recDiv);
    }

    // Mở Modal
    if (resultModal) resultModal.setAttribute('aria-hidden', 'false');
}

if (closeResult) {
    closeResult.addEventListener('click', () => {
        resultModal.setAttribute('aria-hidden', 'true');
    });
}

// --- 5. HÀM VẼ BIỂU ĐỒ (CHART.JS) ---
function drawLineChart(canvas, dataObj) {
    if(canvas.chartInstance) canvas.chartInstance.destroy();
    canvas.chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: Object.keys(dataObj),
            datasets: [{
                label: 'Doanh thu (VNĐ)',
                data: Object.values(dataObj),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                tension: 0.3, fill: true, pointRadius: 4
            }]
        },
        options: { responsive: true }
    });
}

function drawBarChart(canvas, dataObj) {
    if(canvas.chartInstance) canvas.chartInstance.destroy();
    canvas.chartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: Object.keys(dataObj),
            datasets: [{
                label: 'Doanh thu (VNĐ)',
                data: Object.values(dataObj),
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                borderRadius: 5
            }]
        },
        options: { responsive: true }
    });
}

// --- 6. TÍNH NĂNG CHAT AI (CÓ SESSION ID) ---
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const chatMessages = document.getElementById('chatMessages');

async function sendChatMessage() {
    const txt = chatInput.value.trim();
    if (!txt) return;

    appendChatBubble('user', txt);
    chatInput.value = '';

    // Loading
    const loadingId = `load-${Date.now()}`;
    const loadingHtml = `<div id="${loadingId}" class="chat-bubble ai"><i class="fas fa-circle-notch fa-spin"></i> Đang suy nghĩ...</div>`;
    chatMessages.insertAdjacentHTML('beforeend', loadingHtml);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        // Gửi Session ID để AI biết ngữ cảnh
        const payload = { 
            message: txt,
            session_id: currentSessionId // <-- QUAN TRỌNG NHẤT
        };

        const res = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        document.getElementById(loadingId)?.remove();

        if (res.ok) {
            appendChatBubble('ai', data.response || 'Không có phản hồi từ AI');
        } else {
            appendChatBubble('ai', `⚠️ Lỗi: ${data.error || 'Server error'}`);
        }

    } catch (err) {
        document.getElementById(loadingId)?.remove();
        appendChatBubble('ai', '⚠️ Mất kết nối tới server.');
    }
}

function appendChatBubble(role, htmlContent) {
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    div.innerHTML = htmlContent.replace(/\n/g, '<br>'); 
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

if (chatSend) chatSend.addEventListener('click', sendChatMessage);
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
    });
}