// Run after npm run build. Uses local Chrome and mocked API responses; no real records change.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os'), {spawn} = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../dist');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const server = http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root)) {res.writeHead(403).end();return;}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');const ext=path.extname(file);res.setHeader('Content-Type',ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.png'?'image/png':'text/html');res.end(fs.readFileSync(file));});
let chrome,ws; let next=1; const pending=new Map();const writes=[],calls=[],errors=[];
const user=(role)=>({id:1,name:'Original Name',email:'mock@example.test',role});
let profile=null;
const staff=Array.from({length:5},(_,i)=>({id:i+10,name:'Applicant '+i,email:'applicant'+i+'@example.test',created_at:new Date().toISOString(),role:i===4?'staff_rejected':'staff_pending',has_id:true,duplicates:[]}));
const stats={stats:{awaiting_foster:0,urgent_awaiting:0,pending_applications:0,pending_older_than_2_days:0,in_foster_care:0,due_back_this_week:0,adopted_this_month:0},stages:[],recent_applications:[],deadlines:[],overdue_placements:[]};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function cdp(method,params={}){const id=next++;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let i=0;i<160;i++){if(await evaluate("Boolean("+expression+")"))return;await sleep(100);}throw Error('Timed out: '+expression);}
async function click(text){await evaluate('Array.from(document.querySelectorAll("button")).find(b=>(b.textContent.trim()==='+JSON.stringify(text)+'||b.getAttribute("aria-label")==='+JSON.stringify(text)+')).click()');await sleep(80);}
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

