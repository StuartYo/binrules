import { recordSpend } from "./budget";
import { setGuard } from "./llm";

let installed = false;
/** Server side: every model call adds its cost to today's total. */
export function installSpendGuard() {
  if (installed) return;
  installed = true;
  setGuard({ after: (r) => recordSpend(r.costUsd) });
}
