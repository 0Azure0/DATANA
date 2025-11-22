// dashboard.js — render charts from stored analysis in localStorage
document.addEventListener('DOMContentLoaded', ()=>{
  const raw = localStorage.getItem('datana_last_analysis');
  if (!raw){ document.getElementById('tableWrap').innerHTML = '<p class="muted">Chưa có dữ liệu. Vui lòng tải file ở trang Upload.</p>'; return; }
  const analysis = JSON.parse(raw);
  // KPIs
  const stats = analysis.statistics || {};
  document.getElementById('kpi_rev').textContent = new Intl.NumberFormat('vi-VN').format(stats.total_revenue||0) + ' VNĐ';
  document.getElementById('kpi_profit').textContent = new Intl.NumberFormat('vi-VN').format(stats.total_profit||0) + ' VNĐ';
  document.getElementById('kpi_topprod').textContent = ((analysis.top_products && analysis.top_products[0])? analysis.top_products[0].name : '-') ;

  // Prepare datasets
  const monthly = analysis.revenue_by_month || {};
  const months = Object.keys(monthly);
  const mvals = Object.values(monthly);
  const ctxLine = document.getElementById('chartLine').getContext('2d');
  createLine(ctxLine, months, mvals, {label:'Doanh thu', color:'#4facfe'});

  const rby = (analysis.region_analysis && analysis.region_analysis.revenue_by_region) ? analysis.region_analysis.revenue_by_region : {};
  const rlabels = Object.keys(rby); const rvals = Object.values(rby);
  const ctxBar = document.getElementById('chartBar').getContext('2d');
  createBar(ctxBar, rlabels, rvals, {label:'Khu vực'});

  // Stacked bar: mock per product per region if product_metrics present
  const prodMetrics = analysis.product_metrics || {};
  const prods = Object.keys(prodMetrics).slice(0,4);
  const regions = rlabels.length? rlabels : ['Region A'];
  const stackDatasets = prods.map((p,i)=>({label:p, data: regions.map(()=> Math.round(Math.random()*100000)), backgroundColor: ['#667eea','#4facfe','#f093fb','#ffd166'][i%4]}));
  const ctxStack = document.getElementById('chartStack').getContext('2d');
  createStackedBar(ctxStack, regions, stackDatasets);

  // Donut: product share by revenue
  const top = analysis.top_products || [];
  const dlabels = top.map(t=>t.name); const dvals = top.map(t=>t.revenue||0);
  const ctxDonut = document.getElementById('chartDonut').getContext('2d');
  createDonut(ctxDonut, dlabels, dvals);

  // Area: running total
  const running = []; let sum=0; mvals.forEach(v=>{ sum += v||0; running.push(sum); });
  const ctxArea = document.getElementById('chartArea').getContext('2d');
  createArea(ctxArea, months, running);

  // Scatter: price vs qty mock from product_metrics
  const pts = [];
  Object.values(prodMetrics).slice(0,30).forEach(m=>{ pts.push({x: m.unit_price||Math.random()*100, y: m.quantity||Math.random()*10}); });
  const ctxScatter = document.getElementById('chartScatter').getContext('2d');
  createScatter(ctxScatter, pts);

  // Radar: performance across products (mock values)
  const rlabels2 = prods; const rdata = prods.map(()=> Math.round(Math.random()*100));
  const ctxRadar = document.getElementById('chartRadar').getContext('2d');
  createRadar(ctxRadar, rlabels2, [{label:'Score', data: rdata, backgroundColor:'rgba(102,126,234,0.2)', borderColor:'#667eea'}]);

  // Ensure charts redraw on container resize (Chart.js responsive should handle this, but trigger a resize to be safe)
  if (window && window.addEventListener){
    let resizeTimeout = null;
    window.addEventListener('resize', ()=>{
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(()=>{
        // iterate over canvases and call chart resize via their parent Chart instance
        if (window.Chart && Chart.getChart){
          ['chartLine','chartBar','chartStack','chartDonut','chartArea','chartScatter','chartRadar'].forEach(id=>{
            try{ const c = document.getElementById(id); const chart = Chart.getChart(c); if (chart) chart.resize(); }catch(e){}
          });
        }
      }, 200);
    });
  }

  // Table: show first 20 rows of raw_data if provided
  const tableWrap = document.getElementById('tableWrap');
  const rawdata = analysis.raw_data || [];
  if (rawdata && rawdata.length){
    const cols = Object.keys(rawdata[0]);
    let html = '<table class="stats-table"><thead><tr>' + cols.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
    rawdata.slice(0,20).forEach(r=>{ html += '<tr>' + cols.map(c=>`<td>${r[c]===undefined?'':r[c]}</td>`).join('') + '</tr>'; });
    html += '</tbody></table>';
    tableWrap.innerHTML = html;
  } else {
    tableWrap.innerHTML = '<p class="muted">Không có dữ liệu bảng.</p>';
  }
});
