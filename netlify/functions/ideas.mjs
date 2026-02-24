import Anthropic from '@anthropic-ai/sdk';
import { TIMEOUT_ERROR, withTimeout, createMessageWithFallback } from './_anthropic.mjs';

const ANTHROPIC_TIMEOUT_MS = 22000;
const TARGET_IDEA_COUNT = 10;

function extractJsonArray(text) {
  const match = String(text || '').match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found');
  return JSON.parse(match[0]);
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
    insight: 'Use a clear human truth that reframes category expectations.',
    whyItWorks: 'It ties the core benefit to a concrete behavioral moment and gives production a clear execution path.',
    tags: { tone: t[2], visual: t[3], risk: t[4] },
    scenes: [
      'Opening: Establish context and tension quickly.',
      'Build: Introduce product interaction and key benefit.',
      'Turn: Deliver the proof moment or unexpected payoff.',
      'Resolution: Land tagline and clear brand takeaway.'
    ],
    scores: {
      originality: 6,
      briefFit: 7,
      clarity: 8,
      feasibility: 8,
      distinctiveness: 6,
      overall: 7
    }
  }));
}

function normalizeScenes(scenes = []) {
  const safe = Array.isArray(scenes) ? scenes.filter(Boolean).slice(0, 4) : [];
  while (safe.length < 4) {
    safe.push('Beat: Advance the narrative toward a clear brand payoff.');
  }
  return safe;
}

function normalizeIdea(idea, index) {
  const title = idea?.title || `Concept ${index + 1}`;
  const description = idea?.description || 'Clear, brief-fit concept with a distinct execution angle.';
  const hook = idea?.hook || `${title} turns the brief into a specific, memorable story.`;
  const scores = idea?.scores || {};

  return {
    id: index + 1,
    title,
    hook,
    description,
    insight: idea?.insight || 'Anchor the concept in a specific audience tension from the brief.',
    whyItWorks: idea?.whyItWorks || 'It connects message clarity with a distinct creative mechanism.',
    tags: {
      tone: idea?.tags?.tone || 'Balanced',
      visual: idea?.tags?.visual || 'Cinematic',
      risk: idea?.tags?.risk || 'Medium'
    },
    scenes: normalizeScenes(idea?.scenes),
    scores: {
      originality: Number(scores.originality || 7),
      briefFit: Number(scores.briefFit || 8),
      clarity: Number(scores.clarity || 8),
      feasibility: Number(scores.feasibility || 7),
      distinctiveness: Number(scores.distinctiveness || 8),
      overall: Number(scores.overall || 8)
    }
  };
}

function normalizeTopIdeas(ideas) {
  const list = Array.isArray(ideas) ? ideas : [];
  const seen = new Set();
  const deduped = [];

  for (const item of list) {
    const key = String(item?.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  while (deduped.length < TARGET_IDEA_COUNT) {
    deduped.push(buildFallbackIdeas()[deduped.length]);
  }

  return deduped.slice(0, TARGET_IDEA_COUNT).map((idea, idx) => normalizeIdea(idea, idx));
}

async function createMessage(anthropic, prompt, maxTokens = 2000) {
  const result = await withTimeout(
    createMessageWithFallback(anthropic, {
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
    ANTHROPIC_TIMEOUT_MS
  );

  return result.response;
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
    const { brief } = await req.json();

    if (!brief || brief.trim().length < 50) {
      return new Response(JSON.stringify({ error: 'Brief must be at least 50 characters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const prompt = `You are a world-class creative director.\n\nCLIENT BRIEF:\n${brief}\n\nTask:\nGenerate EXACTLY 10 high-quality creative directions.\n\nOutput format (JSON array only):\nEach item must include:\n- title (3-6 words)\n- hook (max 20 words)\n- insight (one sentence audience truth/tension this idea is built on)\n- description (3-5 sentences, thoughtful and specific)\n- whyItWorks (1-2 sentences explaining strategic reason this concept should perform)\n- tags { tone, visual, risk }\n- scenes (exactly 4 concise beats: opening, build, turn, resolution)\n- scores { originality, briefFit, clarity, feasibility, distinctiveness, overall }\n\nQuality rules:\n- ideas must be meaningfully different (not cosmetic variants)\n- range from safe to bold\n- each idea must explicitly connect to brief objectives and constraints\n- avoid generic ad cliches\n- each idea must have a clear execution mechanism, not just a theme\n\nScoring rules:\n- each score is integer 1-10\n- overall weighted toward originality + briefFit\n\nReturn ONLY valid JSON array with exactly 10 items.`;

    let ideas;
    try {
      const message = await createMessage(anthropic, prompt, 2100);
      ideas = extractJsonArray(message.content?.[0]?.text || '');
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        return new Response(JSON.stringify({
          ideas: buildFallbackIdeas(),
          fallback: true,
          partial: true,
          fallbackReason: 'timeout'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    return new Response(JSON.stringify({ ideas: normalizeTopIdeas(ideas), qualityPipeline: 'single-pass-scored' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating ideas:', error);
    return new Response(JSON.stringify({
      ideas: buildFallbackIdeas(),
      fallback: true,
      partial: true,
      fallbackReason: 'error',
      details: error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/ideas' };
