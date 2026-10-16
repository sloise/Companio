import { useEffect, useState } from "react";
import api from "../api/client";

// The volunteer's foster limit: { limit, active, pending, used, remaining, completed, reasons }
// (null while loading or if it couldn't be loaded - pages then simply don't show it)
export default function useFosterLimit(reloadKey = 0) {
  const [limit, setLimit] = useState(null);

  useEffect(() => {
    const getLimit = async () => {
      try {
        const response = await api.get("/my-limit");
        setLimit(response.data);
      } catch {
        // the server still enforces the limit, this is only for display
      }
    };

    getLimit();
  }, [reloadKey]);

  return limit;
}
