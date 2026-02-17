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

function buildFallbackIdeas() {
  const templates = [
    ['The Honest Demo', 'Show the product doing one thing exceptionally well.', 'Confident', 'Documentary', 'Safe'],
    ['Before and After', 'Contrast life without the product vs life with it.', 'Practical', 'Lifestyle', 'Safe'],
    ['Tiny Moment Twist', 'A normal moment gets unexpectedly better because of the product.', 'Wry', 'Cinematic', 'Medium'],
    ['Expert Breakdown', 'An expert dissects why this solution quietly outperforms.', 'Authoritative', 'Studio', 'Safe'],
    ['Street Reactions', 'Real people discover and react to the value in real time.', 'Human', 'Handheld', 'Medium'],
    ['One Day Story', 'Follow one person through a day transformed by this product.', 'Emotional', 'Narrative', 'Medium'],
    ['Myth vs Reality', 'Debunk category myths and land on clear proof.', 'Direct', 'Graphic-led', 'Medium'],
    ['Future Snapshot', 'Project where this category is heading and why this leads.', 'Aspirational', 'Futuristic', 'Bold'],
    ['Minimal Hero', 'Stripped-back product film with sharp writing and confidence.', 'Premium', 'Minimal', 'Safe'],
    ['Three Use Cases', 'Rapid vignettes prove versatility across scenarios.', 'Energetic', 'Montage', 'Medium']
  ];

  return templates.map((t, idx) => ({
    id: idx + 1,
    title: t[0],
    hook: t[1],
    description: `${t[1]} Keep the message simple, specific, and visually clear.`,
    tags: {
      tone: t[2],
      visual: t[3],
      risk: t[4]
    },
    scenes: [
      'Opening: Establish context and tension quickly.',
      'Build: Introduce product interaction and key benefit.',
      'Turn: Deliver the proof moment or unexpected payoff.',
      'Resolution: Land tagline and clear brand takeaway.'
    ]
  }));
}

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

    let message;
    try {
      message = await withTimeout(
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }]
        }),
        ANTHROPIC_TIMEOUT_MS
      );
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        return new Response(JSON.stringify({ ideas: buildFallbackIdeas(), fallback: true, partial: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ ideas: buildFallbackIdeas(), fallback: true, partial: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let ideas;
    try {
      ideas = JSON.parse(jsonMatch[0]);
    } catch {
      ideas = buildFallbackIdeas();
      return new Response(JSON.stringify({ ideas, fallback: true, partial: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!Array.isArray(ideas) || ideas.length === 0) {
      return new Response(JSON.stringify({ ideas: buildFallbackIdeas(), fallback: true, partial: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ideas }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error generating ideas:', error);
    return new Response(JSON.stringify({ ideas: buildFallbackIdeas(), fallback: true, partial: true, details: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: "/api/ideas" };
