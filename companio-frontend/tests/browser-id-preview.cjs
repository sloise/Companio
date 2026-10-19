// Run after npm run build. Uses local Chrome and mocked API responses; no real records change.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os'), {spawn} = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../dist');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const server = http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root)) {res.writeHead(403).end();return;}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');const ext=path.extname(file);res.setHeader('Content-Type',ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.png'?'image/png':'text/html');res.end(fs.readFileSync(file));});
let chrome,ws; let next=1; const pending=new Map();const writes=[],calls=[],errors=[];
const user=(role)=>({id:1,name:'Original Name',email:'mock@example.test',role});
let profile=null;let pdfPreview=false;let favoriteFailure=false;
const staff=Array.from({length:5},(_,i)=>({id:i+10,name:'Applicant '+i,email:'applicant'+i+'@example.test',created_at:new Date().toISOString(),role:i===4?'staff_rejected':'staff_pending',has_id:true,duplicates:[]}));
const stats={stats:{awaiting_foster:0,urgent_awaiting:0,pending_applications:0,pending_older_than_2_days:0,in_foster_care:0,due_back_this_week:0,adopted_this_month:0},stages:[],recent_applications:[],deadlines:[],overdue_placements:[]};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function cdp(method,params={}){const id=next++;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let i=0;i<80;i++){if(await evaluate("Boolean("+expression+")"))return;await sleep(100);}throw Error('Timed out: '+expression);}
async function click(text){await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==='+JSON.stringify(text)+').click()');await sleep(80);}
async function confirmAction() {
 await wait('document.querySelector(".confirm-box[open]")');
 const count = writes.length;
 await evaluate('(()=>{const b=document.querySelector(".confirm-box .confirm-actions button:last-child");if(b.disabled)throw new Error("Confirmation unexpectedly disabled");b.click();b.click();})()');
 await wait('!document.querySelector(".confirm-box[open]")');
 await sleep(200);
 assert.equal(writes.length,count+1,'Confirm must issue exactly one backend write');
}
async function cancelAction() {
 await wait('document.querySelector(".confirm-box[open]")');
 const count=writes.length;await evaluate('document.querySelector(".confirm-box .confirm-actions button:first-child").click()');await sleep(80);
 assert.equal(writes.length,count,'Cancel must not write');
 assert.equal(await evaluate('!!document.querySelector(".confirm-box[open]")'),false);
}
async function value(selector,value){await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');const proto=e.tagName==="SELECT"?HTMLSelectElement.prototype:e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(e,'+JSON.stringify(value)+');e.dispatchEvent(new Event(e.tagName==="SELECT"?"change":"input",{bubbles:true}));})()');await sleep(60);}
async function file(selector,names){await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');const d=new DataTransfer();'+JSON.stringify(names)+'.forEach(name=>d.items.add(new File([Uint8Array.from(atob("'+png.toString('base64')+'"),c=>c.charCodeAt(0))],name,{type:"image/png"})));e.files=d.files;e.dispatchEvent(new Event("change",{bubbles:true}));})()');await sleep(120);}
async function navigate(route,role){await cdp('Page.navigate',{url:'http://127.0.0.1:4177/login'});await wait('document.querySelector(".auth-page") || document.querySelector("main")');await evaluate('localStorage.clear();'+(role?'localStorage.setItem("token","mock");localStorage.setItem("user",'+JSON.stringify(JSON.stringify(user(role)))+');':''));await cdp('Page.navigate',{url:'http://127.0.0.1:4177'+route});await sleep(450);}
async function intercept(event){const request=event.request,u=new URL(request.url);calls.push(u.pathname);if(request.method==='OPTIONS'){await cdp('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:204,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'},{name:'Access-Control-Allow-Methods',value:'GET, POST, PATCH, PUT, DELETE, OPTIONS'}]});return;}
let body={},status=200,type='application/json';
if(request.method!=='GET')writes.push({path:u.pathname,method:request.method,body:request.postData});
if(favoriteFailure && u.pathname==='/api/favorites/1' && request.method!=='GET'){status=422;body={message:'Bookmark update failed'};}
else if(u.pathname.endsWith('/admin/counts'))body={staff_requests:4};
else if(u.pathname.endsWith('/admin/dashboard'))body=stats;
else if(u.pathname.endsWith('/admin/animals'))body=request.method==='GET'?[]:{message:'Saved',animal:{id:1}};
else if(/staff-requests\/\d+\/id$/.test(u.pathname)){body=pdfPreview?Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF'):png;type=pdfPreview?'application/pdf':'image/png';}
else if(u.pathname.endsWith('/staff-requests'))body=u.searchParams.has('recent')?staff.filter(p=>p.role==='staff_pending').slice(0,3):staff;
else if(/staff-requests\/\d+$/.test(u.pathname)){body={message:'Backend unavailable'};status=422;}
else if(u.pathname.endsWith('/admin/profiles/pending'))body=[{id:22,user:{name:'Screened Foster',email:'screened@example.test'},updated_at:new Date().toISOString(),phone:'09170000001',address:'12 Main Street',birth_date:'2000-01-01',emergency_name:'Caretaker Name',emergency_phone:'09170000002',hours_alone:0}];
else if(u.pathname.endsWith('/admin/applications'))body=[];
else if(u.pathname.endsWith('/profile'))body=profile;
else if(/matches\/\d+$/.test(u.pathname))body={id:1,name:'Test Rescue',species:'dog',age:'2 years',status:'Awaiting Foster',match:{score:100,eligible:true,checks:[]}};
else if(u.pathname.endsWith('/notifications'))body={unread:0,notifications:[]};
else if(u.pathname.endsWith('/my-limit'))body={active:0,pending:0,limit:1,remaining:1};
else if(u.pathname.endsWith('/favorites'))body=[];
await cdp('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:type},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Cache-Control',value:'no-store'}],body:Buffer.isBuffer(body)?body.toString('base64'):Buffer.from(JSON.stringify(body)).toString('base64')});}
(async()=>{await new Promise(r=>server.listen(4177,'127.0.0.1',r));const profileDir=fs.mkdtempSync(path.join(os.tmpdir(),'companio-browser-'));chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9335','--user-data-dir='+profileDir,'about:blank'],{windowsHide:true,stdio:'ignore'});
let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9335/json')).json();break;}catch{await sleep(100);}}assert(tabs,'Chrome must start');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}else if(m.method==='Fetch.requestPaused')intercept(m.params).catch(e=>errors.push(e.message));else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});

await navigate('/admin/staff-requests','super_admin');await wait('document.querySelector("tbody tr")');
const before=writes.length;
for(let i=0;i<3;i++){
 await click('View ID');await wait('document.querySelector("dialog[open] img")');
 assert.equal(await evaluate('document.querySelector(".id-preview .modal-close").textContent'),'');
 assert.equal(await evaluate('!!document.querySelector(".id-preview .modal-close svg path")'),true);
 await evaluate('document.querySelector(".id-preview .modal-close").click()');await wait('!document.querySelector(".id-preview[open]")');
 assert.equal(writes.length,before,'Closing the preview must not modify staff requests');
}
await click('View ID');await wait('document.querySelector("dialog[open] img")');
await cdp('Page.bringToFront');await evaluate('document.querySelector(".id-preview .modal-close").focus()');await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait('!document.querySelector(".id-preview[open]")');
assert.equal(writes.length,before);assert.equal(await evaluate('!!document.querySelector(".confirm-box[open]")'),false);
pdfPreview=true;await click('View ID');await wait('document.querySelector(".id-preview iframe")');assert(await evaluate('document.querySelector(".id-preview iframe").src.startsWith("blob:")'));assert.equal(await evaluate('!!document.querySelector(".id-preview a[download]")'),false);await evaluate('document.querySelector(".id-preview .modal-close").click()');await wait('!document.querySelector(".id-preview[open]")');assert.equal(writes.length,before);
assert.deepEqual(errors,[]);console.log('PASS ID preview: SVG X, repeated open/close, Escape, inline image, and no unrelated writes');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(ws){try{await cdp('Browser.close');}catch{}ws.close();}if(chrome)chrome.kill();server.close();});
