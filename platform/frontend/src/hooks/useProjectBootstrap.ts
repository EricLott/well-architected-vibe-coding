import { useEffect } from "react";
import { projectService } from "../services/projectService";
import { useAppDispatch } from "../state/AppContext";

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to load persisted project state.";
}

export function useProjectBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isMounted = true;

    async function loadLatestProject() {
      dispatch({ type: "app-bootstrap-start" });
      try {
        const projects = await projectService.listProjects();
        if (!isMounted) {
          return;
        }
        dispatch({
          type: "app-bootstrap-success",
          payload: projects[0] ?? null,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        dispatch({ type: "app-bootstrap-failure", payload: getMessage(error) });
      }
    }

    loadLatestProject();
    return () => {
      isMounted = false;
    };
  }, [dispatch]);
}
