import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusCard } from "../components/StatusCard";
import { projectService } from "../services/projectService";
import { useAppDispatch, useAppState } from "../state/AppContext";
import type {
  AssistantGuideResponse,
  DecisionAssessment,
  DecisionItem,
  Pillar,
  PillarCategory,
  PillarDefinition,
  PillarChatTurnResponse,
} from "../types/app";

const pillarCategoryOrder: PillarCategory[] = [
  "well-architected",
  "solution-architecture",
  "experience-design",
  "engineering-operations",
  "core",
  "ad-hoc",
];

function pillarCategoryLabel(category: PillarCategory): string {
  switch (category) {
    case "well-architected":
      return "Well-Architected";
    case "solution-architecture":
      return "Solution architecture";
    case "experience-design":
      return "Experience design";
    case "engineering-operations":
      return "Engineering operations";
    case "core":
      return "Core (legacy)";
    case "ad-hoc":
      return "Ad-hoc scenarios";
    default:
      return "Pillars";
  }
}

interface PillarChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  suggestions: string[];
}

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to complete this action.";
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function makeMessageId(): string {
  return `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalize(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function looksLikeQuestion(value: string): boolean {
  const normalized = normalize(value);
  return (
    normalized.endsWith("?") ||
    /^(what|why|how|should|can|could|would|do|does|is|are|when|where|which)\b/i.test(
      normalized,
    )
  );
}

function statusLabel(count: number): string {
  if (count >= 3) {
    return "strong";
  }
  if (count >= 1) {
    return "in progress";
  }
  return "not started";
}

function decisionCountByPillar(
  decisions: DecisionItem[],
): Partial<Record<Pillar, number>> {
  const counts: Partial<Record<Pillar, number>> = {};
  for (const decision of decisions) {
    counts[decision.pillar] = (counts[decision.pillar] ?? 0) + 1;
  }
  return counts;
}

function buildAssistantMessage(
  pillar: Pillar,
  response: AssistantGuideResponse,
): PillarChatMessage {
  const prompt = `Draft your ${pillar} approach.`;
  const summary = normalize(response.summary);
  const text = summary ? `${prompt}\n${summary}` : prompt;
  const combinedSuggestions = dedupe([
    ...response.nextActions,
    ...response.questions.map((item) => item.question),
  ]);
  const nudgeSuggestions = combinedSuggestions.filter(
    (suggestion) => !looksLikeQuestion(suggestion),
  );
  const suggestions = (
    nudgeSuggestions.length > 0 ? nudgeSuggestions : combinedSuggestions
  ).slice(0, 5);

  return {
    id: makeMessageId(),
    role: "assistant",
    text,
    suggestions,
  };
}

function decisionNoticeFromAssessment(
  pillar: Pillar,
  assessment: DecisionAssessment,
): string {
  if (assessment.isDecision) {
    return `Possible ${pillar} decision detected (${Math.round(
      assessment.confidence * 100,
    )}% confidence).`;
  }
  return `No ${pillar} decision logged yet. Keep iterating until you state a concrete approach.`;
}

export function GuidedWorkspacePage() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const project = state.currentProject;
  const [pillarCatalog, setPillarCatalog] = useState<PillarDefinition[]>([]);
  const [pillarChats, setPillarChats] = useState<
    Partial<Record<Pillar, PillarChatMessage[]>>
  >({});
  const [draftByPillar, setDraftByPillar] = useState<Partial<Record<Pillar, string>>>(
    {},
  );
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);

  const counts = useMemo(() => decisionCountByPillar(state.decisions), [state.decisions]);
  const selectedPillar = state.selectedPillar;
  const pillars = useMemo(
    () =>
      pillarCatalog.length > 0
        ? pillarCatalog.map((pillar) => pillar.name)
        : [selectedPillar],
    [pillarCatalog, selectedPillar],
  );
  const selectedPillarDefinition = useMemo(
    () => pillarCatalog.find((pillar) => pillar.name === selectedPillar) ?? null,
    [pillarCatalog, selectedPillar],
  );
  const groupedPillars = useMemo(
    () =>
      pillarCategoryOrder
        .map((category) => ({
          category,
          label: pillarCategoryLabel(category),
          pillars: pillarCatalog.filter((pillar) => pillar.category === category),
        }))
        .filter((group) => group.pillars.length > 0),
    [pillarCatalog],
  );
  const selectedChat = pillarChats[selectedPillar] ?? [];
  const selectedDraft = draftByPillar[selectedPillar] ?? "";
  const selectedGuidance =
    state.pillarGuidance?.pillar === selectedPillar ? state.pillarGuidance : null;

  const latestUserMessage = useMemo(
    () => [...selectedChat].reverse().find((message) => message.role === "user"),
    [selectedChat],
  );

  async function refreshPillarCatalog(projectId: string) {
    const definitions = await projectService.listPillars(projectId);
    setPillarCatalog(definitions);
    setCatalogError(null);
    if (
      definitions.length > 0 &&
      !definitions.some((pillar) => pillar.name === selectedPillar)
    ) {
      dispatch({ type: "set-selected-pillar", payload: definitions[0].name });
    }
  }

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId) {
      return;
    }
    let active = true;
    async function loadPillars() {
      try {
        const definitions = await projectService.listPillars(projectId);
        if (!active) {
          return;
        }
        setPillarCatalog(definitions);
        setCatalogError(null);
        if (
          definitions.length > 0 &&
          !definitions.some((pillar) => pillar.name === selectedPillar)
        ) {
          dispatch({ type: "set-selected-pillar", payload: definitions[0].name });
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setCatalogError(getMessage(error));
      }
    }
    loadPillars();
    return () => {
      active = false;
    };
  }, [dispatch, project?.id, selectedPillar]);

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId) {
      navigate("/", { replace: true });
      return;
    }
    const selectedProjectId = projectId;
    let active = true;

    async function hydratePillarGuidance() {
      dispatch({ type: "start-pillar-guidance" });
      try {
        const guidance = await projectService.generatePillarGuidance(
          selectedProjectId,
          selectedPillar,
        );
        if (!active) {
          return;
        }
        dispatch({ type: "pillar-guidance-success", payload: guidance });
      } catch (error) {
        if (!active) {
          return;
        }
        dispatch({ type: "pillar-guidance-failure", payload: getMessage(error) });
      }
    }

    hydratePillarGuidance();
    return () => {
      active = false;
    };
  }, [dispatch, navigate, project?.id, selectedPillar]);

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId) {
      return;
    }
    const selectedProjectId = projectId;
    let active = true;
    async function hydrateConflicts() {
      try {
        const conflicts = await projectService.analyzeConflicts(selectedProjectId);
        if (!active) {
          return;
        }
        dispatch({ type: "conflict-analysis-success", payload: conflicts });
      } catch {
        // Keep workspace available even if conflict analysis fails.
      }
    }
    hydrateConflicts();
    return () => {
      active = false;
    };
  }, [dispatch, project?.id]);

  useEffect(() => {
    if (!project || selectedChat.length > 0) {
      return;
    }
    const currentPillar = selectedPillar;
    const selectedProjectId = project.id;
    let active = true;

    async function bootstrapChat() {
      setChatLoading(true);
      setChatError(null);
      try {
        const turn = await projectService.sendPillarChatTurn({
          projectId: selectedProjectId,
          pillar: currentPillar,
          message: `Start ${currentPillar} exploration for this project.`,
          aiSettings: state.aiSettings,
        });
        if (!active) {
          return;
        }
        dispatch({ type: "guide-request-success", payload: turn.guidance });
        setPillarChats((current) => ({
          ...current,
          [currentPillar]: [buildAssistantMessage(currentPillar, turn.guidance)],
        }));
        if (turn.decisionLogged) {
          dispatch({ type: "decision-save-success", payload: turn.project });
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setChatError(getMessage(error));
      } finally {
        if (active) {
          setChatLoading(false);
        }
      }
    }

    void bootstrapChat();
    return () => {
      active = false;
    };
  }, [
    dispatch,
    project,
    selectedChat.length,
    selectedPillar,
    state.aiSettings,
  ]);

  if (!project) {
    return null;
  }
  const currentProjectId = project.id;

  async function refreshConflicts(projectId: string) {
    try {
      const conflicts = await projectService.analyzeConflicts(projectId);
      dispatch({ type: "conflict-analysis-success", payload: conflicts });
    } catch {
      // Do not block chat flow on conflict refresh failures.
    }
  }

  async function applyTurnResult(
    pillar: Pillar,
    turn: PillarChatTurnResponse,
    options?: { suppressAssistantMessage?: boolean },
  ) {
    dispatch({ type: "guide-request-success", payload: turn.guidance });

    if (!options?.suppressAssistantMessage) {
      const assistantMessage = buildAssistantMessage(pillar, turn.guidance);
      setPillarChats((current) => ({
        ...current,
        [pillar]: [...(current[pillar] ?? []), assistantMessage],
      }));
    }

    if (turn.decisionLogged) {
      dispatch({ type: "decision-save-success", payload: turn.project });
      setDecisionNotice(
        `Decision logged: ${turn.decision?.title ?? `${pillar} approach`}.`,
      );
      await refreshConflicts(turn.project.id);
      await refreshPillarCatalog(turn.project.id);
      return;
    }

    setDecisionNotice(
      decisionNoticeFromAssessment(pillar, turn.decisionAssessment),
    );
    await refreshPillarCatalog(turn.project.id);
  }

  function switchPillar(pillar: Pillar) {
    dispatch({ type: "set-selected-pillar", payload: pillar });
    setChatError(null);
    setDecisionNotice(null);
  }

  function updateDraft(value: string) {
    setDraftByPillar((current) => ({
      ...current,
      [selectedPillar]: value,
    }));
  }

  async function sendMessage() {
    const message = normalize(selectedDraft);
    if (!message) {
      setChatError(`Share your approach to ${selectedPillar} before sending.`);
      return;
    }

    setChatError(null);
    setDecisionNotice(null);
    const currentPillar = selectedPillar;
    const userMessage: PillarChatMessage = {
      id: makeMessageId(),
      role: "user",
      text: message,
      suggestions: [],
    };
    setPillarChats((current) => ({
      ...current,
      [currentPillar]: [...(current[currentPillar] ?? []), userMessage],
    }));
    setDraftByPillar((current) => ({
      ...current,
      [currentPillar]: "",
    }));

    setChatLoading(true);
    try {
      const turn = await projectService.sendPillarChatTurn({
        projectId: currentProjectId,
        pillar: currentPillar,
        aiSettings: state.aiSettings,
        message,
      });
      await applyTurnResult(currentPillar, turn);
    } catch (error) {
      setChatError(getMessage(error));
    } finally {
      setChatLoading(false);
    }
  }

  async function savePillarDecision() {
    const approach = normalize(selectedDraft) || normalize(latestUserMessage?.text ?? "");
    if (!approach) {
      dispatch({
        type: "decision-save-failure",
        payload: `Capture your ${selectedPillar} approach in chat before saving.`,
      });
      return;
    }

    const currentPillar = selectedPillar;
    setChatError(null);
    setDecisionNotice(null);
    setChatLoading(true);
    try {
      const turn = await projectService.sendPillarChatTurn({
        projectId: currentProjectId,
        pillar: currentPillar,
        message: approach,
        aiSettings: state.aiSettings,
        forceDecisionCapture: true,
      });
      await applyTurnResult(currentPillar, turn);
    } catch (error) {
      setChatError(getMessage(error));
    } finally {
      setChatLoading(false);
    }
  }

  const groundedGuidance = selectedGuidance?.retrievedGuidance ?? [];

  return (
    <main className="guided-layout">
      <aside className="pillar-rail">
        <div className="rail-header">
          <p className="section-kicker">Project</p>
          <h2>{project.name}</h2>
          <p>{project.ideaText}</p>
        </div>
        <nav className="pillar-list" aria-label="Pillar journey">
          {pillarCatalog.length === 0 ? (
            pillars.map((pillar) => (
              <button
                key={pillar}
                type="button"
                className={`pillar-item${
                  selectedPillar === pillar ? " pillar-item-active" : ""
                }`}
                onClick={() => switchPillar(pillar)}
              >
                <span>{pillar}</span>
                <span className="pillar-meta">
                  {statusLabel(counts[pillar] ?? 0)} ({counts[pillar] ?? 0})
                </span>
              </button>
            ))
          ) : (
            groupedPillars.map((group) => (
              <div key={group.category} className="pillar-group">
                <p className="pillar-group-label">{group.label}</p>
                {group.pillars.map((pillar) => (
                  <button
                    key={pillar.name}
                    type="button"
                    className={`pillar-item${
                      selectedPillar === pillar.name ? " pillar-item-active" : ""
                    }`}
                    onClick={() => switchPillar(pillar.name)}
                    title={pillar.summary}
                  >
                    <span>{pillar.name}</span>
                    <span className="pillar-meta">
                      {statusLabel(counts[pillar.name] ?? 0)} ({counts[pillar.name] ?? 0})
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </nav>
        {catalogError ? (
          <p className="error-text" role="alert">
            {catalogError}
          </p>
        ) : null}
        <div className="rail-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate("/settings")}
          >
            AI settings
          </button>
        </div>
      </aside>

      <section className="guided-main">
        <header className="guided-header">
          <p className="section-kicker">Guided pillar chat</p>
          <h1>{selectedPillar}</h1>
          <p>
            {selectedPillarDefinition?.summary ??
              "Retrieved framework guidance drives this conversation so your decisions stay grounded."}
          </p>
        </header>

        {state.pillarError ? (
          <p className="error-text" role="alert">
            {state.pillarError}
          </p>
        ) : null}

        <section className="pillar-chat-card">
          <div className="pillar-chat-thread" role="log" aria-live="polite">
            {selectedChat.map((message) => (
              <article
                key={message.id}
                className={`chat-message ${
                  message.role === "assistant" ? "chat-assistant" : "chat-user"
                }`}
              >
                <p className="chat-author">
                  {message.role === "assistant" ? "Architecture coach" : "You"}
                </p>
                <p>{message.text}</p>
                {message.role === "assistant" && message.suggestions.length > 0 ? (
                  <div className="chat-suggestions">
                    {message.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="chat-suggestion-chip"
                        onClick={() => updateDraft(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}

            {chatLoading || state.pillarLoading ? (
              <p className="helper-text">Generating guidance from retrieved sources...</p>
            ) : null}
          </div>

          <form
            className="pillar-chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <label htmlFor="pillar-chat-input" className="form-label">
              {`Describe your ${selectedPillar} approach`}
            </label>
            <textarea
              id="pillar-chat-input"
              className="idea-textarea"
              rows={4}
              value={selectedDraft}
              onChange={(event) => updateDraft(event.target.value)}
              placeholder="Describe your approach in 1-3 practical sentences."
            />
            <div className="conversation-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={chatLoading || state.pillarLoading}
              >
                {chatLoading ? "Thinking..." : "Send"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void savePillarDecision()}
                disabled={chatLoading}
              >
                {chatLoading ? "Saving..." : "Force log decision"}
              </button>
            </div>
          </form>

          {chatError ? (
            <p className="error-text" role="alert">
              {chatError}
            </p>
          ) : null}
          {state.decisionError ? (
            <p className="error-text" role="alert">
              {state.decisionError}
            </p>
          ) : null}
          {state.guideResponse?.warning ? (
            <p className="warning-text" role="status">
              {state.guideResponse.warning}
            </p>
          ) : null}
          {decisionNotice ? <p className="helper-text">{decisionNotice}</p> : null}
        </section>
      </section>

      <aside className="insight-rail">
        <StatusCard title="Next actions" tone="accent">
          {state.guideResponse?.nextActions.length ? (
            <ul>
              {state.guideResponse.nextActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : (
            <p>Start the pillar chat and guidance-backed next actions will appear here.</p>
          )}
        </StatusCard>

        <StatusCard title="Grounded guidance">
          {groundedGuidance.length > 0 ? (
            <ul>
              {groundedGuidance.slice(0, 3).map((item) => (
                <li key={item.chunk_id}>
                  <strong>
                    {item.citation.heading_path.join(" > ") || item.citation.title}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No retrieved guidance loaded for this pillar yet.</p>
          )}
        </StatusCard>

        <StatusCard title="Risk pulse" tone="warning">
          <p>{state.conflicts?.summary ?? "Save pillar decisions to unlock risk analysis."}</p>
          {state.conflicts?.conflicts.slice(0, 2).map((conflict) => (
            <p key={conflict.id}>
              <strong>{conflict.severity.toUpperCase()}:</strong> {conflict.title}
            </p>
          ))}
        </StatusCard>

        <StatusCard title="Decision coverage">
          <ul>
            {pillars.map((pillar) => (
              <li key={pillar}>
                {pillar}: {counts[pillar] ?? 0}
              </li>
            ))}
          </ul>
        </StatusCard>
      </aside>
    </main>
  );
}
