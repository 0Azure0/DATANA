// auth.js — handles login/register/logout and header UI. Safe if elements are not present.
const LOGIN_API = 'http://localhost:5000/login';
const REGISTER_API = 'http://localhost:5000/register';
const LOGOUT_API = 'http://localhost:5000/logout';

const loginUserEl = document.getElementById('loginUser');
const loginPassEl = document.getElementById('loginPass');
const loginBtnEl = document.getElementById('loginBtn');
const registerBtnEl = document.getElementById('registerBtn');
const logoutBtnEl = document.getElementById('logoutBtn');
const loginMsgHeaderEl = document.getElementById('loginMsgHeader');
const analyzeBtnEl = document.getElementById('analyzeBtn');

function updateAuthUI(){
  const token = localStorage.getItem('auth_token');
  const user = localStorage.getItem('auth_user');
  if (loginMsgHeaderEl) {
    if (token) loginMsgHeaderEl.textContent = `Đã đăng nhập: ${user}`;
    else loginMsgHeaderEl.textContent = 'Vui lòng đăng nhập để phân tích';
  }
  if (loginBtnEl) loginBtnEl.style.display = token ? 'none' : 'inline-block';
  if (registerBtnEl) registerBtnEl.style.display = token ? 'none' : 'inline-block';
  if (logoutBtnEl) logoutBtnEl.style.display = token ? 'inline-block' : 'none';
  if (analyzeBtnEl) analyzeBtnEl.disabled = token ? false : true;
}

async function doLogin(username, password, uiMsgEl){
  try{
    const res = await fetch(LOGIN_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok){ if (uiMsgEl) uiMsgEl.textContent = data.error || 'Đăng nhập thất bại'; return false; }
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth_user', data.username || username);
    if (uiMsgEl) uiMsgEl.textContent = 'Đăng nhập thành công';
    updateAuthUI();
    return true;
  }catch(err){ if (uiMsgEl) uiMsgEl.textContent = 'Lỗi kết nối'; console.error(err); return false; }
}

async function doRegister(username, password, uiMsgEl){
  try{
    const res = await fetch(REGISTER_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok){ if (uiMsgEl) uiMsgEl.textContent = data.error || 'Đăng ký thất bại'; return false; }
    if (uiMsgEl) uiMsgEl.textContent = 'Đăng ký thành công — bạn có thể đăng nhập bây giờ';
    return true;
  }catch(err){ if (uiMsgEl) uiMsgEl.textContent = 'Lỗi kết nối'; console.error(err); return false; }
}

async function doLogout(){
  const token = localStorage.getItem('auth_token');
  if (!token){ localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user'); updateAuthUI(); return; }
  try{ await fetch(LOGOUT_API, { method: 'POST', headers: { 'Authorization': 'Bearer '+token } }); }catch(e){ console.warn('logout network error', e); }
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  updateAuthUI();
}

// Wire up UI events if elements exist
if (loginBtnEl){
  loginBtnEl.addEventListener('click', ()=>{
    const u = loginUserEl ? (loginUserEl.value||'').trim() : '';
    const p = loginPassEl ? (loginPassEl.value||'').trim() : '';
    const uiMsgEl = loginMsgHeaderEl;
    if (!u || !p){ if (uiMsgEl) uiMsgEl.textContent = 'Vui lòng nhập username và password'; return; }
    if (uiMsgEl) uiMsgEl.textContent = 'Đang đăng nhập...';
    doLogin(u,p,uiMsgEl);
  });
}
if (registerBtnEl){
  registerBtnEl.addEventListener('click', ()=>{
    const u = loginUserEl ? (loginUserEl.value||'').trim() : '';
    const p = loginPassEl ? (loginPassEl.value||'').trim() : '';
    const uiMsgEl = loginMsgHeaderEl;
    if (!u || !p){ if (uiMsgEl) uiMsgEl.textContent = 'Vui lòng nhập username và password'; return; }
    if (uiMsgEl) uiMsgEl.textContent = 'Đang đăng ký...';
    doRegister(u,p,uiMsgEl);
  });
}
if (logoutBtnEl){
  logoutBtnEl.addEventListener('click', ()=>{ doLogout(); });
}

// Initialize
updateAuthUI();
