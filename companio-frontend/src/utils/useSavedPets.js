import { useEffect, useState } from "react";
import api, { errorMessage } from "../api/client";
import { useFeedback } from "../context/feedback";

// The volunteer's saved pets (heart button), shared by the match feed and the pet profile.
// saved = [{ id, name, species, status, open }]
export default function useSavedPets() {
  const { notify } = useFeedback();
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

  // CREATE / DELETE - the heart updates right away, then the server is told
  const toggleSaved = async (pet) => {
    const wasSaved = isSaved(pet.id);

    setSaved((current) =>
      wasSaved
        ? current.filter((item) => item.id !== pet.id)
        : [...current, { id: pet.id, name: pet.name, species: pet.species, status: pet.status, open: true }]
    );

    try {
      if (wasSaved) {
        await api.delete(`/favorites/${pet.id}`);
        notify(`${pet.name} removed from saved pets.`, "info");
      } else {
        await api.post(`/favorites/${pet.id}`);
        notify(`${pet.name} saved. Find them again with "Saved pets only".`);
      }
    } catch (error) {
      // undo the change if the server said no
      setSaved((current) =>
        wasSaved ? [...current, { id: pet.id, name: pet.name, species: pet.species, status: pet.status, open: true }] : current.filter((item) => item.id !== pet.id)
      );
      notify(errorMessage(error), "error");
    }
  };

  // remove without a message (used for "dismiss" on pets that found a home)
  const forget = async (petId) => {
    setSaved((current) => current.filter((item) => item.id !== petId));
    try {
      await api.delete(`/favorites/${petId}`);
    } catch {
      // harmless - it will show again next time
    }
  };

  return { saved, isSaved, toggleSaved, forget };
}
