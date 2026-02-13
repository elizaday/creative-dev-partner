import { useState } from 'react';
import BriefUpload from './components/BriefUpload';
import IdeasGrid from './components/IdeasGrid';
import Variations from './components/Variations';
import FinalConcepts from './components/FinalConcepts';
import LoadingState from './components/LoadingState';

function App() {
  const [phase, setPhase] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState({ text: '', subtext: '' });
  const [error, setError] = useState(null);

  // State data
  const [brief, setBrief] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [selectedIdeas, setSelectedIdeas] = useState([]);
  const [variations, setVariations] = useState([]);
  const [selectedVariations, setSelectedVariations] = useState([]);
  const [finalConcepts, setFinalConcepts] = useState([]);

  const phases = [
    { num: 1, label: 'Brief' },
    { num: 2, label: '10 Ideas' },
    { num: 3, label: 'Variations' },
    { num: 4, label: 'Final 3' }
  ];

  const getPhaseClass = (phaseNum) => {
    if (phaseNum === phase) return 'active';
    if (phaseNum < phase) return 'completed';
    return '';
  };

  // Helper to read streamed SSE response and extract final data
  const fetchStream = async (url, body, fallbackError) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // Non-streaming error responses (validation errors return JSON directly)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data;
    }

    // Read the SSE stream
    const text = await response.text();
    const lines = text.split('\n');

    // Find the last data line that has actual content (not just status)
    let result = null;
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.error) throw new Error(parsed.error);
          if (!parsed.status) result = parsed; // Skip keepalive status messages
        } catch (e) {
          if (e.message && !e.message.includes('JSON')) throw e;
        }
      }
    }

    if (!result) throw new Error(fallbackError);
    return result;
  };

  const handleGenerateIdeas = async (briefText) => {
    setBrief(briefText);
    setLoading(true);
    setLoadingMessage({ text: 'Analyzing brief...', subtext: 'Extracting key elements' });
    setError(null);

    try {
      const data = await fetchStream('/api/ideas', { brief: briefText }, 'Failed to generate ideas. Please try again.');
      setIdeas(data.ideas);
      setPhase(2);
    } catch (err) {
      setError(err.message);
      console.error('Error generating ideas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateVariations = async () => {
    const selectedIdeaObjects = ideas.filter(idea => selectedIdeas.includes(idea.id));

    setLoading(true);
    setLoadingMessage({ text: 'Developing variations...', subtext: 'Exploring each direction' });
    setError(null);

    try {
      const data = await fetchStream('/api/variations', { brief, selectedIdeas: selectedIdeaObjects }, 'Failed to generate variations. Please try again.');
      setVariations(data.variations);
      setPhase(3);
    } catch (err) {
      setError(err.message);
      console.error('Error generating variations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDevelopFinalConcepts = async () => {
    setLoading(true);
    setLoadingMessage({ text: 'Building final concepts...', subtext: 'Adding visual references and details' });
    setError(null);

    try {
      const data = await fetchStream('/api/final-concepts', { brief, selectedVariations }, 'Failed to develop final concepts. Please try again.');
      setFinalConcepts(data.concepts);
      setPhase(4);
    } catch (err) {
      setError(err.message);
      console.error('Error developing final concepts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPhase(1);
    setBrief('');
    setIdeas([]);
    setSelectedIdeas([]);
    setVariations([]);
    setSelectedVariations([]);
    setFinalConcepts([]);
    setError(null);
  };

  return (
    <>
      <div className="ambient-bg"></div>

      <div className="app">
        <header className="header">
          <div className="logo-area">
            <img src="/studionow-logo-white.svg" alt="StudioNow" className="logo-image" />
            <div className="logo-divider"></div>
            <div className="tool-name">Creative Dev Partner</div>
          </div>
          <div className="phase-indicator">
            {phases.map((p, idx) => (
              <div key={p.num}>
                <div className={`phase-step ${getPhaseClass(p.num)}`}>
                  <div className="phase-num">{p.num}</div>
                  <span>{p.label}</span>
                </div>
                {idx < phases.length - 1 && <div className="phase-connector"></div>}
              </div>
            ))}
          </div>
        </header>

        {loading ? (
          <LoadingState text={loadingMessage.text} subtext={loadingMessage.subtext} />
        ) : (
          <>
            {phase === 1 && (
              <BriefUpload onGenerate={handleGenerateIdeas} error={error} />
            )}

            {phase === 2 && (
              <IdeasGrid
                ideas={ideas}
                selectedIdeas={selectedIdeas}
                onSelectionChange={setSelectedIdeas}
                onContinue={handleGenerateVariations}
                error={error}
              />
            )}

            {phase === 3 && (
              <Variations
                variations={variations}
                selectedVariations={selectedVariations}
                onSelectionChange={setSelectedVariations}
                onContinue={handleDevelopFinalConcepts}
                error={error}
              />
            )}

            {phase === 4 && (
              <FinalConcepts
                concepts={finalConcepts}
                onReset={handleReset}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

export default App;
