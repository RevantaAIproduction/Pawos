'use strict';
// Audit v3 — correct workspace tile clicks + Paw Go planning test
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 9222;
const DIR = 'C:/Users/APPLE/AppData/Local/Temp/pawos-shots/audit3';
fs.mkdirSync(DIR, { recursive: true });
let n = 0;

function getTarget(cb) {
  http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
    let d=''; r.on('data',c=>d+=c);
    r.on('end',()=>cb(JSON.parse(d).find(t=>t.type==='page')?.webSocketDebuggerUrl));
  });
}
let mid=0; const pend=new Map(); let ws;
function send(m,p,cb){
  const id=++mid;
  const t=setTimeout(()=>{pend.delete(id);console.warn(`timeout: ${m}`);if(cb)cb(null,{});},12000);
  pend.set(id,{cb,t});
  ws.send(JSON.stringify({id,method:m,params:p||{}}));
}
function ss(label,cb){
  send('Page.captureScreenshot',{format:'png'},(err,r)=>{
    if(!r?.data){console.warn('no screenshot:',label);return cb&&cb();}
    const buf=Buffer.from(r.data,'base64');
    const name=`${String(++n).padStart(2,'0')}-${label}`;
    fs.writeFileSync(path.join(DIR,`${name}.png`),buf);
    console.log(`📸 ${name} (${(buf.length/1024).toFixed(0)}KB)`);
    cb&&cb();
  });
}
function click(x,y,cb){
  send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1},()=>{
    setTimeout(()=>send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1},cb),100);
  });
}
function wait(ms,cb){setTimeout(cb,ms);}
function body(cb){
  send('Runtime.evaluate',{expression:`document.body.innerText.slice(0,1000)`,returnByValue:true},(e,r)=>cb(r?.result?.value||''));
}
function seq(steps,done){const go=i=>{if(i>=steps.length)return done&&done();steps[i](()=>go(i+1));};go(0);}

// Go to Apps Hub and wait for tiles to appear
function gotoAppsHub(cb){
  click(140,205,()=>wait(3000,cb));  // Projects → Apps Hub, 3s wait
}

