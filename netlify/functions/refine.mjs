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
    const { brief, concept, feedback } = await req.json();

    if (!brief || !concept || !feedback) {
      return new Response(JSON.stringify({ error: 'Brief, concept, and feedback are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const prompt = `You are an expert creative director refining a concept based on client feedback.

ORIGINAL BRIEF:
${brief}

CURRENT CONCEPT:
Title: ${concept.title}
Description: ${concept.description}

CLIENT FEEDBACK:
${feedback}

Revise the concept to address the feedback while maintaining what works. Return a JSON object with the same structure as the original concept, but improved based on the feedback.

Return ONLY the JSON object, no other text.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Failed to parse refined concept from Claude response' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const refined = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify({ concept: refined }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error refining concept:', error);
    return new Response(JSON.stringify({ error: 'Failed to refine concept', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: "/api/refine" };
