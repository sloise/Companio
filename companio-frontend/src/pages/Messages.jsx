import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { errorMessage } from "../api/client";
import { useAuth } from "../context/auth";
import UserAvatar from "../components/UserAvatar";
import Icon from "../components/Icon";
import { timeAgo } from "../utils/format";
import "./Messages.css";

function PrivatePhoto({ id }) {
 const [url,setUrl]=useState('');
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true,objectUrl;
  api.get(`/messages/${id}/photo`,{responseType:'blob'}).then(r=>{objectUrl=URL.createObjectURL(r.data);if(active)setUrl(objectUrl);}).catch(()=>{if(active)setFailed(true);});
  return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[id]);
 return url?<a href={url} target="_blank" rel="noreferrer"><img className="chat-photo" src={url} alt="Pet update attachment"/></a>:<p>{failed?'Photo could not be loaded.':'Loading photo...'}</p>;
}
export default function Messages() {
 const { id }=useParams();
 return <MessageWorkspace key={id || "inbox"}/>;
}
function MessageWorkspace() {
 const { user }=useAuth();const { id }=useParams();const navigate=useNavigate();
 const base=user.role==='volunteer'?'/messages':'/admin/messages';
 const [data,setData]=useState({conversations:[],placements:[]});
 const [updates,setUpdates]=useState([]),[updateUnread,setUpdateUnread]=useState(0),[updateMore,setUpdateMore]=useState(false),[updating,setUpdating]=useState(false);
 const [messages,setMessages]=useState([]),[participants,setParticipants]=useState([]);
 const [loading,setLoading]=useState(true),[chatLoading,setChatLoading]=useState(Boolean(id)),[error,setError]=useState('');
 const [body,setBody]=useState(''),[category,setCategory]=useState('message'),[photo,setPhoto]=useState(null),[sending,setSending]=useState(false),[more,setMore]=useState(false);
 const fileRef=useRef(null),end=useRef(null),selected=useRef(id),latest=useRef(0);
 const refreshList=useCallback(async()=>{const r=await api.get('/conversations');setData(r.data);},[]);
 useEffect(()=>{
  let active=true;
  const load=async()=>{try {const [r,n]=await Promise.all([api.get('/conversations'),api.get('/notifications',{params:{inbox:1}})]);if(active){setData(r.data);setUpdates(old=>[...n.data.notifications,...old.filter(item=>item.id<(n.data.notifications.at(-1)?.id??0))]);setUpdateUnread(n.data.unread);setUpdateMore(n.data.has_more);}}catch(e){if(active)setError(errorMessage(e));}finally{if(active)setLoading(false);}};
  load();const t=setInterval(()=>{if(!document.hidden)load();},10000);return ()=>{active=false;clearInterval(t);};
 },[]);
 useEffect(()=>{
  let active=true,busy=false;
  selected.current=id;
  if(!id)return;
  const load=async()=>{
   if(busy||document.hidden)return;busy=true;
   try {
    const r=await api.get(`/conversations/${id}`);if(!active)return;
    setMessages(old=>{const first=r.data.messages[0]?.id;return [...old.filter(m=>first&&m.id<first),...r.data.messages];});
    setParticipants(r.data.participants);setMore(r.data.has_more);
    const last=r.data.messages.at(-1)?.id;
    if(last && document.hasFocus()) {await api.post(`/conversations/${id}/read`,{message_id:last});window.dispatchEvent(new Event('communication-changed'));}
    if(last!==latest.current){latest.current=last;setTimeout(()=>end.current?.scrollIntoView({block:'nearest'}),50);}
   }catch(e){if(active)setError(errorMessage(e));}finally{busy=false;if(active)setChatLoading(false);}
  };
  load();const t=setInterval(load,4000);window.addEventListener('focus',load);
  return ()=>{active=false;selected.current=null;clearInterval(t);window.removeEventListener('focus',load);};
 },[id]);
 const start=async(e)=>{const value=e.target.value;if(!value)return;try{setError('');const r=await api.post(`/placements/${value}/conversation`);await refreshList();navigate(`${base}/${r.data.id}`);}catch(err){setError(errorMessage(err));}e.target.value='';};
 const send=async(e)=>{
  e.preventDefault();if(sending||(!body.trim()&&!photo))return;setSending(true);setError('');const current=id;
  try {
   const form=new FormData();form.append('body',body);form.append('category',category);if(photo)form.append('photo',photo);
   const r=await api.post(`/conversations/${id}/messages`,form);
   if(selected.current===current){setMessages(old=>old.some(m=>m.id===r.data.id)?old:[...old,r.data]);setBody('');setPhoto(null);if(fileRef.current)fileRef.current.value='';setTimeout(()=>end.current?.scrollIntoView({block:'nearest'}),50);}
   await refreshList();window.dispatchEvent(new Event('communication-changed'));
  }catch(err){setError(errorMessage(err));}finally{setSending(false);}
 };
 const older=async()=>{try{const r=await api.get(`/conversations/${id}`,{params:{before:messages[0].id}});if(selected.current!==id)return;setMessages(old=>[...r.data.messages,...old.filter(m=>!r.data.messages.some(n=>n.id===m.id))]);setMore(r.data.has_more);}catch(e){setError(errorMessage(e));}};
 const openUpdate=async(item)=>{
  try {
   await api.post(`/notifications/${item.id}/read`,null,{params:{inbox:1}});
   setUpdates(old=>old.map(n=>n.id===item.id?{...n,read_at:n.read_at||new Date().toISOString()}:n));
   if(!item.read_at)setUpdateUnread(n=>Math.max(0,n-1));
   window.dispatchEvent(new Event('communication-changed'));
   if(item.link?.startsWith('/')&&!item.link.startsWith('//'))navigate(item.link);
  }catch(e){setError(errorMessage(e));}
 };
 const markUpdatesRead=async()=>{
  setUpdating(true);
  try{await api.post('/notifications/read',null,{params:{inbox:1}});setUpdates(old=>old.map(n=>({...n,read_at:n.read_at||new Date().toISOString()})));setUpdateUnread(0);window.dispatchEvent(new Event('communication-changed'));}catch(e){setError(errorMessage(e));}finally{setUpdating(false);}
 };
 const olderUpdates=async()=>{
  setUpdating(true);
  try{const r=await api.get('/notifications',{params:{inbox:1,before:updates.at(-1)?.id}});setUpdates(old=>[...old,...r.data.notifications.filter(n=>!old.some(o=>o.id===n.id))]);setUpdateMore(r.data.has_more);}catch(e){setError(errorMessage(e));}finally{setUpdating(false);}
 };
 const inboxEntries=[...data.conversations.map(c=>({type:'chat',id:c.id,date:c.latest?.created_at||''})),{type:'updates',id:'updates',date:updates[0]?.created_at||''}].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
 const conversation=data.conversations.find(c=>String(c.id)===id);
 return <section className="messages-page"><div className="messages-intro"><div><span className="messages-eyebrow"><Icon name="heart" size={14}/> THE CARE CONNECTION</span><h1>Every update. A little closer.</h1><p className="muted">Your conversations, care notes and Companio news in one welcoming space.</p></div><span className="inbox-live"><span/> Updates automatically</span></div>
 {error&&<div className="chat-error" role="alert">{error}<button className="btn" onClick={()=>window.location.reload()}>Retry</button></div>}
 <div className="messenger"><aside className="conversation-list" aria-label="Messages inbox"><div className="inbox-list-heading"><div><Icon name="mail" size={19}/><h2>Messages</h2></div><span>{data.conversations.length + 1}</span></div>
 {user.role==='admin'&&<label>Message a foster parent<select aria-label="Choose foster arrangement" defaultValue="" onChange={start}><option value="">Choose a pet</option>{data.placements.map(p=><option key={p.id} value={p.id}>{p.name} - {p.foster_name} - Arrangement #{p.id}</option>)}</select></label>}
 {loading?<p role="status">Loading inbox...</p>:inboxEntries.map(entry=>{
  if(entry.type==='updates')return <button key="updates" className={`conversation-choice ${!id?'selected':''}`} onClick={()=>navigate(base)}><span className="thread-icon thread-icon-updates"><Icon name="info"/></span><span><strong>Companio updates</strong><small>{updates[0]?.message.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').trim()||'Application decisions, pet news and account updates'}</small></span>{updateUnread>0&&<b className="chat-unread">{updateUnread}</b>}</button>;
  const c=data.conversations.find(c=>c.id===entry.id);
  return <button key={c.id} className={`conversation-choice ${String(c.id)===id?'selected':''}`} onClick={()=>navigate(`${base}/${c.id}`)}><span className="thread-icon"><Icon name="paw"/></span><span><strong>{c.pet.name}</strong><small>Arrangement #{c.placement_id} - {c.status}</small><small>{c.latest?.body||'Start a conversation'}</small></span>{c.unread>0&&<b className="chat-unread">{c.unread}</b>}</button>;
 })}
 {!loading&&!data.conversations.length&&<p className="muted inbox-help">{user.role==='admin'?'Choose an active foster arrangement above to contact its foster parent.':user.role==='volunteer'?'Your shelter can start a conversation here while you are fostering a pet.':'Private foster conversations remain limited to foster parents and relevant shelter staff.'}</p>}

 </aside><div className="chat-area">
 {!id?<>
 <header className="chat-heading updates-heading"><span className="pet-chat-mark"><Icon name="info" size={25}/></span><div><h2>Companio updates</h2><p>Automatic updates about your applications, pets and account.</p></div>{updateUnread>0&&<button className="btn" disabled={updating} onClick={markUpdatesRead}>Mark updates as read</button>}</header>
 <div className="system-updates" role="region" aria-label="Automatic updates" aria-live="polite">
 {loading?<p role="status">Loading updates...</p>:!updates.length?<div className="chat-empty"><Icon name="info" size={36}/><h3>You are all caught up</h3><p>Application decisions, foster changes and account news will appear here automatically.</p></div>:updates.map(item=><button key={item.id} type="button" className={`system-update ${item.read_at?'':'system-update-unread'}`} onClick={()=>openUpdate(item)}><Icon name="clipboard"/><span><strong>Companio update{!item.read_at&&<small className="update-new">Unread</small>}</strong><span>{item.message.replace(/\p{Extended_Pictographic}\uFE0F?/gu,'').trim()}</span><small>{timeAgo(item.created_at)}{item.link?' - View details':''}</small></span>{item.link&&<Icon name="arrow" size={17}/>}</button>)}
 {updateMore&&<button className="btn" disabled={updating} onClick={olderUpdates}>Load earlier updates</button>}
 </div></>:<>

 <header className="chat-heading"><span className="pet-chat-mark"><Icon name="paw" size={25}/></span><div><h2>{conversation?.pet.name||'Pet conversation'}</h2><small>Foster arrangement #{conversation?.placement_id} - {conversation?.status}</small><div className="chat-people">{participants.map(p=><span key={p.id}><Icon name="user" size={12}/>{p.name}</span>)}</div></div></header>
 <div className="chat-history" role="log" aria-label="Message history" aria-live="polite">
 <div className="chat-history-note"><Icon name="shield" size={13}/> A shared space for your foster pet's care</div>
 {more&&<button className="btn" onClick={older}>Load earlier messages</button>}
 {chatLoading?<p role="status">Loading messages...</p>:!messages.length?<p className="chat-empty">No messages yet. Share how your pet is settling in.</p>:messages.map(m=>{const mine=String(m.sender_id)===String(user.id);const recipients=participants.filter(p=>String(p.id)!==String(user.id));const read=recipients.length>0&&recipients.every(p=>p.pivot.last_read_message_id>=m.id);return <article key={m.id} className={`chat-message ${mine?'outgoing':'incoming'}`}><span className="chat-avatar" aria-hidden="true">{m.sender.photo_url?<UserAvatar user={m.sender}/>:<Icon name="user" size={17}/>}</span><div className="chat-bubble"><strong className="chat-sender">{m.sender.name}{mine&&<span>You</span>}</strong>{m.category!=='message'&&<span className="update-label"><Icon name="heart" size={13}/>{m.category} update</span>}<p>{m.body}</p>{m.has_photo&&<PrivatePhoto id={m.id}/>}<small>{new Date(m.created_at).toLocaleString()}{mine&&` - ${read?'Read':'Sent'}`}</small></div></article>;})}<div ref={end}/>
 </div>
 {conversation?.can_send?<form className="chat-compose" onSubmit={send}><label>Share an update<select value={category} onChange={e=>setCategory(e.target.value)} disabled={sending}>{['message','health','behavior','feeding','adjustment'].map(c=><option key={c} value={c}>{c[0].toUpperCase()+c.slice(1)}</option>)}</select></label><label className="chat-text">Message<textarea aria-label="Message" maxLength={5000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Share a question or pet update..." disabled={sending}/></label><label>Photo (optional, up to 5 MB)<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={sending} onChange={e=>{const f=e.target.files[0];if(f?.size>5*1024*1024){setError('Choose a photo smaller than 5 MB.');e.target.value='';setPhoto(null);}else setPhoto(f||null);}}/></label><button className="btn btn-primary" disabled={sending||(!body.trim()&&!photo)}><Icon name="mail" size={18}/>{sending?'Sending...':'Send'}</button></form>:<p className="chat-compose muted">This conversation is read-only.</p>}
 </>}
 </div></div></section>;
}
