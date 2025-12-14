// FILE: frontend/js/chat.js

// --- CẤU HÌNH GỢI Ý ---
const SUGGESTIONS = [
    "📊 Tổng quan kinh doanh",
    "🔥 Top sản phẩm bán chạy",
    "⚠️ Phân tích rủi ro",
    "🔮 Dự báo xu hướng",
    "💰 Soi biên lợi nhuận"
];

// --- DOM ELEMENTS ---
const chatWindow = document.getElementById('chatMessages') || document.querySelector('.messages-area');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const historyList = document.getElementById('history-list');
const suggestionDiv = document.getElementById('suggestionChips');

// --- 1. QUẢN LÝ SESSION (FIX QUAN TRỌNG) ---
function getSessionId() {
    // Ưu tiên 1: Lấy ID đang active
    let sid = localStorage.getItem('datana_session_id');

    // Ưu tiên 2: Nếu không có, thử tìm trong dữ liệu phân tích gần nhất (Do trang Upload lưu)
    if (!sid || sid.startsWith('guest-')) {
        try {
            const raw = localStorage.getItem('datana_last_analysis');
            if (raw) {
                const data = JSON.parse(raw);
                if (data.session_id) {
                    sid = data.session_id;
                    // Lưu lại để dùng luôn
                    localStorage.setItem('datana_session_id', sid);
                    console.log("♻️ Đã khôi phục phiên làm việc:", sid);
                }
            }
        } catch (e) {
            console.error("Lỗi đọc cache:", e);
        }
    }

    // Ưu tiên 3: Nếu vẫn không có -> Tạo Guest mới
    if (!sid) {
        sid = 'guest-' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('datana_session_id', sid);
    }
    return sid;
}

// --- 2. KHỞI TẠO ---
document.addEventListener('DOMContentLoaded', async () => {
    // Kiểm tra & Khôi phục Session ngay khi vào trang
    const currentSid = getSessionId();
    
    // Tự động chỉnh chiều cao ô nhập liệu
    if (chatInput) {
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        chatInput.addEventListener('keydown', (e) => {
            if(e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                send(); 
            }
        });
    }

    // Load lịch sử chat
    await loadChatHistory(currentSid);
    
    // Render gợi ý
    renderSuggestions();
});

// --- 3. CÁC HÀM XỬ LÝ CHAT ---

function appendMessage(role, text, isMarkdown = true, animate = false) {
    if (!chatWindow) return;
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (animate) div.style.animation = "fadeIn 0.5s ease-out";

    const bubble = document.createElement('div');
    bubble.className = `bubble ${role === 'ai' ? 'markdown-content' : ''}`;
    
    if (role === 'user' || !isMarkdown) {
        bubble.innerText = text;
    } else {
        if (typeof marked !== 'undefined') {
            bubble.innerHTML = marked.parse(text);
        } else {
            // Fallback nếu chưa load thư viện marked
            let html = text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
            bubble.innerHTML = html;
        }
    }
    div.appendChild(bubble);
    chatWindow.appendChild(div);
    scrollToBottom();
}

function showTypingIndicator() {
    if (!chatWindow) return;
    const div = document.createElement('div');
    div.id = 'typing-bubble';
    div.className = 'message ai';
    div.innerHTML = `<div class="bubble" style="padding:12px 18px; background:rgba(255,255,255,0.05);"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    chatWindow.appendChild(div);
    scrollToBottom();
}

function removeTypingIndicator() {
    const el = document.getElementById('typing-bubble');
    if (el) el.remove();
}

function scrollToBottom() {
    if(chatWindow) chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderSuggestions() {
    if (!suggestionDiv) return;
    suggestionDiv.innerHTML = '';
    SUGGESTIONS.forEach(text => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerText = text;
        chip.onclick = () => { if(chatInput) { chatInput.value = text; send(); } };
        suggestionDiv.appendChild(chip);
    });
}

// --- 4. GỬI TIN NHẮN ---
async function send() {
    if (!chatInput) return;
    const txt = chatInput.value.trim();
    if(!txt) return;

    // Lấy ID chính xác nhất
    const sid = getSessionId(); 

    appendMessage('user', txt, false);
    chatInput.value = '';
    chatInput.style.height = 'auto'; 
    showTypingIndicator();

    try {
        const res = await fetch('/api/chat', { 
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ message: txt, session_id: sid })
        });

        const data = await res.json(); 
        removeTypingIndicator();

        if (data.error) {
            appendMessage('ai', `⚠️ ${data.error}`, false);
        } else {
            // Nếu có câu trả lời từ AI
            const content = data.response || data.assistant;
            appendMessage('ai', content, true, true);
            
            // Reload sidebar nếu tiêu đề phiên thay đổi
            if (data.session_title) {
                loadChatHistory(sid);
            }
        }
    } catch(e) {
        removeTypingIndicator();
        appendMessage('ai', `⚠️ Mất kết nối tới máy chủ.`, false);
    }
}

// --- 5. TẢI LỊCH SỬ ---
async function loadChatHistory(sessionId) {
    if (!historyList) return; 
    try {
        const res = await fetch('/api/chat_history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        const data = await res.json();
        
        // Render Sidebar
        historyList.innerHTML = '';
        if (data.sessions && data.sessions.length > 0) {
            data.sessions.reverse().forEach(session => {
                const isActive = session.session_id === sessionId;
                const div = document.createElement('div');
                // Style cứng để đảm bảo hiển thị đẹp ngay lập tức
                div.style.padding = '10px'; div.style.cursor = 'pointer'; div.style.borderRadius = '8px'; div.style.marginBottom = '5px'; div.style.color = isActive ? '#fff' : '#94a3b8'; div.style.background = isActive ? 'rgba(99, 102, 241, 0.2)' : 'transparent';
                div.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><i class="fas fa-comment-dots"></i> <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">${session.title}</span></div>`;
                div.onclick = () => {
                    localStorage.setItem('datana_session_id', session.session_id);
                    window.location.reload(); 
                };
                historyList.appendChild(div);
            });
        } else {
            historyList.innerHTML = `<div style="text-align:center; padding:15px; color:#64748b; font-size:0.9rem;">Chưa có lịch sử.</div>`;
        }

        // Render Chat Window (Chỉ khi trống)
        if (data.history && chatWindow && chatWindow.children.length <= 1) { 
            chatWindow.innerHTML = ''; 
            if (data.history.length === 0) {
                // Tin nhắn chào mừng mặc định
                appendMessage('ai', 'Xin chào! 👋\nTôi đã sẵn sàng. Bạn có thể hỏi về doanh thu, sản phẩm bán chạy hoặc xu hướng kinh doanh từ file Excel vừa tải lên.', true);
            } else {
                data.history.forEach(msg => appendMessage(msg.sender, msg.message, true));
            }
            scrollToBottom();
        }
    } catch (error) { console.error(error); }
}

// Sự kiện nút
if(sendBtn) sendBtn.addEventListener('click', send);
const btnNew = document.getElementById('new-analysis-btn');
if (btnNew) btnNew.addEventListener('click', async () => {
    if(confirm('Tạo cuộc trò chuyện mới?')) {
        const res = await fetch('/api/new_session', { method:'POST', body: JSON.stringify({ current_session_id: getSessionId() }) });
        const d = await res.json();
        if(d.success) { localStorage.setItem('datana_session_id', d.new_session_id); window.location.reload(); }
    }
});