const animal={id:1,name:'Test Rescue',species:'dog',breed:'Beagle',sex:'Male',age:'Age Unknown',birth_date:null,estimated_age_years:null,estimated_age_months:null,health_status:'Records Unavailable',sterilization_status:'Unknown',vaccinations:[],status:'Awaiting Foster',apartment_ok:true,needs_yard:false,good_with_cats:true,good_with_dogs:true,kids_ok:'any',max_hours_alone:4,is_urgent:false};
const home={id:22,user:{name:'Original Name',email:'mock@example.test'},updated_at:new Date().toISOString(),phone:'09170000001',address:'12 Main Street',birth_date:'2000-01-01',emergency_name:'Caretaker Name',emergency_phone:'09170000002',housing_type:'house',yard:'fenced',has_cats:false,has_dogs:false,kids:'none',hours_alone:0,experience:'some',review_status:'Approved',next_edit_at:'2020-01-01'};
const makeApp=()=>({id:31,animal:{...animal},full_name:'Foster Person',phone:'09170000001',address:'12 Main Street',user:{email:'foster@example.test',volunteer_profile:home},status:'Pending',created_at:new Date().toISOString(),target_date:'2026-11-01',match_score:100,match:{score:100,eligible:true,checks:[]},verification_completed_at:new Date().toISOString(),screening:{interview_at:'2026-10-01T10:00:00Z',interview_type:'interview',appointment_status:'Confirmed',requires_cosigner:false},profile_snapshot:home});
const makePlacement=()=>({id:41,animal:{...animal},application:{full_name:'Foster Person',phone:'09170000001'},status:'Active',foster_request:'adopt',foster_start_date:'2026-10-01',expected_return_date:'2026-12-01'});
let animals=[{...animal}],app=makeApp(),placement=makePlacement(),myApps=[],reviews=[home],failNext=null;
let slowPath=null;
let chatEmpty=false,chatEnded=false,chatUnread=1,systemRead=false;
const chatPeople=[{id:1,name:'Original Name',pivot:{last_read_message_id:0}},{id:2,name:'Shelter Care Team',pivot:{last_read_message_id:999}}];
const chatMessages=[{id:10,sender_id:2,sender:chatPeople[1],body:'How is Milo settling in?',category:'adjustment',has_photo:false,created_at:new Date().toISOString()}];
async function intercept(event){const request=event.request,u=new URL(request.url),url=u.pathname;calls.push(url);
if(request.method==='OPTIONS'){await cdp('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:204,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'},{name:'Access-Control-Allow-Methods',value:'GET, POST, PATCH, PUT, DELETE, OPTIONS'}]});return;}
let body={},status=200;
const mutation=request.method!=='GET';
if(!mutation && url===slowPath)await sleep(1500);
if(mutation){writes.push({path:url,method:request.method,body:request.postData});await sleep(180);}
const data=request.postData?.startsWith('{')?JSON.parse(request.postData):{};
if(mutation && failNext===url){failNext=null;status=422;body={message:'Simulated backend failure'};}
else if(url.endsWith('/conversations'))body={unread:chatUnread,placements:chatEnded?[]:[{id:41,name:'Milo',foster_name:'Original Name',status:'Active'}],conversations:chatEmpty?[]:[{id:7,placement_id:41,pet:{id:1,name:'Milo'},status:chatEnded?'Returned':'Active',can_send:!chatEnded,participants:chatPeople,unread:chatUnread,latest:chatMessages.at(-1)}]};
else if(url.endsWith('/placements/41/conversation'))body={id:7};
else if(url.endsWith('/conversations/7/read')){chatUnread=0;body={message:'Read'};}
else if(url.endsWith('/conversations/7/messages')){const m={id:11,sender_id:'1',sender:chatPeople[0],body:'Milo ate breakfast',category:'feeding',has_photo:false,created_at:new Date().toISOString()};chatMessages.push(m);body=m;status=201;}
else if(url.endsWith('/conversations/7'))body={messages:chatMessages,participants:chatPeople,has_more:false};
else if(url.endsWith('/admin/counts'))body={staff_requests:4};
else if(url.endsWith('/admin/dashboard'))body=stats;
else if(url.endsWith('/admin/animals')){if(mutation){animals.push({...animal,id:2,name:data.name});body={message:'Animal saved',animal:animals.at(-1)};}else body=animals;}
else if(/admin\/animals\/\d+$/.test(url)){if(request.method==='DELETE')animals=animals.filter(a=>a.id!==Number(url.split('/').at(-1)));else animals=animals.map(a=>a.id===1?{...a,...data}:a);body={message:'Animal updated'};}
else if(url.endsWith('/staff-requests'))body=u.searchParams.has('recent')?staff.filter(p=>p.role==='staff_pending').slice(0,3):staff;
else if(/staff-requests\/\d+$/.test(url)){const person=staff.find(p=>p.id===Number(url.split('/').at(-1)));person.role=request.method==='DELETE'?'staff_rejected':'admin';body={message:'Staff decision saved'};}
else if(url.endsWith('/admin/profiles/pending'))body=reviews;
else if(/admin\/profiles\/\d+\/review$/.test(url)){reviews=[];body={message:'Screening saved'};}
else if(url.endsWith('/admin/applications'))body=[app];
else if(/admin\/applications\/\d+\/reopen$/.test(url)){app.status='Pending';body={message:'Reopened'};}
else if(/admin\/applications\/\d+\/schedule$/.test(url)){app.screening={...app.screening,...data};body={message:'Scheduled'};}
else if(/admin\/applications\/\d+\/verify$/.test(url)){app.verification_completed_at=new Date().toISOString();body={message:'Verified'};}
else if(/admin\/applications\/\d+$/.test(url)){app.status=data.status;body={message:'Decision saved'};}
else if(url.endsWith('/admin/placements'))body=[placement];
else if(/admin\/placements\/\d+\/request$/.test(url)){placement.foster_request=null;body={message:'Request answered'};}
else if(/admin\/placements\/\d+$/.test(url)){placement.status=data.status;body={message:'Placement saved'};}
else if(url.endsWith('/my-applications'))body=myApps;
else if(/my-applications\/\d+\/withdraw$/.test(url)){myApps[0].status='Withdrawn';body={message:'Withdrawn'};}
else if(/my-placements\/\d+\/request$/.test(url)){myApps[0].placement.foster_request=request.method==='DELETE'?null:data.type;body={message:'Request saved'};}
else if(url.endsWith('/profile/photo'))body={message:'Photo saved',user:{...user('volunteer'),photo_url:request.method==='DELETE'?null:'data:image/png;base64,'+png.toString('base64')}};
else if(url.endsWith('/profile')){if(mutation){profile={...home,...data};body={message:'Profile saved',user:{...user('volunteer'),name:data.name},profile};}else body=profile;}
else if(url.endsWith('/matches'))body=[{...animal,match:{score:100,eligible:true,checks:[]}}];
else if(/matches\/\d+$/.test(url))body={...animal,match:{score:100,eligible:true,checks:[]}};
else if(url.endsWith('/notifications/8/read')||url.endsWith('/notifications/read')){systemRead=true;body={message:'Read'};}
else if(url.endsWith('/notifications'))body={unread:systemRead?0:1,has_more:false,notifications:[{id:8,message:'Your foster application was approved',link:'/applications',read_at:systemRead?new Date().toISOString():null,created_at:new Date().toISOString()}]};
else if(url.endsWith('/my-limit'))body={active:0,pending:0,limit:2,remaining:2,reasons:[]};
else if(url.endsWith('/favorites'))body=[];
else if(url.endsWith('/applications')){myApps=[makeApp()];body={message:'Application submitted'};}
else if(url.endsWith('/register'))body=data.account_type==='shelter'?{pending:true,message:'Account pending'}:{token:'mock',user:user('volunteer')};
else if(url.endsWith('/reset-password'))body={message:'Password reset'};
await cdp('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Cache-Control',value:'no-store'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});}
async function clickContains(text){await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes('+JSON.stringify(text)+')).click()');await sleep(80);}
async function cancelCheck(open){await open();await cancelAction();}
async function reason(text){if(text)await value('.confirm-box textarea',text);}
async function exercise(label,open,url,why){
 await cancelCheck(open);
 await open();await reason(why);failNext=url;await confirmAction();
 assert(await evaluate('Array.from(document.querySelectorAll(".toast-error")).some(e=>e.textContent.includes("Simulated backend failure"))'),label+' must show backend errors');
 await open();await reason(why);await confirmAction();
 assert.equal(failNext,null);console.log('PASS '+label+': Cancel, backend failure, success and duplicate-click guard');
}
(async()=>{await new Promise(r=>server.listen(4177,'127.0.0.1',r));const profileDir=fs.mkdtempSync(path.join(os.tmpdir(),'companio-browser-'));chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9335','--user-data-dir='+profileDir,'about:blank'],{windowsHide:true,stdio:'ignore'});
let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9335/json')).json();break;}catch{await sleep(100);}}assert(tabs,'Chrome must start');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}else if(m.method==='Fetch.requestPaused')intercept(m.params).catch(e=>errors.push(e.message));else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});


const artifactDir=path.resolve(__dirname,'artifacts');fs.mkdirSync(artifactDir,{recursive:true});
Object.assign(stats.stats,{awaiting_foster:14,urgent_awaiting:3,pending_applications:8,pending_older_than_2_days:2,in_foster_care:12,due_back_this_week:3,adopted_this_month:5});stats.stages=['Awaiting Foster','Under Review','In Foster Care','Adopted'].map((name,i)=>({name,count:i+3,animals:[{...animal,status:name}]}));
profile={...home};myApps=[makeApp(),{...makeApp(),id:32,status:'Approved',placement:makePlacement()}];
async function viewport(width,height=900){await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});}
async function screenshot(name){await sleep(180);const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifactDir,name+'.png'),Buffer.from(shot.data,'base64'));}
async function inspect(route,role,width,name){
 await viewport(width,width<500?844:950);await navigate(route,role);await sleep(500);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,route+' must fit '+width+'px');
 assert.equal(await evaluate('Array.from(document.querySelectorAll("button:not([aria-label])")).some(b=>!b.textContent.trim()&&!b.querySelector("svg title"))'),false,'Icon-only buttons need accessible names');
 assert.equal(await evaluate('/\\p{Extended_Pictographic}/u.test(document.body.innerText)'),false,'Interface must not contain emoji');
 if(role)assert(await evaluate('!!document.querySelector("a.skip-link")'));
 await screenshot(name);console.log('PASS responsive '+route+' at '+width+'px');
}

