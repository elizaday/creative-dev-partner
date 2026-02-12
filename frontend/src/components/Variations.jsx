import { useState } from 'react';

export default function Variations({ variations, selectedVariations, onSelectionChange, onContinue, error }) {
  const [selections, setSelections] = useState({});

  const handleVariationSelect = (originalId, variation) => {
    // Check if this concept is already selected
    const isCurrentlySelected = selections[originalId]?.letter === variation.letter;

    // If clicking the same variation, deselect it
    if (isCurrentlySelected) {
      const newSelections = { ...selections };
      delete newSelections[originalId];
      setSelections(newSelections);
      onSelectionChange(Object.values(newSelections));
      return;
    }

    // If already at max selections and this is a new concept, don't allow
    const selectedCount = Object.keys(selections).length;
    const maxSelections = 3;

    if (selectedCount >= maxSelections && !selections[originalId]) {
      // Already at max and trying to select from a new concept group
      return;
    }

    // Otherwise, update selection
    const newSelections = { ...selections, [originalId]: variation };
    setSelections(newSelections);
    onSelectionChange(Object.values(newSelections));
  };

  const selectedCount = Object.keys(selections).length;
  const maxSelections = 3;

  return (
    <section className="section">
      <div className="ideas-section">
        <div className="section-header">
          <h1 className="section-title">Variations on your picks</h1>
          <p className="section-subtitle">
            Each of your 3 selected ideas has 3 variations. Review all 9 options and select your final 3 concepts for development.
          </p>
        </div>

        {variations.map((group) => (
          <div key={group.originalId} className="variation-group">
            <div className="variation-header">
              <div className="variation-original">
                <div className="variation-label">Original Concept</div>
                <div className="variation-title">{group.originalTitle}</div>
              </div>
            </div>

            <div className="variations-list">
              {group.variations.map((variation) => {
                const isSelected = selections[group.originalId]?.letter === variation.letter;
                const isDisabled = selectedCount >= maxSelections && !selections[group.originalId];

                return (
                  <div
                    key={variation.letter}
                    className={`variation-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    onClick={() => handleVariationSelect(group.originalId, variation)}
                    style={{ cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.5 : 1 }}
                  >
                    <div className="variation-letter">{variation.letter}</div>
                    <div className="variation-content">
                      <h4>{variation.title}</h4>
                      <p>{variation.description}</p>
                      <div className="variation-diff">Shift: {variation.shift}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="action-row">
          <span className="selection-count">
            Final selections: <strong>{selectedCount}</strong> / {maxSelections}
          </span>
          <button
            className="btn-primary"
            onClick={onContinue}
            disabled={selectedCount < maxSelections}
          >
            Develop Final 3
            <span>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
