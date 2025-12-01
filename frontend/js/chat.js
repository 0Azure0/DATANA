// js/chat.js
const CHAT_API = '/chat'; // Using relative path proxy
const sendBtn = document.getElementById('sendBtn');
const chatInput = document.getElementById('chatInput');
const chatWindow = document.getElementById('chatWindow');
const chatHistory = document.getElementById('chatHistory');

function formatTime(){
  const now = new Date();
  return now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
}

// TASK 1: Modified append function to handle Markdown
function append(role, text){
  const wrapper = document.createElement('div');
  wrapper.className = 'message ' + (role==='user' ? 'user' : 'ai');
  
  // Logic: Use marked.parse for AI (render HTML), keep plain text for User (security)
  let content = text;
  if (role === 'ai') {
      try {
          content = marked.parse(text);
      } catch (e) {
          console.error("Markdown parsing failed", e);
          content = text;
      }
  }

  wrapper.innerHTML = `
    <div>
      <div class="message-bubble">${content}</div>
      <div class="message-time" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; text-align: ${role==='user'?'right':'left'};">${formatTime()}</div>
    </div>
  `;
  
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function send(){
  const txt = chatInput.value.trim();
  if (!txt) return;

  const sessionId = localStorage.getItem('datana_session_id');
  if (!sessionId) {
      alert("⚠️ Phiên làm việc không tồn tại. Vui lòng quay lại trang Tải lên để upload file.");
      return;
  }

  // 1. Show User Message
  append('user', txt);
  chatInput.value = '';
  
  // 2. Show Loading Indicator
  const loaderId = 'loader-' + Date.now();
  const loaderWrapper = document.createElement('div');
  loaderWrapper.id = loaderId;
  loaderWrapper.innerHTML = `<div class="message ai"><div><div class="message-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div></div></div>`;
  chatWindow.appendChild(loaderWrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  
  try{
    const headers = {'Content-Type':'application/json'};
    const body = JSON.stringify({
        message: txt,
        session_id: sessionId 
    });

    const res = await fetch(CHAT_API, {method: 'POST', headers, body});
    const data = await res.json();
    
    // Remove loader
    const loaderElem = document.getElementById(loaderId);
    if(loaderElem) loaderElem.remove();

    if (res.ok){ 
        append('ai', data.assistant || data.reply || 'Không có phản hồi từ AI'); 
    } else { 
        append('ai', '❌ ' + (data.error || 'Lỗi xử lý yêu cầu')); 
    }
  }catch(e){
    const loaderElem = document.getElementById(loaderId);
    if(loaderElem) loaderElem.remove();
    append('ai', '❌ Lỗi kết nối Server.');
    console.error(e);
  }
}

if(sendBtn) sendBtn.addEventListener('click', send);
if(chatInput) chatInput.addEventListener('keydown', e=>{ 
    if (e.key==='Enter' && !e.shiftKey){ 
        e.preventDefault(); 
        send(); 
    } 
});