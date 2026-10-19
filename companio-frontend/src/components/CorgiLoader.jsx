import CompanionArt from "./CompanionArt";
import "./CorgiLoader.css";
export default function CorgiLoader({progress,label="Loading",compact=false}) {
 const known=typeof progress==="number" && Number.isFinite(progress);
 const value=known?Math.max(0,Math.min(100,Math.round(progress))):null;
 const pose=value>=100?"happy":value>=70?"wiggle":value>=35?"run":"sit";
 return <div className={"corgi-loader"+(known?"":" is-indeterminate")+(compact?" corgi-loader-compact":"")} role={known?"progressbar":"status"} aria-label={label} aria-valuemin={known?0:undefined} aria-valuemax={known?100:undefined} aria-valuenow={known?value:undefined}>
   <div className="corgi-stage" aria-hidden="true"><div className="corgi-runner" style={known?{left:value+"%",transform:"translateX(-"+value+"%)"}:undefined}>
     {known?<div className={"corgi corgi--"+pose}><CompanionArt pose={pose}/></div>:<div className="corgi-cycle">{["sit","run","wiggle","happy"].map((p)=><div className={"corgi corgi--"+p+" corgi-pose"} key={p}><CompanionArt pose={p}/></div>)}</div>}
   </div></div>
   <div className="corgi-track" aria-hidden="true"><div className="corgi-fill" style={known?{width:Math.max(value,6)+"%"}:undefined}/></div>
   {label&&<p className="corgi-label" aria-hidden="true">{label}</p>}
 </div>;
}
