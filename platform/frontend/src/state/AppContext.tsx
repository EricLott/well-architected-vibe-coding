import { createContext, useContext, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import type { AppState, ProjectState, RetrievalResult } from "../types/app";

const initialState: AppState = {
  currentPhase: "idea-intake",
  pillarFocus: "Idea intake (Phase 1)",
  projectSummary:
    "No app idea provided yet, so intake can't start without assumptions.",
  questions: [
    "What app do you want to build (who it's for, what problem it solves, and the main user workflow)?",
  ],
  decisions: [],
  risks: [
    "Starting without a concrete idea would produce weak or incorrect architecture decisions.",
  ],
  openQuestions: ["App type", "Target users", "Core workflows", "Constraints"],
  nextStep: "Share the idea in 2-4 sentences and I'll start Phase 1 immediately.",
  intakeText: "",
  currentProject: null,
  intakeLoading: false,
  intakeError: null,
  retrievalQuery: "authentication strategy",
  retrievedGuidance: [],
  retrievalLoading: false,
  retrievalError: null,
};

type AppAction =
  | { type: "set-intake-text"; payload: string }
  | { type: "start-intake" }
  | { type: "intake-success"; payload: ProjectState }
  | { type: "intake-failure"; payload: string }
  | { type: "set-retrieval-query"; payload: string }
  | { type: "start-retrieval" }
  | { type: "retrieval-success"; payload: RetrievalResult[] }
  | { type: "retrieval-failure"; payload: string };

function mergeUnique(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...existing, ...incoming]) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "set-intake-text":
      return {
        ...state,
        intakeText: action.payload,
      };
    case "start-intake":
      return {
        ...state,
        intakeLoading: true,
        intakeError: null,
      };
    case "intake-success":
      return {
        ...state,
        currentPhase: "project-initialized",
        projectSummary:
          "Project initialized from your idea. Continue with pillar-guided architecture decisions before code generation.",
        currentProject: action.payload,
        questions: action.payload.discoveryQuestions,
        risks: mergeUnique(state.risks, action.payload.risks),
        openQuestions: action.payload.suggestedOpenQuestions,
        nextStep: action.payload.recommendedNextAction,
        intakeLoading: false,
        intakeError: null,
      };
    case "intake-failure":
      return {
        ...state,
        intakeLoading: false,
        intakeError: action.payload,
      };
    case "set-retrieval-query":
      return {
        ...state,
        retrievalQuery: action.payload,
      };
    case "start-retrieval":
      return {
        ...state,
        retrievalLoading: true,
        retrievalError: null,
      };
    case "retrieval-success":
      return {
        ...state,
        retrievalLoading: false,
        retrievalError: null,
        retrievedGuidance: action.payload,
      };
    case "retrieval-failure":
      return {
        ...state,
        retrievalLoading: false,
        retrievalError: action.payload,
      };
    default:
      return state;
  }
}

const AppStateContext = createContext<AppState | undefined>(undefined);
const AppDispatchContext = createContext<Dispatch<AppAction> | undefined>(
  undefined,
);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppProvider");
  }
  return context;
}

export function useAppDispatch(): Dispatch<AppAction> {
  const context = useContext(AppDispatchContext);
  if (!context) {
    throw new Error("useAppDispatch must be used within an AppProvider");
  }
  return context;
}
