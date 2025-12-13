// frontend/js/auth.js

document.addEventListener("DOMContentLoaded", function() {
    // 1. Kiểm tra trạng thái đăng nhập ngay khi tải trang
    checkLoginStatus();

    // 2. Gắn sự kiện cho nút Đăng xuất (nếu tìm thấy trong DOM)
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function(e) {
            e.preventDefault(); 
            logout();
        });
    }
});

// Hàm gọi API kiểm tra session
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/user_info');
        const data = await response.json();

        if (data.authenticated) {
            // Đã đăng nhập -> Cập nhật giao diện
            updateUserInterface(data.username);
        } else {
            // Chưa đăng nhập -> Kiểm tra xem trang hiện tại có yêu cầu login không
            const currentPath = window.location.pathname;
            const publicPages = ['login.html', 'register.html', 'index.html', '/'];
            
            // Nếu không phải trang công khai thì đá về login
            let isPublic = false;
            publicPages.forEach(page => {
                if (currentPath.includes(page) || currentPath === page) isPublic = true;
            });

            if (!isPublic) {
                window.location.href = '../pages/login.html'; 
            }
        }
    } catch (error) {
        console.error("Lỗi kiểm tra đăng nhập:", error);
    }
}

// Hàm cập nhật tên và avatar trên UI
function updateUserInterface(username) {
    // Tìm các vị trí hiển thị tên và avatar
    const nameElements = document.querySelectorAll('.user-mini-profile span');
    const avatarElements = document.querySelectorAll('.avatar-circle');

    // Cập nhật tên
    if (username) {
        nameElements.forEach(el => el.innerText = username);
        
        // Tạo avatar từ 2 chữ cái đầu
        const initials = username.substring(0, 2).toUpperCase();
        avatarElements.forEach(el => el.innerText = initials);
    }
}

// Hàm xử lý đăng xuất
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        // Dùng showToast từ utils.js nếu có, không thì alert
        if (typeof showToast === 'function') {
            showToast('Đã đăng xuất thành công!', 'success');
        }
        // Chuyển hướng sau 1 chút để người dùng kịp thấy thông báo
        setTimeout(() => {
            window.location.href = '../pages/login.html';
        }, 500);
    } catch (error) {
        console.error("Lỗi đăng xuất:", error);
        alert("Đăng xuất thất bại");
    }
}