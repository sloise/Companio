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
async function intercept(event){const request=event.request,u=new URL(request.url),url=u.pathname;calls.push(url);
if(request.method==='OPTIONS'){await cdp('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:204,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'},{name:'Access-Control-Allow-Methods',value:'GET, POST, PATCH, PUT, DELETE, OPTIONS'}]});return;}
let body={},status=200;
const mutation=request.method!=='GET';
if(!mutation && url===slowPath)await sleep(1500);
if(mutation){writes.push({path:url,method:request.method,body:request.postData});await sleep(180);}
const data=request.postData?.startsWith('{')?JSON.parse(request.postData):{};
if(mutation && failNext===url){failNext=null;status=422;body={message:'Simulated backend failure'};}
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
if(process.argv.includes('--animal-layout')){
 animals=[{...animal,name:'Princess Marshmallow the Very Brave Rescue Companion',breed:'Mixed breed / Labrador Retriever and German Shepherd',age:'12 years and 11 months',is_urgent:true,needed_by:'2026-12-31',health_status:'Vaccination Due Soon',sterilization_status:'Not Yet Neutered',description:'A gentle rescue who needs a quiet space to settle in. Please introduce other animals slowly.\nEnjoys short walks and time with a trusted companion.'},{...animal,id:2,species:'cat',name:'RescueWithAnExceptionallyLongUnbrokenNameToVerifyWrapping',breed:'UnknownMixedBreedWithVeryLongUnbrokenDetails',status:'In Foster Care',description:'LongDescriptionWithoutSpaces'.repeat(9)}];
 for(const width of [1440,1100,768,390,320]){
  await inspect('/admin/animals','admin',width,'animal-details-'+width);
  assert(await evaluate(`Array.from(document.querySelectorAll('.animal-post')).every(card=>{
    const rect=el=>el.getBoundingClientRect(),head=card.querySelector('.animal-post-head'),title=head.querySelector('.animal-post-title'),avatar=head.querySelector('.animal-post-avatar'),flags=head.querySelector('.animal-post-flags'),details=card.querySelector('.animal-post-details'),photo=card.querySelector('.animal-post-photo');
    return rect(avatar).right<=rect(title).left&&rect(title).bottom<=rect(flags).top&&rect(head).bottom<=rect(details).top+1&&rect(details).bottom<=rect(photo).top+1&&Array.from(card.querySelectorAll('.animal-post-title,.animal-post-flags,.animal-post-health,.animal-post-text')).every(el=>el.scrollWidth<=el.clientWidth+1&&rect(el).left>=rect(card).left&&rect(el).right<=rect(card).right);
  })`),'Animal identity, badges, health, and description must stay separate and fit at '+width+'px');
 }
 assert.deepEqual(errors,[]);console.log('PASS animal details: long names, breeds, urgent badges, health labels and multiline descriptions fit without overlap at five viewport widths');return;
}
await inspect('/',null,1440,'landing-desktop');
await evaluate('document.querySelector(".scene-switcher button:nth-child(2)").click()');
assert.equal(await evaluate('document.querySelector(".scene-pet-name strong").textContent'),'Maple.');
assert.equal(await evaluate('document.querySelector(".logo").getAttribute("href")'),'/');
assert(await evaluate('!!document.querySelector(".scene-art .cat-svg")'),'Maple must render the new cat artwork');
await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:400,y:350});await sleep(160);
assert.equal(await evaluate('document.querySelector(".cursor-companion").dataset.visible'),'true');
const cursorStart=await evaluate('document.querySelector(".cursor-companion").style.transform');
await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:850,y:500});await sleep(200);
assert.notEqual(await evaluate('document.querySelector(".cursor-companion").style.transform'),cursorStart);
assert.equal(await evaluate('getComputedStyle(document.querySelector(".cursor-companion")).pointerEvents'),'none');
await click('Let the cat chase your cursor');assert(await evaluate('!!document.querySelector(".cursor-companion .cat-svg")'));
await click('Pause cursor play');assert.equal(await evaluate('document.querySelector(".cursor-companion").dataset.visible'),'false');
console.log('PASS cursor chase follows movement, switches to cat, stays click-through and pauses');
await inspect('/',null,390,'landing-mobile');
await inspect('/',null,320,'landing-small');
await navigate('/login?mode=register&role=shelter',null);
assert.equal(await evaluate('document.querySelector("input[value=shelter]").checked'),true);
console.log('PASS landing companion switcher, clickable brand, mobile layout, shelter registration link');
await inspect('/login',null,1440,'login-desktop');await value('[name=password]','quiet-companion');await click('Show password');assert.equal(await evaluate('document.querySelector("[name=password]").type'),'text');assert.equal(await evaluate('document.querySelector("[name=password]").value'),'quiet-companion');await click('Hide password');assert.equal(await evaluate('document.querySelector("[name=password]").type'),'password');
const before=writes.length;await evaluate('document.querySelector(".login-play").open=true');await click('Throw the ball');await wait('document.querySelector(".fetch-arena").dataset.playing==="true"');assert.equal(writes.length,before);assert.equal(await evaluate('document.querySelector("[name=password]").value'),'quiet-companion');await screenshot('login-play');
await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(1900);await click('Throw the ball');assert.equal(await evaluate('document.querySelector(".fetch-arena").dataset.playing'),'false');assert.equal(await evaluate('getComputedStyle(document.querySelector(".fetch-dog")).animationName'),'none');
assert.equal(await evaluate('document.querySelector(".play-yard-toolbar").textContent.includes("2 catches")'),true);
assert.equal(writes.length,before,'Play must never submit the login form or change backend data');
await cdp('Emulation.setEmulatedMedia',{features:[]});
await click('Switch play companion');assert(await evaluate('!!document.querySelector(".fetch-dog .cat-svg")'));
await evaluate('document.querySelector(".fetch-arena").click()');await wait('document.querySelector(".fetch-arena").dataset.playing==="true"');
await sleep(1900);assert(await evaluate('document.querySelector(".play-yard-toolbar").textContent.includes("3 catches")'));
assert.equal(await evaluate('document.querySelector("[name=password]").value'),'quiet-companion');
console.log('PASS play-yard click targets, dog/cat turns, catch count, reduced motion and preserved form input');
await inspect('/login',null,390,'login-mobile');await inspect('/admin','super_admin',1440,'dashboard-desktop');await inspect('/admin','super_admin',390,'dashboard-mobile');
await inspect('/admin/staff-requests','super_admin',390,'staff-mobile');await inspect('/admin/animals','admin',1440,'animals-desktop');await inspect('/admin/animals','admin',390,'animals-mobile');
await click('+ Add animal');await screenshot('animal-form-mobile');assert.equal(await evaluate('document.querySelector(".modal[open]").getBoundingClientRect().right<=innerWidth'),true);await clickContains('Close').catch(()=>{});await navigate('/profile','volunteer');
await inspect('/admin/applications','admin',1440,'review-desktop');await inspect('/admin/applications','admin',390,'review-mobile');await inspect('/admin/placements','admin',390,'placements-mobile');
await inspect('/profile','volunteer',390,'profile-mobile');await inspect('/questionnaire','volunteer',390,'questionnaire-mobile');await inspect('/matches','volunteer',1440,'matches-desktop');await inspect('/matches','volunteer',390,'matches-mobile');await inspect('/matches/1','volunteer',390,'pet-mobile');await inspect('/applications','volunteer',390,'applications-mobile');

