// Homepage JS: upload, drag-drop, call analyze API and render simple result preview
const API_URL = 'http://localhost:5000';

// Elements
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');
const uploadInput = document.getElementById('uploadInput');
const dropArea = document.getElementById('dropArea');
const fileInfo = document.getElementById('fileInfo');
const analyzeBtn = document.getElementById('analyzeBtn');
const uploadMessage = document.getElementById('uploadMessage');
const resultModal = document.getElementById('resultModal');
const resultContent = document.getElementById('resultContent');
const closeResult = document.getElementById('closeResult');

const demoRev = document.getElementById('demoRev');
const demoQty = document.getElementById('demoQty');
const demoProfit = document.getElementById('demoProfit');
const demoRec = document.getElementById('demoRec');

let selectedFile = null;

// Auth removed: login/register modal and related handlers deleted


// Mobile nav
navToggle.addEventListener('click', ()=>{
  mainNav.style.display = mainNav.style.display === 'flex' ? 'none' : 'flex';
});

// Click to open file dialog
dropArea.addEventListener('click', ()=> uploadInput.click());
uploadInput.addEventListener('change', (e)=>{
  const f = e.target.files[0];
  handleFileSelect(f);
});

// Drag & drop
['dragenter','dragover'].forEach(ev=> dropArea.addEventListener(ev, (e)=>{ e.preventDefault(); dropArea.classList.add('dragover'); }));
['dragleave','drop'].forEach(ev=> dropArea.addEventListener(ev, (e)=>{ e.preventDefault(); dropArea.classList.remove('dragover'); }));
dropArea.addEventListener('drop', (e)=>{
  const f = e.dataTransfer.files[0];
  handleFileSelect(f);
});

function handleFileSelect(file){
  if (!file) return;
  const allowed = ['.csv','.xlsx','.xls'];
  const name = file.name || '';
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!allowed.includes(ext)){
    uploadMessage.textContent = 'Chỉ chấp nhận file .xlsx hoặc .csv';
    return;
  }
  selectedFile = file;
  fileInfo.textContent = name;
  uploadMessage.textContent = '';
}

// Analyze action
analyzeBtn.addEventListener('click', async ()=>{
  if (!selectedFile){ uploadMessage.textContent = 'Vui lòng chọn file trước khi phân tích'; return; }
  uploadMessage.textContent = 'Đang gửi file lên server...';
  const formData = new FormData();
  formData.append('file', selectedFile);

  try{
    const res = await fetch(`${API_URL}/analyze`, { method:'POST', body: formData });
    const data = await res.json();
    if (!res.ok){
      uploadMessage.textContent = data.error || 'Lỗi khi phân tích';
      return;
    }

    // Show result modal with summary
    showResult(data);
  }catch(err){
    uploadMessage.textContent = 'Lỗi kết nối tới server';
    console.error(err);
  }
});

