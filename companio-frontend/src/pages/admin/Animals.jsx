import { defaultUrgencyDeadline, urgencyText } from "../../utils/format";
import ValidatedForm from "../../components/ValidatedForm";
import Icon from "../../components/Icon";
import useConfirmedAction from "../../utils/useConfirmedAction";
import { animalAge, localToday, HEALTH_STATUSES, sterilizationOptions, normalizeSterilization, estimatedAge, vaccinesFor } from "../../utils/animal";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { errorMessage } from "../../api/client";
import { useFeedback } from "../../context/feedback";
import OptionGroup from "../../components/OptionGroup";
import PetPhoto from "../../components/PetPhoto";
import StatusPill from "../../components/StatusPill";
import AnimalHistory from "../../components/AnimalHistory";
import { LoadError, Skeleton } from "../../components/PageStates";
import { ANIMAL_HOURS, ANIMAL_KIDS, CAT_BREEDS, DOG_BREEDS, STATUSES } from "../../constants";

const OTHER_BREED = "__other";

const breedsFor = (species) => (species === "cat" ? CAT_BREEDS : DOG_BREEDS);

const EMPTY_FORM = {
  name: "",
  species: "dog",
  breed: "",
  sex: "",
  birth_date: "",
  birth_date_unknown: false,
  estimated_age_years: "",
  estimated_age_months: "",
  health_status: "Records Unavailable",
  sterilization_status: "Unknown",
  vaccinations: [],
  description: "",
  photo_url: "",
  apartment_ok: "",
  needs_yard: "",
  good_with_cats: "",
  good_with_dogs: "",
  kids_ok: "",
  max_hours_alone: "",
  care_rules_confirmed: false,
  urgent_reason: "",
  urgent_notes: "",
  is_urgent: false,
  needed_by: "",
  status: "Awaiting Foster",
};

const CARE_RULES = [
  { name: "apartment_ok", label: "Can live in an apartment", yes:"Apartment suitable", no:"House required" },
  { name: "needs_yard", label: "Needs a fenced yard", yes:"Fenced yard required", no:"No yard needed" },
  { name: "good_with_cats", label: "Good with cats", yes:"Comfortable with cats", no:"No cats in the home" },
  { name: "good_with_dogs", label: "Good with dogs", yes:"Comfortable with dogs", no:"No dogs in the home" },

];

