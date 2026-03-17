interface IdeaIntakeFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  errorMessage: string | null;
}

const placeholderText =
  "I want to build a scheduling app for small home service companies that helps dispatch jobs, track technicians, and keep customers updated.";

export function IdeaIntakeForm({
  value,
  onChange,
  onSubmit,
  isLoading,
  errorMessage,
}: IdeaIntakeFormProps) {
  return (
    <section className="intake-form-panel">
      <header className="intake-form-header">
        <h3>Start Phase 1 intake</h3>
        <p>
          Describe your app idea in 2-4 sentences so the platform can guide
          architecture decisions before implementation.
        </p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="form-label" htmlFor="idea-text">
          App idea
        </label>
        <textarea
          id="idea-text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholderText}
          rows={7}
          className="idea-textarea"
          aria-describedby="idea-help-text"
          required
        />
        <p id="idea-help-text" className="helper-text">
          Keep this practical. Include target users, the core workflow, and the
          main outcome the product should deliver.
        </p>
        <div className="form-actions">
          <p className="character-count">{value.trim().length} characters</p>
          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? "Initializing project..." : "Start Phase 1"}
          </button>
        </div>
        {errorMessage ? (
          <p className="error-text" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </section>
  );
}
