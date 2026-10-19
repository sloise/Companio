import CorgiLoader from "./CorgiLoader";
import { useEffect, useRef, useState } from "react";
import api, { errorMessage } from "../api/client";
export default function ApplicantIdModal({ person, onClose }) {
 const dialog = useRef(null);
 const [document, setDocument] = useState(null);
 const [error, setError] = useState("");
 const [zoom, setZoom] = useState(100);
 useEffect(() => {
   dialog.current?.showModal();
   let cancelled = false, url;
   api.get('/admin/staff-requests/' + person.id + '/id', {responseType:'blob'}).then(({data}) => {
     url = URL.createObjectURL(data);
     if (!cancelled) setDocument({url,type:data.type});
     else URL.revokeObjectURL(url);
   }).catch((e) => { if (!cancelled) setError(errorMessage(e)); });
   return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
 }, [person.id]);
 return <dialog ref={dialog} className="modal id-preview" aria-labelledby="id-title" onCancel={(e) => {e.preventDefault();onClose();}}>
   <div className="modal-head"><h2 id="id-title">{person.name}: applicant ID</h2><button type="button" className="modal-close" aria-label="Close ID preview" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
   <div className="modal-body stack-sm">
     {error ? <p role="alert">{error}</p> : !document ? <CorgiLoader label="Opening secure ID preview..." compact/> : document.type.includes('pdf') ? <iframe title="Applicant ID document" src={document.url + '#toolbar=1&view=FitH'} /> : <>
       <label className="field">Zoom: {zoom}%<input aria-label="ID zoom" type="range" min="25" max="300" step="25" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
       <div className="document-viewport"><img style={{width:zoom+'%'}} src={document.url} alt="Applicant identification" /></div>
     </>}
     <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
   </div>
 </dialog>;
}