getTarget(wsUrl=>{
  ws=new WebSocket(wsUrl);
  ws.on('error',e=>{console.error('WS:',e.message);process.exit(1);});
  ws.on('message',data=>{
    const m=JSON.parse(data);
    if(m.id&&pend.has(m.id)){
      const {cb,t}=pend.get(m.id);
      clearTimeout(t);pend.delete(m.id);
      if(cb)cb(null,m.result||{});
    }
  });
  ws.on('open',()=>{
    console.log('WS open\n');
    seq([

      // ── 1. RESEARCH workspace (row 1 col 2: x=840, y=120)
      cb=>{console.log('═══ RESEARCH ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>ss('01-apphub-pre-research',cb),
      cb=>body(t=>{console.log('Apps hub check:',t.slice(0,100));cb();}),
      cb=>click(840,120,cb),
      cb=>wait(3500,cb),
      cb=>ss('02-research-workspace',cb),
      cb=>body(t=>{console.log('Research:',t.slice(0,300));cb();}),

      // ── 2. COMMUNICATION workspace (row 1 col 3: x=1190, y=120)
      cb=>{console.log('\n═══ COMMUNICATION ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(1190,120,cb),
      cb=>wait(3500,cb),
      cb=>ss('03-communication-workspace',cb),
      cb=>body(t=>{console.log('Communication:',t.slice(0,300));cb();}),

      // ── 3. OFFICE workspace (row 2 col 1: x=490, y=295)
      cb=>{console.log('\n═══ OFFICE ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(490,295,cb),
      cb=>wait(3500,cb),
      cb=>ss('04-office-workspace',cb),
      cb=>body(t=>{console.log('Office:',t.slice(0,300));cb();}),

      // ── 4. CLOUD workspace (row 2 col 2: x=840, y=295)
      cb=>{console.log('\n═══ CLOUD ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(840,295,cb),
      cb=>wait(3500,cb),
      cb=>ss('05-cloud-workspace',cb),
      cb=>body(t=>{console.log('Cloud:',t.slice(0,300));cb();}),

      // ── 5. FILES workspace (row 2 col 3: x=1190, y=295)
      cb=>{console.log('\n═══ FILES ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(1190,295,cb),
      cb=>wait(3500,cb),
      cb=>ss('06-files-workspace',cb),
      cb=>body(t=>{console.log('Files:',t.slice(0,300));cb();}),

      // ── 6. DEV workspace → click "Explain this project" chip
      cb=>{console.log('\n═══ DEV — EXPLAIN THIS PROJECT ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(490,120,cb),
      cb=>wait(3000,cb),
      cb=>ss('07-dev-landing',cb),
      cb=>body(t=>{console.log('Dev landing:',t.slice(0,300));cb();}),
      // Click "Explain this project" chip — visible at approx x=395, y=577
      cb=>click(395,577,cb),
      cb=>wait(4000,cb),
      cb=>ss('08-dev-explain-project-result',cb),
      cb=>body(t=>{console.log('After explain:', t.slice(0,500));cb();}),
      cb=>wait(3000,cb),
      cb=>ss('09-dev-explain-project-result2',cb),

      // ── 7. DEV → "Run my tests" chip
      cb=>{console.log('\n═══ DEV — RUN MY TESTS ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(490,120,cb),
      cb=>wait(3000,cb),
      cb=>click(533,577,cb),  // "Run my tests" chip
      cb=>wait(4000,cb),
      cb=>ss('10-dev-run-tests-result',cb),
      cb=>body(t=>{console.log('Run tests:', t.slice(0,400));cb();}),

      // ── 8. DEV → "Fix a bug" chip
      cb=>{console.log('\n═══ DEV — FIX A BUG ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(490,120,cb),
      cb=>wait(3000,cb),
      cb=>click(642,577,cb),  // "Fix a bug" chip
      cb=>wait(4000,cb),
      cb=>ss('11-dev-fix-bug-result',cb),
      cb=>body(t=>{console.log('Fix bug:', t.slice(0,400));cb();}),

      // ── 9. SETTINGS — search for it
      cb=>{console.log('\n═══ SETTINGS DISCOVERY ═══');cb();},
      cb=>click(140,130,cb),  // Home
      cb=>wait(1500,cb),
      cb=>click(148,87,cb),   // Search
      cb=>wait(500,cb),
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'S'},cb),
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'e'},cb),
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'t'},cb),
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'t'},cb),
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'i'},cb),
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'n'},cb),
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'g'},cb),
      cb=>wait(800,cb),
      cb=>ss('12-search-settings',cb),
      cb=>body(t=>{console.log('Settings search:', t.slice(0,300));cb();}),
      // Press Escape to close search
      cb=>send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape'},cb),
      cb=>wait(300,cb),

      // ── 10. Autonomous ticket via home/companion flow
      cb=>{console.log('\n═══ AUTONOMOUS TICKET FLOW ═══');cb();},
      cb=>click(140,130,cb),
      cb=>wait(1500,cb),
      cb=>ss('13-home-for-ticket',cb),
      // Try clicking "Enable companion" — see if anything happens at all
      cb=>click(843,278,cb),
      cb=>wait(5000,cb),
      cb=>ss('14-companion-enable-attempt',cb),
      cb=>body(t=>{console.log('After enable:', t.slice(0,400));cb();}),

      // ── 11. WORKING HISTORY detail
      cb=>{console.log('\n═══ WORKING HISTORY ═══');cb();},
      cb=>click(140,343,cb),
      cb=>wait(2000,cb),
      cb=>ss('15-working-history',cb),
      cb=>body(t=>{console.log('WH:', t.slice(0,200));cb();}),

      // ── 12. Take complete final state screenshot of each sidebar item
      cb=>{console.log('\n═══ FINAL SIDEBAR SWEEP ═══');cb();},
      cb=>click(140,130,cb), cb=>wait(2000,cb), cb=>ss('16-home-final',cb),
      cb=>click(140,167,cb), cb=>wait(2000,cb), cb=>ss('17-companion-final',cb),
      cb=>gotoAppsHub(cb),   cb=>ss('18-apps-hub-final',cb),
      cb=>click(140,280,cb), cb=>wait(2000,cb), cb=>ss('19-analytics-final',cb),
      cb=>click(140,343,cb), cb=>wait(2000,cb), cb=>ss('20-working-history-final',cb),

    ],()=>{
      const shots=fs.readdirSync(DIR).filter(f=>f.endsWith('.png'));
      console.log(`\n✅ Audit v3 complete — ${shots.length} screenshots in ${DIR}`);
      shots.forEach(s=>console.log(' ',s));
      ws.close(); process.exit(0);
    });
  });
});
