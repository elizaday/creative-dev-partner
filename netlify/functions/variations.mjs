import Anthropic from '@anthropic-ai/sdk';
import { TIMEOUT_ERROR, withTimeout, createMessageWithFallback } from './_anthropic.mjs';

const ANTHROPIC_TIMEOUT_MS = 12000;
const CANDIDATE_VARIATIONS_PER_IDEA = 5;

const DIVERSITY_SLOTS = [
  { letter: 'A', requiredAxes: ['tone', 'structure'] },
  { letter: 'B', requiredAxes: ['setting', 'pacing'] },
  { letter: 'C', requiredAxes: ['visualStyle', 'riskLevel'] }
];

function extractJsonArray(text) {
  const match = String(text || '').match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found');
  return JSON.parse(match[0]);
}

function canonicalizeAxis(axis) {
  const value = String(axis || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!value) return null;
  if (value.includes('tone')) return 'tone';
  if (value.includes('structure') || value.includes('narrative')) return 'structure';
  if (value.includes('setting') || value.includes('location') || value.includes('world')) return 'setting';
  if (value.includes('pacing') || value.includes('rhythm') || value.includes('tempo')) return 'pacing';
  if (value.includes('visual') || value.includes('look') || value.includes('style')) return 'visualStyle';
  if (value.includes('risk')) return 'riskLevel';
  return null;
}

function normalizeAxes(axes, requiredAxes) {
  const normalized = [];
  for (const axis of Array.isArray(axes) ? axes : []) {
    const canonical = canonicalizeAxis(axis);
    if (canonical && !normalized.includes(canonical)) {
      normalized.push(canonical);
    }
  }

  for (const required of requiredAxes) {
    if (!normalized.includes(required)) {
      normalized.push(required);
    }
  }

  return normalized.slice(0, 4);
}

function createSlotFallback(originalTitle, slot, index) {
  const [axisA, axisB] = slot.requiredAxes;
  return {
    letter: slot.letter,
    candidateId: `${slot.letter}-${index + 1}`,
    title: `${originalTitle} — ${slot.letter} Variant`,
    description: `A ${axisA}/${axisB} reinterpretation that keeps the core idea while shifting execution style.`,
    shift: `Primary shifts: ${axisA} + ${axisB}.`,
    differenceAxes: [...slot.requiredAxes],
    scores: {
      originality: 7,
      briefFit: 8,
      clarity: 8,
      feasibility: 7,
      distinctiveness: 8,
      overall: 8
    }
  };
}

function normalizeVariation(variation, slot, originalTitle, index) {
  const fallback = createSlotFallback(originalTitle, slot, index);
  const scores = variation?.scores || {};

  return {
    letter: slot.letter,
    candidateId: variation?.candidateId || fallback.candidateId,
    title: variation?.title || fallback.title,
    description: variation?.description || fallback.description,
    shift: variation?.shift || fallback.shift,
    differenceAxes: normalizeAxes(variation?.differenceAxes, slot.requiredAxes),
    scores: {
      originality: Number(scores.originality || fallback.scores.originality),
      briefFit: Number(scores.briefFit || fallback.scores.briefFit),
      clarity: Number(scores.clarity || fallback.scores.clarity),
      feasibility: Number(scores.feasibility || fallback.scores.feasibility),
      distinctiveness: Number(scores.distinctiveness || fallback.scores.distinctiveness),
      overall: Number(scores.overall || fallback.scores.overall)
    }
  };
}

function enforceDiversitySlots(selected, originalTitle) {
  const list = Array.isArray(selected) ? selected : [];
  return DIVERSITY_SLOTS.map((slot, idx) => {
    const direct = list.find((item) => String(item?.letter || '').toUpperCase() === slot.letter);
    const fallbackCandidate = list[idx] || null;
    const source = direct || fallbackCandidate;
    return normalizeVariation(source, slot, originalTitle, idx);
  });
}

function buildFallbackVariations(selectedIdeas = []) {
  return selectedIdeas.map((idea, idx) => {
    const originalTitle = idea?.title || `Idea ${idx + 1}`;
    return {
      originalId: idea?.id || idx + 1,
      originalTitle,
      variations: enforceDiversitySlots([], originalTitle)
    };
  });
}

