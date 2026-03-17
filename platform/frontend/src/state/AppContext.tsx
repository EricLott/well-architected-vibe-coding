import { createContext, useContext, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import type {
  AiSettings,
  AppState,
  AssistantGuideResponse,
  ConflictAnalysis,
  DecisionGraph,
  DecisionLink,
  GeneratedOutputs,
  Pillar,
  PillarGuidance,
  ProjectState,
  RetrievalResult,
} from "../types/app";
import { defaultAiSettings, loadAiSettings } from "../services/aiSettingsStorage";

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
  appLoading: false,
  appError: null,
  selectedPillar: "Security",
  pillarGuidance: null,
  pillarLoading: false,
  pillarError: null,
  decisionSaving: false,
  decisionError: null,
  decisionLinks: [],
  decisionGraph: null,
  graphLoading: false,
  graphError: null,
  conflicts: null,
  conflictLoading: false,
  conflictError: null,
  outputs: null,
  outputsLoading: false,
  outputsError: null,
  aiSettings: typeof window !== "undefined" ? loadAiSettings() : defaultAiSettings(),
  guideLoading: false,
  guideError: null,
  guideResponse: null,
};

type AppAction =
  | { type: "app-bootstrap-start" }
  | { type: "app-bootstrap-success"; payload: ProjectState | null }
  | { type: "app-bootstrap-failure"; payload: string }
  | { type: "set-intake-text"; payload: string }
  | { type: "start-intake" }
  | { type: "intake-success"; payload: ProjectState }
  | { type: "intake-failure"; payload: string }
  | { type: "set-retrieval-query"; payload: string }
  | { type: "start-retrieval" }
  | { type: "retrieval-success"; payload: RetrievalResult[] }
  | { type: "retrieval-failure"; payload: string }
  | { type: "set-selected-pillar"; payload: Pillar }
  | { type: "start-pillar-guidance" }
  | { type: "pillar-guidance-success"; payload: PillarGuidance }
  | { type: "pillar-guidance-failure"; payload: string }
  | { type: "start-decision-save" }
  | { type: "decision-save-success"; payload: ProjectState }
  | { type: "decision-save-failure"; payload: string }
  | { type: "start-graph-load" }
  | { type: "graph-load-success"; payload: DecisionGraph }
  | { type: "graph-load-failure"; payload: string }
  | { type: "start-conflict-analysis" }
  | { type: "conflict-analysis-success"; payload: ConflictAnalysis }
  | { type: "conflict-analysis-failure"; payload: string }
  | { type: "start-outputs-generation" }
  | { type: "outputs-generation-success"; payload: GeneratedOutputs }
  | { type: "outputs-generation-failure"; payload: string }
  | { type: "set-ai-settings"; payload: AiSettings }
  | { type: "start-guide-request" }
  | { type: "guide-request-success"; payload: AssistantGuideResponse }
  | { type: "guide-request-failure"; payload: string };

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

function buildGraph(
  decisions: AppState["decisions"],
  links: DecisionLink[],
): DecisionGraph {
  return {
    nodes: decisions,
    links,
    unresolvedDecisionIds: decisions
      .filter((decision) => decision.status === "unresolved")
      .map((decision) => decision.id),
  };
}

function withInitializedProject(
  state: AppState,
  project: ProjectState,
  options?: { keepIntakeSummary?: boolean },
): AppState {
  const decisionLinks = project.decisionLinks ?? [];
  const decisions = project.decisions ?? [];
  return {
    ...state,
    currentPhase: "project-initialized",
    pillarFocus: project.currentFocus,
    projectSummary: options?.keepIntakeSummary
      ? state.projectSummary
      : "Project initialized from your idea. Continue with pillar-guided architecture decisions before code generation.",
    currentProject: project,
    decisionLinks,
    decisionGraph: buildGraph(decisions, decisionLinks),
    decisions,
    questions:
      project.discoveryQuestions.length > 0
        ? project.discoveryQuestions
        : state.questions,
    risks: mergeUnique(state.risks, project.risks),
    openQuestions:
      project.suggestedOpenQuestions.length > 0
        ? project.suggestedOpenQuestions
        : state.openQuestions,
    nextStep: project.recommendedNextAction,
  };
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "app-bootstrap-start":
      return {
        ...state,
        appLoading: true,
        appError: null,
      };
    case "app-bootstrap-success":
      if (!action.payload) {
        return {
          ...state,
          appLoading: false,
          appError: null,
        };
      }
      return {
        ...withInitializedProject(state, action.payload, {
          keepIntakeSummary: true,
        }),
        appLoading: false,
        appError: null,
      };
    case "app-bootstrap-failure":
      return {
        ...state,
        appLoading: false,
        appError: action.payload,
      };
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
        ...withInitializedProject(state, action.payload),
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
    case "set-selected-pillar":
      return {
        ...state,
        selectedPillar: action.payload,
      };
    case "start-pillar-guidance":
      return {
        ...state,
        pillarLoading: true,
        pillarError: null,
      };
    case "pillar-guidance-success":
      return {
        ...state,
        pillarLoading: false,
        pillarError: null,
        pillarGuidance: action.payload,
        pillarFocus: `${action.payload.pillar} exploration`,
      };
    case "pillar-guidance-failure":
      return {
        ...state,
        pillarLoading: false,
        pillarError: action.payload,
      };
    case "start-decision-save":
      return {
        ...state,
        decisionSaving: true,
        decisionError: null,
      };
    case "decision-save-success":
      return {
        ...withInitializedProject(state, action.payload, {
          keepIntakeSummary: true,
        }),
        decisionSaving: false,
        decisionError: null,
      };
    case "decision-save-failure":
      return {
        ...state,
        decisionSaving: false,
        decisionError: action.payload,
      };
    case "start-graph-load":
      return {
        ...state,
        graphLoading: true,
        graphError: null,
      };
    case "graph-load-success":
      return {
        ...state,
        graphLoading: false,
        graphError: null,
        decisionGraph: action.payload,
        decisionLinks: action.payload.links,
      };
    case "graph-load-failure":
      return {
        ...state,
        graphLoading: false,
        graphError: action.payload,
      };
    case "start-conflict-analysis":
      return {
        ...state,
        conflictLoading: true,
        conflictError: null,
      };
    case "conflict-analysis-success":
      return {
        ...state,
        conflictLoading: false,
        conflictError: null,
        conflicts: action.payload,
      };
    case "conflict-analysis-failure":
      return {
        ...state,
        conflictLoading: false,
        conflictError: action.payload,
      };
    case "start-outputs-generation":
      return {
        ...state,
        outputsLoading: true,
        outputsError: null,
      };
    case "outputs-generation-success":
      return {
        ...state,
        outputsLoading: false,
        outputsError: null,
        outputs: action.payload,
      };
    case "outputs-generation-failure":
      return {
        ...state,
        outputsLoading: false,
        outputsError: action.payload,
      };
    case "set-ai-settings":
      return {
        ...state,
        aiSettings: action.payload,
      };
    case "start-guide-request":
      return {
        ...state,
        guideLoading: true,
        guideError: null,
      };
    case "guide-request-success":
      return {
        ...state,
        guideLoading: false,
        guideError: null,
        guideResponse: action.payload,
      };
    case "guide-request-failure":
      return {
        ...state,
        guideLoading: false,
        guideError: action.payload,
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
