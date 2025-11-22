// upload.js — handles login, file upload and calls backend /analyze
const UP_API = 'http://localhost:5000/analyze';
const fileInput = document.getElementById('fileInput');
const dropArea = document.getElementById('dropArea');
const fileName = document.getElementById('fileName');
const analyzeBtn = document.getElementById('analyzeBtn');
const uploadMsg = document.getElementById('uploadMsg');

let selected = null;

// Drag & drop and file selection
if (dropArea){
  dropArea.addEventListener('click', ()=> fileInput && fileInput.click());
}
if (fileInput){
  fileInput.addEventListener('change', e=>{ selected = e.target.files[0]; if (fileName) fileName.textContent = selected ? selected.name : 'Chưa chọn file'; });
}
['dragenter','dragover'].forEach(ev=> dropArea && dropArea.addEventListener(ev,e=>{ e.preventDefault(); dropArea.classList.add('dragover'); }));
['dragleave','drop'].forEach(ev=> dropArea && dropArea.addEventListener(ev,e=>{ e.preventDefault(); dropArea.classList.remove('dragover'); }));
if (dropArea){
  dropArea.addEventListener('drop', e=>{ selected = e.dataTransfer.files[0]; if (fileName) fileName.textContent = selected ? selected.name : 'Chưa chọn file'; });
}

// Analyze/upload handler
if (analyzeBtn){
  analyzeBtn.addEventListener('click', async ()=>{
  if (!selected){ uploadMsg.textContent = 'Vui lòng chọn file'; return; }
    const token = localStorage.getItem('auth_token');
    if (!token){ uploadMsg.textContent = 'Bạn cần đăng nhập trước khi phân tích'; return; }
    uploadMsg.textContent = 'Đang gửi file...';
    const fd = new FormData(); fd.append('file', selected);
    const headers = { 'Authorization': 'Bearer '+token };
    try{
      const res = await fetch(UP_API, { method: 'POST', headers, body: fd });
      const data = await res.json();
      if (!res.ok){ uploadMsg.textContent = data.error || 'Lỗi phân tích'; return; }
      uploadMsg.textContent = 'Phân tích hoàn tất';
      // store analysis locally for dashboard & suggestions
      localStorage.setItem('datana_last_analysis', JSON.stringify(data));
      // also store structured suggestions if provided
      if (data.recommendations && typeof data.recommendations === 'object'){
        const out = { product: data.recommendations.product_suggestions || [], pricing: [], marketing: data.recommendations.marketing_suggestions || [], regional: data.recommendations.region_suggestions || [], operation: data.recommendations.overall_strategy || [] };
        localStorage.setItem('datana_last_analysis_recs', JSON.stringify(out));
      }
      // redirect to dashboard
      setTimeout(()=> location.href = '/pages/dashboard.html', 600);
    }catch(err){ uploadMsg.textContent = 'Lỗi kết nối'; console.error(err); }
  });
}
