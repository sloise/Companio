import { useState } from "react";
import Icon from "./Icon";
export default function ValidatedForm({children,onInvalidCapture,onChangeCapture,...props}) {
 const [error,setError]=useState(null);
 return <form {...props} onInvalidCapture={(event)=>{
   const input=event.target;
   const label=input.getAttribute("aria-label") || input.labels?.[0]?.firstChild?.textContent?.trim() || input.name?.replaceAll("_"," ") || "Field";
   setError({label,message:input.validationMessage});onInvalidCapture?.(event);
 }} onChangeCapture={(event)=>{setError(null);onChangeCapture?.(event);}}>
   {error&&<div className="notice notice-error form-validation" role="alert"><Icon name="alert"/><span><strong>Check {error.label.toLowerCase()}.</strong> {error.message}</span></div>}
   <p className="form-help">Fields marked <span className="required-mark" aria-hidden="true">*</span> are required. Optional fields are labeled.</p>
   {children}
 </form>;
}