await inspect('/matches','volunteer',1440,'matches-refined-desktop');
assert.equal(await evaluate('document.querySelector(".match-collection").dataset.view'),'gallery');
await click('List view');assert.equal(await evaluate('document.querySelector(".match-collection").dataset.view'),'list');
await screenshot('matches-list-desktop');await click('Gallery view');
assert.equal(await evaluate('document.querySelector(".match-collection").dataset.view'),'gallery');
console.log('PASS gallery and list views preserve the same pet results');

assert.equal(await evaluate('document.querySelector(".topbar .logo").getAttribute("href")'),'/matches');
assert(await evaluate('(()=>{const input=document.querySelector(".search-box input"),icon=document.querySelector(".search-box svg");return input.getBoundingClientRect().left+parseFloat(getComputedStyle(input).paddingLeft)>icon.getBoundingClientRect().right+4})()'),'Search text must clear the icon');
assert(await evaluate('Array.from(document.querySelectorAll(".match-row .photo-placeholder")).every(p=>{const a=p.querySelector(".pet-placeholder-art").getBoundingClientRect(),c=p.querySelector(".pet-placeholder-caption").getBoundingClientRect();return a.bottom<=c.top&&c.right<=p.getBoundingClientRect().right})'),'Placeholder artwork and caption must not overlap');
await click('Account menu');
assert(await evaluate('Array.from(document.querySelectorAll(".user-menu-panel button")).every(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})'),'Account menu actions must appear above the page');
await screenshot('account-menu-layering');
await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
assert.equal(await evaluate('!!document.querySelector(".user-menu-panel")'),false);
await navigate('/','volunteer');await wait('location.pathname==="/matches"');
await navigate('/','admin');await wait('location.pathname==="/admin"');
await evaluate('document.querySelector(".sidebar .logo").click()');await wait('location.pathname==="/admin"');
await navigate('/matches','volunteer');await click('Account menu');await click('Log out');await wait('location.pathname==="/" && document.querySelector(".landing")');
assert.equal(await evaluate('localStorage.getItem("user")'),null);
await viewport(1440);await evaluate('document.querySelector(".landing-footer").scrollIntoView({behavior:"instant",block:"end"})');await screenshot('landing-footer-desktop');
await viewport(390);await evaluate('document.querySelector(".landing-footer").scrollIntoView({behavior:"instant",block:"end"})');await screenshot('landing-footer-mobile');
assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
assert(await evaluate('document.querySelector(".landing-footer").getBoundingClientRect().bottom<=innerHeight+1'));
await inspect('/matches','volunteer',390,'matches-mobile');await click('Show filters');
assert.equal(await evaluate('getComputedStyle(document.querySelector(".search-box")).display')==='none',false);
await click('Hide filters');assert.equal(await evaluate('getComputedStyle(document.querySelector(".search-box")).display'),'none');
console.log('PASS search and placeholder separation, menu hit testing, session-aware home and logo routing, logout landing, footer responsiveness');
slowPath='/api/admin/dashboard';await viewport(1000);await navigate('/admin','super_admin');await wait('document.querySelector(".corgi-loader")');assert.equal(await evaluate('document.querySelector(".corgi-loader").getAttribute("aria-valuenow")'),null);assert(await evaluate('document.querySelectorAll(".corgi-pose svg").length===8'));assert(await evaluate('Array.from(document.querySelectorAll(".corgi-pose .corgi-svg")).filter(s=>getComputedStyle(s).visibility==="visible").length===2'),'Only the active loader pose may expose its paired animals');await screenshot('corgi-loading');
await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate('getComputedStyle(document.querySelector(".corgi-runner")).animationName'),'none');slowPath=null;await sleep(1600);await cdp('Emulation.setEmulatedMedia',{features:[]});
assert.deepEqual(errors,[]);console.log('All UI, accessibility, supplied corgi, and responsive checks passed. Screenshots: '+artifactDir);
})().catch(async e=>{console.error(e);try{console.error(await evaluate('document.body.innerText'));}catch{}process.exitCode=1;}).finally(async()=>{if(ws){try{await cdp('Browser.close');}catch{}ws.close();}if(chrome)chrome.kill();server.close();});
