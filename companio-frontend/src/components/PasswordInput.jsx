import { useState } from "react";
import Icon from "./Icon";
export default function PasswordInput(props) {
 const [visible,setVisible]=useState(false);
 return <span className="password-field"><input {...props} type={visible?"text":"password"}/><button type="button" className="password-toggle" aria-label={visible?"Hide password":"Show password"} aria-pressed={visible} onClick={(event)=>{event.preventDefault();setVisible((value)=>!value);}}><Icon name={visible?"eyeOff":"eye"}/></button></span>;
}
