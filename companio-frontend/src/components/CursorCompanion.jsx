import { useEffect, useRef, useState } from "react";
import CompanionArt from "./CompanionArt";
import Icon from "./Icon";
export default function CursorCompanion(){
 const [enabled,setEnabled]=useState(true),[species,setSpecies]=useState("dog");
 const sprite=useRef(null);
 useEffect(()=>{
  if(!enabled)return;
  const media=window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)");
  let frame=0,idle=0,x=0,y=0,tx=0,ty=0,started=false;
  const hide=()=>{if(sprite.current)sprite.current.dataset.visible="false";started=false;cancelAnimationFrame(frame);clearTimeout(idle);};
  const move=(event)=>{
   if(media.matches||event.pointerType==="touch")return;
   tx=Math.max(10,Math.min(innerWidth-80,event.clientX-75));ty=Math.max(10,Math.min(innerHeight-80,event.clientY+24));
   clearTimeout(idle);idle=setTimeout(hide,2400);
   if(started)return;started=true;x=tx-30;y=ty;
   const tick=()=>{if(!sprite.current)return;const dx=tx-x,dy=ty-y;x+=dx*.075;y+=dy*.075;sprite.current.style.transform=`translate3d(${x}px,${y}px,0)`;sprite.current.dataset.visible="true";sprite.current.dataset.running=Math.abs(dx)+Math.abs(dy)>5?"true":"false";sprite.current.style.setProperty("--pet-facing",dx < -1 ? "-1":"1");frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
  };
  window.addEventListener("pointermove",move,{passive:true});document.documentElement.addEventListener("pointerleave",hide);media.addEventListener("change",hide);
  return()=>{hide();window.removeEventListener("pointermove",move);document.documentElement.removeEventListener("pointerleave",hide);media.removeEventListener("change",hide);};
 },[enabled]);
 return <><div ref={sprite} className="cursor-companion" data-visible="false" aria-hidden="true"><div className="cursor-companion-sprite"><CompanionArt species={species} pose="run"/></div><span className="cursor-paw-shadow"/></div><div className="cursor-play-controls"><button type="button" aria-pressed={enabled} onClick={()=>setEnabled(!enabled)}><Icon name="paw" size={15}/>{enabled?"Pause cursor play":"Play with a companion"}</button><button type="button" aria-label={species==="dog"?"Let the cat chase your cursor":"Let the dog chase your cursor"} onClick={()=>setSpecies(species==="dog"?"cat":"dog")}><Icon name={species==="dog"?"cat":"dog"} size={17}/></button></div></>;
}
