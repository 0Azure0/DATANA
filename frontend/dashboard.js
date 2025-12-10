// DATANA Dashboard - Robust Data Parser & Neon Charts
const charts = {};

// Fuzzy column mapping - handles case variations and partial matches
const FIELD_KEYS = {
  product: ['name', 'product', 'item', 'sku', 'tên', 'sản phẩm', 'product name'],
  quantity: ['quantity sold', 'quantity', 'qty', 'units', 'số lượng', 'sl', 'orders', 'quantity_sold'],
  price: ['price', 'unit price', 'giá', 'đơn giá', 'cost', 'unit_price'],
  profit: ['profit', 'margin', 'lợi nhuận', 'lãi', 'lợi_nhuận'],
  revenue: ['revenue', 'sales', 'amount', 'doanh thu', 'total', 'gross', 'doanh_thu'],
  brand: ['brand', 'hãng', 'thương hiệu', 'thương_hiệu'],
  category: ['category', 'ngành hàng', 'danh mục', 'segment', 'danh_mục'],
  date: ['date', 'ngày', 'day', 'month', 'time', 'order date', 'order_date']
};

document.addEventListener('DOMContentLoaded', () => {
  initChartsTheme();
  bindActions();
  hydrateDashboard();
});

function bindActions() {
  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => hydrateDashboard(true));

  const filterBtn = document.getElementById('applyFilter');
  if (filterBtn) filterBtn.addEventListener('click', hydrateDashboard);

  const btnAi = document.getElementById('btnAiForecast');
  if (btnAi) btnAi.addEventListener('click', runForecast);
}

function hydrateDashboard() {
  const spinner = document.getElementById('pageSpinner');
  if (spinner) spinner.classList.remove('hidden');
  
  try {
    const cached = localStorage.getItem('datana_last_analysis');
    if (!cached) {
      showMessage("Chưa có dữ liệu. Hãy tải file ở trang Upload.");
      return;
    }
    
    const analysis = JSON.parse(cached);
    let data = analysis.raw_data || [];
    
    if (!data.length) {
      showMessage("Dữ liệu trống hoặc không hợp lệ.");
      return;
    }

    const filters = collectFilters(data);
    data = applyFilters(data, filters);
    renderDashboard(data);
    
  } catch (err) {
    console.error("Dashboard Error:", err);
    showMessage("Lỗi đọc dữ liệu localStorage.");
  } finally {
    if (spinner) spinner.classList.add('hidden');
  }
}

function collectFilters(data) {
  const startDate = document.getElementById('startDate')?.value || "";
  const endDate = document.getElementById('endDate')?.value || "";

  // Populate dropdowns if needed
  populateDropdowns(data);
  
  // Get selected values from custom dropdown checkboxes
  const selectedCats = Array.from(document.querySelectorAll('#categoryMenu input[type="checkbox"]:checked'))
    .map(cb => cb.value)
    .filter(v => v);
  
  const selectedBrands = Array.from(document.querySelectorAll('#brandMenu input[type="checkbox"]:checked'))
    .map(cb => cb.value)
    .filter(v => v);
  
  return { 
    startDate, 
    endDate, 
    categories: selectedCats, 
    brands: selectedBrands 
  };
}

function populateDropdowns(data) {
  const catMenu = document.getElementById('categoryMenu');
  const brandMenu = document.getElementById('brandMenu');

  // Populate categories if not already done
  if (catMenu && catMenu.children.length === 0) {
    const cats = Array.from(new Set(data.map(r => pickText(r, 'category')).filter(Boolean)));
    catMenu.innerHTML = cats.map(cat => `
      <div class="dropdown-item">
        <input type="checkbox" id="cat_${cat}" value="${cat}">
        <label for="cat_${cat}">${cat}</label>
      </div>
    `).join('');
  }

  // Populate brands if not already done
  if (brandMenu && brandMenu.children.length === 0) {
    const brands = Array.from(new Set(data.map(r => pickText(r, 'brand')).filter(Boolean)));
    brandMenu.innerHTML = brands.map(brand => `
      <div class="dropdown-item">
        <input type="checkbox" id="brand_${brand}" value="${brand}">
        <label for="brand_${brand}">${brand}</label>
      </div>
    `).join('');
  }
}

