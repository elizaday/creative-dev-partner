import { useState } from 'react';

export default function BriefUpload({ onGenerate, error }) {
  const [brief, setBrief] = useState('');

  const handleSubmit = () => {
    if (brief.trim().length >= 50) {
      onGenerate(brief);
    }
  };

  return (
    <section className="section">
      <div className="upload-section">
        <div className="section-header">
          <h1 className="section-title">Upload the client brief</h1>
          <p className="section-subtitle">
            Paste the brief below. I'll analyze it and generate 10 wildly different creative
            directions—some safe, some surprising, all worth considering.
          </p>
        </div>

        <textarea
          className="brief-textarea"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={`Paste the client brief here...

Example:
PROJECT: :30 Commercial for Mr. Pibb
OBJECTIVE: Reframe Mr. Pibb as the soda that doesn't need credentials to be enjoyed
KEY MESSAGE: 'Mr. Pibb is Built Different — No advanced degree required to have a good time'
TONE: Dry, observational comedy. Deadpan. Cinematic seriousness applied to simple moments.
CONSTRAINTS: AI-led production, minimal human performance, object-focused storytelling...`}
        />

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="action-row">
          <span className="upload-hint">Minimum 50 characters required</span>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={brief.trim().length < 50}
          >
            Generate 10 Ideas
            <span>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
