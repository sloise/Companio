import { createContext, useContext } from "react";

// Pop-up messages and confirm boxes, shared by every page. Filled in by <FeedbackProvider>.
//   const { notify, confirm } = useFeedback();
//   notify("Saved!")                      -> a small message in the corner
//   notify("Something broke", "error")
//   if (await confirm({ title, message, confirmLabel, danger: true })) { ... }
export const FeedbackContext = createContext(null);

export function useFeedback() {
  return useContext(FeedbackContext);
}
