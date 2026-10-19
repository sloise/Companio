// Run after npm run build. Uses local Chrome and mocked API responses; no real records change.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os'), {spawn} = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../dist');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const server = http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root)) {res.writeHead(403).end();return;}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');const ext=path.extname(file);res.setHeader('Content-Type',ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.png'?'image/png':'text/html');res.end(fs.readFileSync(file));});
let chrome,ws; let next=1; const pending=new Map();const writes=[],calls=[],errors=[];
const user=(role)=>({id:1,name:'Original Name',email:'mock@example.test',role});
let applicants=[];
let profile=null;let favoriteFailure=false;
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
else if(/staff-requests\/\d+\/id$/.test(u.pathname)){body=png;type='image/png';}
else if(u.pathname.endsWith('/staff-requests'))body=u.searchParams.has('recent')?staff.filter(p=>p.role==='staff_pending').slice(0,3):staff;
else if(/staff-requests\/\d+$/.test(u.pathname)){body={message:'Backend unavailable'};status=422;}
else if(u.pathname.endsWith('/admin/profiles/pending'))body=[{id:22,user:{name:'Screened Foster',email:'screened@example.test'},updated_at:new Date().toISOString(),phone:'09170000001',address:'12 Main Street',birth_date:'2000-01-01',emergency_name:'Caretaker Name',emergency_phone:'09170000002',hours_alone:0}];
else if(u.pathname.endsWith('/admin/applications'))body=applicants;
else if(u.pathname.endsWith('/privacy-notice'))body={ready:true,controller:'Test Shelter',contact:'privacy@example.test',retention:'Test retention policy',version:'2026-10-19'};
else if(/admin\/applications\/\d+\/schedule$/.test(u.pathname))body={message:'Appointment confirmed'};
else if(u.pathname.endsWith('/profile'))body=profile;
else if(/matches\/\d+$/.test(u.pathname))body={id:1,name:'Test Rescue',species:'dog',age:'2 years',status:'Awaiting Foster',match:{score:100,eligible:true,checks:[]}};
else if(u.pathname.endsWith('/notifications'))body={unread:0,notifications:[]};
else if(u.pathname.endsWith('/my-limit'))body={active:0,pending:0,limit:1,remaining:1};
else if(u.pathname.endsWith('/favorites'))body=[];
await cdp('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:type},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Cache-Control',value:'no-store'}],body:Buffer.isBuffer(body)?body.toString('base64'):Buffer.from(JSON.stringify(body)).toString('base64')});}
(async()=>{await new Promise(r=>server.listen(4177,'127.0.0.1',r));const profileDir=fs.mkdtempSync(path.join(os.tmpdir(),'companio-browser-'));chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9335','--user-data-dir='+profileDir,'about:blank'],{windowsHide:true,stdio:'ignore'});
let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9335/json')).json();break;}catch{await sleep(100);}}assert(tabs,'Chrome must start');ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}else if(m.method==='Fetch.requestPaused')intercept(m.params).catch(e=>errors.push(e.message));else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
await navigate('/login',null);await click('Create an account');await evaluate('document.querySelector("input[value=shelter]").click()');await wait('document.querySelector("input[type=file]")');assert.equal(await evaluate('!!document.querySelector("[name=shelter_name], [name=shelter_address]")'),false);await file('input[type=file]',['identity.png']);assert.equal(await evaluate('document.querySelector("input[type=file]").files.length'),1);await click('Remove file');assert.equal(await evaluate('document.querySelector("input[type=file]").files.length'),0);assert.equal(await evaluate('document.querySelectorAll(".file-selection img").length'),0);console.log('PASS registration ID removal clears file and preview; shelter fields removed');
await navigate('/questionnaire','volunteer');await wait('document.querySelector("[name=name]")');assert.equal(await evaluate('document.querySelector("[name=name]").value'),'Original Name');assert.equal(await evaluate('document.querySelector("[name=name]").readOnly'),true);
assert.equal(await evaluate('document.querySelector("[name=address]").placeholder'),'House No., Street, Barangay, City, Province');
assert.equal(await evaluate('document.querySelector("[name=emergency_name]").placeholder'),'Enter the full name of the person responsible for the animal.');await value('[name=phone]','abc123');assert.equal(await evaluate('document.querySelector("[name=phone]").checkValidity()'),false);await value('[name=phone]','+639170000001');assert.equal(await evaluate('document.querySelector("[name=phone]").checkValidity()'),true);await evaluate('Array.from(document.querySelectorAll("label.option")).find(e=>e.textContent.includes("Someone is always home")).click()');assert.equal(await evaluate('document.querySelector("[name=hours_alone]").checked'),true);console.log('PASS initial name lock, Philippine phone validity, None selection');
profile={id:2,name:'Original Name',phone:'09170000001',hours_alone:0,last_edited_at:'2020-01-01',next_edit_at:'2020-01-08'};await navigate('/questionnaire','volunteer');assert.equal(await evaluate('document.querySelector("[name=name]").readOnly'),false);await value('[name=name]','Updated Name');assert.equal(await evaluate('document.querySelector("[name=name]").value'),'Updated Name');await navigate('/profile','volunteer');await wait('document.querySelector("input[type=file]")');await file('input[type=file]',['portrait.png']);assert(await evaluate('Array.from(document.querySelectorAll("button")).some(e=>e.textContent.includes("Save profile picture"))'));const before=writes.length;await click('Remove file');assert.equal(writes.length,before);assert.equal(await evaluate('document.querySelector("input[type=file]").files.length'),0);console.log('PASS normal name editing and staged profile picture removal without upload');
await navigate('/admin','admin');await wait('document.querySelector(".stat-grid")');assert.equal(await evaluate('Array.from(document.querySelectorAll("a")).some(a=>a.pathname==="/admin/staff-requests")'),false);assert.equal(await evaluate('document.body.textContent.includes("staff requests waiting")'),false);await navigate('/admin/staff-requests','admin');await wait('location.pathname==="/admin"');console.log('PASS regular Admin has no staff navigation or review page');
await navigate('/admin','super_admin');await wait('document.querySelector("#recent-staff-title") && document.querySelectorAll("tbody tr").length>=3');assert.equal(await evaluate('document.querySelector("#recent-staff-title").closest("section").querySelectorAll("tbody tr").length'),3);await navigate('/admin/staff-requests','super_admin');await wait('document.querySelectorAll("tbody tr").length===5');await click('View ID');await wait('document.querySelector("dialog[open] img")');await value('[aria-label="ID zoom"]','200');assert.equal(await evaluate('document.querySelector("dialog img").style.width'),'200%');await click('Close');const unchanged=writes.length;await click('Approve');await wait('document.querySelector(".confirm-box[open]")');await click('Cancel');assert.equal(writes.length,unchanged);await click('Reject');await wait('document.querySelector(".confirm-box[open] textarea")');assert.equal(await evaluate('Array.from(document.querySelectorAll(".confirm-box button")).find(e=>e.textContent.trim()==="Confirm Rejection").disabled'),true);await value('.confirm-box textarea','Unable to verify identity');await click('Confirm Rejection');await wait('document.querySelector(".toast-error")');assert.equal(await evaluate('document.querySelector("tbody tr td:nth-child(2)").textContent'),'Pending');console.log('PASS Super Admin summary/full queue, inline ID zoom, Cancel, reason requirement, backend failure preserves pending status');
await navigate('/admin/animals','admin');await wait('document.body.textContent.includes("No animals found")');await click('+ Add animal');await value('#animal-breed','Mixed breed');await value('[name=breed]','Bea');assert(await evaluate('!!document.querySelector("input[name=breed][list=breed-suggestions]")'));assert(await evaluate('Array.from(document.querySelectorAll("#breed-suggestions option")).some(e=>e.value==="Beagle")'));await value('[name=birth_date]','2025-02-18');assert(await evaluate('document.querySelector("[name=birth_date]").nextElementSibling.textContent.includes("month")'));await value('[name=health_status]','Vaccinated');await evaluate('Array.from(document.querySelectorAll("label.check")).find(e=>e.textContent.trim()==="Anti-Rabies").querySelector("input").click()');await evaluate('Array.from(document.querySelectorAll("label.check")).find(e=>e.textContent.trim()==="5-in-1").querySelector("input").click()');assert.equal(await evaluate('document.querySelectorAll("input[type=date]").length'),5);await value('[name=species]','cat');assert.equal(await evaluate('document.body.textContent.includes("5-in-1")'),false);assert(await evaluate('document.body.textContent.includes("3-in-1 (FVRCP)")'));console.log('PASS mixed breed suggestions, calculated age, multiple vaccine selection, species-specific vaccines');
// Optional DOB, sex-specific statuses, unknown vaccine dates, and complete form submission.
await value('[name=sex]','Female');
assert.deepEqual(await evaluate('Array.from(document.querySelector("[name=sterilization_status]").options).map(o=>o.value)'),['Spayed','Not Yet Spayed','Unknown']);
await value('[name=sterilization_status]','Spayed');await value('[name=sex]','Male');
assert.equal(await evaluate('document.querySelector("[name=sterilization_status]").value'),'Unknown');
assert.deepEqual(await evaluate('Array.from(document.querySelector("[name=sterilization_status]").options).map(o=>o.value)'),['Neutered','Not Yet Neutered','Unknown']);
await value('[name=sterilization_status]','Not Yet Neutered');
await evaluate('document.querySelector("[name=birth_date_unknown]").click()');await sleep(80);
assert.equal(await evaluate('document.querySelector("[name=birth_date]").disabled'),true);
assert(await evaluate('document.body.textContent.includes("Age Unknown")'));
await value('[name=estimated_age_years]','1');await value('[name=estimated_age_months]','8');
assert(await evaluate('document.querySelector("[name=birth_date]").nextElementSibling.textContent==="1 year and 8 months"'));
await value('[name=health_status]','Vaccinated');
await evaluate('Array.from(document.querySelectorAll("label.check")).find(e=>e.textContent.trim()==="Anti-Rabies").querySelector("input").click()');await sleep(80);
assert.equal(await evaluate('Array.from(document.querySelectorAll("input")).find(e=>e.getAttribute("aria-label")==="Vaccination date for Anti-Rabies").disabled'),true);
await evaluate('Array.from(document.querySelectorAll("input")).find(e=>e.getAttribute("aria-label")==="Unknown vaccination date for Anti-Rabies").click()');await sleep(50);
await value('input[aria-label="Vaccination date for Anti-Rabies"]','2026-02-18');
await evaluate('Array.from(document.querySelectorAll("input")).find(e=>e.getAttribute("aria-label")==="Unknown vaccination date for Anti-Rabies").click()');await sleep(50);
assert.equal(await evaluate('Array.from(document.querySelectorAll("input")).find(e=>e.getAttribute("aria-label")==="Vaccination date for Anti-Rabies").value'),'');
await value('[name=name]','Estimated rescue');
await evaluate('for(const name of ["apartment_ok","needs_yard","good_with_cats","good_with_dogs","kids_ok","max_hours_alone"]) document.querySelector("input[name="+name+"]").click();document.querySelector("[name=care_rules_confirmed]").click()');await sleep(100);
assert.equal(await evaluate('document.querySelector(".modal-form").checkValidity()'),true);
await click('Add animal');await confirmAction();await wait('!document.querySelector("dialog[open]")');
let animalWrite=JSON.parse(writes.filter(w=>w.path.endsWith('/admin/animals')).at(-1).body);
assert.equal(animalWrite.birth_date,null);assert.equal(animalWrite.estimated_age_years,1);assert.equal(animalWrite.estimated_age_months,8);assert.equal(animalWrite.vaccinations[0].vaccinated_at,null);assert.equal(animalWrite.health_status,'Vaccinated');assert.equal(animalWrite.sterilization_status,'Not Yet Neutered');
await click('+ Add animal');await value('[name=name]','Unknown-age rescue');
await evaluate('for(const name of ["apartment_ok","needs_yard","good_with_cats","good_with_dogs","kids_ok","max_hours_alone"]) document.querySelector("input[name="+name+"]").click();document.querySelector("[name=care_rules_confirmed]").click()');await sleep(80);await click('Add animal');await confirmAction();await wait('!document.querySelector("dialog[open]")');
animalWrite=JSON.parse(writes.filter(w=>w.path.endsWith('/admin/animals')).at(-1).body);assert.equal(animalWrite.birth_date,null);assert.equal(animalWrite.estimated_age_years,null);assert.equal(animalWrite.estimated_age_months,null);assert.equal(animalWrite.health_status,'Records Unavailable');assert.deepEqual(animalWrite.vaccinations,[]);
console.log('PASS optional birth dates, estimated and unknown ages, sex/status resets, and unknown vaccination dates submit correctly');
await navigate('/admin/applications','admin');await wait('document.querySelector("details summary")');await evaluate('document.querySelector("details").open=true');
assert.equal(await evaluate('document.querySelector("details textarea")'),null);
await click('Approve screened profile');await confirmAction();
let reviewWrite=JSON.parse(writes.filter(w=>w.path.endsWith('/profiles/22/review')).at(-1).body);assert.equal(reviewWrite.findings_type,'none');assert.equal(reviewWrite.review_notes,null);
await evaluate('document.querySelector("details").open=true');await value('details select','comments');await value('details textarea','Additional safe-home findings.');await click('Approve screened profile');await confirmAction();
reviewWrite=JSON.parse(writes.filter(w=>w.path.endsWith('/profiles/22/review')).at(-1).body);assert.equal(reviewWrite.findings_type,'comments');assert.equal(reviewWrite.review_notes,'Additional safe-home findings.');
await value('details select','none');await click('Approve screened profile');await confirmAction();reviewWrite=JSON.parse(writes.filter(w=>w.path.endsWith('/profiles/22/review')).at(-1).body);assert.equal(reviewWrite.review_notes,null);
console.log('PASS screening None submits without comments, Comments submits text, switching back clears submitted notes');
profile={id:2,name:'Original Name',phone:'09170000001',address:'Test address',birth_date:'2010-01-01',emergency_name:'Guardian',emergency_phone:'09170000002',review_status:'Approved'};
await navigate('/matches/1','volunteer');await wait('document.querySelectorAll("input[type=file]").length===3');
await file('input[type=file]',['government.png']);await file('input[type=file][multiple]',['room-one.png','room-two.png','room-three.png']);
await evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.getAttribute("aria-label")==="Remove room-two.png").click()');await sleep(100);
assert.deepEqual(await evaluate('Array.from(document.querySelector("input[multiple]").files).map(f=>f.name)'),['room-one.png','room-three.png']);
assert.equal(await evaluate('Array.from(document.querySelectorAll(".file-selection img")).some(e=>e.alt.includes("room-two"))'),false);
await evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.getAttribute("aria-label")==="Remove government.png").click()');await sleep(100);assert.equal(await evaluate('document.querySelector("input[type=file]").files.length'),0);

