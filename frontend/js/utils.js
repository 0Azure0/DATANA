// frontend/js/utils.js - Tiện ích UX

// Hàm hiển thị thông báo xịn (Thay thế alert)
function showToast(message, type = 'info') {
    // 1. Tạo container nếu chưa có
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // 2. Xác định Icon
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    // 3. Tạo thẻ Toast
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-text">${message}</div>
        <div class="toast-close" onclick="this.parentElement.remove()">×</div>
    `;

    // 4. Thêm vào DOM và kích hoạt hiệu ứng
    container.appendChild(toast);
    
    // Delay nhỏ để CSS transition bắt được
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // 5. Tự động tắt sau 3 giây
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); // Đợi animation tắt xong mới xóa
    }, 4000);
}

// Thay thế hàm alert mặc định của trình duyệt bằng Toast cho đẹp
window.alert = function(msg) {
    showToast(msg, 'info');
};