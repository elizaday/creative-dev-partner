import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5-20250929';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { brief, selectedIdeas } = await req.json();

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

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 12000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Failed to parse variations from Claude response' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const variations = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify({ variations }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error generating variations:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate variations', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: "/api/variations" };