// Shrinks a picked image to at most 800px wide/tall and returns it as a JPEG data URL,
// so it is small enough to save straight into the database
function resizeImage(file, maxSize = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function Animals() {
  const { notify } = useFeedback();

  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to load the list again
  const [historyFor, setHistoryFor] = useState(null); // animal whose history window is open
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const photoRevision = useRef(0);
  const [mixedBreed, setMixedBreed] = useState(false);
  const [customBreed, setCustomBreed] = useState(false); // true when "Other" is picked
  const { run, busy: saving } = useConfirmedAction();

  const [filters, setFilters] = useState({ search: "", species: "", status: "" });

  const dialogRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // READ
  useEffect(() => {
    const getAnimals = async () => {
      try {
        const response = await api.get("/admin/animals", {
          params: {
            search: filters.search || undefined,
            species: filters.species || undefined,
            status: filters.status || undefined,
          },
        });
        setAnimals(response.data);
        setLoadError("");
      } catch (error) {
        setLoadError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    // wait a moment while the admin is still typing
    const timer = setTimeout(getAnimals, 250);
    return () => clearTimeout(timer);
  }, [filters, reload]);

  const refreshAnimals = () => setReload((count) => count + 1);

  // the dashboard's "+ Add animal" button links here with ?new=1
  // (removing ?new=1 right away means this only opens the form once)
  useEffect(() => {
    if (searchParams.get("new")) {
      dialogRef.current?.showModal();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // FORM WINDOW
  const openForm = () => {
    dialogRef.current?.showModal();
  };

  const closeForm = () => {
    dialogRef.current?.close();
  };

  // runs whenever the window closes (Cancel, Esc key, or after saving)
  const resetForm = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setDragging(false);
    setCustomBreed(false);
    setMixedBreed(false);
    photoRevision.current += 1;
  };

  const addAnimal = () => {
    resetForm();
    openForm();
  };

  // INPUT
  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;

    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "is_urgent" && checked && !formData.needed_by ? {needed_by: defaultUrgencyDeadline()} : {}),
      ...(name === "sex" ? {sterilization_status:normalizeSterilization(value, formData.sterilization_status)} : {}),
    });
  };

  // BREED
  const handleSpeciesChange = (e) => {
    const species = e.target.value;

    // a dog breed doesn't make sense for a cat, so clear a picked breed from the old list
    const keepBreed = customBreed || breedsFor(species).includes(formData.breed);

    setFormData({ ...formData, species, breed: keepBreed ? formData.breed : "", vaccinations: [] });
  };

  const handleBreedSelect = (e) => {
    const { value } = e.target;

    setMixedBreed(value === "Mixed breed");
    if (value === OTHER_BREED || value === "Mixed breed") {
      setCustomBreed(true);
      setFormData({ ...formData, breed: "" });
    } else {
      setCustomBreed(false);
      setFormData({ ...formData, breed: value });
    }
  };

  // PHOTO UPLOAD
  const applyPhotoFile = async (file) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      notify("Please choose an image file.", "error");
      return;
    }

    const revision = ++photoRevision.current;
    try {
      const photo = await resizeImage(file);
      if (revision !== photoRevision.current) return;
      setFormData((current) => ({ ...current, photo_url: photo }));
    } catch (error) {
      console.error(error);
      notify("That image could not be read. Try another file.", "error");
    }
  };

  const handlePhotoPick = (e) => {
    applyPhotoFile(e.target.files[0]);
    e.target.value = ""; // lets the same file be picked again later
  };

  const handlePhotoDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    applyPhotoFile(e.dataTransfer.files[0]);
  };

  const removePhoto = () => {
    photoRevision.current += 1;
    setFormData({ ...formData, photo_url: "" });
  };

  const isUploadedPhoto = formData.photo_url.startsWith("data:");

  // CREATE AND UPDATE
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (saving) {
      return;
    }

    // empty optional fields are sent as null
    const payload = {
      ...formData,
      breed: mixedBreed ? "Mixed breed: " + formData.breed : formData.breed || null,
      sex: formData.sex || null,
      birth_date: formData.birth_date_unknown ? null : formData.birth_date || null,
      estimated_age_years: formData.birth_date_unknown && formData.estimated_age_years !== "" ? Number(formData.estimated_age_years) : null,
      estimated_age_months: formData.birth_date_unknown && formData.estimated_age_months !== "" ? Number(formData.estimated_age_months) : null,
      vaccinations:formData.vaccinations.map((v)=>({...v,vaccinated_at:v.vaccinated_at || null,next_due_at:v.next_due_at || null})),
      description: formData.description || null,
      photo_url: formData.photo_url || null,
      max_hours_alone: Number(formData.max_hours_alone),
      needed_by: formData.is_urgent && formData.needed_by ? formData.needed_by : null,
    };

    await run({
      title: editingId ? "Save changes to " + formData.name + "?" : "Add " + formData.name + "?",
      message: editingId ? "The animal's profile, health records and care rules will be updated. These details affect foster matching." : "This creates a rescue animal profile visible to foster volunteers. Review the health details and care rules before adding it.",
      confirmLabel: editingId ? "Save Changes" : "Add Animal",
    }, async () => {
      if (editingId) {
        await api.put('/admin/animals/' + editingId, payload);
        notify(formData.name + " updated.");
      } else {
        await api.post('/admin/animals', payload);
        notify(formData.name + " added. Volunteers can see them now.");
      }
      closeForm();
      refreshAnimals();
    });
  };

  // EDIT
  const editAnimal = (animal) => {
    setEditingId(animal.id);
    setMixedBreed(animal.breed?.startsWith("Mixed breed") || false);

    // a saved breed that isn't in the list was typed in with "Other"
    setCustomBreed(Boolean(animal.breed) && !breedsFor(animal.species).includes(animal.breed));

    setFormData({
      name: animal.name,
      species: animal.species,
      breed: animal.breed?.startsWith("Mixed breed: ") ? animal.breed.slice(13) : animal.breed || "",
      sex: animal.sex || "",
      birth_date: animal.birth_date || "",
      birth_date_unknown: !animal.birth_date,
      estimated_age_years: animal.estimated_age_years ?? "",
      estimated_age_months: animal.estimated_age_months ?? "",
      health_status: animal.health_status || "Records Unavailable",
      sterilization_status: normalizeSterilization(animal.sex, animal.sterilization_status),
      vaccinations: animal.vaccinations || [],
      description: animal.description || "",
      photo_url: animal.photo_url || "",
      apartment_ok: animal.apartment_ok,
      needs_yard: animal.needs_yard,
      good_with_cats: animal.good_with_cats,
      good_with_dogs: animal.good_with_dogs,
      kids_ok: animal.kids_ok,
      max_hours_alone: animal.max_hours_alone,
      care_rules_confirmed: false,
      urgent_reason: animal.urgent_reason || "",
      urgent_notes: animal.urgent_notes || "",
      is_urgent: animal.is_urgent,
      needed_by: animal.needed_by || "",
      status: animal.status,
    });

    openForm();
  };

  // DELETE
  const deleteAnimal = (animal) => run({
    title: "Delete " + animal.name + "?",
    message: "Their applications, placements and history will also be deleted. This cannot be undone.",
    confirmLabel: "Delete", danger: true,
  }, async () => {
    await api.delete('/admin/animals/' + animal.id);
    notify(animal.name + " was deleted.", "info");
    refreshAnimals();
  });

  return (
    <div className="stack animals-page">
      <div className="page-head">
        <div>
          <h1>Rescue animals</h1>
          <p className="muted">
            {animals.length} animal{animals.length === 1 ? "" : "s"} shown
          </p>
        </div>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={addAnimal}>
          + Add animal
        </button>
      </div>

      <div className="card filters">
        <label className="filter-search">
          <span className="sr-only">Search animals</span>
          <input
            type="search"
            placeholder="Search by name"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>

        <select
          aria-label="Species"
          value={filters.species}
          onChange={(e) => setFilters({ ...filters, species: e.target.value })}
        >
          <option value="">All species</option>
          <option value="dog">Dogs</option>
          <option value="cat">Cats</option>
        </select>
      </div>

      <div className="segmented status-tabs" role="group" aria-label="Filter by status">
        {["", ...STATUSES].map((status) => (
          <button
            key={status || "all"}
            type="button"
            className={filters.status === status ? "seg seg-active" : "seg"}
            aria-pressed={filters.status === status}
            onClick={() => setFilters({ ...filters, status })}
          >
            {status || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton rows={2} height={260} />
      ) : loadError ? (
        <LoadError message={loadError} onRetry={refreshAnimals} />
      ) : animals.length === 0 ? (
        <div className="card empty">
          <h2>No animals found</h2>
          <p className="muted">Try a different search or filter, or add a new animal.</p>
          <button type="button" className="btn btn-primary" onClick={addAnimal}>
            + Add animal
          </button>
        </div>
      ) : (
        <div className="animal-feed">
          {animals.map((animal) => (
            <article className="animal-post" key={animal.id} aria-labelledby={`animal-${animal.id}-name`}>
              <header className="animal-post-head">
                <span className="animal-post-avatar" aria-hidden="true">
                  <Icon name={animal.species === "cat" ? "cat" : "dog"} size={22}/>
                </span>
                <div className="animal-post-title">
                  <h3 id={`animal-${animal.id}-name`}>{animal.name}</h3>
                  <ul className="animal-post-meta muted" aria-label="Animal details">
                    <li>{animal.species === "cat" ? "Cat" : "Dog"}</li>
                    <li>{animal.age}</li>
                    {animal.sex && <li>{animal.sex}</li>}
                    {animal.breed && <li>{animal.breed}</li>}
                  </ul>
                </div>
                <div className="animal-post-flags">
                  {animal.is_urgent && (
                    <span className="badge badge-urgent">
                      {urgencyText(animal)}
                    </span>
                  )}
                  <StatusPill status={animal.status} />
                </div>
              </header>

              <div className="animal-post-details">
                <dl className="animal-post-health">
                  <div><dt>Health</dt><dd>{animal.health_status || "Unknown"}</dd></div>
                  <div><dt>Spay / neuter</dt><dd>{normalizeSterilization(animal.sex, animal.sterilization_status)}</dd></div>
                </dl>
                {animal.description && <p className="animal-post-text">{animal.description}</p>}
              </div>

              <div className="animal-post-photo">
                <PetPhoto pet={animal} />
              </div>

              <div className="tags animal-post-tags">
                <span className="tag">{animal.apartment_ok ? "Apartment OK" : "House only"}</span>
                {animal.needs_yard && <span className="tag">Fenced yard</span>}
                {animal.good_with_cats && <span className="tag">Cats OK</span>}
                {animal.good_with_dogs && <span className="tag">Dogs OK</span>}
                <span className="tag">Alone up to {animal.max_hours_alone}h</span>
              </div>

              <div className="animal-post-actions">
                <button type="button" disabled={saving} onClick={() => editAnimal(animal)}>
                  <Icon name="edit" size={17}/> Edit
                </button>
                <button type="button" onClick={() => setHistoryFor(animal)}>
                  <Icon name="history" size={17}/> History
                </button>
                <button type="button" className="animal-post-delete" disabled={saving} onClick={() => deleteAnimal(animal)}>
                  <Icon name="trash" size={17}/> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="animal-form-title"
        onCancel={(e) => { if (saving) e.preventDefault(); }}
        onClose={resetForm}
        onClick={(e) => !saving && e.target === dialogRef.current && closeForm()}
      >
        <ValidatedForm className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-head">
            <h2 id="animal-form-title">{editingId ? `Edit ${formData.name || "animal"}` : "Add animal"}</h2>
            <button type="button" className="modal-close" aria-label="Close" disabled={saving} onClick={closeForm}>
              <Icon name="x"/>
            </button>
          </div>

          <div className="modal-body">
            <section className="form-section">
              <h3>Basic info</h3>
              <div className="field-grid">
                <label className="field">
                  <span>Name <span className="required-mark" aria-hidden="true">*</span></span>
                  <input type="text" name="name" value={formData.name} onChange={handleChange} required />
                </label>

                <label className="field">
                  Species
                  <select name="species" value={formData.species} onChange={handleSpeciesChange}>
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                  </select>
                </label>

                <div className="field">
                  <label htmlFor="animal-breed">Breed</label>
                  <select
                    id="animal-breed"
                    value={mixedBreed ? "Mixed breed" : customBreed ? OTHER_BREED : formData.breed}
                    onChange={handleBreedSelect}
                  >
                    <option value="">Not sure / unknown</option>
                    {breedsFor(formData.species).map((breed) => (
                      <option key={breed} value={breed}>{breed}</option>
                    ))}
                    <option value={OTHER_BREED}>Other (type it in)</option>
                  </select>

                  <datalist id="breed-suggestions">{breedsFor(formData.species).filter((breed) => breed !== "Mixed breed").map((breed) => <option key={breed} value={breed} />)}</datalist>
                  {(customBreed || mixedBreed) && (
                    <input
                      type="text"
                      name="breed"
                      aria-label={mixedBreed ? "Mixed breed details" : "Other breed"}
                      list="breed-suggestions"
                      placeholder="Type the breed"
                      maxLength={mixedBreed ? 87 : 100}
                      value={formData.breed}
                      onChange={handleChange}
                      required={mixedBreed}
                      autoFocus
                    />
                  )}
                </div>

                <label className="field">
                  Sex
                  <select name="sex" value={formData.sex} onChange={handleChange}>
                    <option value="">Unknown</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>

                <fieldset className="animal-age-group">
                  <legend>Birthday & age</legend>
                  <p className="field-hint">Add a known birthday, or use an estimated age when rescue records are incomplete.</p>
                  <div className="animal-age-fields">
                <label className="field">Date of Birth
                  <input type="date" name="birth_date" max={localToday()} value={formData.birth_date} disabled={formData.birth_date_unknown} onChange={(e) => setFormData({...formData,birth_date:e.target.value,estimated_age_years:"",estimated_age_months:""})} />
                  <span className="field-hint" aria-live="polite">{formData.birth_date && !formData.birth_date_unknown ? animalAge(formData.birth_date) : estimatedAge(formData.estimated_age_years,formData.estimated_age_months)}</span>
                </label>
                <label className="check"><input type="checkbox" name="birth_date_unknown" checked={formData.birth_date_unknown} onChange={(e) => setFormData({...formData,birth_date_unknown:e.target.checked,birth_date:"",estimated_age_years:"",estimated_age_months:""})} />Date of birth unknown</label>
                {formData.birth_date_unknown && <div className="field-grid">
                  <label className="field">Estimated age in years (optional)<input type="number" name="estimated_age_years" min="0" max="100" step="1" placeholder="Years" value={formData.estimated_age_years} onChange={handleChange} /></label>
                  <label className="field">Estimated age in months (optional)<input type="number" name="estimated_age_months" min="0" max="11" step="1" placeholder="Months (0-11)" value={formData.estimated_age_months} onChange={handleChange} /></label>
                </div>}
                  </div>
                </fieldset>
                <label className="field">Health Status<select name="health_status" value={formData.health_status} onChange={(e) => setFormData({...formData, health_status:e.target.value, vaccinations: ["Vaccinated", "Vaccination Due Soon"].includes(e.target.value) ? formData.vaccinations : []})}>{HEALTH_STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="field">Spay/Neuter Status<select name="sterilization_status" value={formData.sterilization_status} onChange={handleChange}>{sterilizationOptions(formData.sex).map((value) => <option key={value}>{value}</option>)}</select></label>
                <p className="muted small">Status: {editingId ? formData.status : "Awaiting Foster"}. Updated automatically through applications and placements.</p>
              </div>

              {["Vaccinated", "Vaccination Due Soon"].includes(formData.health_status) && <fieldset className="plain stack-sm"><legend>Vaccines (select all that apply)</legend>
                {vaccinesFor(formData.species).map((type) => {
                  const record = formData.vaccinations.find((v) => v.type === type);
                  const update = (field, value) => setFormData((current) => ({...current, vaccinations:current.vaccinations.map((v) => v.type === type ? {...v,[field]:value} : v)}));
                  return <div className="card stack-sm" key={type}>
                    <label className="check"><input type="checkbox" checked={Boolean(record)} onChange={(e) => setFormData({...formData, vaccinations:e.target.checked ? [...formData.vaccinations,{type,other_name:"",vaccinated_at:null,next_due_at:""}] : formData.vaccinations.filter((v) => v.type !== type)})} />{type}</label>
                    {record && <div className="field-grid">
                      {type === "Other" && <label className="field"><span>Vaccine name <span className="required-mark" aria-hidden="true">*</span></span><input value={record.other_name || ""} maxLength={100} onChange={(e) => update("other_name",e.target.value)} required /></label>}
                      <label className="check"><input type="checkbox" aria-label={"Unknown vaccination date for " + type} checked={record.vaccinated_at == null} onChange={(e) => update("vaccinated_at",e.target.checked ? null : "")} />Vaccination date unknown</label>
                      <label className="field">Vaccination date (optional)<input aria-label={"Vaccination date for " + type} type="date" max={localToday()} min={formData.birth_date || undefined} value={record.vaccinated_at || ""} disabled={record.vaccinated_at == null} onChange={(e) => update("vaccinated_at",e.target.value)} /></label>
                      <label className="field">Next due date<input type="date" min={record.vaccinated_at || undefined} value={record.next_due_at || ""} onChange={(e) => update("next_due_at",e.target.value)} required={formData.health_status === "Vaccination Due Soon"} /></label>
                    </div>}
                  </div>;
                })}
              </fieldset>}
              <label className="field">
                Description
                <textarea name="description" rows="3" value={formData.description} onChange={handleChange} />
              </label>
            </section>

            <section className="form-section">
              <h3>Photo</h3>

              {formData.photo_url ? (
                <div className="photo-current">
                  <img src={formData.photo_url} alt={`${formData.name || "Animal"} preview`} />
                  <div className="photo-current-actions">
                    <label className="btn btn-outline btn-sm">
                      Change
                      <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoPick} />
                    </label>
                    <button type="button" className="btn btn-danger btn-sm" onClick={removePhoto}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  className={dragging ? "dropzone dropzone-active" : "dropzone"}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handlePhotoDrop}
                >
                  <span className="dropzone-icon" aria-hidden="true">+</span>
                  <strong>Drop a photo here or click to upload</strong>
                  <span className="small">JPG, PNG or WebP. Large photos are shrunk automatically.</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoPick} />
                </label>
              )}

              <label className="field">
                Or paste a photo link
                <input
                  name="photo_url"
                  type="url"
                  placeholder={isUploadedPhoto ? "Using uploaded image" : "https://..."}
                  value={isUploadedPhoto ? "" : formData.photo_url}
                  onChange={handleChange}
                />
              </label>
            </section>

            <section className="form-section">
              <h3>Care rules</h3>
              <p className="muted small">Used to match this animal with volunteers' homes.</p>

              {CARE_RULES.map((rule) => <fieldset className="plain" key={rule.name}>
                <legend>{rule.label} <span className="required-mark" aria-hidden="true">*</span></legend>
                <OptionGroup name={rule.name} value={formData[rule.name]} options={[{value:true,label:rule.yes}, {value:false,label:rule.no}]} onChange={(value) => setFormData((current) => ({...current, [rule.name]:value}))} />
              </fieldset>)}
              {formData.is_urgent && formData.needed_by && urgencyText(formData) === "Overdue" && <p className="notice notice-info">Overdue: renew the deadline or clear urgency.</p>}
              <label className="check"><input type="checkbox" name="is_urgent" checked={formData.is_urgent} onChange={handleChange} /> Mark as urgent</label>
              <p className="muted small">Use urgent for time-sensitive welfare or shelter capacity needs. This affects listing order, never the compatibility score or safety requirements.</p>
              {formData.is_urgent && <label className="field"><span>Reason for urgency <span className="required-mark" aria-hidden="true">*</span></span><select name="urgent_reason" value={formData.urgent_reason} onChange={handleChange} required><option value="">Select a reason</option>{["Medical care", "Shelter capacity", "Transport deadline"].map(reason => <option key={reason}>{reason}</option>)}</select></label>}
              {formData.is_urgent && <label className="field"><span>Optional urgency notes</span><textarea name="urgent_notes" value={formData.urgent_notes} onChange={handleChange} maxLength={500} /></label>}
              {formData.is_urgent && (
                <label className="field deadline-field">
                  Needs a home by (required)
                  <input type="date" name="needed_by" value={formData.needed_by} onChange={handleChange} required />
                  <span className="field-hint">Shown to volunteers on the urgent badge and on your dashboard.</span>
                </label>
              )}

              <fieldset className="plain">
                <legend>Children</legend>
                <OptionGroup
                  name="kids_ok"
                  value={formData.kids_ok}
                  options={ANIMAL_KIDS}
                  onChange={(value) => setFormData({ ...formData, kids_ok: value })}
                />
              </fieldset>

              <fieldset className="plain">
                <legend>Time alone</legend>
                <OptionGroup
                  name="max_hours_alone"
                  value={formData.max_hours_alone === "" ? "" : Number(formData.max_hours_alone)}
                  options={ANIMAL_HOURS}
                  onChange={(value) => setFormData({ ...formData, max_hours_alone: value })}
                />
              </fieldset>
              <label className="check"><input type="checkbox" name="care_rules_confirmed" checked={formData.care_rules_confirmed} onChange={handleChange} required /> I have assessed and defined every care, behavior and household safety rule for this pet.</label>
            </section>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={closeForm}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Add animal"}
            </button>
          </div>
        </ValidatedForm>
      </dialog>

      {historyFor && <AnimalHistory animal={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}
