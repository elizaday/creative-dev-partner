import Anthropic from '@anthropic-ai/sdk';
import { TIMEOUT_ERROR, withTimeout } from './_anthropic.mjs';

const TARGET_IDEA_COUNT = 10;
const JOB_VERSION = 1;
const START_MODE = 'start';
const POLL_MODE = 'poll';

const IDEAS_PRIMARY_TIMEOUT_MS = 9000;
const IDEAS_RESCUE_TIMEOUT_MS = 7000;
const IDEAS_PRIMARY_MAX_TOKENS = 1500;
const IDEAS_RESCUE_MAX_TOKENS = 1000;
const MAX_STAGE_RETRIES = 12;

const STAGE_PLANS = [
  {
    key: 'strategic-safe',
    label: 'Generating strategic concepts',
    detail: 'Pass 1/4 - practical but differentiated directions',
    count: 4,
    laneInstruction: 'Focus on high-confidence concepts that are strategically tight and directly aligned to the brief goals and constraints.'
  },
  {
    key: 'bold-differentiated',
    label: 'Generating bold concepts',
    detail: 'Pass 2/4 - category-breaking but feasible directions',
    count: 4,
    laneInstruction: 'Focus on bold differentiation with non-obvious creative mechanisms while staying production-feasible.'
  },
  {
    key: 'unexpected-wildcard',
    label: 'Generating wildcard concepts',
    detail: 'Pass 3/4 - unconventional approaches with clear strategic logic',
    count: 4,
    laneInstruction: 'Focus on surprising execution formats and narrative structures that still serve the brief objective.'
  }
];

const SONNET_DEFAULT_MODELS = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022'
];

function parseModelList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.toLowerCase().includes('sonnet'));
}

function getIdeaModelPlan() {
  const envPreferred = parseModelList(process.env.ANTHROPIC_IDEA_MODELS);
  if (envPreferred.length > 0) {
    return [...new Set([...envPreferred, ...SONNET_DEFAULT_MODELS])];
  }
  return SONNET_DEFAULT_MODELS;
}

function selectModelForCursor(models, cursor = 0) {
  const list = Array.isArray(models) && models.length > 0 ? models : SONNET_DEFAULT_MODELS;
  const safeCursor = Number.isFinite(Number(cursor)) ? Number(cursor) : 0;
  const index = Math.abs(Math.trunc(safeCursor)) % list.length;
  return { model: list[index], index };
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function compactText(value, maxLen = 500) {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;
}

function isModelNotFoundError(error) {
  const status = error?.status ?? error?.statusCode;
  const message = String(error?.message || '');
  return status === 404 || message.includes('not_found_error') || message.includes('model:');
}

function isRetryableModelError(error) {
  const status = error?.status ?? error?.statusCode;
  return [408, 409, 429, 500, 502, 503, 504, 529].includes(status);
}

function extractJsonArray(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('No response text');

  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = JSON.parse(fenced[1]);
    if (!Array.isArray(parsed)) throw new Error('Expected JSON array in fenced block');
    return parsed;
  }

  if (source.startsWith('[')) {
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
    return parsed;
  }

  const start = source.indexOf('[');
  const end = source.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found in model response');
  }

  const parsed = JSON.parse(source.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array after extraction');
  return parsed;
}

function normalizeScenes(scenes = []) {
  const clean = Array.isArray(scenes)
    ? scenes.map((item) => compactText(item, 120)).filter(Boolean).slice(0, 4)
    : [];

  while (clean.length < 4) {
    clean.push('Advance the narrative with a concrete strategic shift.');
  }

  return clean;
}

function clampScore(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(10, Math.round(num)));
}

function normalizeIdea(rawIdea, index) {
  const scores = rawIdea?.scores || {};
  const description = compactText(rawIdea?.description, 420);
  const insight = compactText(rawIdea?.insight, 180);
  const whyItWorks = compactText(rawIdea?.whyItWorks, 200);

  return {
    id: index + 1,
    title: compactText(rawIdea?.title, 80) || `Concept ${index + 1}`,
    hook: compactText(rawIdea?.hook, 140) || 'Distinct creative mechanism aligned to the brief objective.',
    description: description || 'Strategic concept with a clear execution path and audience payoff.',
    insight: insight || 'Built on a specific audience tension tied to the brief.',
    whyItWorks: whyItWorks || 'Connects audience truth, execution clarity, and brand objective.',
    tags: {
      tone: compactText(rawIdea?.tags?.tone, 40) || 'Balanced',
      visual: compactText(rawIdea?.tags?.visual, 40) || 'Cinematic',
      risk: compactText(rawIdea?.tags?.risk, 20) || 'Medium'
    },
    scenes: normalizeScenes(rawIdea?.scenes),
    scores: {
      originality: clampScore(scores.originality, 8),
      briefFit: clampScore(scores.briefFit, 8),
      clarity: clampScore(scores.clarity, 8),
      feasibility: clampScore(scores.feasibility, 7),
      distinctiveness: clampScore(scores.distinctiveness, 8),
      overall: clampScore(scores.overall, 8)
    }
  };
}

