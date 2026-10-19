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

const animal={id:1,name:'Test Rescue',species:'dog',breed:'Beagle',sex:'Male',age:'Age Unknown',birth_date:null,estimated_age_years:null,estimated_age_months:null,health_status:'Records Unavailable',sterilization_status:'Unknown',vaccinations:[],status:'Awaiting Foster',apartment_ok:true,needs_yard:false,good_with_cats:true,good_with_dogs:true,kids_ok:'any',max_hours_alone:4,is_urgent:false};
const home={id:22,user:{name:'Original Name',email:'mock@example.test'},updated_at:new Date().toISOString(),phone:'09170000001',address:'12 Main Street',birth_date:'2000-01-01',emergency_name:'Caretaker Name',emergency_phone:'09170000002',housing_type:'house',yard:'fenced',has_cats:false,has_dogs:false,kids:'none',hours_alone:0,experience:'some',review_status:'Approved',next_edit_at:'2020-01-01'};
const makeApp=()=>({id:31,animal:{...animal},full_name:'Foster Person',phone:'09170000001',address:'12 Main Street',user:{email:'foster@example.test',volunteer_profile:home},status:'Pending',created_at:new Date().toISOString(),target_date:'2026-11-01',match_score:100,match:{score:100,eligible:true,checks:[]},verification_completed_at:new Date().toISOString(),screening:{interview_at:'2026-10-01T10:00:00Z',interview_type:'interview',appointment_status:'Confirmed',requires_cosigner:false},profile_snapshot:home});
const makePlacement=()=>({id:41,animal:{...animal},application:{full_name:'Foster Person',phone:'09170000001'},status:'Active',foster_request:'adopt',foster_start_date:'2026-10-01',expected_return_date:'2026-12-01'});
let animals=[{...animal}],app=makeApp(),placement=makePlacement(),myApps=[],reviews=[home],failNext=null;
async function intercept(event){const request=event.request,u=new URL(request.url),url=u.pathname;calls.push(url);
if(request.method==='OPTIONS'){await cdp('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:204,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'},{name:'Access-Control-Allow-Methods',value:'GET, POST, PATCH, PUT, DELETE, OPTIONS'}]});return;}
let body={},status=200;
const mutation=request.method!=='GET';
if(mutation){writes.push({path:url,method:request.method,body:request.postData});await sleep(180);}
const data=request.postData?.startsWith('{')?JSON.parse(request.postData):{};
if(mutation && failNext===url){failNext=null;status=422;body={message:'Simulated backend failure'};}
else if(url.endsWith('/admin/counts'))body={staff_requests:4};
else if(url.endsWith('/admin/dashboard'))body=stats;
else if(url.endsWith('/admin/animals')){if(mutation){animals.push({...animal,id:2,name:data.name});body={message:'Animal saved',animal:animals.at(-1)};}else body=animals;}
else if(/admin\/animals\/\d+$/.test(url)){if(request.method==='DELETE')animals=animals.filter(a=>a.id!==Number(url.split('/').at(-1)));else animals=animals.map(a=>a.id===1?{...a,...data}:a);body={message:'Animal updated'};}
else if(url.endsWith('/staff-requests'))body=staff;
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
else if(/matches\/\d+$/.test(url))body={...animal,match:{score:100,eligible:true,checks:[]}};
else if(url.endsWith('/notifications'))body={unread:0,notifications:[]};
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

