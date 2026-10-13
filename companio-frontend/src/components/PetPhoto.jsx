// Shows the photo if the animal has one, otherwise a striped placeholder with its name
export default function PetPhoto({ pet, className = "" }) {
  if (pet.photo_url) {
    return <img className={`pet-photo ${className}`} src={pet.photo_url} alt={pet.name} />;
  }

  return (
    <div className={`pet-photo photo-placeholder ${className}`}>
      <span>{pet.species === "cat" ? "Cat" : "Dog"} photo</span>
    </div>
  );
}