function toggleDropdown(elementId) {
  const dropdown = document.getElementById(elementId);
  const menu = dropdown?.querySelector('.dropdown-menu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
}


function applyFilters(data, { startDate, endDate, categories, brands }) {
  return data.filter(r => {
    const d = pickText(r, 'date');
    
    if (startDate && d && d !== 'N/A') {
      const dt = new Date(d);
      if (!isNaN(dt.getTime()) && dt < new Date(startDate)) return false;
    }
    
    if (endDate && d && d !== 'N/A') {
      const dt = new Date(d);
      if (!isNaN(dt.getTime()) && dt > new Date(endDate)) return false;
    }
    
    // Multi-select filter: OR logic (include if matches ANY selected category)
    if (categories && categories.length > 0) {
      const itemCat = pickText(r, 'category');
      if (!categories.includes(itemCat)) return false;
    }
    
    // Multi-select filter: OR logic (include if matches ANY selected brand)
    if (brands && brands.length > 0) {
      const itemBrand = pickText(r, 'brand');
      if (!brands.includes(itemBrand)) return false;
    }
    
    return true;
  });
}

function renderDashboard(data) {
  let tRev = 0, tProf = 0, tQty = 0;
  const brandMap = {}, catMap = {}, timeMap = {}, scatterData = [];
  
  // Process each row with robust parsing
  data.forEach(r => {
    const qty = num(pick(r, 'quantity'));
    const price = num(pick(r, 'price'));
    let rev = num(pick(r, 'revenue'));
    const prof = num(pick(r, 'profit'));
    
    // Calculate revenue if missing
    if (!rev && price && qty) rev = price * qty;

    const p = pickText(r, 'product') || 'Unknown';
    const b = pickText(r, 'brand') || 'Khác';
    const c = pickText(r, 'category') || 'Chung';
    const d = pickText(r, 'date');

    tRev += rev; 
    tProf += prof; 
    tQty += qty;

    brandMap[b] = (brandMap[b] || 0) + rev;
    catMap[c] = (catMap[c] || 0) + rev;
    
    if (d && d.length > 4 && d !== 'N/A') {
      timeMap[d] = (timeMap[d] || 0) + rev;
    }
    
    if (rev > 0 && price > 0 && qty > 0) {
      // Scale bubble radius using a conservative log transform to avoid huge bubbles
      const profAbs = Math.abs(prof || 0);
      // Use a smaller multiplier and tighter bounds so bubbles stay proportional
      const radius = Math.max(3, Math.min(8, Math.log10(profAbs + 1) * 2 + 1));
      scatterData.push({
        x: price,
        y: qty,
        r: radius,
        label: p
      });
    }
  });

  // Update KPIs with animation and currency formatting
  animateValue('kpi_rev', tRev, money);
  animateValue('kpi_profit', tProf, money);
  animateValue('kpi_qty', tQty, v => new Intl.NumberFormat('vi-VN').format(Math.floor(v)));
  
  const sortedByRev = [...data].sort((a, b) => {
    const revA = num(pick(a, 'revenue')) || (num(pick(a, 'price')) * num(pick(a, 'quantity')));
    const revB = num(pick(b, 'revenue')) || (num(pick(b, 'price')) * num(pick(b, 'quantity')));
    return revB - revA;
  });
  
  setText('kpi_top', pickText(sortedByRev[0] || {}, 'product') || '-');

  // Render Charts
  const top10Rev = sortedByRev.slice(0, 10);
  if (top10Rev.length) {
    drawBar('cardTopRev', 'chartTopRev', 
      top10Rev.map(r => getFullProductName(r)), 
      top10Rev.map(r => num(pick(r, 'revenue')) || (num(pick(r, 'price')) * num(pick(r, 'quantity')))), 
      '#8b5cf6',
      { indexAxis: 'y' }  // ← HORIZONTAL BAR for product names
    );
  } else {
    hideCard('cardTopRev');
  }

  const sortedBrand = Object.entries(brandMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (sortedBrand.length) {
    drawBar('cardBrand', 'chartBrand', 
      sortedBrand.map(x => x[0]), 
      sortedBrand.map(x => x[1]), 
      '#0ea5e9', 
      { indexAxis: 'y' }  // Horizontal bar for brand names
    );
  } else {
    hideCard('cardBrand');
  }

  const months = Object.keys(timeMap).sort();
  if (months.length > 1) {
    drawLine('cardTrend', 'chartTrend', months, months.map(m => timeMap[m]), '#10b981');
  } else {
    hideCard('cardTrend');
  }

  const sortedCat = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  if (sortedCat.length) {
    drawDoughnut('cardCat', 'chartCat', sortedCat.map(x => x[0]), sortedCat.map(x => x[1]));
  } else {
    hideCard('cardCat');
  }

  if (scatterData.length >= 3) {
    drawBubble('cardScatter', 'chartScatter', scatterData);
  } else {
    hideCard('cardScatter');
  }

  // Top Profit Chart - ALSO HORIZONTAL for product names
  const topProfit = [...data].sort((a, b) => num(pick(b, 'profit')) - num(pick(a, 'profit'))).slice(0, 10);
  if (topProfit.length) {
    drawBar('cardTopProfit', 'chartTopProfit', 
      topProfit.map(r => getFullProductName(r)), 
      topProfit.map(r => num(pick(r, 'profit'))), 
      '#10b981',
      { indexAxis: 'y' }  // ← HORIZONTAL BAR for product names
    );
  } else {
    hideCard('cardTopProfit');
  }

  // Render Table
  const tbody = document.getElementById('dataTableBody');
  if (tbody) {
    const top20 = sortedByRev.slice(0, 20);
    tbody.innerHTML = top20.map(r => {
      const rev = num(pick(r, 'revenue')) || (num(pick(r, 'price')) * num(pick(r, 'quantity')));
      return `
        <tr>
          <td>${pickText(r, 'product')}</td>
          <td>${pickText(r, 'brand')}</td>
          <td>${pickText(r, 'category')}</td>
          <td>${money(pick(r, 'price'))}</td>
          <td>${num(pick(r, 'quantity'))}</td>
          <td style="color:#8b5cf6;font-weight:700">${money(rev)}</td>
          <td style="color:#10b981;font-weight:700">${money(pick(r, 'profit'))}</td>
        </tr>
      `;
    }).join('');
  }
}

// Chart Drawing Functions
function drawBar(cardId, canvasId, labels, data, color, opts = {}) {
  if (!data || !data.length || !labels || !labels.length) {
    hideCard(cardId);
    return;
  }
  
  showCard(cardId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  
  destroy(canvasId);
  
  const isHorizontal = opts.indexAxis === 'y';
  
  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: gradient(ctx, color),
        borderColor: color,
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: opts.indexAxis || 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed.y || context.parsed.x;
              return money(value);
            }
          }
        }
      },
      scales: {
        x: { 
          grid: { display: false },
          ticks: {
            callback: function(value) {
              // Only show currency formatting on non-horizontal (value axis)
              if (!isHorizontal && typeof value === 'number') {
                return money(value);
              }
              return value;
            }
          }
        },
        y: { 
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            callback: function(value) {
              // Show currency formatting on vertical axis when horizontal bar
              if (isHorizontal && typeof value === 'number') {
                return money(value);
              }
              return value;
            }
          }
        }
      }
    }
  });
}

