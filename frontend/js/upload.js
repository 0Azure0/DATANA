// frontend/js/upload.js - Đã tích hợp sẵn hàm thông báo & hiệu ứng

// 1. KHỞI TẠO CÁC BIẾN
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const fileDisplay = document.getElementById('fileDisplay');
const fileNameSpan = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFile');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingOverlay = document.getElementById('loadingOverlay'); // Cần có div này bên HTML
const loadingStep = document.getElementById('loadingStep');
const sheetInput = document.getElementById('sheetUrl');

let selectedFile = null;

// --- PHẦN 1: HÀM TIỆN ÍCH (TOAST & CSS) ---

// Tự động thêm CSS cho Toast và Rung lắc vào trang (Không cần sửa file CSS)
const styleSheet = document.createElement("style");
styleSheet.innerText = `
    /* Toast Container */
    #toast-container {
        position: fixed; top: 20px; right: 20px; z-index: 99999;
        display: flex; flex-direction: column; gap: 10px; pointer-events: none;
    }
    /* Toast Item */
    .toast-message {
        pointer-events: auto; min-width: 300px; padding: 16px 20px; border-radius: 12px;
        background: rgba(30, 41, 59, 0.95); backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        color: #fff; font-size: 0.95rem; display: flex; align-items: center; gap: 12px;
        transform: translateX(120%); transition: all 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
        opacity: 0;
    }
    .toast-message.show { transform: translateX(0); opacity: 1; }
    .toast-success { border-left: 4px solid #10b981; }
    .toast-error { border-left: 4px solid #ef4444; }
    .toast-info { border-left: 4px solid #3b82f6; }
    .toast-warning { border-left: 4px solid #f59e0b; }
    
    /* Animation Rung */
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
`;
document.head.appendChild(styleSheet);

// Hàm hiện thông báo đẹp
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.innerHTML = `<div>${icons[type]}</div><div style="flex:1">${message}</div>`;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// --- PHẦN 2: XỬ LÝ KÉO THẢ & FILE ---

if (dropArea && fileInput) {
    // Click để chọn file
    dropArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // Hiệu ứng kéo thả
    ['dragenter', 'dragover'].forEach(evt => {
        dropArea.addEventListener(evt, (e) => {
            e.preventDefault();
            dropArea.style.borderColor = '#6366f1';
            dropArea.style.transform = "scale(1.02)";
            dropArea.style.backgroundColor = "rgba(99, 102, 241, 0.1)";
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropArea.addEventListener(evt, (e) => {
            e.preventDefault();
            dropArea.style.borderColor = 'rgba(255,255,255,0.2)';
            dropArea.style.transform = "scale(1)";
            dropArea.style.backgroundColor = "transparent";
        });
    });

    dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    });
}

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        // Validate đuôi file
        if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
            showToast("Chỉ chấp nhận file Excel (.xlsx, .xls) hoặc CSV!", "error");
            return;
        }
        selectedFile = file;
        // Cập nhật giao diện
        if (dropArea) dropArea.style.display = 'none';
        if (fileDisplay) {
            fileDisplay.style.display = 'flex';
            if(fileNameSpan) fileNameSpan.textContent = file.name;
        }
        showToast(`Đã chọn file: ${file.name}`, "info");
        
        // Xóa link nếu đang nhập dở
        if (sheetInput) sheetInput.value = '';
    }
}

// Nút Xóa file
if (removeFileBtn) {
    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedFile = null;
        if (fileInput) fileInput.value = '';
        if (dropArea) dropArea.style.display = 'block';
        if (fileDisplay) fileDisplay.style.display = 'none';
    });
}

// --- PHẦN 3: XỬ LÝ NÚT PHÂN TÍCH ---

if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
        const sheetUrlVal = sheetInput ? sheetInput.value.trim() : '';
        
        // 1. Kiểm tra đầu vào
        if (!selectedFile && !sheetUrlVal) {
            showToast("Vui lòng chọn File hoặc dán Link trước!", "warning");
            analyzeBtn.style.animation = "shake 0.5s"; // Rung nút
            setTimeout(() => analyzeBtn.style.animation = "", 500);
            return;
        }

        // 2. Hiện màn hình Loading (Nếu có trong HTML)
        if (loadingOverlay) {
            loadingOverlay.classList.add('active');
            animateLoadingText();
        } else {
            // Fallback nếu chưa thêm HTML loading
            analyzeBtn.textContent = "⏳ Đang xử lý...";
            analyzeBtn.disabled = true;
        }

        // 3. Gửi dữ liệu
        const formData = new FormData();
        if (selectedFile) formData.append('file', selectedFile);
        else if (sheetUrlVal) formData.append('sheet_url', sheetUrlVal);

        try {
            const res = await fetch('/analyze', { method: 'POST', body: formData });
            const data = await res.json();

            if (res.ok) {
                // Lưu session
                localStorage.setItem('datana_session_id', data.session_id);
                localStorage.setItem('datana_last_analysis', JSON.stringify(data));
                
                showToast("Phân tích thành công! Đang chuyển trang...", "success");
                
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1000);
            } else {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
                else { analyzeBtn.textContent = "🚀 Bắt đầu Phân tích"; analyzeBtn.disabled = false; }
                
                showToast(data.error || 'Lỗi xử lý dữ liệu', "error");
            }
        } catch (err) {
            console.error(err);
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            else { analyzeBtn.textContent = "🚀 Bắt đầu Phân tích"; analyzeBtn.disabled = false; }
            
            showToast("Lỗi kết nối tới Server!", "error");
        }
    });
}

// Hiệu ứng chữ chạy khi loading
function animateLoadingText() {
    const steps = [
        "Đang đọc cấu trúc file...", 
        "AI đang dọn dẹp dữ liệu rác...", 
        "Đang tính toán KPIs...", 
        "Vẽ biểu đồ...", 
        "Đang hoàn tất..."
    ];
    let i = 0;
    const interval = setInterval(() => {
        if (loadingStep && loadingOverlay && loadingOverlay.classList.contains('active')) {
            if (i < steps.length) {
                loadingStep.textContent = steps[i];
                i++;
            }
        } else {
            clearInterval(interval);
        }
    }, 800);
}