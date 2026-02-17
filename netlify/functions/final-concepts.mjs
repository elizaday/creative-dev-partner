import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-3-5-haiku-latest';
const ANTHROPIC_TIMEOUT_MS = 12000;
const TIMEOUT_ERROR = 'ANTHROPIC_TIMEOUT';
const TARGET_FRAME_COUNT = 8;
const FRAME_TIMINGS = [
  '0:00-0:04',
  '0:04-0:08',
  '0:08-0:12',
  '0:12-0:16',
  '0:16-0:20',
  '0:20-0:24',
  '0:24-0:27',
  '0:27-0:30'
];

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(TIMEOUT_ERROR)), ms);
    })
  ]);
}

function buildPlaceholderFrame(frameIndex, seedText = '') {
  const frameNumber = frameIndex + 1;
  return {
    frameNumber,
    timing: FRAME_TIMINGS[frameIndex] || '',
    shotType: ['Wide', 'Medium', 'Close-up', 'Wide', 'Medium', 'Close-up', 'POV', 'Hero'][frameIndex] || 'Wide',
    visual: seedText ? `Visual beat ${frameNumber}: ${seedText}` : `Visual beat ${frameNumber}: clear progression of the concept.`,
    action: `Action beat ${frameNumber}: advance story toward final payoff.`,
    audio: `Audio beat ${frameNumber}: supporting VO/music cue.`,
    transition: frameNumber === TARGET_FRAME_COUNT ? 'Fade out' : 'Cut',
    imageUrl: null
  };
}

function normalizeStoryboardFrames(frames, seedText = '') {
  const normalized = [];
  for (let i = 0; i < TARGET_FRAME_COUNT; i += 1) {
    const frame = Array.isArray(frames) ? frames[i] : null;
    if (frame) {
      normalized.push({
        frameNumber: i + 1,
        timing: frame.timing || FRAME_TIMINGS[i] || '',
        shotType: frame.shotType || 'Wide',
        visual: frame.visual || (seedText ? `Visual beat ${i + 1}: ${seedText}` : ''),
        action: frame.action || `Action beat ${i + 1}: progress the narrative.`,
        audio: frame.audio || `Audio beat ${i + 1}: VO/music support.`,
        transition: frame.transition || (i === TARGET_FRAME_COUNT - 1 ? 'Fade out' : 'Cut'),
        imageUrl: frame.imageUrl || null
      });
    } else {
      normalized.push(buildPlaceholderFrame(i, seedText));
    }
  }
  return normalized;
}

function buildFallbackConcept(variation, index) {
  return {
    number: index + 1,
    title: variation?.title || `Concept ${index + 1}`,
    tagline: variation?.shift || 'Refined from selected variation',
    description: variation?.description || 'Concept draft generated from selected variation.',
    storyboardFrames: normalizeStoryboardFrames([], variation?.description || variation?.title || ''),
    visualReferences: [],
    productionNotes: [],
    rationale: 'Generated as a fallback because the model returned fewer concepts than requested.'
  };
}

function normalizeConcepts(rawConcepts, selectedVariations) {
  const expectedCount = selectedVariations.length;
  const concepts = Array.isArray(rawConcepts) ? rawConcepts.slice(0, expectedCount) : [];

  for (let i = 0; i < concepts.length; i += 1) {
    const concept = concepts[i] || {};
    const frames = Array.isArray(concept.storyboardFrames) ? concept.storyboardFrames : [];
    concept.number = concept.number || i + 1;
    concept.title = concept.title || selectedVariations[i]?.title || `Concept ${i + 1}`;
    concept.tagline = concept.tagline || selectedVariations[i]?.shift || '';
    concept.description = concept.description || selectedVariations[i]?.description || '';
    concept.visualReferences = Array.isArray(concept.visualReferences) ? concept.visualReferences : [];
    concept.productionNotes = Array.isArray(concept.productionNotes) ? concept.productionNotes : [];
    concept.storyboardFrames = normalizeStoryboardFrames(
      frames,
      concept.description || selectedVariations[i]?.description || selectedVariations[i]?.title || ''
    );
  }

  while (concepts.length < expectedCount) {
    concepts.push(buildFallbackConcept(selectedVariations[concepts.length], concepts.length));
  }

  return concepts;
}

function fallbackConceptsFromVariations(selectedVariations) {
  return selectedVariations.map((variation, index) => ({
    number: index + 1,
    title: variation?.title || `Concept ${index + 1}`,
    tagline: variation?.shift || 'Refined variation',
    description: variation?.description || 'Generated from selected variation.',
    storyboardFrames: normalizeStoryboardFrames([], variation?.description || variation?.title || ''),
    visualReferences: ['High-end commercial look', 'Clear product storytelling', 'Brand-consistent tone'],
    productionNotes: ['30-second pacing', 'Readable visuals', 'Simple transitions'],
    rationale: 'Fallback generated to avoid timeout and keep workflow moving.'
  }));
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { brief, selectedVariations } = await req.json();

    if (!brief || !selectedVariations || selectedVariations.length === 0) {
      return new Response(JSON.stringify({ error: 'Brief and selected variations are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (selectedVariations.length > 3) {
      return new Response(JSON.stringify({ error: 'Maximum 3 variations can be selected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const expectedCount = selectedVariations.length;
    const variationsText = selectedVariations
      .map((v, idx) => `Variation ${idx + 1}: ${v.title}\n${v.description}\nShift: ${v.shift}`)
      .join('\n\n---\n\n');

    const prompt = `You are an expert creative director.\n\nORIGINAL BRIEF:\n${brief}\n\nSELECTED VARIATIONS:\n${variationsText}\n\nGenerate EXACTLY ${expectedCount} final concepts as a JSON array with EXACTLY ${expectedCount} objects.\nEach object must include: number, title, tagline, description, storyboardFrames (exactly ${TARGET_FRAME_COUNT} with frameNumber/timing/shotType/visual/action/audio/transition), visualReferences, productionNotes, rationale.\nKeep each frame field concise (1 short sentence). Return ONLY valid JSON.`;

    let message;
    try {
      message = await withTimeout(
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 1600,
          messages: [{ role: 'user', content: prompt }]
        }),
        ANTHROPIC_TIMEOUT_MS
      );
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        const concepts = fallbackConceptsFromVariations(selectedVariations);
        return new Response(JSON.stringify({ concepts, fallback: true, partial: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      const concepts = fallbackConceptsFromVariations(selectedVariations);
      return new Response(JSON.stringify({ concepts, fallback: true, partial: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (error) {
      const concepts = fallbackConceptsFromVariations(selectedVariations);
      return new Response(JSON.stringify({ concepts, fallback: true, partial: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const concepts = normalizeConcepts(parsed, selectedVariations);

    return new Response(JSON.stringify({ concepts }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error developing final concepts:', error);
    return new Response(JSON.stringify({ error: 'Failed to develop final concepts', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/final-concepts' };
