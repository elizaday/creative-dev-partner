import { useEffect, useMemo, useState } from 'react';
import { createStoryboardPdfDownload } from '../utils/storyboardPdfExport';

const SCRIPT_RETRY_ATTEMPTS = 1;
const SCRIPT_RETRY_DELAY_MS = 1200;
const IMAGE_CONCURRENCY = 2;

const EMPTY_CONSTRAINTS = {
  mandatoryVisualElements: '',
  requiredProductRituals: '',
  iconographyRules: '',
  toneRestrictions: '',
  hardExclusions: ''
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureJsonResponse(response, data) {
  if (!response.ok || data.error) {
    throw new Error(data.details || data.error || `Request failed (${response.status})`);
  }
}

async function callApi(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const snippet = text.slice(0, 160).replace(/\s+/g, ' ').trim();
    throw new Error(`API returned non-JSON (${response.status}). ${snippet}`);
  }

  const data = await response.json();
  ensureJsonResponse(response, data);
  return data;
}

async function callWithQualityRetry(url, body, onRetry) {
  let lastFallbackData = null;

  for (let attempt = 1; attempt <= SCRIPT_RETRY_ATTEMPTS; attempt += 1) {
    const data = await callApi(url, body);
    if (!data.fallback) return { ...data, qualityDegraded: false };
    lastFallbackData = data;

    if (attempt < SCRIPT_RETRY_ATTEMPTS) {
      onRetry?.(attempt + 1, SCRIPT_RETRY_ATTEMPTS);
      await wait(SCRIPT_RETRY_DELAY_MS * attempt);
      continue;
    }
  }

  if (lastFallbackData) {
    return { ...lastFallbackData, qualityDegraded: true, qualityRetriesExhausted: true };
  }

  throw new Error('Unable to complete storyboard generation.');
}

