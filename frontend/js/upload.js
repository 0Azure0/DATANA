// js/upload.js - Optimized UX
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const fileDisplay = document.getElementById('fileDisplay');
const fileNameSpan = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFile');
const analyzeBtn = document.getElementById('analyzeBtn');
const uploadMsg = document.getElementById('uploadMessage'); // Nếu có dùng để báo lỗi

let selectedFile = null;

// 1. Xử lý Click vào hộp -> Mở chọn file
dropArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// 2. Xử lý Kéo Thả (Drag & Drop)
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Hiệu ứng khi kéo file vào (Sáng viền lên)
['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.add('drag-over'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.remove('drag-over'), false);
});

// Khi thả file
dropArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
});

// 3. Hàm xử lý file chung
function handleFiles(files) {
    if (files.length > 0) {
        selectedFile = files[0];
        showFileInfo(selectedFile.name);
    }
}

function showFileInfo(name) {
    // Ẩn vùng drop, hiện vùng thông tin file
    dropArea.style.display = 'none';
    fileDisplay.style.display = 'flex';
    fileNameSpan.textContent = name;
    analyzeBtn.disabled = false; // Mở khóa nút phân tích
    analyzeBtn.style.opacity = '1';
    analyzeBtn.style.cursor = 'pointer';
}

// 4. Xử lý nút Xóa file chọn lại
removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Tránh kích hoạt click của cha
    selectedFile = null;
    fileInput.value = ''; // Reset input
    
    dropArea.style.display = 'block'; // Hiện lại vùng drop
    fileDisplay.style.display = 'none'; // Ẩn vùng info
    analyzeBtn.disabled = true;
    analyzeBtn.style.opacity = '0.5';
    analyzeBtn.style.cursor = 'not-allowed';
});

// 5. Gửi file đi (Giữ nguyên logic API cũ của bạn)
analyzeBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    analyzeBtn.textContent = '⏳ Đang phân tích...';
    analyzeBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const res = await fetch('/analyze', { method: 'POST', body: formData });
        const data = await res.json();

        if (res.ok) {
            // Lưu session và chuyển trang
            localStorage.setItem('datana_session_id', data.session_id);
            localStorage.setItem('datana_last_analysis', JSON.stringify(data));
            
            analyzeBtn.textContent = '✅ Hoàn tất! Đang chuyển hướng...';
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể phân tích file này.'));
            analyzeBtn.textContent = '🚀 Bắt đầu Phân tích';
            analyzeBtn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi kết nối server.');
        analyzeBtn.textContent = '🚀 Bắt đầu Phân tích';
        analyzeBtn.disabled = false;
    }
});