import { useEffect } from "react";
import { useLocation } from "react-router-dom";
export default function RouteAnnouncer(){
 const {pathname}=useLocation();
 const names={"/admin/staff-requests":"Staff Requests","/admin/applications":"Application review","/admin/placements":"Placements","/admin/animals":"Animal management","/admin":"Dashboard","/questionnaire":"Your home profile","/profile":"My profile","/applications":"My applications","/matches":"Find a companion","/forgot-password":"Reset your password","/reset-password":"Choose a new password","/login":"Welcome to Companio"};
 const title=names[pathname] || (pathname.startsWith("/matches/")?"Pet profile":"Companio");
 useEffect(()=>{document.title=title+" | Companio";},[title]);
 useEffect(()=>{if(navigator.connection?.saveData || navigator.hardwareConcurrency<=2)document.documentElement.dataset.motion="limited";},[]);
 return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{title}</p>;
}
