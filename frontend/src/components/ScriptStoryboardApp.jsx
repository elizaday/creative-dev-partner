import { useEffect, useMemo, useState } from 'react';

const SCRIPT_RETRY_ATTEMPTS = 3;
const SCRIPT_RETRY_DELAY_MS = 1200;
const IMAGE_CONCURRENCY = 2;

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
  for (let attempt = 1; attempt <= SCRIPT_RETRY_ATTEMPTS; attempt += 1) {
    const data = await callApi(url, body);
    if (!data.fallback) return data;

    if (attempt < SCRIPT_RETRY_ATTEMPTS) {
      onRetry?.(attempt + 1, SCRIPT_RETRY_ATTEMPTS);
      await wait(SCRIPT_RETRY_DELAY_MS * attempt);
      continue;
    }

    throw new Error('High-quality storyboard generation is still warming up. Please run again.');
  }

  throw new Error('Unable to complete storyboard generation.');
}

export default function ScriptStoryboardApp() {
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState(null);

  const [storyboard, setStoryboard] = useState(null);
  const [imageStats, setImageStats] = useState({ total: 0, done: 0, running: false });
  const [generationRunId, setGenerationRunId] = useState(0);

  const isScriptValid = script.trim().length >= 80;

  const framesToGenerate = useMemo(() => {
    if (!storyboard?.frames) return [];
    return storyboard.frames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => !frame.imageUrl);
  }, [storyboard]);

  const handleGenerateStoryboard = async () => {
    setLoading(true);
    setLoadingText('Breaking script into storyboard beats...');
    setError(null);

    try {
      const data = await callWithQualityRetry('/api/script-storyboard', { script }, (attempt, max) => {
        setLoadingText(`Retrying for high-quality script alignment (${attempt}/${max})...`);
      });

      setStoryboard(data.storyboard);
      setGenerationRunId((prev) => prev + 1);
    } catch (err) {
      setError(err.message);
      setStoryboard(null);
    } finally {
      setLoading(false);
      setLoadingText('');
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
            conceptDescription: `${storyboard.summary || ''} Script anchor: ${frame.scriptAnchor || ''}. Dialogue: ${frame.dialogue || ''}`
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
          <h1>Storyboard Alignment Studio</h1>
          <p>Paste a script and generate an 8-frame storyboard with FAL-powered visuals aligned to script beats.</p>
        </div>
        <a className="ssb-link" href="/">Open Creative Development Partner</a>
      </header>

      <section className="ssb-panel">
        <label htmlFor="script-input">Script</label>
        <textarea
          id="script-input"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Paste your full script here (dialogue + action + audio cues)..."
        />
        <div className="ssb-toolbar">
          <span>{script.trim().length} chars</span>
          <button
            className="ssb-btn"
            onClick={handleGenerateStoryboard}
            disabled={!isScriptValid || loading}
          >
            {loading ? 'Generating...' : 'Generate 8-Frame Storyboard'}
          </button>
        </div>
        {loadingText && <p className="ssb-status">{loadingText}</p>}
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
                  <p><strong>Script Anchor:</strong> {frame.scriptAnchor}</p>
                  <p><strong>Visual:</strong> {frame.visual}</p>
                  <p><strong>Action:</strong> {frame.action}</p>
                  <p><strong>Audio:</strong> {frame.audio}</p>
                  <p><strong>Dialogue:</strong> {frame.dialogue}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
