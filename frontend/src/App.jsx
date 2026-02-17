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

  // Helper to call API and parse JSON response
  const callApi = async (url, body) => {
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
    if (!response.ok || data.error) {
      throw new Error(data.details || data.error || `Request failed (${response.status})`);
    }
    return data;
  };

  const handleGenerateIdeas = async (briefText) => {
    setBrief(briefText);
    setLoading(true);
    setLoadingMessage({ text: 'Analyzing brief...', subtext: 'Extracting key elements' });
    setError(null);

    try {
      const data = await callApi('/api/ideas', { brief: briefText });
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
      const data = await callApi('/api/variations', { brief, selectedIdeas: selectedIdeaObjects });
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
      const data = await callApi('/api/final-concepts', { brief, selectedVariations });
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
            <div className="tool-name">Creative Development Partner</div>
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
