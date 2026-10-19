import { useEffect, useRef, useState } from "react";
export default function FileInput({ onChange, ...props }) {
  const input = useRef(null), urls = useRef([]);
  const [selected, setSelected] = useState([]);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  function select(files) {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    const next = files.map((file) => ({file, preview:file.type.startsWith("image/") ? URL.createObjectURL(file) : null}));
    urls.current = next.map((item) => item.preview).filter(Boolean);
    setSelected(next);
  }
  function remove(index) {
    const next = selected.filter((_, i) => i !== index).map((item) => item.file);
    const transfer = new DataTransfer();
    next.forEach((file) => transfer.items.add(file));
    input.current.files = transfer.files;
    if (!next.length) input.current.value = "";
    select(next);
    onChange?.({ target: input.current, currentTarget: input.current });
  }
  return <span className="file-picker">
    <input {...props} type="file" ref={input} onChange={(event) => { select(Array.from(event.target.files)); onChange?.(event); }} />
    {selected.map(({file,preview}, index) => <span className="file-selection" key={file.name + index}>
      {preview && <img src={preview} alt={file.name + " preview"} />}
      <span>{file.name}</span><button type="button" className="btn btn-outline btn-sm" disabled={props.disabled} aria-label={"Remove " + file.name} onClick={() => remove(index)}>Remove file</button>
    </span>)}
  </span>;
}
