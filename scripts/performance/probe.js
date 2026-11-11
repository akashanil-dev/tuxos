(() => {
  const label = document.querySelector('script[data-product]')?.dataset.product || 'unknown';
  const data = { product: label, userAgent: navigator.userAgent, viewport: [innerWidth,innerHeight], hardwareConcurrency: navigator.hardwareConcurrency, fcpMs: null, lcpMs: null, longTasks: [], entryToDesktopMs: null, openedWindows: [] };
  const observers = [];
  function observe(type, consume) { try { const o = new PerformanceObserver(list => list.getEntries().forEach(consume)); o.observe({ type, buffered:true }); observers.push(o); } catch {} }
  observe('paint', e => { if(e.name==='first-contentful-paint')data.fcpMs=e.startTime; });
  observe('largest-contentful-paint', e => { data.lcpMs=e.startTime; });
  observe('longtask', e => { if(data.longTasks.length<200)data.longTasks.push({start:e.startTime,duration:e.duration}); });
  let lastClick, desktopSeen=false;
  const visible = element => element && !element.hidden && element.getClientRects().length>0 && getComputedStyle(element).visibility!=='hidden';
  const knownWindows = new WeakSet();
  const monitor = new MutationObserver(() => {
    const desktop = document.querySelector('.desktop-screen,#desktop');
    if(!desktopSeen && visible(desktop)) { desktopSeen=true; if(lastClick)data.entryToDesktopMs=+(performance.now()-lastClick.time).toFixed(2); }
    for(const element of document.querySelectorAll('.app-window,.wm-window,.window')) {
      if(knownWindows.has(element)||!visible(element)||element.querySelector('.window-loading'))continue;
      knownWindows.add(element);
      if(lastClick && data.openedWindows.length<30)data.openedWindows.push({action:lastClick.label,ms:+(performance.now()-lastClick.time).toFixed(2)});
    }
  });
  const panel=document.createElement('details'); panel.id='performance-readings';
  panel.style.cssText='position:fixed;z-index:20000;right:8px;bottom:8px;max-width:540px;max-height:65vh;overflow:auto;background:#fff;color:#111;border:2px solid #555;padding:8px;font:12px/1.4 monospace;';
  const summary=document.createElement('summary');summary.textContent=`Performance readings · ${label}`;panel.append(summary);
  const capture=document.createElement('button');capture.textContent='Capture measurements';panel.append(capture);
  const out=document.createElement('pre');out.style.whiteSpace='pre-wrap';panel.append(out);
  capture.onclick=()=>{
    const resources=performance.getEntriesByType('resource').filter(e=>/\.m?js(?:\?|$)/.test(e.name)&&!e.name.includes('__performance-probe'));
    const nav=performance.getEntriesByType('navigation')[0];
    const result={...data,navigation:{domContentLoadedMs:nav?.domContentLoadedEventEnd,loadMs:nav?.loadEventEnd},scriptCount:resources.length,scriptEncodedBytes:resources.reduce((s,r)=>s+r.encodedBodySize,0),scriptTransferredBytes:resources.reduce((s,r)=>s+r.transferSize,0),capturedAt:new Date().toISOString()};
    out.textContent=JSON.stringify(result,null,2);console.info('TUXOS_PERFORMANCE '+JSON.stringify(result));
  };
  document.addEventListener('click',event=>{
    if(panel.contains(event.target))return;
    const target=event.target.closest('button,input[type=submit],[role=button]');
    if(target)lastClick={time:performance.now(),label:(target.getAttribute('aria-label')||target.textContent||'submit').trim().slice(0,80)};
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Enter'&&!panel.contains(event.target))lastClick={time:performance.now(),label:'Enter'};},true);
  document.body.append(panel);monitor.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','style']});
  window.addEventListener('pagehide',()=>{monitor.disconnect();observers.forEach(o=>o.disconnect());},{once:true});
})();
