// suggestions.js — render suggestions with better UI
document.addEventListener('DOMContentLoaded', ()=>{
  const s = JSON.parse(localStorage.getItem('datana_last_analysis_recs')||'null');
  const suggestionsArea = document.getElementById('suggestionsArea');
  const noDataMsg = document.getElementById('noDataMsg');
  
  if (!s || ((!s.product || s.product.length===0) && (!s.marketing || s.marketing.length===0))){
    suggestionsArea.innerHTML = '';
    noDataMsg.style.display = 'block';
    return;
  }
  
  noDataMsg.style.display = 'none';
  suggestionsArea.innerHTML = '';
  
  const groups = [
    { key:'product', title:'📦 Chiến lược sản phẩm', icon:'📦', color:'#667eea' },
    { key:'pricing', title:'💰 Chiến lược giá', icon:'💰', color:'#f59e0b' },
    { key:'marketing', title:'📢 Chiến lược marketing', icon:'📢', color:'#ef4444' },
    { key:'regional', title:'🗺️ Chiến lược khu vực', icon:'🗺️', color:'#10b981' },
    { key:'operation', title:'⚙️ Chiến lược vận hành', icon:'⚙️', color:'#8b5cf6' }
  ];
  
  groups.forEach(g=>{
    const items = s[g.key] || [];
    if (items.length === 0) return;
    
    const html = `
      <div class="suggestion-group animate-in">
        <h3 style="color:${g.color};">${g.title}</h3>
        <ul class="suggestion-list">
          ${items.map(item=> `<li class="suggestion-item">✓ ${item}</li>`).join('')}
        </ul>
      </div>
    `;
    suggestionsArea.innerHTML += html;
  });
});
