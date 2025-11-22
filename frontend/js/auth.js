// auth.js — handles login/register/logout and header UI
const LOGIN_API = 'http://localhost:5000/login';
const LOGOUT_API = 'http://localhost:5000/logout';

// Elements
const authSection = document.getElementById('authSection');
const authNotLogged = document.getElementById('authNotLogged');
const authLogged = document.getElementById('authLogged');
const userMenuBtn = document.getElementById('userMenuBtn');
const userMenu = document.getElementById('userMenu');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');
const analyzeBtnEl = document.getElementById('analyzeBtn');

// Header user menu
function toggleUserMenu(){
  const isOpen = userMenu?.classList.contains('active');
  if (isOpen) {
    userMenu?.classList.remove('active');
    userMenuBtn?.setAttribute('aria-expanded','false');
  } else {
    userMenu?.classList.add('active');
    userMenuBtn?.setAttribute('aria-expanded','true');
  }
}

function closeUserMenu(){
  userMenu?.classList.remove('active');
  userMenuBtn?.setAttribute('aria-expanded','false');
}

// Update UI based on auth state
function updateAuthUI(){
  const token = localStorage.getItem('auth_token');
  const user = localStorage.getItem('auth_user') || 'User';
  
  if (!authSection) return; // elements not present
  
  if (token){
    // Show logged in state
    authNotLogged?.style.setProperty('display','none','important');
    authLogged?.style.setProperty('display','flex','important');
    
    // Update user info
    if (userAvatar) userAvatar.textContent = user.charAt(0).toUpperCase();
    if (userName) userName.textContent = user;
    
    if (analyzeBtnEl) analyzeBtnEl.disabled = false;
  } else {
    // Show not logged in state
    authNotLogged?.style.setProperty('display','flex','important');
    authLogged?.style.setProperty('display','none','important');
    
    if (analyzeBtnEl) analyzeBtnEl.disabled = true;
  }
}

// Auth functions
async function performLogout(){
  const token = localStorage.getItem('auth_token');
  if (!token){ localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user'); updateAuthUI(); return; }
  try{ await fetch(LOGOUT_API, { method: 'POST', headers: { 'Authorization': 'Bearer '+token } }); }catch(e){ console.warn('logout network error', e); }
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  closeUserMenu();
  updateAuthUI();
}

// Event listeners
if (userMenuBtn) userMenuBtn.addEventListener('click', toggleUserMenu);
if (userMenu) {
  userMenu.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) closeUserMenu();
  });
}
if (document.body) {
  document.body.addEventListener('click', (e) => {
    if (!authSection?.contains(e.target)) closeUserMenu();
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => { performLogout(); });
}

// Close user menu on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeUserMenu();
  }
});

// Initialize
updateAuthUI();