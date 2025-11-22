// chat.js — improved chat UI with message bubbles and better UX
const CHAT_API = 'http://localhost:5000/chat';
const sendBtn = document.getElementById('sendBtn');
const chatInput = document.getElementById('chatInput');
const chatWindow = document.getElementById('chatWindow');
const chatHistory = document.getElementById('chatHistory');

let messageCount = 0;

function formatTime(){
  const now = new Date();
  return now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
}

function append(role, text){
  const wrapper = document.createElement('div');
  wrapper.className = 'message ' + (role==='user' ? 'user' : 'ai');
  wrapper.innerHTML = `
    <div>
      <div class="message-bubble">${role==='user' ? text : text}</div>
      <div class="message-time">${formatTime()}</div>
    </div>
  `;
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  
  // add to history sidebar
  if (++messageCount <= 10){
    const hist = document.createElement('div');
    hist.className = 'chat-history-item';
    hist.textContent = text.substring(0,30) + (text.length > 30 ? '...' : '');
    hist.onclick = ()=> chatInput.value = text;
    chatHistory.appendChild(hist);
  }
}

async function send(){
  const txt = chatInput.value.trim();
  if (!txt) return;
  append('user', txt);
  chatInput.value = '';
  
  const loader = document.createElement('div');
  loader.innerHTML = '<div class="message ai"><div><div class="message-bubble"><span class="spinner"></span> Đang phân tích...</div></div></div>';
  chatWindow.appendChild(loader);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  
  try{
    const headers = {'Content-Type':'application/json'};
    const res = await fetch(CHAT_API, {method: 'POST', headers, body: JSON.stringify({message: txt})});
    const data = await res.json();
    loader.remove();
    if (res.ok){ append('ai', data.reply || 'Không có phản hồi'); }
    else { append('ai', '❌ ' + (data.error || 'Lỗi xử lý')); }
  }catch(e){
    loader.remove();
    append('ai', '❌ Lỗi kết nối. Vui lòng thử lại.');
    console.error(e);
  }
}

sendBtn.addEventListener('click', send);
chatInput.addEventListener('keydown', e=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } });

// load simple history from localStorage
function loadHistory(){
  const key = 'datana_chat_anon';
  try{
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.forEach(h=> append(h.role, h.text));
  }catch(e){}
}
loadHistory();

