import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { errorMessage } from "../../api/client";
import { useFeedback } from "../../context/feedback";
import OptionGroup from "../../components/OptionGroup";
import PetPhoto from "../../components/PetPhoto";
import StatusPill from "../../components/StatusPill";
import AnimalHistory from "../../components/AnimalHistory";
import { LoadError, Skeleton } from "../../components/PageStates";
import { formatDate } from "../../utils/format";
import { ANIMAL_HOURS, ANIMAL_KIDS, CAT_BREEDS, DOG_BREEDS, STATUSES } from "../../constants";

const OTHER_BREED = "__other";

const breedsFor = (species) => (species === "cat" ? CAT_BREEDS : DOG_BREEDS);

const EMPTY_FORM = {
  name: "",
  species: "dog",
  breed: "",
  sex: "",
  age: "",
  description: "",
  photo_url: "",
  apartment_ok: true,
  needs_yard: false,
  good_with_cats: true,
  good_with_dogs: true,
  kids_ok: "any",
  max_hours_alone: 8,
  is_urgent: false,
  needed_by: "",
  status: "Awaiting Foster",
};

const CARE_RULES = [
  { name: "apartment_ok", label: "Can live in an apartment" },
  { name: "needs_yard", label: "Needs a fenced yard" },
  { name: "good_with_cats", label: "Good with cats" },
  { name: "good_with_dogs", label: "Good with dogs" },
  { name: "is_urgent", label: "Mark as urgent" },
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
  const { notify, confirm } = useFeedback();

  const [animals, setAnimals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0); // bump to load the list again
  const [historyFor, setHistoryFor] = useState(null); // animal whose history window is open
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [customBreed, setCustomBreed] = useState(false); // true when "Other" is picked

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
    });
  };

  // BREED
  const handleSpeciesChange = (e) => {
    const species = e.target.value;

    // a dog breed doesn't make sense for a cat, so clear a picked breed from the old list
    const keepBreed = customBreed || breedsFor(species).includes(formData.breed);

    setFormData({ ...formData, species, breed: keepBreed ? formData.breed : "" });
  };

  const handleBreedSelect = (e) => {
    const { value } = e.target;

    if (value === OTHER_BREED) {
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

    try {
      const photo = await resizeImage(file);
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
    setFormData({ ...formData, photo_url: "" });
  };

  const isUploadedPhoto = formData.photo_url.startsWith("data:");

  // CREATE AND UPDATE
  const handleSubmit = async (e) => {
    e.preventDefault();

    // empty optional fields are sent as null
    const payload = {
      ...formData,
      breed: formData.breed || null,
      sex: formData.sex || null,
      description: formData.description || null,
      photo_url: formData.photo_url || null,
      max_hours_alone: Number(formData.max_hours_alone),
      needed_by: formData.is_urgent && formData.needed_by ? formData.needed_by : null,
    };

    try {
      if (editingId) {
        // UPDATE
        await api.put(`/admin/animals/${editingId}`, payload);
        notify(`${formData.name} updated.`);
      } else {
        // CREATE
        await api.post("/admin/animals", payload);
        notify(`${formData.name} added. Volunteers can see them now.`);
      }

      closeForm();
      refreshAnimals();
    } catch (error) {
      console.error(error);
      notify(errorMessage(error), "error");
    }
  };

  // EDIT
  const editAnimal = (animal) => {
    setEditingId(animal.id);

    // a saved breed that isn't in the list was typed in with "Other"
    setCustomBreed(Boolean(animal.breed) && !breedsFor(animal.species).includes(animal.breed));

    setFormData({
      name: animal.name,
      species: animal.species,
      breed: animal.breed || "",
      sex: animal.sex || "",
      age: animal.age,
      description: animal.description || "",
      photo_url: animal.photo_url || "",
      apartment_ok: animal.apartment_ok,
      needs_yard: animal.needs_yard,
      good_with_cats: animal.good_with_cats,
      good_with_dogs: animal.good_with_dogs,
      kids_ok: animal.kids_ok,
      max_hours_alone: animal.max_hours_alone,
      is_urgent: animal.is_urgent,
      needed_by: animal.needed_by || "",
      status: animal.status,
    });

    openForm();
  };

  // DELETE
  const deleteAnimal = async (animal) => {
    const confirmDelete = await confirm({
      title: `Delete ${animal.name}?`,
      message: "Their applications, placements and history will be deleted too. This can't be undone.",
      confirmLabel: "Delete animal",
      danger: true,
    });

    if (!confirmDelete) {
      return;
    }

    try {
      await api.delete(`/admin/animals/${animal.id}`);
      notify(`${animal.name} was deleted.`, "info");
      refreshAnimals();
    } catch (error) {
      console.error(error);
      notify(errorMessage(error), "error");
    }
  };

  return (
    <div className="stack animals-page">
      <div className="page-head">
        <div>
          <h1>Rescue animals</h1>
          <p className="muted">
            {animals.length} animal{animals.length === 1 ? "" : "s"} shown
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={addAnimal}>
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
                  {animal.species === "cat" ? "🐱" : "🐶"}
                </span>
                <div className="animal-post-title">
                  <h3 id={`animal-${animal.id}-name`}>{animal.name}</h3>
                  <p className="muted small">
                    {animal.species === "cat" ? "Cat" : "Dog"} · {animal.age}
                    {animal.sex ? ` · ${animal.sex}` : ""}
                    {animal.breed ? ` · ${animal.breed}` : ""}
                  </p>
                </div>
                <div className="animal-post-flags">
                  {animal.is_urgent && (
                    <span className="badge badge-urgent">
                      Urgent{animal.needed_by ? ` · by ${formatDate(animal.needed_by)}` : ""}
                    </span>
                  )}
                  <StatusPill status={animal.status} />
                </div>
              </header>

              {animal.description && <p className="animal-post-text">{animal.description}</p>}

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
                <button type="button" onClick={() => editAnimal(animal)}>
                  <span aria-hidden="true">✏️</span> Edit
                </button>
                <button type="button" onClick={() => setHistoryFor(animal)}>
                  <span aria-hidden="true">🕑</span> History
                </button>
                <button type="button" className="animal-post-delete" onClick={() => deleteAnimal(animal)}>
                  <span aria-hidden="true">🗑️</span> Delete
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
        onClose={resetForm}
        onClick={(e) => e.target === dialogRef.current && closeForm()}
      >
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-head">
            <h2 id="animal-form-title">{editingId ? `Edit ${formData.name || "animal"}` : "Add animal"}</h2>
            <button type="button" className="modal-close" aria-label="Close" onClick={closeForm}>
              ×
            </button>
          </div>

          <div className="modal-body">
            <section className="form-section">
              <h3>Basic info</h3>
              <div className="field-grid">
                <label className="field">
                  Name
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
                    value={customBreed ? OTHER_BREED : formData.breed}
                    onChange={handleBreedSelect}
                  >
                    <option value="">Not sure / unknown</option>
                    {breedsFor(formData.species).map((breed) => (
                      <option key={breed} value={breed}>{breed}</option>
                    ))}
                    <option value={OTHER_BREED}>Other (type it in)</option>
                  </select>

                  {customBreed && (
                    <input
                      type="text"
                      name="breed"
                      aria-label="Other breed"
                      placeholder="Type the breed"
                      maxLength={100}
                      value={formData.breed}
                      onChange={handleChange}
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

                <label className="field">
                  Age
                  <input
                    type="text"
                    name="age"
                    placeholder="e.g. 2 yrs"
                    value={formData.age}
                    onChange={handleChange}
                    required
                  />
                </label>

                <label className="field">
                  Status
                  <select name="status" value={formData.status} onChange={handleChange}>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              </div>

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

              <div className="option-grid">
                {CARE_RULES.map((rule) => (
                  <label
                    key={rule.name}
                    className={formData[rule.name] ? "option option-selected" : "option"}
                  >
                    <input
                      type="checkbox"
                      name={rule.name}
                      checked={formData[rule.name]}
                      onChange={handleChange}
                    />
                    <strong>{rule.label}</strong>
                  </label>
                ))}
              </div>

              {formData.is_urgent && (
                <label className="field deadline-field">
                  Needs a home by (optional)
                  <input type="date" name="needed_by" value={formData.needed_by} onChange={handleChange} />
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
                  value={Number(formData.max_hours_alone)}
                  options={ANIMAL_HOURS}
                  onChange={(value) => setFormData({ ...formData, max_hours_alone: value })}
                />
              </fieldset>
            </section>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-outline" onClick={closeForm}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingId ? "Save changes" : "Add animal"}
            </button>
          </div>
        </form>
      </dialog>

      {historyFor && <AnimalHistory animal={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}