await navigate('/admin/animals','admin');await wait('document.querySelector(".animal-post")');
await click('+ Add animal');await value('[name=name]','New Rescue');await evaluate('for(const n of ["apartment_ok","needs_yard","good_with_cats","good_with_dogs","kids_ok","max_hours_alone"])document.querySelector("input[name="+n+"]").click();document.querySelector("[name=care_rules_confirmed]").click()');
await exercise('Animal creation',()=>click('Add animal'),'/api/admin/animals');
await clickContains('Edit');await value('[name=name]','Updated Rescue');await evaluate('document.querySelector("[name=care_rules_confirmed]").click()');
await exercise('Animal update',()=>click('Save changes'),'/api/admin/animals/1');
await exercise('Animal deletion',()=>clickContains('Delete'),'/api/admin/animals/1');
for(const approving of [true,false]){staff[0].role='staff_pending';await navigate('/admin/staff-requests','super_admin');await wait('document.querySelector("tbody tr")');await exercise('Staff '+(approving?'approval':'rejection'),()=>click(approving?'Approve':'Reject'),'/api/admin/staff-requests/10',approving?null:'Identity could not be verified.');}
for(const approving of [true,false]){reviews=[home];app=makeApp();await navigate('/admin/applications','admin');await wait('document.querySelector("details summary")');await evaluate('document.querySelector("details").open=true');await exercise('Home screening '+(approving?'approval':'rejection'),()=>click(approving?'Approve screened profile':'Reject profile'),'/api/admin/profiles/22/review');}
for(const action of ['approve','reject','reopen','schedule','verify']){
 app=makeApp();reviews=[];if(action==='reopen')app.status='Rejected';if(action==='verify')app.verification_completed_at=null;
 await navigate('/admin/applications','admin');await wait('document.querySelector(".detail-head")');
 let open,url='/api/admin/applications/31';
 if(action==='approve')open=()=>click('Approve placement');
 if(action==='reject')open=()=>click('Reject');
 if(action==='reopen'){open=()=>clickContains('Reopen this request');url+='/reopen';}
 if(action==='schedule'){open=()=>click('Confirm appointment and notify');url+='/schedule';}
 if(action==='verify'){await evaluate('document.querySelectorAll(".check input[type=checkbox]").forEach(e=>e.click())');open=()=>click('Record completed verification');url+='/verify';}
 await exercise('Application '+action,open,url,action==='reject'?'The home cannot meet care needs.':null);
}
for(const action of ['return','adopt','keep']){placement=makePlacement();await navigate('/admin/placements','admin');await wait('document.querySelector(".placement-card")');await exercise('Placement '+action,async()=>{const text=action==='return'?'Return / reclaim':action==='adopt'?'Adopted':'Keep fostering';await evaluate('Array.from(document.querySelectorAll(".placement-card button")).find(b=>b.textContent.trim()==='+JSON.stringify(text)+').click()');await sleep(80);},'/api/admin/placements/41'+(action==='keep'?'/request':''));}
myApps=[makeApp()];await navigate('/applications','volunteer');await wait('document.querySelector(".application-card")');await exercise('Withdraw application',()=>click('Withdraw request'),'/api/my-applications/31/withdraw');
for(const type of ['adopt','return']){myApps=[{...makeApp(),status:'Approved',placement:{...makePlacement(),foster_request:null}}];await navigate('/applications','volunteer');await wait('document.querySelector(".foster-panel")');await clickContains(type==='adopt'?"like to adopt":"need to return");await exercise('Volunteer '+type+' request',()=>click(type==='adopt'?'Send adoption request':'Send return request'),'/api/my-placements/41/request');await wait('Array.from(document.querySelectorAll("button")).some(b=>b.textContent.trim()==="Cancel request")');await exercise('Cancel volunteer '+type+' request',()=>click('Cancel request'),'/api/my-placements/41/request');}
profile={...home};await navigate('/questionnaire','volunteer');await wait('document.querySelector("[name=name]")');await value('[name=name]','Updated Foster Name');await exercise('Home profile update',()=>click('Save for shelter screening'),'/api/profile');
profile=null;await navigate('/questionnaire','volunteer');await wait('document.querySelector("[name=phone]")');for(const [name,val] of Object.entries({phone:'09170000001',address:'12 Main Street',birth_date:'2000-01-01',emergency_name:'Caretaker Name',emergency_phone:'09170000002'}))await value('[name='+name+']',val);await evaluate('for(const n of ["housing_type","yard","kids","hours_alone","experience"])document.querySelector("input[name="+n+"]").click()');await exercise('Initial home profile',()=>click('Save for shelter screening'),'/api/profile');
await navigate('/profile','volunteer');await wait('document.querySelector("input[type=file]")');await file('input[type=file]',['portrait.png']);await exercise('Save profile photo',()=>click('Save profile picture'),'/api/profile/photo');await exercise('Remove saved profile photo',()=>click('Remove profile picture'),'/api/profile/photo');
profile={...home};await navigate('/matches/1','volunteer');await wait('document.querySelectorAll("input[type=file]").length===2');await file('input[type=file]',['id.png']);await file('input[multiple]',['room1.png','room2.png']);await value('[name=interview_at]','2026-11-20T10:00');await value('[name=target_date]','2026-12-01');await evaluate('document.querySelector("[name=agreed]").click()');await exercise('Foster application submission',()=>click('Send foster request'),'/api/applications');
await navigate('/login',null);await click('Create an account');await evaluate('document.querySelector("input[value=shelter]").click()');for(const [name,val] of Object.entries({first_name:'Shelter',last_name:'Applicant',email:'new@example.test',password:'password123'}))await value('[name='+name+']',val);await file('input[type=file]',['id.png']);await exercise('Shelter account registration',()=>click('Request shelter account'),'/api/register');
profile=null;await navigate('/login',null);await click('Create an account');for(const [name,val] of Object.entries({first_name:'Foster',last_name:'Applicant',email:'foster-new@example.test',password:'password123'}))await value('[name='+name+']',val);await exercise('Foster account registration',()=>click('Create account & start questionnaire'),'/api/register');
await navigate('/reset-password?token=mock&email=mock@example.test',null);await wait('document.querySelector("[name=password]")');await value('[name=password]','newpassword123');await value('[name=password_confirmation]','newpassword123');await exercise('Password reset',()=>clickContains('Save new password'),'/api/reset-password');
assert.deepEqual(errors,[]);console.log('All important-action confirmation checks passed; no real records changed.');
})().catch(async e=>{console.error(e);try{console.error(await evaluate('document.body.innerText'));}catch{}process.exitCode=1;}).finally(async()=>{if(ws){try{await cdp('Browser.close');}catch{}ws.close();}if(chrome)chrome.kill();server.close();});
