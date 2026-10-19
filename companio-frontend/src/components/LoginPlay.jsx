import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import CompanionArt from "./CompanionArt";
import "./CorgiLoader.css";
export default function LoginPlay(){
 const [playing,setPlaying]=useState(false),[species,setSpecies]=useState("dog"),[catches,setCatches]=useState(0),[target,setTarget]=useState(78);
 const [message,setMessage]=useState("Pick a spot in the yard. Your companion will fetch!");
 const timer=useRef(null),arena=useRef(null),locked=useRef(false);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 function finish(){locked.current=false;setPlaying(false);setCatches(n=>n+1);setMessage("Caught it! Try another spot, or invite the other companion.");setSpecies(s=>s==="dog"?"cat":"dog");}
 function fetchBall(event){
  if(locked.current)return;
  const rect=arena.current?.getBoundingClientRect();
  setTarget(event?.clientX && rect?Math.max(30,Math.min(87,(event.clientX-rect.left)/rect.width*100)):45+Math.random()*40);
  if(window.matchMedia("(prefers-reduced-motion: reduce)").matches||navigator.connection?.saveData){finish();return;}
  locked.current=true;setPlaying(true);setMessage(species==="cat"?"A pounce, a chase... here comes the cat!":"Off to fetch! Watch those little paws go.");
  timer.current=setTimeout(finish,1800);
 }
 return <details open className="login-play" onToggle={e=>{if(!e.currentTarget.open){clearTimeout(timer.current);locked.current=false;setPlaying(false);}}}>
 <summary><Icon name="ball" size={16}/> The little play club <span className="muted">Optional</span></summary>
 <div className="play-yard-toolbar"><span><span className="play-live-dot"/> {species==="dog"?"Corgi":"Tabby"}'s turn</span><span><Icon name="heart" size={13}/> {catches} catches</span><button type="button" disabled={playing} onClick={()=>setSpecies(s=>s==="dog"?"cat":"dog")} aria-label="Switch play companion"><Icon name={species==="dog"?"cat":"dog"} size={16}/> Switch</button></div>
 <button ref={arena} type="button" className="fetch-arena" data-playing={playing} style={{"--fetch-target":target+"%"}} onClick={fetchBall} disabled={playing} aria-label="Throw a ball at this spot in the play yard">
 <span className="fetch-sun"/><span className="fetch-cloud"/><span className="fetch-cloud cloud-two"/><span className="fetch-scene-label">TAP ANYWHERE TO PLAY FETCH</span><span className="yard-fence"/><span className="yard-flower flower-one"/><span className="yard-flower flower-two"/><span className="yard-flower flower-three"/>
 <span className={"fetch-dog corgi corgi--"+(playing?"run":"sit")}><CompanionArt species={species} pose={playing?"run":"happy"}/></span><span className="fetch-ball"><Icon name="ball" size={24}/></span><span className="yard-target"/><span className="yard-hint">{playing?"Catch it!":"Your click. Their next adventure."}</span>
 </button>
 <div className="fetch-controls"><p className="small muted" role="status">{message}</p><button type="button" className="btn btn-outline btn-sm" disabled={playing} onClick={()=>fetchBall()}>Throw the ball</button></div>
 </details>;
}
