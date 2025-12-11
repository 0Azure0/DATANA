// frontend/js/upload.js

// --- PHẦN KHỞI TẠO BIẾN ---
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const fileDisplay = document.getElementById('fileDisplay');
const fileNameSpan = document.getElementById('fileName');
const fileSizeSpan = document.getElementById('fileSize');
const fileTypeIcon = document.getElementById('fileTypeIcon');
const removeFileBtn = document.getElementById('removeFile');
const analyzeBtn = document.getElementById('analyzeBtn');
const sheetInput = document.getElementById('sheetUrl');

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingStep = document.getElementById('loadingStep');
const progressBarFill = document.getElementById('progressBarFill');
const progressPercent = document.getElementById('progressPercent');
const successOverlay = document.getElementById('successOverlay');

// THÊM: Biến cho hiệu ứng Spotlight Card
const uploadCard = document.getElementById('uploadCard');

let selectedFile = null;
let progressInterval = null;

// --- 1. HIỆU ỨNG SPOTLIGHT (MOUSE TRACKING) ---
// Đoạn này làm cho ánh sáng di chuyển theo chuột trên card
if (uploadCard) {
    uploadCard.addEventListener('mousemove', (e) => {
        const rect = uploadCard.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Cập nhật biến CSS
        uploadCard.style.setProperty('--mouse-x', `${x}px`);
        uploadCard.style.setProperty('--mouse-y', `${y}px`);
    });
}

// --- 2. XỬ LÝ KÉO THẢ & CHỌN FILE ---
if (dropArea && fileInput) {
    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    ['dragenter', 'dragover'].forEach(evt => {
        dropArea.addEventListener(evt, (e) => {
            e.preventDefault();
            // Hiệu ứng khi kéo file vào
            dropArea.style.borderColor = '#818cf8';
            dropArea.style.background = 'rgba(99, 102, 241, 0.15)';
            dropArea.style.transform = "scale(1.02)";
            dropArea.querySelector('.icon-glow').style.transform = "scale(1.2)";
            dropArea.querySelector('.icon-glow').style.boxShadow = "0 0 20px #6366f1";
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropArea.addEventListener(evt, (e) => {
            e.preventDefault();
            // Reset hiệu ứng
            dropArea.style.borderColor = '';
            dropArea.style.background = '';
            dropArea.style.transform = '';
            dropArea.querySelector('.icon-glow').style.transform = "";
            dropArea.querySelector('.icon-glow').style.boxShadow = "";
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
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (!['xlsx', 'xls', 'csv'].includes(ext)) {
            alert("⚠️ File không hỗ trợ! Vui lòng chọn .xlsx hoặc .csv");
            return;
        }
        
        selectedFile = file;
        
        // UI Switch
        if (dropArea) dropArea.style.display = 'none';
        if (fileDisplay) fileDisplay.style.display = 'flex';
        
        // Update Info
        if(fileNameSpan) fileNameSpan.textContent = file.name;
        if(fileSizeSpan) {
            const mb = file.size / 1024 / 1024;
            fileSizeSpan.textContent = mb > 1 ? mb.toFixed(2) + ' MB' : Math.round(file.size/1024) + ' KB';
        }
        
        // Update Icon
        if(fileTypeIcon) {
            fileTypeIcon.className = ext === 'csv' ? 'fas fa-file-csv' : 'fas fa-file-excel';
        }
        
        if (sheetInput) sheetInput.value = ''; 
    }
}

if (removeFileBtn) {
    removeFileBtn.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        if (dropArea) dropArea.style.display = 'block';
        if (fileDisplay) fileDisplay.style.display = 'none';
    });
}

// --- 3. GIẢ LẬP TIẾN ĐỘ ---
function runProgress() {
    let width = 0;
    if(progressBarFill) progressBarFill.style.width = '0%';
    if(progressPercent) progressPercent.textContent = '0%';
    
    const steps = [
        "Connecting to Neural Network...", 
        "Parsing Raw Data...", 
        "Cleaning & Normalizing...", 
        "Detecting Anomalies...", 
        "Generating Insights..."
    ];
    let stepIdx = 0;

    progressInterval = setInterval(() => {
        if (width < 90) {
            width += Math.random() * 3; 
            if (width > 90) width = 90;
        }
        
        if(progressBarFill) progressBarFill.style.width = width + '%';
        if(progressPercent) progressPercent.textContent = Math.round(width) + '%';
        
        if (loadingStep && width > (stepIdx+1)*18 && stepIdx < steps.length) {
            loadingStep.textContent = steps[stepIdx];
            stepIdx++;
        }
    }, 150);
}

// --- 4. GỬI DỮ LIỆU ---
if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
        const url = sheetInput ? sheetInput.value.trim() : '';
        if (!selectedFile && !url) {
            alert("⚠️ Vui lòng chọn File hoặc dán Link trước!");
            return;
        }

        if (loadingOverlay) loadingOverlay.classList.add('active');
        runProgress();

        const fd = new FormData();
        if (selectedFile) fd.append('file', selectedFile);
        else fd.append('sheet_url', url);

        try {
            // Dòng 164 - Sửa thành thế này:
const res = await fetch('/analyze', { method: 'POST', body: fd });
            const data = await res.json();
            
            if (res.ok) {
                // Thành công
                clearInterval(progressInterval);
                if(progressBarFill) progressBarFill.style.width = '100%';
                if(progressPercent) progressPercent.textContent = '100%';
                if(loadingStep) loadingStep.textContent = "Complete!";
                
                localStorage.setItem('datana_session_id', data.session_id);
                localStorage.setItem('datana_last_analysis', JSON.stringify(data));
                
                setTimeout(() => {
                    loadingOverlay.classList.remove('active');
                    if(successOverlay) {
                        successOverlay.classList.add('active');
                        setTimeout(() => window.location.href = 'dashboard.html', 1500);
                    } else {
                        window.location.href = 'dashboard.html';
                    }
                }, 800);
            } else {
                // Lỗi server
                clearInterval(progressInterval);
                loadingOverlay.classList.remove('active');
                alert(data.error || "Lỗi xử lý!");
            }
        } catch (e) {
            clearInterval(progressInterval);
            loadingOverlay.classList.remove('active');
            console.error(e);
            alert("Lỗi kết nối Server!");
        }
    });
}