// Find the co-signer input by its enclosing label instead of relying on child position.
await evaluate('(()=>{const e=Array.from(document.querySelectorAll("label")).find(e=>e.textContent.startsWith("Co-signer government-issued ID")).querySelector("input");const d=new DataTransfer();d.items.add(new File(["id"],"adult-id.pdf",{type:"application/pdf"}));e.files=d.files;e.dispatchEvent(new Event("change",{bubbles:true}));})()');await sleep(100);
await evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.getAttribute("aria-label")==="Remove adult-id.pdf").click()');await sleep(100);
assert.equal(await evaluate('Array.from(document.querySelectorAll("label")).find(e=>e.textContent.startsWith("Co-signer government-issued ID")).querySelector("input").files.length'),0);
console.log('PASS government ID, individual home-photo and co-signer ID removal clears native selections and previews');
await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.getAttribute("aria-label")==="Save Test Rescue").click()');await sleep(150);
assert.equal(await evaluate('!!document.querySelector(".confirm-box[open]")'),false);
await wait('Array.from(document.querySelectorAll("button")).some(b=>b.getAttribute("aria-label")==="Remove Test Rescue from saved pets")');
favoriteFailure=true;await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.getAttribute("aria-label")==="Remove Test Rescue from saved pets").click()');await sleep(200);
assert(await evaluate('Array.from(document.querySelectorAll("button")).some(b=>b.getAttribute("aria-label")==="Remove Test Rescue from saved pets")'));
console.log('PASS bookmarks remain prompt-free and preserve saved state after a failed backend update');

