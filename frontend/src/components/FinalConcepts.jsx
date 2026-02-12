import Storyboard from './Storyboard';

export default function FinalConcepts({ concepts, onReset }) {
  return (
    <section className="section">
      <div className="ideas-section">
        <div className="section-header">
          <h1 className="section-title">Your three concepts, fully developed</h1>
          <p className="section-subtitle">
            Complete creative directions with visual storyboards, production notes, and rationale.
          </p>
        </div>

        {concepts.map((concept, index) => (
          <div key={index} className="final-concept">
            <div className="final-concept-header">
              <div>
                <div className="final-concept-num">FINAL CONCEPT {concept.number || index + 1}</div>
                <div className="final-concept-title">{concept.title}</div>
                <div className="final-concept-tagline">"{concept.tagline}"</div>
              </div>
            </div>

            <div className="final-concept-body">
              <div className="concept-overview">
                <h4>Core Concept</h4>
                <p>{concept.description}</p>
              </div>

              {/* Storyboard visualization */}
              {concept.storyboardFrames && concept.storyboardFrames.length > 0 ? (
                <Storyboard frames={concept.storyboardFrames} />
              ) : concept.scenes ? (
                <div className="concept-details">
                  <h4>Key Scenes</h4>
                  <ul>
                    {concept.scenes.map((scene, i) => (
                      <li key={i}>{scene}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="concept-meta-grid">
                {concept.rationale && (
                  <div className="concept-details">
                    <h4>Why This Works</h4>
                    <p>{concept.rationale}</p>
                  </div>
                )}

                {concept.visualReferences && (
                  <div className="concept-details">
                    <h4>Visual References</h4>
                    <ul>
                      {concept.visualReferences.map((ref, i) => (
                        <li key={i}>{ref}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {concept.productionNotes && (
                  <div className="concept-details">
                    <h4>Production Notes</h4>
                    <ul>
                      {concept.productionNotes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="summary-footer">
          <p>Ready to present these to the client, or continue refining?</p>
          <button className="btn-secondary" onClick={onReset}>
            Start New Session
          </button>
        </div>
      </div>
    </section>
  );
}