function dedupeByTitle(list) {
  const seen = new Set();
  const deduped = [];

  for (const item of Array.isArray(list) ? list : []) {
    const key = normalizeWhitespace(item?.title).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function materializeIdeas(curated, candidates) {
  const dedupedCurated = dedupeByTitle(curated);
  const dedupedCandidates = dedupeByTitle(candidates);

  const combined = [...dedupedCurated];
  const usedKeys = new Set(combined.map((item) => normalizeWhitespace(item?.title).toLowerCase()));

  for (const candidate of dedupedCandidates) {
    const key = normalizeWhitespace(candidate?.title).toLowerCase();
    if (!key || usedKeys.has(key)) continue;
    combined.push(candidate);
    usedKeys.add(key);
    if (combined.length >= TARGET_IDEA_COUNT) break;
  }

  if (combined.length < TARGET_IDEA_COUNT) {
    throw new Error('Insufficient unique high-quality ideas generated. Please retry.');
  }

  return combined.slice(0, TARGET_IDEA_COUNT).map((idea, index) => normalizeIdea(idea, index));
}

function createEmptyJob(brief) {
  return {
    version: JOB_VERSION,
    brief: compactText(brief, 7000),
    stageIndex: 0,
    candidates: [],
    modelCursor: 0,
    stageRetryCount: 0,
    createdAt: new Date().toISOString(),
    pollCount: 0
  };
}

function validateJob(job, briefFromBody = '') {
  if (!job || typeof job !== 'object') {
    throw new Error('Missing ideas job payload.');
  }

  if (Number(job.version) !== JOB_VERSION) {
    throw new Error('Ideas job version mismatch. Please restart generation.');
  }

  const brief = compactText(job.brief || briefFromBody, 7000);
  if (!brief || brief.length < 50) {
    throw new Error('Ideas job brief is invalid. Please restart generation.');
  }

  const stageIndex = Number.isInteger(job.stageIndex) ? job.stageIndex : Number(job.stageIndex || 0);
  const safeStageIndex = Number.isFinite(stageIndex) ? Math.max(0, Math.min(STAGE_PLANS.length, stageIndex)) : 0;

  return {
    ...job,
    version: JOB_VERSION,
    brief,
    stageIndex: safeStageIndex,
    modelCursor: Number(job.modelCursor || 0),
    stageRetryCount: Number(job.stageRetryCount || 0),
    pollCount: Number(job.pollCount || 0),
    candidates: Array.isArray(job.candidates) ? job.candidates.slice(0, 30) : []
  };
}

async function createIdeasMessage(anthropic, prompt, options = {}) {
  const {
    maxTokens = IDEAS_PRIMARY_MAX_TOKENS,
    temperature = 0.7,
    modelCursor = 0
  } = options;

  const models = getIdeaModelPlan();
  const selection = selectModelForCursor(models, modelCursor);
  const isPrimary = selection.index === 0;
  const timeoutMs = isPrimary ? IDEAS_PRIMARY_TIMEOUT_MS : IDEAS_RESCUE_TIMEOUT_MS;
  const tokenCap = isPrimary ? maxTokens : Math.min(maxTokens, IDEAS_RESCUE_MAX_TOKENS);

  const response = await withTimeout(
    anthropic.messages.create({
      model: selection.model,
      max_tokens: tokenCap,
      temperature,
      messages: [{ role: 'user', content: prompt }]
    }),
    timeoutMs
  );

  return { response, model: selection.model };
}

function buildStagePrompt(brief, stage, existingCandidates) {
  const usedTitles = dedupeByTitle(existingCandidates)
    .map((item) => normalizeWhitespace(item?.title))
    .filter(Boolean)
    .slice(0, 20);

  return `You are an elite creative director.

CLIENT BRIEF:\n${brief}

Current lane: ${stage.key}
Lane instruction: ${stage.laneInstruction}

Already generated titles (do not repeat):\n${JSON.stringify(usedTitles)}

Generate EXACTLY ${stage.count} concepts as a JSON array.
Each concept must include:
- title (3-7 words)
- hook (max 18 words)
- insight (one sharp audience truth)
- description (3-5 concrete sentences, no fluff)
- whyItWorks (1-2 sentences, strategic reason)
- tags { tone, visual, risk }
- scenes (exactly 4 beats: opening, build, turn, resolution)
- scores { originality, briefFit, clarity, feasibility, distinctiveness, overall }

Rules:
- Do not produce cosmetic rewrites.
- Each concept must have a distinct mechanism.
- Avoid generic ad language.
- Keep concepts production-realistic.

Return ONLY valid JSON array.`;
}

function buildCurationPrompt(brief, candidates) {
  return `You are a creative quality board.

CLIENT BRIEF:\n${brief}

CANDIDATE CONCEPTS JSON:\n${JSON.stringify(candidates)}

Task:
Select and rewrite the best ${TARGET_IDEA_COUNT} concepts into final output.

Output format:
Return ONLY a JSON array of exactly ${TARGET_IDEA_COUNT} objects with fields:
- title
- hook
- insight
- description
- whyItWorks
- tags { tone, visual, risk }
- scenes (exactly 4)
- scores { originality, briefFit, clarity, feasibility, distinctiveness, overall }

Selection rules:
- maximize strategic quality and diversity
- no duplicate mechanisms
- preserve feasibility
- remove weak or generic concepts
- keep safe-to-bold spread

Return valid JSON array only.`;
}

function stageProgress(stageIndex) {
  const total = STAGE_PLANS.length + 1;

  if (stageIndex < STAGE_PLANS.length) {
    const stage = STAGE_PLANS[stageIndex];
    return {
      step: stageIndex + 1,
      total,
      label: stage.label,
      detail: stage.detail
    };
  }

  return {
    step: total,
    total,
    label: 'Curating final 10 ideas',
    detail: 'Pass 4/4 - selecting strongest diverse final set'
  };
}

function isJobRetryableError(error) {
  return error?.message === TIMEOUT_ERROR || isRetryableModelError(error) || isModelNotFoundError(error);
}

async function runIdeasJobStep(anthropic, job) {
  const safeJob = validateJob(job);
  const progress = stageProgress(safeJob.stageIndex);

  if (safeJob.stageIndex < STAGE_PLANS.length) {
    const stage = STAGE_PLANS[safeJob.stageIndex];
    const prompt = buildStagePrompt(safeJob.brief, stage, safeJob.candidates);
    const result = await createIdeasMessage(anthropic, prompt, {
      maxTokens: 1200,
      temperature: 0.85,
      modelCursor: safeJob.modelCursor
    });
    const stageIdeas = extractJsonArray(result.response?.content?.[0]?.text || '');

    const mergedCandidates = dedupeByTitle([
      ...safeJob.candidates,
      ...stageIdeas
    ]);

    const updatedJob = {
      ...safeJob,
      stageIndex: safeJob.stageIndex + 1,
      candidates: mergedCandidates,
      stageRetryCount: 0,
      pollCount: safeJob.pollCount + 1
    };

    return {
      status: 'processing',
      job: updatedJob,
      progress: stageProgress(updatedJob.stageIndex),
      modelUsed: result.model
    };
  }

  const curationPrompt = buildCurationPrompt(safeJob.brief, safeJob.candidates);
  const curationResult = await createIdeasMessage(anthropic, curationPrompt, {
    maxTokens: IDEAS_PRIMARY_MAX_TOKENS,
    temperature: 0.55,
    modelCursor: safeJob.modelCursor
  });
  const curated = extractJsonArray(curationResult.response?.content?.[0]?.text || '');
  const ideas = materializeIdeas(curated, safeJob.candidates);

  return {
    status: 'completed',
    ideas,
    progress,
    qualityPipeline: 'ideas-job-two-pass-sonnet-only',
    modelUsed: curationResult.model
  };
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

    const body = await req.json();
    const mode = body?.mode || (body?.job ? POLL_MODE : START_MODE);

    if (mode === START_MODE) {
      const brief = compactText(body?.brief, 7000);
      if (!brief || brief.length < 50) {
        return new Response(JSON.stringify({ error: 'Brief must be at least 50 characters' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const job = createEmptyJob(brief);
      return new Response(JSON.stringify({
        status: 'processing',
        job,
        progress: stageProgress(0),
        qualityPipeline: 'ideas-job-two-pass-sonnet-only'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (mode === POLL_MODE) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const job = validateJob(body?.job, body?.brief);

      try {
        const result = await runIdeasJobStep(anthropic, job);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        if (isJobRetryableError(error)) {
          const retryCount = Number(job.stageRetryCount || 0) + 1;
          if (retryCount > MAX_STAGE_RETRIES) {
            return new Response(JSON.stringify({
              error: 'High-quality generation could not complete for this stage after repeated retries. Please restart ideas generation.',
              details: 'stage_retry_limit_reached'
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }

          const updatedJob = {
            ...job,
            modelCursor: Number(job.modelCursor || 0) + 1,
            stageRetryCount: retryCount,
            pollCount: Number(job.pollCount || 0) + 1
          };

          return new Response(JSON.stringify({
            status: 'retry_required',
            retryable: true,
            message: 'High-quality generation timed out in this step. Poll again to continue.',
            job: updatedJob,
            progress: stageProgress(job.stageIndex)
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        throw error;
      }
    }

    return new Response(JSON.stringify({ error: 'Unsupported mode. Use mode=start or mode=poll.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating ideas:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate high-quality ideas',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/ideas' };
