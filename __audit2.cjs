'use strict';
// LIVE AUDIT v2 — careful navigation, full workspace entry
// Key fix: navigate to Apps Hub via Projects (y=205), THEN click tiles
// Each tile screenshot + body text to distinguish workspace vs plan gate
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9222;
const DIR = 'C:/Users/APPLE/AppData/Local/Temp/pawos-shots/audit2';
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
  const t=setTimeout(()=>{
    pend.delete(id);
    console.warn(`⏱ timeout: ${m} #${id}`);
    if(cb)cb(new Error('timeout'));
  },10000);
  pend.set(id,{cb,t});
  ws.send(JSON.stringify({id,method:m,params:p||{}}));
}
function ss(label,cb){
  send('Page.captureScreenshot',{format:'png'},(err,r)=>{
    if(err){console.error('ss ERR:',label,err.message);if(cb)cb();return;}
    const buf=Buffer.from(r.data,'base64');
    const name=`${String(++n).padStart(2,'0')}-${label}`;
    fs.writeFileSync(path.join(DIR,`${name}.png`),buf);
    console.log(`📸 ${name} (${(buf.length/1024).toFixed(0)}KB)`);
    if(cb)cb();
  });
}
function click(x,y,cb){
  send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1},()=>{
    setTimeout(()=>send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1},cb||null),100);
  });
}
function scroll(x,y,dy,cb){
  send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:dy},cb||null);
}
function wait(ms,cb){setTimeout(cb,ms);}
function body(cb){
  send('Runtime.evaluate',{expression:`document.body.innerText.slice(0,800)`,returnByValue:true},(e,r)=>cb(r?.result?.value||''));
}
function key(k,cb){
  send('Input.dispatchKeyEvent',{type:'keyDown',key:k},()=>
    send('Input.dispatchKeyEvent',{type:'keyUp',key:k},cb||null));
}

// Sequential step runner
function seq(steps,done){
  const go=i=>{
    if(i>=steps.length)return done&&done();
    steps[i](()=>go(i+1));
  };
  go(0);
}

