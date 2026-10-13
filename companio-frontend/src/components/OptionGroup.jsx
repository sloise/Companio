// A group of radio "cards" (used by the questionnaire and admin forms).
// options = [{ value, label, hint? }]
export default function OptionGroup({ name, value, options, onChange, required = true }) {
  return (
    <div className="option-grid">
      {options.map((option) => (
        <label
          key={option.value}
          className={value === option.value ? "option option-selected" : "option"}
        >
          <input
            type="radio"
            name={name}
            required={required}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>
            <strong>{option.label}</strong>
            {option.hint && <small>{option.hint}</small>}
          </span>
        </label>
      ))}
    </div>
  );
}
