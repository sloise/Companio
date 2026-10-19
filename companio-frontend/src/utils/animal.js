export function animalAge(date, today = new Date()) {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  const birth = new Date(year, month - 1, day);
  if (birth > today) return "";
  const total = Math.max(0, (today.getFullYear() - year) * 12 + today.getMonth() + 1 - month - (today.getDate() < day ? 1 : 0));
  const years = Math.floor(total / 12), months = total % 12;
  const parts = [];
  if (years) parts.push(years + (years === 1 ? " year" : " years"));
  if (months) parts.push(months + (months === 1 ? " month" : " months"));
  const days = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(year, month - 1, day)) / 86400000);
  return parts.join(" and ") || days + (days === 1 ? " day" : " days");
}
export function localToday() { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-"); }
export const HEALTH_STATUSES = ["Vaccinated", "Vaccination Due Soon", "Not Yet Vaccinated", "Records Unavailable"];
export const sterilizationOptions = (sex) => sex === "Female" ? ["Spayed", "Not Yet Spayed", "Unknown"] : sex === "Male" ? ["Neutered", "Not Yet Neutered", "Unknown"] : ["Unknown"];
export function normalizeSterilization(sex, status) {
  if (status === "Not Yet Spayed/Neutered") return sex === "Female" ? "Not Yet Spayed" : sex === "Male" ? "Not Yet Neutered" : "Unknown";
  return sterilizationOptions(sex).includes(status) ? status : "Unknown";
}
export function estimatedAge(years, months) {
  if (years === "" && months === "") return "Age Unknown";
  const parts = [];
  if (Number(years)) parts.push(Number(years) + (Number(years) === 1 ? " year" : " years"));
  if (Number(months)) parts.push(Number(months) + (Number(months) === 1 ? " month" : " months"));
  return parts.join(" and ") || "0 months";
}
export const vaccinesFor = (species) => species === "cat" ? ["Anti-Rabies", "3-in-1 (FVRCP)", "4-in-1", "FeLV Vaccine", "Other"] : ["Anti-Rabies", "3-in-1", "4-in-1", "5-in-1", "6-in-1", "8-in-1", "Other"];
