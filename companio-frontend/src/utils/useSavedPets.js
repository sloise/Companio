import { useEffect, useRef, useState } from "react";
import api, { errorMessage } from "../api/client";
import { useFeedback } from "../context/feedback";

// The volunteer's saved pets (heart button), shared by the match feed and the pet profile.
// saved = [{ id, name, species, status, open }]
export default function useSavedPets() {
  const { notify } = useFeedback();
  const pending = useRef(new Set());
  const [saved, setSaved] = useState([]);

  // READ
  useEffect(() => {
    const getSaved = async () => {
      try {
        const response = await api.get("/favorites");
        setSaved(response.data);
      } catch {
        // saving is a nice extra - the page still works without it
      }
    };

    getSaved();
  }, []);

  const isSaved = (petId) => saved.some((pet) => pet.id === petId);

  const toggleSaved = async (pet) => {
    if (pending.current.has(pet.id)) return;
    pending.current.add(pet.id);
    const wasSaved = isSaved(pet.id);
    try {
      if (wasSaved) await api.delete('/favorites/'+pet.id);
      else await api.post('/favorites/'+pet.id);
      setSaved((current) => wasSaved ? current.filter((item)=>item.id!==pet.id) : [...current,{id:pet.id,name:pet.name,species:pet.species,status:pet.status,open:true}]);
      notify(wasSaved ? pet.name + " removed from saved pets." : pet.name + " saved.");
    } catch(error) {notify(errorMessage(error),"error");}
    finally {pending.current.delete(pet.id);}
  };
  const forget = async (petId) => {
    if (pending.current.has(petId)) return;
    pending.current.add(petId);
    try {await api.delete('/favorites/'+petId);setSaved((current)=>current.filter((item)=>item.id!==petId));}
    catch(error){notify(errorMessage(error),"error");}
    finally {pending.current.delete(petId);}
  };

  return { saved, isSaved, toggleSaved, forget };
}
