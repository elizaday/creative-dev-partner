import Anthropic from '@anthropic-ai/sdk';
import { TIMEOUT_ERROR, withTimeout, createMessageWithFallback } from './_anthropic.mjs';

const ANTHROPIC_TIMEOUT_MS = 12000;
const TARGET_IDEA_COUNT = 10;
const CANDIDATE_IDEA_COUNT = 12;

function extractJsonArray(text) {
  const match = String(text || '').match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found');
  return JSON.parse(match[0]);
}

function extractJsonObject(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found');
  return JSON.parse(match[0]);
}

function fallbackStrategy(brief) {
  const compactBrief = String(brief || '').replace(/\s+/g, ' ').trim();
  return {
    audienceInsight: compactBrief.slice(0, 180) || 'Broad audience with practical needs.',
    brandTension: 'Need to stand out while staying believable.',
    businessObjective: 'Drive preference and clarity of value.',
    emotionalNeed: 'Confidence and relevance.',
    creativeLevers: ['proof', 'contrast', 'human truth', 'clear payoff', 'memorable frame'],
    constraints: ['30-second format', 'single-minded message'],
    tabooDirections: ['generic category cliches'],
    successCriteria: ['distinctive', 'brief-fit', 'production-feasible']
  };
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
    candidateId: idea?.candidateId || idea?.id || `candidate-${index + 1}`,
    title,
    hook,
    description,
    tags: {
      tone: idea?.tags?.tone || 'Balanced',
      visual: idea?.tags?.visual || 'Cinematic',
      risk: idea?.tags?.risk || 'Medium'
    },
    scenes: normalizeScenes(idea?.scenes),
    scores: {
      originality: Number(scores.originality || 0),
      briefFit: Number(scores.briefFit || 0),
      clarity: Number(scores.clarity || 0),
      feasibility: Number(scores.feasibility || 0),
      distinctiveness: Number(scores.distinctiveness || 0),
      overall: Number(scores.overall || 0)
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

async function createMessage(anthropic, messages, maxTokens) {
  const result = await withTimeout(
    createMessageWithFallback(anthropic, {
      max_tokens: maxTokens,
      messages
    }),
    ANTHROPIC_TIMEOUT_MS
  );
  return result.response;
}

function localScoreCandidates(candidates) {
  return candidates.map((candidate, idx) => {
    const descriptionLength = (candidate?.description || '').length;
    const sceneCount = Array.isArray(candidate?.scenes) ? candidate.scenes.length : 0;
    const originality = Math.min(10, Math.max(5, Math.floor(descriptionLength / 35)));
    const clarity = sceneCount >= 4 ? 8 : 6;

    return {
      ...candidate,
      scores: {
        originality,
        briefFit: 7,
        clarity,
        feasibility: 7,
        distinctiveness: Math.min(10, originality + 1),
        overall: Math.round((originality + 7 + clarity + 7 + Math.min(10, originality + 1)) / 5)
      }
    };
  }).sort((a, b) => (b?.scores?.overall || 0) - (a?.scores?.overall || 0));
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

    let strategy = fallbackStrategy(brief);
    try {
      const strategyPrompt = `Analyze this creative brief and return only JSON with keys:\n\n- audienceInsight\n- brandTension\n- businessObjective\n- emotionalNeed\n- creativeLevers (array of 5)\n- constraints (array)\n- tabooDirections (array)\n- successCriteria (array)\n\nBrief:\n${brief}`;

      const strategyMessage = await createMessage(
        anthropic,
        [{ role: 'user', content: strategyPrompt }],
        450
      );
      strategy = extractJsonObject(strategyMessage.content?.[0]?.text || '');
    } catch (error) {
      console.warn('Strategic pass fallback:', error.message);
    }

    let candidates;
    try {
      const candidatePrompt = `You are generating candidate creative ideas from a strategy brief.\n\nBRIEF:\n${brief}\n\nSTRATEGY (JSON):\n${JSON.stringify(strategy)}\n\nReturn ONLY a JSON array with exactly ${CANDIDATE_IDEA_COUNT} candidates. Each candidate must include:\n- candidateId\n- title (3-6 words)\n- hook (under 20 words)\n- description (2-3 sentences)\n- tags { tone, visual, risk }\n- scenes (exactly 4 concise beats)\n- noveltyAnchor (what makes it distinct)\n\nMake each candidate structurally different from the others.`;

      const candidateMessage = await createMessage(
        anthropic,
        [{ role: 'user', content: candidatePrompt }],
        1700
      );
      candidates = extractJsonArray(candidateMessage.content?.[0]?.text || '');
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        return new Response(JSON.stringify({ ideas: buildFallbackIdeas(), fallback: true, partial: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    const normalizedCandidates = Array.isArray(candidates)
      ? candidates.slice(0, CANDIDATE_IDEA_COUNT).map((candidate, idx) => ({
          candidateId: candidate?.candidateId || `candidate-${idx + 1}`,
          title: candidate?.title,
          hook: candidate?.hook,
          description: candidate?.description,
          tags: candidate?.tags,
          scenes: candidate?.scenes,
          noveltyAnchor: candidate?.noveltyAnchor
        }))
      : [];

    let rankedCandidates;
    try {
      const criticPrompt = `You are a strict creative evaluator.\n\nBRIEF:\n${brief}\n\nSTRATEGY (JSON):\n${JSON.stringify(strategy)}\n\nCANDIDATES (JSON):\n${JSON.stringify(normalizedCandidates)}\n\nReturn ONLY a JSON array with the top ${TARGET_IDEA_COUNT} candidates ranked by quality.\nFor each item, return:\n- candidateId\n- title\n- hook\n- description\n- tags\n- scenes\n- scores { originality, briefFit, clarity, feasibility, distinctiveness, overall }\n\nScoring rules:\n- originality, briefFit, clarity, feasibility, distinctiveness are integers 1-10\n- overall is weighted average with briefFit and originality weighted highest\n- reject repetitive concepts; maximize diversity of approach.`;

      const criticMessage = await createMessage(
        anthropic,
        [{ role: 'user', content: criticPrompt }],
        1400
      );

      rankedCandidates = extractJsonArray(criticMessage.content?.[0]?.text || '');
    } catch (error) {
      console.warn('Critic pass fallback:', error.message);
      rankedCandidates = localScoreCandidates(normalizedCandidates).slice(0, TARGET_IDEA_COUNT);
    }

    const candidateMap = new Map(
      normalizedCandidates.map((candidate) => [String(candidate.candidateId), candidate])
    );

    const merged = (Array.isArray(rankedCandidates) ? rankedCandidates : []).map((ranked) => {
      const key = String(ranked?.candidateId || '');
      const base = candidateMap.get(key) || {};
      return {
        ...base,
        ...ranked,
        tags: ranked?.tags || base?.tags,
        scenes: ranked?.scenes || base?.scenes
      };
    });

    const ideas = normalizeTopIdeas(merged);

    return new Response(JSON.stringify({ ideas, strategy, qualityPipeline: 'strategy+candidates+critic' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating ideas:', error);
    return new Response(JSON.stringify({ ideas: buildFallbackIdeas(), fallback: true, partial: true, details: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/ideas' };