function showResult(data){
  resultContent.innerHTML = '';
  // Summary
  const stats = data.statistics || {};
  const time = data.time_analysis || {};
  const product = data.product_analysis || {};
  const region = data.region_analysis || {};
  const recs = data.recommendations || [];

  const sHtml = `<div class="result-summary">
    <div class="rs-row"><strong>Tổng doanh thu:</strong> ${Number(stats.total_revenue||0).toLocaleString('vi-VN')} VNĐ</div>
    <div class="rs-row"><strong>Tổng số lượng:</strong> ${stats.total_quantity||0}</div>
    <div class="rs-row"><strong>Tổng lợi nhuận:</strong> ${Number(stats.total_profit||0).toLocaleString('vi-VN')} VNĐ</div>
  </div>`;

  resultContent.innerHTML += sHtml;

  // Recommendations: support both array (legacy) and structured object
  if (Array.isArray(recs) && recs.length){
    const rEl = document.createElement('div'); rEl.className='rs-recs';
    rEl.innerHTML = '<h4>Gợi ý chiến lược</h4>' + recs.map(r=>`<p>• ${r}</p>`).join('');
    resultContent.appendChild(rEl);
  } else if (typeof recs === 'object' && recs !== null){
    const rEl = document.createElement('div'); rEl.className='rs-recs';
    rEl.innerHTML = '<h4>Gợi ý chiến lược</h4>';
    for (const section of ['product_suggestions','region_suggestions','customer_suggestions','marketing_suggestions','overall_strategy']){
      const arr = recs[section] || [];
      if (arr.length){
        rEl.innerHTML += `<h5>${section.replace('_',' ').toUpperCase()}</h5>` + arr.map(s=>`<p>• ${s}</p>`).join('');
      }
    }
    resultContent.appendChild(rEl);
  }

  // Small charts: revenue by month if present
  const months = time.by_month || {};
  if (Object.keys(months).length){
    const c = document.createElement('canvas'); c.width=600; c.height=220; resultContent.appendChild(c);
    drawLineChart(c, months);
  }

  // region bar
  const rby = (region.revenue_by_region) ? region.revenue_by_region : (data.revenue_by_region || {});
  if (Object.keys(rby).length){
    const c2 = document.createElement('canvas'); c2.width=600;c2.height=200; resultContent.appendChild(c2);
    drawBarChart(c2, rby);
  }

  resultModal.setAttribute('aria-hidden','false');
}

closeResult.addEventListener('click', ()=>{ resultModal.setAttribute('aria-hidden','true'); });

function drawLineChart(canvas, series){
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  const keys = Object.keys(series); const vals = Object.values(series);
  const max = Math.max(...vals);
  const padding = 30; const w = canvas.width - padding*2; const h = canvas.height - padding*2;
  ctx.beginPath(); ctx.strokeStyle='#4facfe'; ctx.lineWidth=2;
  vals.forEach((v,i)=>{ const x=padding + (i/(vals.length-1||1))*w; const y=canvas.height-padding - (v/max)*h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
  ctx.fillStyle='#333'; ctx.textAlign='center'; keys.forEach((k,i)=>{ const x=padding + (i/(keys.length-1||1))*w; ctx.fillText(k, x, canvas.height-6); });
}

function drawBarChart(canvas, data){
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  const keys = Object.keys(data); const vals = Object.values(data); const max = Math.max(...vals);
  const padding=30; const w = canvas.width - padding*2; const bw = w/keys.length;
  keys.forEach((k,i)=>{ const x=padding + i*bw; const h = (vals[i]/max)*(canvas.height-padding*2); const y = canvas.height-padding - h; ctx.fillStyle='#667eea'; ctx.fillRect(x+8,y,bw-16,h); ctx.fillStyle='#333'; ctx.textAlign='center'; ctx.fillText(k, x+bw/2, canvas.height-8); });
}

// Demo chart initial (sample data)
(function demoInit(){
  const demoMonths = {'2025-01':1200000,'2025-02':1800000,'2025-03':900000,'2025-04':2100000,'2025-05':1500000};
  const c = document.getElementById('demoRevenueChart'); if (c) drawLineChart(c,demoMonths);
  demoRev.textContent = Number(5800000).toLocaleString('vi-VN')+' VNĐ'; demoQty.textContent = '220'; demoProfit.textContent = Number(1200000).toLocaleString('vi-VN');
})();

// --- Reviews handling (localStorage-backed) ---
const starButtons = document.querySelectorAll('#starInput .star');
const reviewText = document.getElementById('reviewText');
const submitReview = document.getElementById('submitReview');
const reviewsList = document.getElementById('reviewsList');
let currentRating = 0;

function renderStarsUI(rating, container){
  const max = 5; let html = '';
  for (let i=1;i<=max;i++) html += `<span style="color:${i<=rating? '#ffb400':'#ddd'}">★</span> `;
  container.innerHTML = html;
}

starButtons.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    currentRating = Number(btn.dataset.value);
    starButtons.forEach(b=>{ if (Number(b.dataset.value) <= currentRating) b.classList.add('selected'); else b.classList.remove('selected'); });
  });
});

