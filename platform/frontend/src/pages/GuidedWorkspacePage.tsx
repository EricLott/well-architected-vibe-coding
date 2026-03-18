import { useEffect, useMemo, useRef, useState } from "react";
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
  const [chatHistory, setChatHistory] = useState<PillarChatMessage[]>([]);
  const [draftByPillar, setDraftByPillar] = useState<Partial<Record<string, string>>>(
    {},
  );
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => decisionCountByPillar(state.decisions), [state.decisions]);
  const selectedPillar = state.selectedPillar || "Unified Architecture Chat";
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
  
  const selectedDraft = draftByPillar[selectedPillar] ?? "";
  const selectedGuidance =
    state.pillarGuidance?.pillar === selectedPillar ? state.pillarGuidance : null;


  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, chatLoading]);

  async function refreshPillarCatalog(projectId: string) {
    const definitions = await projectService.listPillars(projectId);
    setPillarCatalog(definitions);
    setCatalogError(null);
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
  }, [project?.id]);

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
    if (!project || chatHistory.length > 0) {
      return;
    }
    const currentPillar = selectedPillar;
    const selectedProjectId = project.id;
    const projectIdentifier = project.name;
    let active = true;

    async function bootstrapChat() {
      setChatLoading(true);
      setChatError(null);
      try {
        const turn = await projectService.sendPillarChatTurn({
          projectId: selectedProjectId,
          pillar: currentPillar,
          message: `Start general architecture exploration for ${projectIdentifier}.`,
          aiSettings: state.aiSettings,
        });
        if (!active) {
          return;
        }
        dispatch({ type: "guide-request-success", payload: turn.guidance });
        setChatHistory([buildAssistantMessage(currentPillar, turn.guidance)]);
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
  }, [dispatch, project, chatHistory.length, selectedPillar, state.aiSettings]);

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
      setChatHistory((current) => [...current, assistantMessage]);
    }

    if (turn.decisionLogged) {
      dispatch({ type: "decision-save-success", payload: turn.project });
      const targetPillar = turn.decision?.pillar || pillar;
      setDecisionNotice(
        `Decision logged under ${targetPillar}: ${turn.decision?.title ?? `${pillar} approach`}.`,
      );
      await refreshConflicts(turn.project.id);
      await refreshPillarCatalog(turn.project.id);
      return;
    }

    if (turn.decisionAssessment.suggestedPillar && turn.decisionAssessment.suggestedPillar !== pillar) {
      setDecisionNotice(`Routing architecture insights to ${turn.decisionAssessment.suggestedPillar}...`);
    } else {
      setDecisionNotice(
        decisionNoticeFromAssessment(pillar, turn.decisionAssessment),
      );
    }
    await refreshPillarCatalog(turn.project.id);
  }

  function switchPillar(pillarName: string) {
    dispatch({ type: "set-selected-pillar", payload: pillarName });
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
      setChatError(`Share your architecture thoughts before sending.`);
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
    setChatHistory((current) => [...current, userMessage]);
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


  const groundedGuidance = selectedGuidance?.retrievedGuidance ?? [];

  return (
    <main className="guided-layout">
      <section className="guided-main">
        <div className="chat-background-mesh" aria-hidden="true" />
        <header className="guided-header">
          <p className="section-kicker">Unified Architecture Chat</p>
          <h1>{selectedPillar === "Unified Architecture Chat" ? project.name : selectedPillar}</h1>
          <p>
            {selectedPillar === "Unified Architecture Chat"
              ? project.ideaSummary || "Architecting your system from a holistic viewpoint."
              : selectedPillarDefinition?.summary ?? "Architecture coach ready to guide your pillar decisions."}
          </p>
        </header>

        {state.pillarError && (
          <div className="inline-error-banner" style={{ margin: "1rem 2.5rem", position: "relative", zIndex: 11 }}>
            {state.pillarError}
          </div>
        )}

        <section className="pillar-chat-card">
          <div className="pillar-chat-thread" role="log" aria-live="polite" ref={chatContainerRef}>
            {chatHistory.map((message) => (
              <article
                key={message.id}
                className={`chat-message ${
                  message.role === "assistant" ? "chat-assistant" : "chat-user"
                }`}
              >
                <header className="chat-author">
                  {message.role === "assistant" ? "Architecture Coach" : "Project Architect"}
                </header>
                <p>{message.text}</p>
              </article>
            ))}

            {(chatLoading || state.pillarLoading) && (
              <div className="chat-message chat-assistant thinking-bubble">
                <header className="chat-author">Architecture Coach</header>
                <p className="thinking-text">Analyzing architectural patterns and routing decisions...</p>
              </div>
            )}
          </div>

          <div className="pillar-chat-composer">
            <div className="composer-container">
              <textarea
                id="pillar-chat-input"
                className="idea-textarea-chat"
                value={selectedDraft}
                onChange={(event) => updateDraft(event.target.value)}
                placeholder={selectedPillar === "Unified Architecture Chat" ? "Describe your overall system patterns..." : `Describe your ${selectedPillar} approach...`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <div className="conversation-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void sendMessage()}
                  disabled={chatLoading || state.pillarLoading || !selectedDraft.trim()}
                >
                  {chatLoading ? "..." : "Send"}
                </button>
              </div>
            </div>
            {chatError && <p className="error-text" style={{ padding: "0 1rem" }}>{chatError}</p>}
            {decisionNotice && <p className="helper-text" style={{ color: "var(--accent)", padding: "0 1rem", fontSize: "0.85rem", fontWeight: 700 }}>{decisionNotice}</p>}
          </div>
        </section>
      </section>

      <aside className="workspace-rail">
        <div className="workspace-rail-header">
          <h2>Architecture Workspace</h2>
        </div>
        
        <div className="workspace-content-scroll">
          {catalogError && (
            <div className="inline-error-banner" style={{ fontSize: "0.85rem" }}>
              {catalogError}
            </div>
          )}

          <section className="pillar-list-section">
            <p className="section-kicker" style={{ marginBottom: "0.8rem" }}>Context & Focus</p>
            <nav className="pillar-list" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <button
                type="button"
                className={`pillar-item${
                  selectedPillar === "Unified Architecture Chat" ? " pillar-item-active" : ""
                }`}
                onClick={() => switchPillar("Unified Architecture Chat")}
              >
                <span>Unified Overview</span>
                <span className="pillar-meta">Project Chat</span>
              </button>
              
              <div style={{ height: "1px", background: "var(--border-soft)", margin: "0.5rem 0" }} />

              {groupedPillars.find(g => g.category === 'well-architected')?.pillars.map((pillar) => (
                <button
                  key={pillar.name}
                  type="button"
                  className={`pillar-item${
                    selectedPillar === pillar.name ? " pillar-item-active" : ""
                  }`}
                  onClick={() => switchPillar(pillar.name)}
                >
                  <span>{pillar.name}</span>
                  <span className="pillar-meta">
                    {counts[pillar.name] ?? 0} logged
                  </span>
                </button>
              ))}
            </nav>
          </section>

          <StatusCard title="Next Actions">
            {state.guideResponse?.nextActions.length ? (
              <ul style={{ fontSize: "0.85rem", paddingLeft: "1.2rem", color: "var(--text-secondary)" }}>
                {state.guideResponse.nextActions.map((action) => (
                  <li key={action} style={{ marginBottom: "0.4rem" }}>{action}</li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Guidance will appear here.</p>
            )}
          </StatusCard>

          <StatusCard title="Grounded Guidance">
            {groundedGuidance.length > 0 ? (
              <ul style={{ fontSize: "0.85rem", paddingLeft: "1.2rem", color: "var(--text-secondary)" }}>
                {groundedGuidance.slice(0, 3).map((item) => (
                  <li key={item.chunk_id} style={{ marginBottom: "0.4rem" }}>
                    {item.citation.heading_path.join(" > ") || item.citation.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Reference guidance found.</p>
            )}
          </StatusCard>

          <section className="pillar-list-section">
            <p className="section-kicker" style={{ marginBottom: "0.8rem" }}>Tailored Modules</p>
            <nav className="pillar-list" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {pillarCatalog
                .filter(p => p.category !== 'well-architected')
                .map((pillar) => (
                  <button
                    key={pillar.name}
                    type="button"
                    className={`pillar-item${
                      selectedPillar === pillar.name ? " pillar-item-active" : ""
                    }`}
                    onClick={() => switchPillar(pillar.name)}
                  >
                    <span>{pillar.name}</span>
                    <span className="pillar-meta">
                      {counts[pillar.name] ?? 0}
                    </span>
                  </button>
                ))}
            </nav>
          </section>
        </div>
      </aside>
    </main>
  );
}