for(const [role,route] of [['volunteer','/messages/7'],['admin','/admin/messages/7']]){
 for(const width of [1440,390,320]){
  await inspect(route,role,width,`messages-${role}-${width}`);
  await wait('document.querySelector(".chat-message")');
  assert(await evaluate('document.querySelector(".chat-heading").textContent.includes("Milo")'));
  assert(await evaluate('document.querySelector(".update-label").textContent.includes("adjustment")'));
  assert(await evaluate('document.querySelector(".chat-compose textarea").getBoundingClientRect().right <= innerWidth'));
 }
}
await navigate('/admin/messages','admin');await wait('document.querySelector(".conversation-list select")');
assert.equal(await evaluate('!!document.querySelector(".chat-compose form")'),false);
await value('[aria-label="Choose foster arrangement"]','41');await wait('location.pathname==="/admin/messages/7"');
assert(writes.some(w=>w.path==='/api/placements/41/conversation'));
await navigate('/messages/7','volunteer');assert.equal(await evaluate('!!document.querySelector(".conversation-list select")'),false);await wait('document.querySelector(".chat-compose textarea")');
await value('.chat-compose textarea','Milo ate breakfast');await value('.chat-compose select','feeding');await click('Send');
await wait('document.querySelector(".outgoing")');
assert(await evaluate(`(()=>{const row=document.querySelector('.outgoing'),bubble=row.querySelector('.chat-bubble'),avatar=row.querySelector('.chat-avatar');const r=row.getBoundingClientRect(),b=bubble.getBoundingClientRect(),a=avatar.getBoundingClientRect();return a.width===30&&Math.abs(a.right-r.right)<2&&a.left-b.right<12&&b.left>r.left+10;})()`),'Own messages must align right with compact avatars, including string sender IDs');
assert(await evaluate('document.querySelector(".outgoing .chat-sender").textContent.includes("Original Name")'),'Show full sender names');
await screenshot('messages-outgoing-mobile');
for(const width of [1440,390,320]){
 await viewport(width);await sleep(100);
 assert(await evaluate(`(()=>{const r=document.querySelector('.outgoing').getBoundingClientRect(),a=document.querySelector('.outgoing .chat-avatar').getBoundingClientRect(),incoming=document.querySelector('.incoming'),b=incoming.querySelector('.chat-bubble').getBoundingClientRect(),ia=incoming.querySelector('.chat-avatar').getBoundingClientRect();return Math.abs(a.right-r.right)<2&&ia.width===30&&b.left-ia.right<12;})()`),'Message alignment and avatar spacing at '+width+'px');
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
}

