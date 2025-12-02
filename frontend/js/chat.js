const chatWindow = document.getElementById('chatWindow');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// Tự động chỉnh độ cao ô nhập liệu
chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    if(this.value === '') this.style.height = '24px';
});

function scrollToBottom() {
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
}

function append(role, text, id=null) {
    // Tạo div bao quanh tin nhắn
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if(id) div.id = id;

    let contentHtml = text;

    // Xử lý Markdown nếu là AI
    if (role === 'ai') {
        if (typeof marked !== 'undefined') {
            try { 
                // Parse Markdown sang HTML
                contentHtml = marked.parse(text); 
            } catch(e) {
                console.error("Markdown error:", e);
            }
        }
        
        // FIX LỖI LẶP CHỮ:
        // Thay vì dùng hiệu ứng gõ từng chữ (dễ gây lỗi), ta dùng hiệu ứng Fade-in (hiện dần)
        // Vừa đẹp, vừa mượt, lại không bao giờ bị lặp.
        div.innerHTML = `<div class="bubble fade-in">${contentHtml}</div>`;
    } else {
        // Tin nhắn User (không cần effect cầu kỳ)
        div.innerHTML = `<div class="bubble">${contentHtml}</div>`;
    }

    chatWindow.appendChild(div);
    scrollToBottom();
}

// Hàm riêng cho Loading (Giữ nguyên)
function appendLoading(id) {
    const div = document.createElement('div');
    div.className = 'message ai';
    div.id = id;
    div.innerHTML = `
        <div class="bubble" style="background:transparent; border:none; box-shadow:none; padding:0;">
            <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>
    `;
    chatWindow.appendChild(div);
    scrollToBottom();
}

async function send() {
    const txt = chatInput.value.trim();
    if(!txt) return;

    const sid = localStorage.getItem('datana_session_id');
    if (!sid) {
        alert('Vui lòng vào trang Tải lên để upload dữ liệu trước!');
        return;
    }

    // 1. User nhắn
    append('user', txt);
    chatInput.value = '';
    chatInput.style.height = '24px';

    // 2. Hiện Loading
    const loadId = 'load-'+Date.now();
    appendLoading(loadId);

    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ message: txt, session_id: sid })
        });
        const data = await res.json();
        
        // Xóa loading
        const loader = document.getElementById(loadId);
        if(loader) loader.remove();
        
        // Hiện kết quả AI (Delay nhẹ để tạo cảm giác tự nhiên)
        setTimeout(() => {
            append('ai', data.assistant || 'Lỗi kết nối AI.');
        }, 300);

    } catch(e) {
        const loader = document.getElementById(loadId);
        if(loader) loader.remove();
        append('ai', '❌ Lỗi máy chủ.');
    }
}

sendBtn.addEventListener('click', send);
chatInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});