// charts.js — helper wrappers for Chart.js for 7 chart types
function createLine(ctx, labels, data, opts={}){
  return new Chart(ctx, {type:'line', data:{labels, datasets:[{label:opts.label||'Series', data, fill:false, borderColor:opts.color||'#4facfe'}]}, options:{responsive:true, maintainAspectRatio:false, animation:{duration:600}, plugins:{legend:{display:false}}, layout:{padding:6}}});
}
function createBar(ctx, labels, data, opts={}){
  return new Chart(ctx, {type:'bar', data:{labels, datasets:[{label:opts.label||'Series', data, backgroundColor:opts.color||'#667eea'}]}, options:{responsive:true, maintainAspectRatio:false, animation:{duration:600}, plugins:{legend:{display:false}}, layout:{padding:6}}});
}
function createStackedBar(ctx, labels, datasets, opts={}){
  return new Chart(ctx, {type:'bar', data:{labels, datasets:datasets}, options:{responsive:true, maintainAspectRatio:false, scales:{x:{stacked:true}, y:{stacked:true}}, animation:{duration:700}, plugins:{legend:{position:'bottom'}}, layout:{padding:6}}});
}
function createDonut(ctx, labels, data, opts={}){
  return new Chart(ctx, {type:'doughnut', data:{labels, datasets:[{data, backgroundColor:opts.colors||['#667eea','#4facfe','#f093fb','#ffd166']} ]}, options:{responsive:true, maintainAspectRatio:false, animation:{duration:600}, plugins:{legend:{position:'bottom'}}, layout:{padding:6}}});
}
function createArea(ctx, labels, data, opts={}){
  return new Chart(ctx, {type:'line', data:{labels, datasets:[{label:opts.label||'Area', data, fill:true, backgroundColor:opts.bg||'rgba(102,126,234,0.12)', borderColor:opts.color||'#667eea'}]}, options:{responsive:true, maintainAspectRatio:false, animation:{duration:700}, plugins:{legend:{display:false}}, layout:{padding:6}}});
}
function createScatter(ctx, points, opts={}){
  return new Chart(ctx, {type:'scatter', data:{datasets:[{label:opts.label||'Scatter', data:points, backgroundColor:opts.color||'#764ba2'}]}, options:{responsive:true, maintainAspectRatio:false, animation:{duration:600}, plugins:{legend:{display:false}}, layout:{padding:6}}});
}
function createRadar(ctx, labels, datasets, opts={}){
  return new Chart(ctx, {type:'radar', data:{labels, datasets:datasets}, options:{responsive:true, maintainAspectRatio:false, animation:{duration:600}, plugins:{legend:{display:false}}, layout:{padding:6}}});
}