function localScoreAndSelect(candidatesByIdea, selectedIdeas) {
  return selectedIdeas.map((idea, idx) => {
    const originalId = idea?.id || idx + 1;
    const originalTitle = idea?.title || `Idea ${idx + 1}`;

    const candidates = Array.isArray(candidatesByIdea.get(String(originalId)))
      ? candidatesByIdea.get(String(originalId))
      : [];

    const scored = candidates.map((candidate) => {
      const descLen = String(candidate?.description || '').length;
      const originality = Math.min(10, Math.max(5, Math.floor(descLen / 28)));
      const overall = Math.round((originality + 8 + 8 + 7 + Math.min(10, originality + 1)) / 5);
      return {
        ...candidate,
        scores: {
          originality,
          briefFit: 8,
          clarity: 8,
          feasibility: 7,
          distinctiveness: Math.min(10, originality + 1),
          overall
        }
      };
    }).sort((a, b) => (b?.scores?.overall || 0) - (a?.scores?.overall || 0));

    return {
      originalId,
      originalTitle,
      variations: enforceDiversitySlots(scored.slice(0, 3), originalTitle)
    };
  });
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

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let selectedIdeas = [];
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const body = await req.json();
    const brief = body?.brief;
    selectedIdeas = Array.isArray(body?.selectedIdeas) ? body.selectedIdeas : [];

    if (!brief || selectedIdeas.length === 0) {
      return new Response(JSON.stringify({ error: 'Brief and selected ideas are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (selectedIdeas.length > 3) {
      return new Response(JSON.stringify({ error: 'Maximum 3 ideas can be selected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ideasPayload = selectedIdeas.map((idea, idx) => ({
      originalId: idea?.id || idx + 1,
      originalTitle: idea?.title || `Idea ${idx + 1}`,
      description: idea?.description || ''
    }));

    let candidateGroups;
    try {
      const generationPrompt = `You are an expert creative strategist generating diverse execution variations.\n\nBRIEF:\n${brief}\n\nSELECTED IDEAS (JSON):\n${JSON.stringify(ideasPayload)}\n\nReturn ONLY a JSON array with one object per selected idea:\n- originalId\n- originalTitle\n- candidates (exactly ${CANDIDATE_VARIATIONS_PER_IDEA} items)\n\nEach candidate must include:\n- candidateId\n- title\n- description\n- shift\n- differenceAxes (2-4 values chosen from: tone, structure, setting, pacing, visualStyle, riskLevel)\n\nHard rules:\n- candidates must be materially different from each other\n- avoid cosmetic rewrites\n- preserve the original core idea while changing execution.\n\nReturn valid JSON only.`;

      const generationMessage = await createMessage(
        anthropic,
        [{ role: 'user', content: generationPrompt }],
        1800
      );

      candidateGroups = extractJsonArray(generationMessage.content?.[0]?.text || '');
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        return new Response(JSON.stringify({ variations: buildFallbackVariations(selectedIdeas), fallback: true, partial: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    const candidateMap = new Map();
    for (const group of Array.isArray(candidateGroups) ? candidateGroups : []) {
      const key = String(group?.originalId || '');
      if (!key) continue;
      const candidates = Array.isArray(group?.candidates) ? group.candidates : [];
      candidateMap.set(key, candidates);
    }

    let rerankedGroups;
    try {
      const criticPrompt = `You are a strict creative evaluator and reranker.\n\nBRIEF:\n${brief}\n\nCANDIDATE VARIATIONS (JSON):\n${JSON.stringify(candidateGroups)}\n\nDIVERSITY SLOT RULES:\nA requires [tone, structure]\nB requires [setting, pacing]\nC requires [visualStyle, riskLevel]\n\nReturn ONLY a JSON array with one object per idea:\n- originalId\n- originalTitle\n- selected (exactly 3 items labeled A/B/C)\n\nEach selected item must include:\n- letter (A|B|C)\n- candidateId\n- title\n- description\n- shift\n- differenceAxes (must include slot-required axes, at least 2 total)\n- scores { originality, briefFit, clarity, feasibility, distinctiveness, overall }\n\nScoring rules: integer 1-10 per metric, overall weighted toward originality + briefFit.\nReject near-duplicates and maximize uniqueness across A/B/C.`;

      const criticMessage = await createMessage(
        anthropic,
        [{ role: 'user', content: criticPrompt }],
        1600
      );

      rerankedGroups = extractJsonArray(criticMessage.content?.[0]?.text || '');
    } catch (error) {
      console.warn('Variations critic fallback:', error.message);
      return new Response(JSON.stringify({
        variations: localScoreAndSelect(candidateMap, selectedIdeas),
        qualityPipeline: 'generation+local-critic-fallback'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const variations = selectedIdeas.map((idea, idx) => {
      const originalId = idea?.id || idx + 1;
      const originalTitle = idea?.title || `Idea ${idx + 1}`;

      const group = (Array.isArray(rerankedGroups) ? rerankedGroups : [])
        .find((item) => String(item?.originalId) === String(originalId));

      const selected = Array.isArray(group?.selected) ? group.selected : [];
      return {
        originalId,
        originalTitle,
        variations: enforceDiversitySlots(selected, originalTitle)
      };
    });

    return new Response(JSON.stringify({ variations, qualityPipeline: 'generation+critic-rerank' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating variations:', error);
    return new Response(JSON.stringify({ variations: buildFallbackVariations(selectedIdeas), fallback: true, partial: true, details: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/variations' };
