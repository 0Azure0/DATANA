// chat.js

const chatWindow = document.getElementById('chatWindow');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// Tự động chỉnh độ cao ô nhập liệu
if (chatInput) {
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if(this.value === '') this.style.height = '24px';
    });
}

function scrollToBottom() {
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
}

function append(role, text, id=null) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if(id) div.id = id;

    let contentHtml = text;

    // --- XỬ LÝ MARKDOWN CHO AI ---
    if (role === 'ai') {
        if (typeof marked !== 'undefined') {
            // Cấu hình marked (bắt buộc ngắt dòng)
            marked.setOptions({ breaks: true, gfm: true });
            contentHtml = marked.parse(text);
        } else {
            // Fallback nếu chưa load thư viện marked
            contentHtml = contentHtml.replace(/\n/g, '<br>');
        }
    } else {
        // Escape HTML cho tin nhắn user để bảo mật
        contentHtml = contentHtml
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, '<br>');
    }

    // Thêm class 'markdown-content' để CSS có thể style bảng biểu
    div.innerHTML = `<div class="bubble fade-in ${role === 'ai' ? 'markdown-content' : ''}">${contentHtml}</div>`;
    chatWindow.appendChild(div);
    scrollToBottom();
}

function appendLoading(id) {
    const div = document.createElement('div');
    div.className = 'message ai';
    div.id = id;
    div.innerHTML = `<div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    chatWindow.appendChild(div);
    scrollToBottom();
}

async function send() {
    if (!chatInput) return;
    const txt = chatInput.value.trim();
    if(!txt) return;

    // Lấy Session ID
    const sid = localStorage.getItem('datana_session_id');
    
    if (!sid) {
        append('ai', '⚠️ **Chưa có dữ liệu!**\nVui lòng tải lên file Excel/CSV trước tại trang Upload.');
        return;
    }

    // 1. Hiển thị tin nhắn User
    append('user', txt);
    chatInput.value = '';
    chatInput.style.height = '24px';

    // 2. Hiển thị Loading
    const loadId = 'load-'+Date.now();
    appendLoading(loadId);

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ message: txt, session_id: sid })
        });
        const data = await res.json();
        
        // Xóa loading
        const loader = document.getElementById(loadId);
        if(loader) loader.remove();
        
        if (data.error) {
            append('ai', '❌ Lỗi hệ thống: ' + data.error);
        } else {
            // Hiển thị kết quả từ AI
            append('ai', data.assistant || data.response);
        }

    } catch(e) {
        const loader = document.getElementById(loadId);
        if(loader) loader.remove();
        console.error(e);
        append('ai', '❌ Không thể kết nối đến máy chủ.');
    }
}

if(sendBtn) sendBtn.addEventListener('click', send);
if(chatInput) chatInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});