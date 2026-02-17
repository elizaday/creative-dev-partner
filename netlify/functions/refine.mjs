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

function buildFallbackRefinedConcept(concept, feedback) {
  if (!concept || typeof concept !== 'object') {
    return {
      title: 'Refined Concept',
      description: `Refinement requested: ${feedback || 'No feedback provided.'}`
    };
  }

  return {
    ...concept,
    description: `${concept.description || ''}\n\nRefinement note: ${feedback || 'Client requested refinements.'}`.trim()
  };
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  let concept = null;
  let feedback = '';
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const body = await req.json();
    const brief = body?.brief;
    concept = body?.concept;
    feedback = body?.feedback || '';

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

    let message;
    try {
      message = await withTimeout(
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 900,
          messages: [{ role: 'user', content: prompt }]
        }),
        ANTHROPIC_TIMEOUT_MS
      );
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        return new Response(JSON.stringify({ concept: buildFallbackRefinedConcept(concept, feedback), fallback: true, partial: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ concept: buildFallbackRefinedConcept(concept, feedback), fallback: true, partial: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let refined;
    try {
      refined = JSON.parse(jsonMatch[0]);
    } catch {
      refined = buildFallbackRefinedConcept(concept, feedback);
      return new Response(JSON.stringify({ concept: refined, fallback: true, partial: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ concept: refined }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error refining concept:', error);
    return new Response(JSON.stringify({ concept: buildFallbackRefinedConcept(concept, feedback), fallback: true, partial: true, details: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: "/api/refine" };