function drawLine(cardId, canvasId, labels, data, color) {
  if (!data || !data.length || !labels || !labels.length) {
    hideCard(cardId);
    return;
  }
  
  showCard(cardId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  
  destroy(canvasId);
  
  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: gradient(ctx, color, 0.25),
        fill: true,
        tension: 0.35,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return money(context.parsed.y);
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { 
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            callback: function(value) {
              if (typeof value === 'number') {
                return money(value);
              }
              return value;
            }
          }
        }
      }
    }
  });
}

function drawDoughnut(cardId, canvasId, labels, data) {
  if (!data || !data.length || !labels || !labels.length) {
    hideCard(cardId);
    return;
  }
  
  showCard(cardId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  
  destroy(canvasId);
  
  charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#f472b6'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#cbd5e1', boxWidth: 12 }
        }
      }
    }
  });
}

function drawBubble(cardId, canvasId, points) {
  if (!points || points.length < 3) {
    hideCard(cardId);
    return;
  }
  
  showCard(cardId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  
  destroy(canvasId);
  
  charts[canvasId] = new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'SP',
        data: points.slice(0, 60),
        backgroundColor: 'rgba(236,72,153,0.6)',
        borderColor: '#ec4899'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { 
          title: { display: true, text: 'Giá', color: '#cbd5e1' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: { 
          title: { display: true, text: 'Số lượng', color: '#cbd5e1' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// Helper Functions
function destroy(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function hideCard(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showCard(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function gradient(ctx, color, alpha = 0.6) {
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, hex(color, alpha));
  g.addColorStop(1, hex(color, 0.05));
  return g;
}

// Fuzzy column picker - handles case-insensitive and partial matches
function pick(row, target) {
  if (!row || typeof row !== 'object') return null;
  
  const keys = FIELD_KEYS[target] || [target];
  const rowKeys = Object.keys(row);
  
  // Try exact match first (case-insensitive)
  for (const key of rowKeys) {
    const lowerKey = key.toLowerCase().trim();
    if (keys.some(k => lowerKey === k.toLowerCase())) {
      return row[key];
    }
  }
  
  // Try partial match
  for (const key of rowKeys) {
    const lowerKey = key.toLowerCase().trim();
    if (keys.some(k => lowerKey.includes(k.toLowerCase()) || k.toLowerCase().includes(lowerKey))) {
      return row[key];
    }
  }
  
  // Fallback to direct key
  return row[target] || null;
}

function pickText(row, target) {
  const v = pick(row, target);
  return (v === undefined || v === null || v === '') ? '' : String(v).trim();
}

// Get the strict full product name from a row.
// Prefer exact keys like 'Name' or common 'product' fields; fall back to pickText.
function getFullProductName(row) {
  if (!row || typeof row !== 'object') return '';
  // Check common exact keys first (case-insensitive)
  const exactKeys = ['Name', 'name', 'Product', 'product', 'Tên', 'tên'];
  for (const k of exactKeys) {
    if (Object.prototype.hasOwnProperty.call(row, k)) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    // also check case-insensitive presence
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === k.toLowerCase()) {
        const v = row[rk];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
    }
  }
  // Fallback to fuzzy picker
  return pickText(row, 'product') || pickText(row, 'name') || '';
}

function num(v) {
  if (v === undefined || v === null || v === '') return 0;
  const str = String(v).replace(/,/g, '').trim();
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function money(n) {
  if (n === undefined || n === null) return '0 ₫';
  const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/,/g, '')) || 0;
  if (isNaN(num)) return '0 ₫';
  
  // Format Vietnamese currency: 1234567.89 -> 1.234.567 ₫
  const formatted = Math.floor(num).toLocaleString('vi-VN');
  const decimals = num % 1;
  
  if (decimals > 0) {
    return formatted + '.' + Math.round(decimals * 100).toString().padStart(2, '0') + ' ₫';
  }
  return formatted + ' ₫';
}

function hex(hex, alpha) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

function animateValue(id, end, formatter = v => v, duration = 800) {
  const el = document.getElementById(id);
  if (!el) return;
  
  const start = 0;
  const startTime = performance.now();
  
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const val = start + (end - start) * p;
    el.textContent = formatter(val);
    if (p < 1) requestAnimationFrame(tick);
  }
  
  requestAnimationFrame(tick);
}

function initChartsTheme() {
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
  Chart.defaults.font.size = 13;
  Chart.defaults.font.weight = '500';
  Chart.defaults.color = '#cbd5e1';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
  Chart.defaults.animation = { duration: 1200, easing: 'easeOutQuart' };
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
  Chart.defaults.plugins.tooltip.titleColor = '#f8fafc';
  Chart.defaults.plugins.tooltip.bodyColor = '#cbd5e1';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(139, 92, 246, 0.5)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
}

// AI Forecast - Enhanced with Market Intelligence
async function runForecast() {
  const holder = document.getElementById('aiForecastResult');
  const btnAI = document.getElementById('btnAiForecast');
  
  if (!holder) return;
  
  const cached = localStorage.getItem('datana_last_analysis');
  if (!cached) {
    holder.innerHTML = '⚠️ Chưa có dữ liệu phân tích. Vui lòng tải file trước.';
    return;
  }
  
  if (btnAI) btnAI.disabled = true;
  holder.innerHTML = `<div class="spinner" style="margin:15px auto; border-top-color:#8b5cf6;"></div><p style="color:#94a3b8; text-align:center;">🤖 AI đang phân tích dữ liệu + thị trường...</p>`;
  
  try {
    const analysis = JSON.parse(cached);
    const sessionId = analysis.session_id || 'unknown';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const res = await fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }
    
    const data = await res.json();
    const content = data.html_content || data.content || data.message || '❌ AI không thể xử lý yêu cầu này.';
    holder.innerHTML = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    
  } catch (e) {
    console.error('AI Forecast Error:', e);
    holder.innerHTML = `<div style="color:#ef4444; line-height:1.8;">
      <strong>⚠️ Lỗi AI:</strong><br/>
      ${e.message || 'Không xác định'}<br/><br/>
      <small>Kiểm tra: 1) API key Groq được cấu hình, 2) Có dữ liệu hợp lệ, 3) Kết nối Internet ổn định.</small>
    </div>`;
  } finally {
    if (btnAI) btnAI.disabled = false;
  }
}

function showMessage(msg) {
  const main = document.querySelector('.main-content');
  if (main) {
    main.innerHTML = `<div style="padding:60px; text-align:center; color:#94a3b8; font-size:1.2rem;">${msg}</div>`;
  }
}

