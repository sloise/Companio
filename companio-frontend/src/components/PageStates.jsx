import CorgiLoader from "./CorgiLoader";
import Icon from "./Icon";
export function Skeleton({rows=3,height=120,label="Getting everything ready..."}) {
 return <div className="loading-state" aria-busy="true"><CorgiLoader label={label}/><div className="loading-placeholders" aria-hidden="true">{Array.from({length:Math.min(rows,2)},(_,i)=><div key={i} className="skeleton" style={{height:Math.min(height,88)}}/>)}</div></div>;
}
export function LoadError({message,onRetry}) {
 return <div className="card empty load-error" role="alert"><span className="empty-symbol"><Icon name="alert" size={26}/></span><h2>We couldn't load this page</h2><p className="muted">{message}</p>{onRetry&&<button type="button" className="btn btn-primary" onClick={onRetry}><Icon name="refresh" size={17}/> Try again</button>}</div>;
}
