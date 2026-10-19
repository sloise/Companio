import { useCallback, useRef, useState } from "react";
import { useFeedback } from "../context/feedback";
import { errorMessage } from "../api/client";

// Lock synchronously before opening the dialog and hold the lock through the API request.
export default function useConfirmedAction() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const { confirm, notify } = useFeedback();
  const run = useCallback(async (options, action) => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    try {
      const answer = await confirm(options);
      if (!answer) return false;
      await action(answer);
      return true;
    } catch (error) {
      notify(error.isAxiosError || error.response ? errorMessage(error) : error.message || "The action could not be completed.", "error");
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, [confirm, notify]);
  return { run, busy };
}
