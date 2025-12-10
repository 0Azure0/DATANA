// Neon Auth Logic (Login & Register) - AJAX + validation

const state = { busy: false };

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-auth-form]');
  if (!form) return;

  const mode = form.dataset.mode; // 'login' or 'register'
  form.addEventListener('submit', (e) => handleSubmit(e, mode));
});

function setBusy(btn, busy) {
  state.busy = busy;
  if (!btn) return;
  btn.disabled = busy;
  btn.innerHTML = busy ? `<span class="spinner-inline"></span>Processing...` : btn.dataset.label;
}

function showError(msg) {
  const box = document.getElementById('authError');
  if (!box) return;
  if (!msg) { box.classList.remove('show'); box.innerText = ''; return; }
  box.innerText = msg;
  box.classList.add('show');
}

async function handleSubmit(e, mode) {
  e.preventDefault();
  if (state.busy) return;
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  setBusy(btn, true);
  showError('');

  const username = form.querySelector('#username')?.value.trim();
  const password = form.querySelector('#password')?.value;
  const confirm = form.querySelector('#confirm_password')?.value;

  if (!username || !password) {
    showError('Please fill all required fields.');
    return setBusy(btn, false);
  }
  if (mode === 'register' && password !== confirm) {
    showError('Passwords do not match.');
    return setBusy(btn, false);
  }

  try {
    const res = await fetch(mode === 'login' ? '/api/login' : '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      if (mode === 'login') {
        localStorage.setItem('datana_user', data.username || username);
        window.location.href = 'dashboard.html';
      } else {
        // auto login not required; redirect to login
        window.location.href = 'login.html';
      }
    } else {
      showError(data.error || 'Request failed. Please try again.');
    }
  } catch (err) {
    showError('Network error. Please try again.');
    console.error(err);
  } finally {
    setBusy(btn, false);
  }
}