applicants = [
 {id:3,full_name:'Zara Newest',user:{name:'Zara Newest',email:'zara@example.test'},animal:{id:3,name:'Clover',species:'cat'},status:'Rejected',created_at:'2026-10-18T10:00:00Z',match_score:100,match:{checks:[]}},
 {id:1,full_name:'Alex Oldest',user:{name:'Alex Oldest',email:'alex@example.test',volunteer_profile:{review_status:'Approved'}},animal:{id:1,name:'Biscuit',species:'dog'},status:'Pending',created_at:'2026-10-01T10:00:00Z',match_score:100,match:{eligible:true,checks:[]},screening:{interview_type:'interview',interview_at:'2026-11-01T10:00:00Z'},profile_snapshot:{birth_date:'2000-01-01'}},
 {id:2,full_name:'Jamie Middle',user:{name:'Jamie Middle',email:'jamie@example.test'},animal:{id:2,name:'Mochi',species:'cat'},status:'Approved',created_at:'2026-10-10T10:00:00Z',match_score:100,match:{checks:[]}}
];
await navigate('/admin/applications','admin');await wait('document.querySelectorAll(".queue-item").length===3');
assert.equal(await evaluate('document.querySelector(".queue-text strong").textContent'),'Alex Oldest');
const requestCount=calls.filter(p=>p.endsWith('/admin/applications')).length;
const searchSelector='input[placeholder="Search applicant, email or pet"]';
await value(searchSelector,'CLOVER');assert.equal(await evaluate('document.querySelectorAll(".queue-item").length'),1);
await value(searchSelector,'JAMIE@');assert.equal(await evaluate('document.querySelector(".queue-text strong").textContent'),'Jamie Middle');
await value(searchSelector,'alex');await click('Pending');
await value('select[aria-label="Sort applicants"], .filters select','oldest');
assert.equal(calls.filter(p=>p.endsWith('/admin/applications')).length,requestCount,'Filtering stays local');
await click('Confirm appointment and notify');await confirmAction();
assert.equal(await evaluate('document.querySelector('+JSON.stringify(searchSelector)+').value'),'alex');
assert(await evaluate('document.querySelector(".seg-active").textContent.includes("Pending")'));
assert.equal(await evaluate('document.querySelector(".queue-text strong").textContent'),'Alex Oldest');
assert(calls.filter(p=>p.endsWith('/admin/applications')).length>requestCount,'The update reloads data');
await value(searchSelector,'nobody');assert(await evaluate('document.body.textContent.includes("No applicants match your search.")'));
await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Reset").click()');
await wait('document.querySelectorAll(".queue-item").length===3');
await value('select[aria-label="Sort applicants"]','newest');assert.equal(await evaluate('document.querySelector(".queue-text strong").textContent'),'Zara Newest');
await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),'Applicants page fits phone width');
console.log('PASS applicant search by name/email/pet, statuses, oldest/newest, empty/reset, preserved filters after scheduling, local filtering, and phone width');
const {animalAge}=await import('../src/utils/animal.js');
assert.equal(animalAge('2025-02-18',new Date(2026,9,18)),'1 year and 8 months');
assert.equal(animalAge('2026-10-18',new Date(2026,9,18)),'0 days');
assert.equal(animalAge('2026-10-17',new Date(2026,9,18)),'1 day');
assert.equal(animalAge('2025-10-18',new Date(2026,9,18)),'1 year');
assert.equal(animalAge('2027-10-18',new Date(2026,9,18)),'');
assert.deepEqual(errors,[]);console.log('All browser workflow checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(ws){try{await cdp('Browser.close');}catch{}ws.close();}if(chrome)chrome.kill();server.close();});
