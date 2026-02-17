import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-3-5-haiku-latest';

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

    const prompt = `You are an expert creative director helping develop advertising concepts. Generate 10 creative directions from this brief.

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

Format as JSON array with objects containing:
id, title, hook, description, tags { tone, visual, risk }, scenes (4 items).
Return ONLY JSON.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1800,
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