getTarget(wsUrl=>{
  if(!wsUrl){console.error('No target');process.exit(1);}
  console.log('Connecting:',wsUrl.slice(0,80));
  ws=new WebSocket(wsUrl);
  ws.on('error',e=>{console.error('WS:',e.message);process.exit(1);});
  ws.on('message',data=>{
    const m=JSON.parse(data);
    if(m.id&&pend.has(m.id)){
      const {cb,t}=pend.get(m.id);
      clearTimeout(t); pend.delete(m.id);
      if(cb)m.error?cb(new Error(m.error.message)):cb(null,m.result||{});
    }
  });
  ws.on('open',()=>{
    console.log('WS open — starting live audit v2\n');

    // Helper: go to known-good page first (Home), wait, then navigate
    function gotoHome(cb){ click(140,130,()=>wait(1500,cb)); }

    // Helper: go to Apps Hub via Projects sidebar item
    function gotoAppsHub(cb){
      click(140,205,()=>wait(2000,cb));
    }

    seq([

      // ── 0. Baseline: what screen are we on?
      cb=>ss('00-baseline',cb),
      cb=>body(t=>{console.log('Baseline screen:',t.slice(0,200));cb();}),

      // ── 1. HOME
      cb=>{console.log('\n═══ HOME ═══');cb();},
      cb=>gotoHome(cb),
      cb=>ss('01-home',cb),
      cb=>body(t=>{console.log(t.slice(0,300));cb();}),

      // ── 2. COMPANION STUDIO
      cb=>{console.log('\n═══ COMPANION STUDIO ═══');cb();},
      cb=>click(140,167,cb),
      cb=>wait(2000,cb),
      cb=>ss('02-companion-studio',cb),
      cb=>body(t=>{console.log(t.slice(0,300));cb();}),
      // Click "Enable companion" button
      cb=>{console.log('  → clicking Enable companion button');cb();},
      cb=>click(843,342,cb),  // button is lower in companion studio
      cb=>wait(3000,cb),
      cb=>ss('02b-companion-after-enable',cb),
      cb=>body(t=>{console.log('  After enable:',t.slice(0,300));cb();}),
      // Gallery tab (x≈505, y≈434 in companion studio)
      cb=>click(505,434,cb),
      cb=>wait(1500,cb),
      cb=>ss('02c-companion-gallery',cb),
      cb=>body(t=>{console.log('  Gallery:',t.slice(0,200));cb();}),

      // ── 3. APPS HUB
      cb=>{console.log('\n═══ APPS HUB ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>ss('03-apps-hub',cb),
      cb=>body(t=>{console.log(t.slice(0,300));cb();}),

      // ── 4. DEVELOPMENT WORKSPACE
      cb=>{console.log('\n═══ DEVELOPMENT ═══');cb();},
      // tile position in Apps Hub: first screenshot confirms grid
      // Row 1: y≈120 center. Col 1 x≈490, Col 2 x≈840, Col 3 x≈1190
      // But coordinates relative to the CURRENT page — need to be on apps hub
      cb=>gotoAppsHub(cb),
      cb=>ss('04a-apps-hub-pre-dev',cb),
      cb=>body(t=>{console.log('  Pre-dev hub:',t.slice(0,150));cb();}),
      // Now click Development tile
      cb=>click(490,120,cb),
      cb=>wait(3000,cb),
      cb=>ss('04b-dev-workspace',cb),
      cb=>body(t=>{console.log('  Dev workspace:',t.slice(0,400));cb();}),
      cb=>scroll(840,420,400,cb),
      cb=>wait(800,cb),
      cb=>ss('04c-dev-scrolled',cb),

      // ── 5. RESEARCH WORKSPACE
      cb=>{console.log('\n═══ RESEARCH ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(840,120,cb),
      cb=>wait(3000,cb),
      cb=>ss('05-research-workspace',cb),
      cb=>body(t=>{console.log('  Research:',t.slice(0,400));cb();}),

      // ── 6. COMMUNICATION WORKSPACE
      cb=>{console.log('\n═══ COMMUNICATION ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(1190,120,cb),
      cb=>wait(3000,cb),
      cb=>ss('06-communication-workspace',cb),
      cb=>body(t=>{console.log('  Communication:',t.slice(0,400));cb();}),

      // ── 7. OFFICE WORKSPACE
      cb=>{console.log('\n═══ OFFICE ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(490,295,cb),
      cb=>wait(3000,cb),
      cb=>ss('07-office-workspace',cb),
      cb=>body(t=>{console.log('  Office:',t.slice(0,400));cb();}),

      // ── 8. CLOUD WORKSPACE
      cb=>{console.log('\n═══ CLOUD ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(840,295,cb),
      cb=>wait(3000,cb),
      cb=>ss('08-cloud-workspace',cb),
      cb=>body(t=>{console.log('  Cloud:',t.slice(0,400));cb();}),

      // ── 9. FILES WORKSPACE
      cb=>{console.log('\n═══ FILES ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>click(1190,295,cb),
      cb=>wait(3000,cb),
      cb=>ss('09-files-workspace',cb),
      cb=>body(t=>{console.log('  Files:',t.slice(0,400));cb();}),

      // ── 10. ANALYTICS
      cb=>{console.log('\n═══ ANALYTICS ═══');cb();},
      cb=>click(140,280,cb),
      cb=>wait(2000,cb),
      cb=>ss('10-analytics',cb),
      cb=>body(t=>{console.log('  Analytics:',t.slice(0,300));cb();}),

      // ── 11. WORKING HISTORY
      cb=>{console.log('\n═══ WORKING HISTORY ═══');cb();},
      cb=>click(140,343,cb),
      cb=>wait(2000,cb),
      cb=>ss('11-working-history',cb),
      cb=>body(t=>{console.log('  Working History:',t.slice(0,300));cb();}),

      // ── 12. ACCOUNT / SETTINGS DISCOVERY
      cb=>{console.log('\n═══ ACCOUNT / SETTINGS ═══');cb();},
      // click T avatar at bottom left
      cb=>click(40,810,cb),
      cb=>wait(1500,cb),
      cb=>ss('12a-avatar-click',cb),
      cb=>body(t=>{console.log('  Avatar click:',t.slice(0,300));cb();}),
      // try right-clicking
      cb=>send('Input.dispatchMouseEvent',{type:'mousePressed',x:140,y:810,button:'right',clickCount:1},cb),
      cb=>wait(500,cb),
      cb=>send('Input.dispatchMouseEvent',{type:'mouseReleased',x:140,y:810,button:'right',clickCount:1},cb),
      cb=>wait(1000,cb),
      cb=>ss('12b-avatar-rightclick',cb),

      // ── 13. HOME → TRY TO ENABLE COMPANION properly
      cb=>{console.log('\n═══ HOME + ENABLE COMPANION ═══');cb();},
      cb=>gotoHome(cb),
      cb=>ss('13a-home-fresh',cb),
      cb=>body(t=>{console.log('  Home:',t.slice(0,200));cb();}),
      // Click enable companion button (white pill button in the center card)
      cb=>click(843,278,cb),
      cb=>wait(4000,cb),
      cb=>ss('13b-companion-modal',cb),
      cb=>body(t=>{console.log('  After enable click:',t.slice(0,400));cb();}),
      cb=>wait(2000,cb),
      cb=>ss('13c-companion-state2',cb),
      cb=>key('Escape',cb),
      cb=>wait(500,cb),

      // ── 14. PLAN & RUNTIMES click from home stats bar
      cb=>{console.log('\n═══ PLAN & RUNTIMES ═══');cb();},
      cb=>gotoHome(cb),
      cb=>click(703,383,cb),  // Plan & Runtimes stats bar item
      cb=>wait(2000,cb),
      cb=>ss('14-plan-runtimes',cb),
      cb=>body(t=>{console.log('  Plan:',t.slice(0,300));cb();}),

      // ── 15. PROJECTS DETAIL → click "View recent" from stats bar
      cb=>gotoHome(cb),
      cb=>click(1157,383,cb),  // Projects: View recent
      cb=>wait(2000,cb),
      cb=>ss('15-projects-view-recent',cb),
      cb=>body(t=>{console.log('  Projects:',t.slice(0,300));cb();}),

      // ── 16. SEARCH
      cb=>{console.log('\n═══ SEARCH ═══');cb();},
      cb=>gotoHome(cb),
      cb=>click(148,87,cb),   // Search button in sidebar header
      cb=>wait(800,cb),
      cb=>ss('16a-search-open',cb),
      // Type something
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'d'},cb),
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'e'},cb),
      cb=>send('Input.dispatchKeyEvent',{type:'char',text:'v'},cb),
      cb=>wait(800,cb),
      cb=>ss('16b-search-typed-dev',cb),
      cb=>body(t=>{console.log('  Search results:',t.slice(0,300));cb();}),
      cb=>key('Escape',cb),
      cb=>wait(500,cb),

      // ── 17. BACK button test
      cb=>{console.log('\n═══ BACK BUTTON ═══');cb();},
      cb=>gotoAppsHub(cb),
      cb=>ss('17a-in-apps-hub',cb),
      cb=>click(65,87,cb),  // Back button (← Back)
      cb=>wait(1500,cb),
      cb=>ss('17b-after-back',cb),
      cb=>body(t=>{console.log('  After back:',t.slice(0,200));cb();}),

    ], ()=>{
      const shots=fs.readdirSync(DIR).filter(f=>f.endsWith('.png'));
      console.log(`\n✅ Audit v2 complete — ${shots.length} screenshots in ${DIR}`);
      shots.forEach(s=>console.log(' ',s));
      ws.close();
      process.exit(0);
    });
  });
});
