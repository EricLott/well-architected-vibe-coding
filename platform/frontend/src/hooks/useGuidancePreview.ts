import { useCallback } from "react";
import { useAppDispatch, useAppState } from "../state/AppContext";
import { retrievalService } from "../services/retrievalService";

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to retrieve guidance at the moment.";
}

export function useGuidancePreview() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const setQuery = useCallback(
    (query: string) => {
      dispatch({ type: "set-retrieval-query", payload: query });
    },
    [dispatch],
  );

  const runQuery = useCallback(async () => {
    const query = state.retrievalQuery.trim();
    if (!query) {
      dispatch({
        type: "retrieval-failure",
        payload: "Enter a query to preview grounded guidance.",
      });
      return;
    }

    dispatch({ type: "start-retrieval" });
    try {
      const response = await retrievalService.retrieve({ query, topK: 4 });
      dispatch({ type: "retrieval-success", payload: response.results });
    } catch (error) {
      dispatch({ type: "retrieval-failure", payload: getMessage(error) });
    }
  }, [dispatch, state.retrievalQuery]);

  return {
    query: state.retrievalQuery,
    results: state.retrievedGuidance,
    isLoading: state.retrievalLoading,
    errorMessage: state.retrievalError,
    setQuery,
    runQuery,
  };
}
