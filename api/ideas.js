import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-20250514';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { brief } = req.body;

    if (!brief || brief.trim().length < 50) {
      return res.status(400).json({ error: 'Brief must be at least 50 characters' });
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

    const response_text = message.content[0].text;
    const jsonMatch = response_text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse ideas from Claude response');
    }

    const ideas = JSON.parse(jsonMatch[0]);
    res.status(200).json({ ideas });
  } catch (error) {
    console.error('Error generating ideas:', error);
    res.status(500).json({ error: 'Failed to generate ideas', details: error.message });
  }
}
