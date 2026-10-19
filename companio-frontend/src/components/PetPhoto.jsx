import { useState } from "react";

import CompanionArt from "./CompanionArt";
export default function PetPhoto({pet,className=""}) {
 const [failed,setFailed]=useState(null);
 if(pet.photo_url && failed!==pet.photo_url)return <img className={"pet-photo "+className} src={pet.photo_url} alt={pet.name} loading="lazy" decoding="async" onError={()=>setFailed(pet.photo_url)}/>;
 return <div className={"pet-photo photo-placeholder "+className}><span className="pet-placeholder-art" aria-hidden="true"><CompanionArt species={pet.species === "cat" ? "cat" : "dog"} pose="sit"/></span><span className="pet-placeholder-caption">{pet.species==="cat"?"Cat":"Dog"} photo unavailable</span></div>;
}
