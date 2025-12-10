// frontend/js/upload.js - PREMIUM UI LOGIC

document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const filePreview = document.getElementById('filePreview'); // Thẻ hiển thị mới
    const fileNameSpan = document.getElementById('fileName');
    const removeFileBtn = document.getElementById('removeFile');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');

    let selectedFile = null;

    // 1. CLICK CHỌN FILE
    if (dropArea && fileInput) {
        dropArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (fileInput.files.length > 0) handleFiles(fileInput.files);
        });
    }

    // 2. KÉO THẢ (DRAG & DROP)
    if (dropArea) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
            dropArea.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false);
        });

        // Hiệu ứng Visual khi kéo
        ['dragenter', 'dragover'].forEach(() => dropArea.classList.add('dragover'));
        ['dragleave', 'drop'].forEach(() => dropArea.classList.remove('dragover'));

        dropArea.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    }

    // 3. XỬ LÝ FILE (LOGIC MỚI)
    function handleFiles(files) {
        const file = files[0];
        if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
            showToast("⚠️ Chỉ chấp nhận file Excel (.xlsx) hoặc CSV!", "warning");
            return;
        }
        selectedFile = file;
        
        // Ẩn vùng Drop -> Hiện thẻ Preview
        dropArea.style.display = 'none';
        filePreview.style.display = 'flex'; // Flex để căn chỉnh icon và text
        fileNameSpan.textContent = file.name;
        
        // Bật sáng nút Phân tích
        analyzeBtn.classList.add('active');
        
        showToast("✅ Đã chọn: " + file.name, "success");
    }

    // 4. XÓA FILE
    if (removeFileBtn) {
        removeFileBtn.addEventListener('click', () => {
            selectedFile = null;
            fileInput.value = '';
            
            // Reset giao diện
            filePreview.style.display = 'none';
            dropArea.style.display = 'block';
            analyzeBtn.classList.remove('active');
        });
    }

    // 5. GỬI LÊN SERVER
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            if (!selectedFile) return; // Nút mờ rồi, nhưng cứ check cho chắc

            if(loadingOverlay) {
                loadingOverlay.classList.add('active');
                loadingOverlay.innerHTML = `
                    <div class="spinner"></div>
                    <h3 style="margin-top:20px; color:#fff;">Đang xử lý dữ liệu...</h3>
                    <p style="color:#94a3b8;">AI đang đọc file và phân tích xu hướng</p>
                `;
            }

            const formData = new FormData();
            formData.append('file', selectedFile);

            try {
                const res = await fetch('/analyze', { method: 'POST', body: formData });
                const data = await res.json();

                if (res.ok) {
                    localStorage.setItem('datana_session_id', data.session_id);
                    localStorage.setItem('datana_last_analysis', JSON.stringify(data));
                    
                    // Hiệu ứng thành công
                    if(loadingOverlay) {
                        loadingOverlay.innerHTML = `
                            <i class="fas fa-check-circle" style="font-size:4rem; color:#10b981; animation:popIn 0.5s;"></i>
                            <h2 style="margin-top:20px; color:#fff;">Hoàn tất!</h2>
                            <p style="color:#10b981;">Đang chuyển đến Dashboard...</p>
                        `;
                    }
                    setTimeout(() => window.location.href = 'dashboard.html', 1500);
                } else {
                    showToast(data.error || "Lỗi xử lý file", "error");
                    resetBtn();
                }
            } catch (err) {
                console.error(err);
                showToast("❌ Lỗi kết nối Server", "error");
                resetBtn();
            }
        });
    }

    function resetBtn() {
        if(loadingOverlay) loadingOverlay.classList.remove('active');
    }

    // Helper: Toast
    function showToast(msg, type = 'info') {
        let box = document.getElementById('toast-box');
        if (!box) {
            box = document.createElement('div');
            box.id = 'toast-box';
            box.style.cssText = "position:fixed; top:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:10px;";
            document.body.appendChild(box);
        }
        const toast = document.createElement('div');
        const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b' };
        toast.style.cssText = `background:rgba(15,23,42,0.95); color:#fff; padding:15px 25px; border-radius:12px; border-left:4px solid ${colors[type]||'#6366f1'}; box-shadow:0 10px 30px rgba(0,0,0,0.5); font-weight:500; animation: slideIn 0.3s forwards;`;
        toast.innerText = msg;
        box.appendChild(toast);
        setTimeout(() => { toast.style.opacity='0'; setTimeout(()=>toast.remove(),300); }, 3000);
    }
    const style = document.createElement('style');
    style.innerHTML = `@keyframes slideIn { from{transform:translateX(100%);} to{transform:translateX(0);} } @keyframes popIn { 0%{transform:scale(0);} 80%{transform:scale(1.2);} 100%{transform:scale(1);} }`;
    document.head.appendChild(style);
});