assert(await evaluate('document.querySelector(".outgoing").textContent.includes("Milo ate breakfast")'));
assert.equal(await evaluate('document.querySelector(".chat-compose textarea").value'),'');
await value('.chat-compose textarea','Keep this draft');failNext='/api/conversations/7/messages';await click('Send');
await wait('document.querySelector(".chat-error")');assert.equal(await evaluate('document.querySelector(".chat-compose textarea").value'),'Keep this draft');
await navigate('/messages','volunteer');await wait('document.querySelector(".system-update")');
assert.equal(await evaluate('!!document.querySelector("[aria-controls=notifications-panel]")'),false,'The separate bell is removed');
assert(await evaluate('document.querySelector(".system-update-unread").textContent.includes("approved")'));
assert.equal(writes.filter(w=>w.path==='/api/notifications/read').length,0,'Opening Messages must not mark every update read');
await evaluate('document.querySelector(".system-update").click()');await wait('location.pathname==="/applications"');
assert(writes.some(w=>w.path==='/api/notifications/8/read'));
await navigate('/messages','volunteer');await wait('document.querySelector(".system-update")');
assert.equal(await evaluate('!!document.querySelector(".system-update-unread")'),false,'Read state survives returning to the inbox');
systemRead=false;await navigate('/messages','volunteer');await wait('document.querySelector(".system-update-unread")');
await click('Mark updates as read');await wait('!document.querySelector(".system-update-unread")');
assert(writes.some(w=>w.path==='/api/notifications/read'));
// An automatic update arrives while the inbox is open: polling must reveal it without navigation.
systemRead=false;await wait('document.querySelector(".system-update-unread")');
await wait('document.querySelector(".message-link").getAttribute("aria-label")==='+JSON.stringify(`Messages, ${chatUnread+1} unread`));
chatEnded=true;await inspect('/messages/7','volunteer',390,'messages-ended');assert.equal(await evaluate('!!document.querySelector(".chat-compose textarea")'),false);
chatEmpty=true;await inspect('/messages','volunteer',390,'messages-empty');assert(await evaluate('document.body.textContent.includes("Companio updates")'));
assert.deepEqual(errors,[]);console.log('PASS unified inbox: automatic update polling, combined badge, update routing and read persistence; messaging: desktop/mobile layouts, pet context, sending, failure draft preservation, notification routing, ended and empty states');
})().catch(async e=>{console.error(e);try{console.error(await evaluate('document.body.innerText'));}catch{}process.exitCode=1;}).finally(async()=>{if(ws){try{await cdp('Browser.close');}catch{}ws.close();}if(chrome)chrome.kill();server.close();});
