import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/auth";
import api from "../api/client";
import Icon from "./Icon";
export default function MessageLink() {
 const { user } = useAuth();
 const [unread,setUnread]=useState(0);
 useEffect(()=>{
  let active=true;
  const refresh=()=>{if(document.hidden)return;Promise.all([api.get('/conversations'),api.get('/notifications',{params:{inbox:1}})]).then(([chats,updates])=>{if(active)setUnread(chats.data.unread+updates.data.unread);}).catch(()=>{});};
  refresh();const timer=setInterval(refresh,10000);window.addEventListener('communication-changed',refresh);
  return ()=>{active=false;clearInterval(timer);window.removeEventListener('communication-changed',refresh);};
 },[]);
 return <Link className="bell-btn message-link" to={user.role==='volunteer'?'/messages':'/admin/messages'} aria-label={`Messages, ${unread} unread`}><Icon name="mail"/>{unread>0&&<span className="bell-count">{unread>99?'99+':unread}</span>}</Link>;
}
