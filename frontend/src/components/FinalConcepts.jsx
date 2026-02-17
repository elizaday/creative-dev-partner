import { useEffect, useMemo, useState } from 'react';
import Storyboard from './Storyboard';
import { exportConceptPdf } from '../utils/pdfExport';

const IMAGE_CONCURRENCY = 2;

export default function FinalConcepts({ concepts, onReset }) {
  const [displayConcepts, setDisplayConcepts] = useState(concepts || []);
  const [imageStats, setImageStats] = useState({ total: 0, done: 0, running: false });
  const [pdfLoadingIndex, setPdfLoadingIndex] = useState(null);

  useEffect(() => {
    setDisplayConcepts(concepts || []);
  }, [concepts]);

  const imageTasks = useMemo(() => {
    const tasks = [];
    (concepts || []).forEach((concept, conceptIndex) => {
      const frames = Array.isArray(concept.storyboardFrames) ? concept.storyboardFrames : [];
      frames.forEach((frame, frameIndex) => {
        if (!frame.imageUrl) {
          tasks.push({ conceptIndex, frameIndex, frame, concept });
        }
      });
    });
    return tasks;
  }, [concepts]);

  useEffect(() => {
    if (!imageTasks.length) {
      setImageStats({ total: 0, done: 0, running: false });
      return;
    }

    let cancelled = false;
    let cursor = 0;
    let done = 0;

    setImageStats({ total: imageTasks.length, done: 0, running: true });

    const worker = async () => {
      while (!cancelled) {
        const taskIndex = cursor;
        cursor += 1;
        if (taskIndex >= imageTasks.length) break;

        const task = imageTasks[taskIndex];

        try {
          const response = await fetch('/api/frame-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              frame: task.frame,
              conceptTitle: task.concept.title,
              conceptDescription: task.concept.description
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.imageUrl && !cancelled) {
              setDisplayConcepts((prev) => {
                const next = prev.map((c, cIdx) => {
                  if (cIdx !== task.conceptIndex) return c;
                  const nextFrames = (c.storyboardFrames || []).map((f, fIdx) => {
                    if (fIdx !== task.frameIndex) return f;
                    return { ...f, imageUrl: data.imageUrl };
                  });
                  return { ...c, storyboardFrames: nextFrames };
                });
                return next;
              });
            }
          }
        } catch (error) {
          console.error('Frame image generation failed:', error.message);
        } finally {
          done += 1;
          if (!cancelled) {
            setImageStats({ total: imageTasks.length, done, running: done < imageTasks.length });
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(IMAGE_CONCURRENCY, imageTasks.length) }, () => worker());
    Promise.all(workers).catch(() => {
      if (!cancelled) {
        setImageStats((prev) => ({ ...prev, running: false }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageTasks]);

  const handleDownloadPdf = async (concept, index) => {
    try {
      setPdfLoadingIndex(index);
      await exportConceptPdf(concept, concept.number || index + 1);
    } catch (error) {
      console.error('PDF export failed:', error.message);
      alert('Failed to generate PDF for this concept.');
    } finally {
      setPdfLoadingIndex(null);
    }
  };

  return (
    <section className="section">
      <div className="ideas-section">
        <div className="section-header">
          <h1 className="section-title">Your three concepts, fully developed</h1>
          <p className="section-subtitle">
            Complete creative directions with visual storyboards, production notes, and rationale.
          </p>
          {imageStats.total > 0 && (
            <p className="section-subtitle">
              {imageStats.running
                ? `Generating storyboard images... ${imageStats.done}/${imageStats.total}`
                : `Storyboard images complete: ${imageStats.done}/${imageStats.total}`}
            </p>
          )}
        </div>

        {displayConcepts.map((concept, index) => (
          <div key={index} className="final-concept">
            <div className="final-concept-header">
              <div>
                <div className="final-concept-num">FINAL CONCEPT {concept.number || index + 1}</div>
                <div className="final-concept-title">{concept.title}</div>
                <div className="final-concept-tagline">"{concept.tagline}"</div>
              </div>
              <button
                className="btn-secondary"
                onClick={() => handleDownloadPdf(concept, index)}
                disabled={pdfLoadingIndex === index}
              >
                {pdfLoadingIndex === index ? 'Generating PDF...' : 'Download PDF'}
              </button>
            </div>

            <div className="final-concept-body">
              <div className="concept-overview">
                <h4>Core Concept</h4>
                <p>{concept.description}</p>
              </div>

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
