// Shared option lists. The "value" is what Laravel stores.

export const HOUSING = [
  { value: "apartment", label: "Apartment / condo" },
  { value: "house", label: "House" },
  { value: "townhouse", label: "Townhouse" },
  { value: "dormitory", label: "Dormitory / boarding" },
];

export const YARD = [
  { value: "none", label: "No yard", hint: "No outdoor space" },
  { value: "small", label: "Small or shared", hint: "Patio, garden or common area" },
  { value: "fenced", label: "Fenced yard", hint: "Private and secure for a dog to run" },
];

export const KIDS = [
  { value: "none", label: "No children" },
  { value: "older", label: "Ages 10 and up" },
  { value: "young", label: "Under 10" },
];

export const HOURS_ALONE = [
  { value: 0, label: "None", hint: "Someone is always home" },
  { value: 4, label: "Under 4 hours" },
  { value: 8, label: "4-8 hours" },
  { value: 12, label: "More than 8 hours" },
];

export const EXPERIENCE = [
  { value: "first_time", label: "First-time" },
  { value: "some", label: "Some experience" },
  { value: "experienced", label: "Experienced / trained" },
];

// Animal side
export const ANIMAL_KIDS = [
  { value: "any", label: "OK with children of any age" },
  { value: "older", label: "Children 10 and up only" },
  { value: "none", label: "No children in the home" },
];

export const ANIMAL_HOURS = [
  { value: 4, label: "Up to 4 hours alone" },
  { value: 8, label: "Up to 8 hours alone" },
  { value: 12, label: "Can be alone 8+ hours" },
];

// Breed choices in the admin animal form ("Other" lets staff type any breed)
export const DOG_BREEDS = [
  "Aspin (Asong Pinoy)",
  "Mixed breed",
  "Beagle",
  "Belgian Malinois",
  "Chihuahua",
  "Dachshund",
  "Dobermann",
  "French Bulldog",
  "German Shepherd",
  "Golden Retriever",
  "Husky",
  "Japanese Spitz",
  "Labrador Retriever",
  "Maltese",
  "Pomeranian",
  "Poodle",
  "Pug",
  "Rottweiler",
  "Shih Tzu",
];

export const CAT_BREEDS = [
  "Puspin (Pusang Pinoy)",
  "Mixed breed",
  "American Shorthair",
  "Bengal",
  "British Shorthair",
  "Maine Coon",
  "Persian",
  "Ragdoll",
  "Russian Blue",
  "Scottish Fold",
  "Siamese",
  "Sphynx",
];

export const STATUSES =["Awaiting Foster", "Under Review", "In Foster Care", "Adopted"];

export const EXPERIENCE_LABEL = {
  first_time: "First-time",
  some: "Some experience",
  experienced: "Experienced / trained",
};

// "All" sends min_match=0, so every available pet is shown whatever its score
export const MATCH_OPTIONS = [
  { value: 0, label: "All", short: "All" },
  { value: 60, label: "60% and up", short: "60%" },
  { value: 80, label: "80% and up", short: "80%" },
  { value: 100, label: "100% only", short: "100%" },
];
