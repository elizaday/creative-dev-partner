export default function IdeasGrid({ ideas, selectedIdeas, onSelectionChange, onContinue, error }) {
  const toggleSelection = (ideaId) => {
    if (selectedIdeas.includes(ideaId)) {
      onSelectionChange(selectedIdeas.filter(id => id !== ideaId));
    } else if (selectedIdeas.length < 3) {
      onSelectionChange([...selectedIdeas, ideaId]);
    }
  };

  const getTagType = (tagText) => {
    const lower = tagText.toLowerCase();
    if (lower.includes('safe') || lower.includes('medium') || lower.includes('bold') || lower.includes('risk')) {
      return 'risk';
    }
    if (lower.includes('visual') || lower.includes('cinematic') || lower.includes('minimal')) {
      return 'visual';
    }
    return 'tone';
  };

  return (
    <section className="section">
      <div className="ideas-section">
        <div className="section-header">
          <h1 className="section-title">Ten directions, wildly varied</h1>
          <p className="section-subtitle">
            Select 3 that resonate most. I'll develop 3 variations on each of your picks (9 total options).
          </p>
        </div>

        <div className="ideas-grid">
          {ideas.map((idea, index) => (
            <div
              key={idea.id}
              className={`idea-card ${selectedIdeas.includes(idea.id) ? 'selected' : ''}`}
              onClick={() => toggleSelection(idea.id)}
            >
              <div className="idea-number">CONCEPT {String(index + 1).padStart(2, '0')}</div>
              <div className="idea-title">{idea.title}</div>
              <div className="idea-hook">"{idea.hook}"</div>
              <div className="idea-desc">{idea.description}</div>
              {idea.tags && (
                <div className="idea-tags">
                  {Object.entries(idea.tags).map(([key, value]) => (
                    <span key={key} className={`idea-tag ${getTagType(value)}`}>
                      {value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="action-row">
          <span className="selection-count">
            Selected: <strong>{selectedIdeas.length}</strong> / 3
          </span>
          <button
            className="btn-primary"
            onClick={onContinue}
            disabled={selectedIdeas.length !== 3}
          >
            Get Variations on Selected
            <span>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
