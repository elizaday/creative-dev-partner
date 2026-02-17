import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-3-5-haiku-latest';
const ANTHROPIC_TIMEOUT_MS = 12000;
const TIMEOUT_ERROR = 'ANTHROPIC_TIMEOUT';

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(TIMEOUT_ERROR)), ms);
    })
  ]);
}

function buildFallbackVariations(selectedIdeas = []) {
  return selectedIdeas.map((idea, idx) => ({
    originalId: idea.id || idx + 1,
    originalTitle: idea.title || `Idea ${idx + 1}`,
    variations: [
      {
        letter: 'A',
        title: `${idea.title || `Idea ${idx + 1}`} — Character-Led`,
        description: 'Push the same core idea through a human performance lens with clearer emotional beats.',
        shift: 'Character-driven execution'
      },
      {
        letter: 'B',
        title: `${idea.title || `Idea ${idx + 1}`} — Visual System`,
        description: 'Keep the concept but move to a more graphic, design-forward visual treatment.',
        shift: 'Visual language shift'
      },
      {
        letter: 'C',
        title: `${idea.title || `Idea ${idx + 1}`} — Fast Cut`,
        description: 'Compress into a sharper, high-energy rhythm while preserving the same message.',
        shift: 'Pacing and structure shift'
      }
    ]
  }));
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  let selectedIdeas = [];
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const body = await req.json();
    const brief = body?.brief;
    selectedIdeas = Array.isArray(body?.selectedIdeas) ? body.selectedIdeas : [];

    if (!brief || !selectedIdeas || selectedIdeas.length === 0) {
      return new Response(JSON.stringify({ error: 'Brief and selected ideas are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (selectedIdeas.length > 3) {
      return new Response(JSON.stringify({ error: 'Maximum 3 ideas can be selected' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const ideasText = selectedIdeas.map(idea => `${idea.title}: ${idea.description}`).join('\n\n');

    const prompt = `You are an expert creative director developing variations on selected concepts.

ORIGINAL BRIEF:
${brief}

SELECTED CONCEPTS:
${ideasText}

For each concept above, generate 3 distinct variations. Each variation should:
- Maintain the core idea but shift tone, pacing, or structure
- Offer a meaningfully different execution
- Include a clear "shift" explanation

Common variation types:
- Extended Cut (slower pacing, more silence)
- Ensemble Version (multiple characters/vignettes)
- Inverted (reversed structure)
- Darker/Lighter tone shifts
- Different setting or time period
- Different visual style

Format as JSON array:
[
  {
    "originalId": 1,
    "originalTitle": "The Expert Opinion",
    "variations": [
      {
        "letter": "A",
        "title": "The Expert Opinion — Extended Cut",
        "description": "Same core concept, but we hold on moments longer. Let the silence do the work. More observational, less rushed.",
        "shift": "Slower pacing, more uncomfortable pauses"
      },
      {
        "letter": "B",
        "title": "The Expert Opinion — Ensemble Version",
        "description": "Multiple expert panels across different industries, all reaching the same simple conclusion.",
        "shift": "Multiple vignettes instead of single narrative"
      },
      {
        "letter": "C",
        "title": "The Expert Opinion — Inverted",
        "description": "Start with the satisfied user, then flash back to show the absurd analysis they're NOT dealing with.",
        "shift": "Reversed structure, satisfaction first"
      }
    ]
  }
]

Return ONLY the JSON array, no other text.`;

    let message;
    try {
      message = await withTimeout(
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 1400,
          messages: [{ role: 'user', content: prompt }]
        }),
        ANTHROPIC_TIMEOUT_MS
      );
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        return new Response(JSON.stringify({ variations: buildFallbackVariations(selectedIdeas), fallback: true, partial: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ variations: buildFallbackVariations(selectedIdeas), fallback: true, partial: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let variations;
    try {
      variations = JSON.parse(jsonMatch[0]);
    } catch {
      variations = buildFallbackVariations(selectedIdeas);
      return new Response(JSON.stringify({ variations, fallback: true, partial: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ variations }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error generating variations:', error);
    return new Response(JSON.stringify({ variations: buildFallbackVariations(selectedIdeas), fallback: true, partial: true, details: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: "/api/variations" };