function loadReviews(){
  const raw = localStorage.getItem('datana_reviews');
  const arr = raw ? JSON.parse(raw) : [];
  reviewsList.innerHTML = '';
  if (!arr.length) reviewsList.innerHTML = '<p class="muted">Chưa có đánh giá nào. Hãy là người đầu tiên!</p>';
  arr.slice().reverse().forEach(r=>{
    const div = document.createElement('div'); div.className='review-item';
    const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${r.user||'Khách'} • ${new Date(r.time).toLocaleString()}`;
    const starDiv = document.createElement('div'); starDiv.innerHTML = Array.from({length:5}).map((_,i)=> i<r.rating? '<span style="color:#ffb400">★</span>' : '<span style="color:#ddd">★</span>').join('');
    const txt = document.createElement('div'); txt.textContent = r.text || '';
    div.appendChild(meta); div.appendChild(starDiv); div.appendChild(txt);
    reviewsList.appendChild(div);
  });
}

submitReview.addEventListener('click', ()=>{
  const txt = reviewText.value.trim();
  if (currentRating <= 0) { uploadMessage.textContent = 'Vui lòng chọn số sao cho đánh giá'; return; }
  const newR = { rating: currentRating, text: txt, time: Date.now(), user: localStorage.getItem('auth_user') || 'Khách' };
  const raw = localStorage.getItem('datana_reviews'); const arr = raw? JSON.parse(raw):[]; arr.push(newR); localStorage.setItem('datana_reviews', JSON.stringify(arr));
  reviewText.value=''; currentRating=0; starButtons.forEach(b=>b.classList.remove('selected'));
  loadReviews();
  uploadMessage.textContent = 'Cảm ơn bạn đã gửi đánh giá!'; setTimeout(()=>uploadMessage.textContent='',3000);
});

// initial load
loadReviews();

// --- AI Chat integration ---
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');

function scrollChat(){ if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight; }

function appendChatBubble(role, text){
  if (!chatMessages) return;
  const div = document.createElement('div');
  div.className = 'chat-bubble ' + (role === 'user' ? 'user' : 'ai');
  div.innerHTML = text;
  chatMessages.appendChild(div);
  scrollChat();
}

async function sendChatMessage(){
  const txt = (chatInput && chatInput.value || '').trim();
  if (!txt) return;
  appendChatBubble('user', txt);
  chatInput.value='';
  // show loading
  const loader = document.createElement('span'); loader.className='chat-loading';
  const loadingWrap = document.createElement('div'); loadingWrap.className='chat-bubble ai'; loadingWrap.appendChild(loader);
  chatMessages.appendChild(loadingWrap); scrollChat();

  try{
  const headers = {'Content-Type':'application/json'};
  const res = await fetch(`${API_URL}/api/chat`, { method:'POST', headers, body: JSON.stringify({message: txt}) });
    const data = await res.json();
    // remove loader
    loadingWrap.remove();
    if (res.ok){
      appendChatBubble('ai', data.assistant || data.response || data.reply || '...');
      // store history (anon)
      try{
        const key = 'datana_chat_anon';
        const hist = JSON.parse(localStorage.getItem(key) || '[]'); hist.push({role:'user',text:txt, time:Date.now()}); hist.push({role:'ai',text:data.assistant || data.response || data.reply || '',time:Date.now()}); localStorage.setItem(key, JSON.stringify(hist));
      }catch(e){/*ignore*/}
    } else {
      appendChatBubble('ai', data.reply || data.error || 'Lỗi chat');
    }
  }catch(err){ loadingWrap.remove(); appendChatBubble('ai','Lỗi kết nối tới server'); console.error(err); }
}

chatSend.addEventListener('click', sendChatMessage);
if (chatInput) chatInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter'){ e.preventDefault(); sendChatMessage(); } });

// load chat history for current token
function loadChatHistory(){
  const key = 'datana_chat_anon';
  try{
    const hist = JSON.parse(localStorage.getItem(key) || '[]');
    chatMessages.innerHTML = '';
    hist.forEach(h=> appendChatBubble(h.role, h.text));
  }catch(e){/*ignore*/}
  scrollChat();
}

loadChatHistory();


