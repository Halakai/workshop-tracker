import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/** How many app pages are behind the current one in this tab (React Router keeps the index in history.state). */
function historyIndex(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' ? idx : 0;
}

/**
 * Back to the page the user came from. When there is none (the app was opened on this page from a link or a
 * bookmark), go to `fallback` instead. `steps` skips pages that make no sense any more, e.g. 2 after deleting
 * from an edit form: the form and the deleted record's page.
 */
export function useGoBack() {
  const navigate = useNavigate();
  return useCallback(
    (fallback: string, steps = 1) => {
      if (historyIndex() >= steps) navigate(-steps);
      else navigate(fallback, { replace: true });
    },
    [navigate],
  );
}
