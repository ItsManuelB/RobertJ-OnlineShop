"use client";

import { useEffect, useState } from "react";

/**
 * State for a Turnstile widget that guards a Server Action form. Tokens are
 * single-use, so after every submit attempt the token is cleared and
 * `widgetKey` changes — pass it as the widget's `key` to mount a fresh one.
 * `successCount` increments on each successful submit, for remounting the form
 * to clear its fields.
 *
 * `result` is the form action's latest state (null before the first submit).
 */
export function useTurnstileToken(result: { success: boolean } | null) {
  const [token, setToken] = useState("");
  const [widgetKey, setWidgetKey] = useState(0);
  const [successCount, setSuccessCount] = useState(0);

  useEffect(() => {
    if (!result) return;
    // Reset after every submit attempt, success or failure — see the doc comment.
    /* eslint-disable react-hooks/set-state-in-effect */
    setToken("");
    setWidgetKey((key) => key + 1);
    if (result.success) setSuccessCount((count) => count + 1);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [result]);

  return { token, setToken, widgetKey, successCount };
}
