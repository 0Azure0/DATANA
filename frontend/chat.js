// frontend/js/chat.js - FINAL SMART VERSION

const chatWindow = document.getElementById('chatWindow');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const welcomeScreen = document.getElementById('welcomeScreen');

let isProcessing = false;

// 1. Kiểm tra trạng thái nhập liệu
chatInput.addEventListener('input', () => {
    sendBtn.disabled = chatInput.value.trim() === '';
});

// 2. Hàm gửi tin nhắn (Dùng chung cho cả Input và Gợi ý)
async function usePrompt(text) {
    chatInput.value = text;
    sendMessage();
}

async function sendMessage() {
    if (isProcessing) return;
    const text = chatInput.value.trim();
    if (!text) return;

    // Ẩn màn hình chào nếu là tin nhắn đầu tiên
    if (welcomeScreen) welcomeScreen.style.display = 'none';

    // 1. UI User
    addMessage('user', text);
    chatInput.value = '';
    sendBtn.disabled = true;
    isProcessing = true;

    // 2. UI Loading (Typing...)
    const loadingId = showLoading();

    // 3. Gọi API
    const sid = localStorage.getItem('datana_session_id');
    
    try {
        if (!sid) throw new Error("Chưa có dữ liệu. Vui lòng Upload file trước.");

        const res = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, session_id: sid })
        });
        const data = await res.json();

        removeMessage(loadingId);
        addMessage('ai', data.assistant || 'Lỗi: AI không phản hồi.');

    } catch (err) {
        removeMessage(loadingId);
        addMessage('ai', `❌ ${err.message || 'Lỗi kết nối server.'}`);
    } finally {
        isProcessing = false;
        chatInput.focus();
    }
}

// Helper: Thêm tin nhắn
function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    const avatarIcon = role === 'ai' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';
    
    // Parse Markdown nếu là AI
    let content = text;
    if (role === 'ai' && typeof marked !== 'undefined') {
        content = marked.parse(text);
    }

    div.innerHTML = `
        <div class="avatar">${avatarIcon}</div>
        <div class="bubble">${content}</div>
    `;
    
    chatWindow.appendChild(div);
    scrollToBottom();
}

// Helper: Hiệu ứng typing
function showLoading() {
    const id = 'loading-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message ai';
    div.innerHTML = `
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="bubble">
            <div class="typing"><span></span><span></span><span></span></div>
        </div>
    `;
    chatWindow.appendChild(div);
    scrollToBottom();
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function clearChat() {
    if(confirm("Bạn muốn xóa toàn bộ lịch sử chat?")) {
        // Xóa hết tin nhắn, chỉ giữ lại Welcome Screen
        chatWindow.innerHTML = '';
        chatWindow.appendChild(welcomeScreen);
        welcomeScreen.style.display = 'flex';
    }
}

// Sự kiện
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Cho phép function usePrompt được gọi từ HTML
window.usePrompt = usePrompt;
window.clearChat = clearChat;