export default function ScriptStoryboardApp() {
  const [projectName, setProjectName] = useState('');
  const [script, setScript] = useState('');
  const [constraints, setConstraints] = useState(EMPTY_CONSTRAINTS);

  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);

  const [storyboard, setStoryboard] = useState(null);
  const [imageStats, setImageStats] = useState({ total: 0, done: 0, running: false });
  const [generationRunId, setGenerationRunId] = useState(0);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDownload, setPdfDownload] = useState(null);

  const isScriptValid = script.trim().length >= 80;

  const framesToGenerate = useMemo(() => {
    if (!storyboard?.frames) return [];
    return storyboard.frames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => !frame.imageUrl);
  }, [storyboard]);

  useEffect(() => {
    return () => {
      if (pdfDownload?.url) {
        URL.revokeObjectURL(pdfDownload.url);
      }
    };
  }, [pdfDownload]);

  const clearPdfDownload = () => {
    if (pdfDownload?.url) {
      URL.revokeObjectURL(pdfDownload.url);
    }
    setPdfDownload(null);
  };

  const handleConstraintChange = (field, value) => {
    setConstraints((prev) => ({ ...prev, [field]: value }));
  };

  const handleGenerateStoryboard = async () => {
    setLoading(true);
    setLoadingText('Running script stress test and beat compression...');
    setError(null);
    setWarning(null);
    clearPdfDownload();

    try {
      const data = await callWithQualityRetry(
        '/api/script-storyboard',
        {
          script,
          projectName,
          constraints
        },
        () => {
          setLoadingText('Retrying for high-quality storyboard decisions...');
        }
      );

      setStoryboard(data.storyboard);
      if (data.storyboard?.projectName && !projectName.trim()) {
        setProjectName(data.storyboard.projectName);
      }

      if (data.qualityDegraded) {
        setWarning('Showing fallback storyboard because high-quality generation timed out. You can proceed and retry this step later.');
      }

      setGenerationRunId((prev) => prev + 1);
    } catch (err) {
      setError(err.message);
      setStoryboard(null);
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const handleCreatePdf = async () => {
    if (!storyboard) return;
    setPdfLoading(true);
    setError(null);

    try {
      clearPdfDownload();
      const result = await createStoryboardPdfDownload(storyboard);
      setPdfDownload(result);
    } catch (err) {
      setError(`Failed to create PDF: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  };

  useEffect(() => {
    if (!generationRunId || !storyboard?.frames?.length) {
      return;
    }

    let cancelled = false;
    let cursor = 0;
    let done = 0;

    setImageStats({ total: framesToGenerate.length, done: 0, running: framesToGenerate.length > 0 });

    const worker = async () => {
      while (!cancelled) {
        const taskIndex = cursor;
        cursor += 1;

        if (taskIndex >= framesToGenerate.length) break;

        const task = framesToGenerate[taskIndex];
        const frame = task.frame;

        try {
          const response = await callApi('/api/frame-image', {
            frame,
            conceptTitle: storyboard.title,
            conceptDescription: `${storyboard.summary || ''} Tone: ${storyboard.tone || ''}. Maintain continuity across ${storyboard.frames.length} storyboard frames.`
          });

          if (response.imageUrl && !cancelled) {
            setStoryboard((prev) => {
              if (!prev?.frames) return prev;
              const nextFrames = prev.frames.map((item, idx) => (
                idx === task.index ? { ...item, imageUrl: response.imageUrl } : item
              ));
              return { ...prev, frames: nextFrames };
            });
          }
        } catch (err) {
          console.error('Frame image generation failed:', err.message);
        } finally {
          done += 1;
          if (!cancelled) {
            setImageStats({ total: framesToGenerate.length, done, running: done < framesToGenerate.length });
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(IMAGE_CONCURRENCY, framesToGenerate.length) }, () => worker());
    Promise.all(workers).catch((err) => {
      console.error('Storyboard image workers failed:', err.message);
      if (!cancelled) {
        setImageStats((prev) => ({ ...prev, running: false }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [generationRunId]);

  return (
    <div className="ssb-app">
      <header className="ssb-header">
        <div>
          <div className="ssb-eyebrow">SCRIPT TO STORYBOARD</div>
          <h1>Director Storyboard Studio</h1>
          <p>
            Stress-test script intention, compress to high-contrast beats, and generate image-backed boards with decisive visual logic.
          </p>
        </div>
        <a className="ssb-link" href="/">Open Creative Development Partner</a>
      </header>

      <section className="ssb-panel">
        <label htmlFor="project-name">Project Name (for PDF export)</label>
        <input
          id="project-name"
          className="ssb-input"
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Example: SmartLabel Launch"
        />

        <label htmlFor="script-input" style={{ marginTop: '14px' }}>Script</label>
        <textarea
          id="script-input"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Paste full script with action and dialogue..."
        />

        <div className="ssb-constraints-head">Brand and Tonal Constraints (optional but recommended)</div>
        <div className="ssb-constraints-grid">
          <label>
            Mandatory Visual Elements
            <textarea
              value={constraints.mandatoryVisualElements}
              onChange={(e) => handleConstraintChange('mandatoryVisualElements', e.target.value)}
              placeholder="Non-negotiable visuals or assets"
            />
          </label>
          <label>
            Required Product Rituals
            <textarea
              value={constraints.requiredProductRituals}
              onChange={(e) => handleConstraintChange('requiredProductRituals', e.target.value)}
              placeholder="Moments that must be shown"
            />
          </label>
          <label>
            Iconography Rules
            <textarea
              value={constraints.iconographyRules}
              onChange={(e) => handleConstraintChange('iconographyRules', e.target.value)}
              placeholder="Brand marks, symbols, treatment rules"
            />
          </label>
          <label>
            Tone Restrictions
            <textarea
              value={constraints.toneRestrictions}
              onChange={(e) => handleConstraintChange('toneRestrictions', e.target.value)}
              placeholder="Tone boundaries to enforce"
            />
          </label>
          <label>
            Hard Exclusions
            <textarea
              value={constraints.hardExclusions}
              onChange={(e) => handleConstraintChange('hardExclusions', e.target.value)}
              placeholder="What must never appear"
            />
          </label>
        </div>

        <div className="ssb-toolbar">
          <span>{script.trim().length} chars</span>
          <button
            className="ssb-btn"
            onClick={handleGenerateStoryboard}
            disabled={!isScriptValid || loading}
          >
            {loading ? 'Generating...' : 'Generate Director Storyboard'}
          </button>
        </div>

        {loadingText && <p className="ssb-status">{loadingText}</p>}
        {warning && <p className="ssb-status">{warning}</p>}
        {error && <p className="ssb-error">{error}</p>}
      </section>

      {storyboard && (
        <section className="ssb-panel">
          <div className="ssb-result-head">
            <div>
              <h2>{storyboard.title}</h2>
              <p>{storyboard.summary}</p>
            </div>
            <div className="ssb-meta">
              <div>{storyboard.frames?.length || 0} frames</div>
              <div>{storyboard.tone}</div>
            </div>
          </div>

          <div className="ssb-stress-grid">
            <div><strong>Central Contrast:</strong> {storyboard.stressTest?.centralContrast}</div>
            <div><strong>Power Shift:</strong> {storyboard.stressTest?.powerShift}</div>
            <div><strong>Sharpest Moment:</strong> {storyboard.stressTest?.sharpestMoment}</div>
            <div><strong>Muted Visual Check:</strong> {storyboard.stressTest?.mutedVisualCheck}</div>
          </div>

          <div className="ssb-export-row">
            <button className="ssb-btn" onClick={handleCreatePdf} disabled={pdfLoading}>
              {pdfLoading ? 'Creating PDF...' : 'Create Storyboard PDF'}
            </button>
            {pdfDownload && (
              <a className="ssb-download" href={pdfDownload.url} download={pdfDownload.filename}>
                Download {pdfDownload.filename}
              </a>
            )}
          </div>

          {imageStats.total > 0 && (
            <p className="ssb-status">
              {imageStats.running
                ? `Generating storyboard images... ${imageStats.done}/${imageStats.total}`
                : `Storyboard image pass complete: ${imageStats.done}/${imageStats.total}`}
            </p>
          )}

          <div className="ssb-grid">
            {(storyboard.frames || []).map((frame) => (
              <article key={frame.frameNumber} className="ssb-card">
                <div className="ssb-frame-top">
                  <span>Frame {frame.frameNumber}</span>
                  <span>{frame.timing}</span>
                </div>

                <div className="ssb-image-wrap">
                  {frame.imageUrl ? (
                    <img src={frame.imageUrl} alt={`Frame ${frame.frameNumber}`} loading="lazy" />
                  ) : (
                    <div className="ssb-placeholder">Image pending...</div>
                  )}
                </div>

                <div className="ssb-chip-row">
                  <span className="ssb-chip">{frame.shotType}</span>
                  <span className="ssb-chip">{frame.transition}</span>
                </div>

                <div className="ssb-copy">
                  <p><strong>Beat:</strong> {frame.beat}</p>
                  <p><strong>Purpose:</strong> {frame.purpose}</p>
                  <p><strong>Visual Decision:</strong> {frame.visualDecision}</p>
                  <p><strong>Why This Exists:</strong> {frame.whyThisExists}</p>
                  <p><strong>Cut Logic:</strong> {frame.cutLogic}</p>
                  <p><strong>Contrast:</strong> {frame.contrastFromPrevious}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
