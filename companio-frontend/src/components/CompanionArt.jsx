import { useState } from "react";
import CorgiArt from "./CorgiArt";
import CatArt from "./CatArt";
export default function CompanionArt({pose="sit",species="auto"}) {
 const [first] = useState(() => Math.random() < .5 ? "dog" : "cat");
 if(species==="cat")return <CatArt pose={pose}/>;
 if(species==="dog")return <CorgiArt pose={pose}/>;
 return <span className="companion-art" data-first={first} aria-hidden="true"><span className="companion-dog"><CorgiArt pose={pose}/></span><span className="companion-cat"><CatArt pose={pose}/></span></span>;
}
