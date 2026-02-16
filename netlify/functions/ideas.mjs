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
    const { brief } = await req.json();

    if (!brief || brief.trim().length < 50) {
      return new Response(JSON.stringify({ error: 'Brief must be at least 50 characters' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const prompt = `You are an expert creative director helping develop advertising concepts. I'll give you a client brief, and you'll generate 10 wildly different creative directions.

BRIEF:
${brief}

Generate exactly 10 creative concepts. Each should be:
- Wildly different from the others (different tones, approaches, risk levels)
- Range from safe to bold
- Include variety: satirical, emotional, absurd, minimal, cinematic, etc.
- Adaptable to the brief's product/brand

For each concept, provide:
1. A short, punchy title (3-5 words)
2. A one-sentence hook (the core idea in under 20 words)
3. A 2-3 sentence description explaining the concept
4. 3 tags: one for tone, one for visual style, one for risk level
5. 4 scene beats (opening, build, turn, resolution)

Format your response as a JSON array. Example structure:
[
  {
    "id": 1,
    "title": "The Expert Opinion",
    "hook": "Experts analyzed it for hours. Their conclusion? It just works.",
    "description": "A panel of overly serious experts examine the product with absurd intensity. Charts, graphs, heated debates. Final verdict: no notes.",
    "tags": {
      "tone": "Satirical",
      "visual": "Institutional",
      "risk": "Safe"
    },
    "scenes": [
      "Opening: Panel of experts gather around product",
      "Build: Intense analysis, furrowed brows, heated whispers",
      "Turn: Head expert delivers verdict with gravitas",
      "Resolution: 'No notes.' Simple satisfaction."
    ]
  }
]

Return ONLY the JSON array, no other text.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Failed to parse ideas from Claude response' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const ideas = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify({ ideas }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error generating ideas:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate ideas', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: "/api/ideas" };
