// FILE: frontend/js/chat.js

const chatWindow = document.getElementById('chatWindow');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// --- 1. XỬ LÝ GIAO DIỆN NHẬP LIỆU ---
if (chatInput) {
    // Tự động chỉnh độ cao ô nhập liệu
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        const newHeight = Math.min(this.scrollHeight, 120); 
        this.style.height = newHeight + 'px';
        if(this.value === '') this.style.height = '24px'; // Reset về 1 dòng nếu rỗng
    });

    // Gửi bằng phím Enter (giữ Shift để xuống dòng)
    chatInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            send(); 
        }
    });
}

// --- 2. HÀM CUỘN MÀN HÌNH ---
function scrollToBottom() {
    if(chatWindow) {
        // Cuộn xuống dưới cùng
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
}

// --- 3. HIỂN THỊ TIN NHẮN ---
// Hàm này trả về phần tử Bubble để chúng ta update nội dung khi stream
function append(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    const bubble = document.createElement('div');
    // Nếu là AI thì thêm class markdown để CSS xử lý style
    bubble.className = `bubble ${role === 'ai' ? 'markdown-content' : ''}`;
    
    // Nếu là User: Text thuần (tránh lỗi bảo mật XSS)
    // Nếu là AI: HTML (để hiển thị Markdown)
    if (role === 'user') {
        bubble.innerText = text;
    } else {
        bubble.innerHTML = text; // Ban đầu có thể là icon loading
    }

    div.appendChild(bubble);
    chatWindow.appendChild(div);
    scrollToBottom();

    return bubble; // Trả về bong bóng chat để lát nữa stream dữ liệu vào
}

// --- 4. GỬI TIN NHẮN (LOGIC CHÍNH) ---
async function send() {
    if (!chatInput) return;
    const txt = chatInput.value.trim();
    if(!txt) return;

    // Lấy Session ID (nếu có logic đăng nhập/upload file)
    const sid = localStorage.getItem('datana_session_id') || 'guest';

    // 1. Hiện tin nhắn User ngay lập tức
    append('user', txt);
    
    // Reset ô nhập liệu
    chatInput.value = '';
    chatInput.style.height = '24px'; 

    // 2. Tạo bong bóng chat AI với trạng thái "Đang suy nghĩ..."
    const aiBubble = append('ai', '<i class="fas fa-circle-notch fa-spin"></i> Đang suy nghĩ...');

    try {
        // --- BẮT ĐẦU GỌI API ---
        const res = await fetch('/api/chat', { // Đảm bảo đường dẫn API đúng
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ message: txt, session_id: sid })
        });

        if (!res.ok) throw new Error('Lỗi kết nối Server');

        // --- XỬ LÝ STREAM (KHẮC PHỤC LỖI TIẾNG VIỆT) ---
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        
        // Xóa icon loading để bắt đầu hiện chữ
        aiBubble.innerHTML = ''; 
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // QUAN TRỌNG: { stream: true } giúp giữ lại các byte lẻ của ký tự tiếng Việt
            // chờ ghép với chunk sau, ngăn chặn việc vỡ font/ký tự lạ.
            const chunk = decoder.decode(value, { stream: true });
            
            fullText += chunk;
            
            // Parse Markdown và cập nhật ngay lập tức vào bong bóng
            // Việc cập nhật liên tục này chính là "Hiệu ứng gõ chữ" (Typewriter) xịn nhất
            if (typeof marked !== 'undefined') {
                aiBubble.innerHTML = marked.parse(fullText);
            } else {
                aiBubble.innerHTML = fullText.replace(/\n/g, '<br>');
            }

            scrollToBottom();
        }

    } catch(e) {
        console.error(e);
        aiBubble.innerHTML = `<span style="color:#ef4444;">❌ Lỗi: Không thể kết nối hoặc Server gặp sự cố.</span>`;
    }
}

// Gắn sự kiện click cho nút gửi
if(sendBtn) sendBtn.addEventListener('click', send);