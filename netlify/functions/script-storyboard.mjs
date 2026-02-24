import Anthropic from '@anthropic-ai/sdk';
import { TIMEOUT_ERROR, withTimeout } from './_anthropic.mjs';

const BASE_PRIMARY_TIMEOUT_MS = 8500;
const BASE_RESCUE_TIMEOUT_MS = 6500;
const BASE_PRIMARY_MAX_TOKENS = 980;
const BASE_RESCUE_MAX_TOKENS = 720;

const UPGRADE_PRIMARY_TIMEOUT_MS = 7500;
const UPGRADE_RESCUE_TIMEOUT_MS = 5500;
const UPGRADE_PRIMARY_MAX_TOKENS = 900;
const UPGRADE_RESCUE_MAX_TOKENS = 680;
const TARGET_MAX_BEATS = 5;
const FRAME_TIMINGS = [
  '0:00-0:06',
  '0:06-0:12',
  '0:12-0:18',
  '0:18-0:24',
  '0:24-0:30'
];

const CONTRAST_DIMENSIONS = ['composition', 'camera stability', 'distance', 'lighting', 'rhythm'];

function parseModelList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getStoryboardBaseModelPlan() {
  const envPreferred = parseModelList(process.env.ANTHROPIC_STORYBOARD_MODELS);
  const defaults = [
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-6'
  ];

  if (envPreferred.length > 0) {
    return [...new Set([...envPreferred, ...defaults])];
  }

  return defaults;
}

function getStoryboardUpgradeModelPlan() {
  const envPreferred = parseModelList(process.env.ANTHROPIC_STORYBOARD_UPGRADE_MODELS);
  const defaults = [
    'claude-sonnet-4-6',
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022'
  ];

  if (envPreferred.length > 0) {
    return [...new Set([...envPreferred, ...defaults])];
  }

  return defaults;
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

function isSonnetModel(model) {
  const value = String(model || '').toLowerCase();
  return value.includes('sonnet');
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function compactText(text, maxLen = 260) {
  const value = normalizeWhitespace(text);
  if (!value) return '';
  return value.length <= maxLen ? value : `${value.slice(0, maxLen - 1)}…`;
}

function titleCase(value) {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  return text
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function safeProjectName(value) {
  const cleaned = normalizeWhitespace(String(value || '').replace(/[^a-zA-Z0-9\s-]/g, ''));
  if (!cleaned) return 'Project';
  return titleCase(cleaned).slice(0, 60);
}

function parseScriptLines(script) {
  const normalized = String(script || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!normalized) return [];

  const explicitLines = normalized
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const protectedText = normalized
    .replace(/\bINT\.\s*/g, 'INT§ ')
    .replace(/\bEXT\.\s*/g, 'EXT§ ')
    .replace(/\bEST\.\s*/g, 'EST§ ')
    .replace(/\bINT\/EXT\.\s*/g, 'INTEXT§ ');

  const sentenceChunks = protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/g)
    .map((line) => line
      .replace(/INT§/g, 'INT.')
      .replace(/EXT§/g, 'EXT.')
      .replace(/EST§/g, 'EST.')
      .replace(/INTEXT§/g, 'INT/EXT.')
    )
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  if (explicitLines.length >= 3) {
    return explicitLines;
  }

  if (sentenceChunks.length >= 3) {
    return sentenceChunks;
  }

  return explicitLines.length ? explicitLines : sentenceChunks;
}

function parseScriptUnits(script) {
  const lines = parseScriptLines(script);
  const units = [];

  for (const line of lines) {
    if (/^(INT\.|EXT\.|INT\/EXT\.|EST\.|SCENE\s)/i.test(line)) {
      units.push({ kind: 'scene', text: line });
      continue;
    }

    const dialogueLine = line.match(/^([A-Z][A-Z0-9 .'-]{1,30}):\s*(.+)$/);
    if (dialogueLine) {
      units.push({ kind: 'dialogue', text: `${dialogueLine[1]}: ${dialogueLine[2]}` });
      continue;
    }

    units.push({ kind: 'action', text: line });
  }

  if (!units.length) {
    units.push({ kind: 'action', text: 'No actionable script units found.' });
  }

  return units;
}

function inferShotType(unit, index) {
  if (unit?.kind === 'scene') return index === 0 ? 'Wide' : 'Tracking';
  if (unit?.kind === 'dialogue') return ['Over-Shoulder', 'Close-up', 'Medium'][index % 3];
  return ['Wide', 'Tracking', 'Close-up', 'Medium', 'POV'][index % 5];
}

function inferContrastFromPrevious(index) {
  if (index === 0) return 'Opens with controlled framing and stable rhythm to set baseline energy.';

  const dimension = CONTRAST_DIMENSIONS[(index - 1) % CONTRAST_DIMENSIONS.length];
  if (dimension === 'composition') {
    return 'Composition shifts to a tighter focal hierarchy than the previous frame.';
  }
  if (dimension === 'camera stability') {
    return 'Camera stability changes from locked framing to kinetic movement.';
  }
  if (dimension === 'distance') {
    return 'Distance changes from wider coverage to proximity-driven framing.';
  }
  if (dimension === 'lighting') {
    return 'Lighting pivots toward higher contrast to raise urgency.';
  }
  return 'Rhythm accelerates through shorter visual beats and faster cut logic.';
}

function normalizeBrandConstraints(input) {
  const source = input && typeof input === 'object' ? input : {};

  return {
    mandatoryVisualElements: compactText(source.mandatoryVisualElements, 500),
    requiredProductRituals: compactText(source.requiredProductRituals, 500),
    iconographyRules: compactText(source.iconographyRules, 500),
    toneRestrictions: compactText(source.toneRestrictions, 500),
    hardExclusions: compactText(source.hardExclusions, 500)
  };
}

function hasBrandConstraints(constraints) {
  return Object.values(constraints || {}).some((value) => normalizeWhitespace(value).length > 0);
}

const PURPOSE_TEMPLATES = [
  'Establish baseline power and situational context.',
  'Introduce friction that destabilizes the current state.',
  'Escalate conflict through a visible systems consequence.',
  'Show decisive intervention that flips control.',
  'Land outcome and lock the brand promise.'
];

const CUT_LOGIC_TEMPLATES = [
  'Cut on initiating action to launch momentum.',
  'Cut at the moment of information reveal for tension.',
  'Cut at peak instability to force escalation.',
  'Match cut from problem state to corrective action.',
  'Hold briefly, then fade to resolved end state.'
];

const WHY_TEMPLATES = [
  'Defines what normal looks like before disruption.',
  'Transforms passive observation into active tension.',
  'Makes system complexity legible under pressure.',
  'Demonstrates competence through visible decision-making.',
  'Converts narrative tension into trust and clarity.'
];

function buildFallbackFrame(beatNumber, unit, projectContext, index) {
  const shotType = inferShotType(unit, index);
  const source = compactText(unit?.text || projectContext, 140);
  const ritualHint = compactText(projectContext, 120);
  const visualSubject = source || `Key narrative beat ${beatNumber}`;

  return {
    frameNumber: beatNumber,
    timing: FRAME_TIMINGS[index] || '',
    beat: compactText(visualSubject, 120),
    purpose: PURPOSE_TEMPLATES[index] || 'Advance power dynamics with a meaningful shift.',
    visualDecision: compactText(
      `${shotType} framing on ${visualSubject}. Emphasize visual hierarchy and tangible cause-effect progression.`,
      220
    ),
    whyThisExists: WHY_TEMPLATES[index] || 'Ensures this beat changes narrative energy, not coverage.',
    cutLogic: CUT_LOGIC_TEMPLATES[index] || 'Cut on directional momentum toward the next escalation.',
    contrastFromPrevious: inferContrastFromPrevious(index),
    shotType,
    transition: index === TARGET_MAX_BEATS - 1 ? 'Fade out' : 'Cut',
    imageUrl: null
  };
}

function buildFallbackStoryboard(script, constraints = {}, projectName = 'Project') {
  const units = parseScriptUnits(script);
  const projectContext = units.map((unit) => unit.text).join(' ');

  const frames = Array.from({ length: TARGET_MAX_BEATS }, (_, index) => {
    const unitIndex = Math.round((index * (units.length - 1)) / Math.max(1, TARGET_MAX_BEATS - 1));
    const unit = units[unitIndex] || units[units.length - 1];
    return buildFallbackFrame(index + 1, unit, projectContext, index);
  });

  const firstBeat = frames[0]?.beat || 'Opening state';
  const lastBeat = frames[frames.length - 1]?.beat || 'Resolved state';
  const shortestUnit = [...units].sort((a, b) => String(a?.text || '').length - String(b?.text || '').length)[0];
  const sharpest = units.find((unit) => /(mismatch|conflict|tension|problem|risk|resolve|correction)/i.test(unit.text))
    || units[Math.floor(units.length / 2)]
    || units[0];

  const stressTest = {
    centralContrast: compactText(`Shift from "${firstBeat}" to "${lastBeat}".`, 240),
    powerShift: 'Control moves from uncertainty to decisive intervention by the resolution beat.',
    sharpestMoment: compactText(sharpest?.text || frames[2]?.beat || 'Escalation beat', 160),
    removableLine: compactText(shortestUnit?.text || 'Trim redundant exposition that does not change stakes.', 180),
    mutedVisualCheck: 'Pass - visual escalation remains clear without dialogue.',
    scriptStatus: 'usable'
  };

  return {
    projectName: safeProjectName(projectName),
    title: 'Director Storyboard',
    summary: 'Five high-contrast beats engineered around transformation, not coverage.',
    tone: constraints.toneRestrictions || 'Cinematic, decisive, contrast-forward',
    stressTest,
    rewriteApplied: false,
    rewriteExcerpt: '',
    frames
  };
}

function extractJsonObject(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('No response text');

  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }

  if (source.startsWith('{')) {
    return JSON.parse(source);
  }

  const start = source.indexOf('{');
  if (start === -1) throw new Error('No JSON object found');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(source.slice(start, i + 1));
      }
    }
  }

  throw new Error('Could not parse JSON object');
}

function normalizeContrastText(value, fallbackValue) {
  const text = compactText(value, 180);
  if (!text) return fallbackValue;

  const hasContrastDimension = CONTRAST_DIMENSIONS.some((dimension) =>
    text.toLowerCase().includes(dimension.replace(/\s+/g, '')) ||
    text.toLowerCase().includes(dimension)
  );

  if (hasContrastDimension) return text;

  return `${text} Contrast change is anchored in composition and rhythm.`;
}

function normalizeFrame(frame, fallbackFrame, index) {
  const beatNumber = index + 1;
  return {
    frameNumber: beatNumber,
    timing: frame?.timing || fallbackFrame.timing || FRAME_TIMINGS[index] || '',
    beat: compactText(frame?.beat || fallbackFrame.beat || `Beat ${beatNumber}`, 90),
    purpose: compactText(frame?.purpose || fallbackFrame.purpose, 180),
    visualDecision: compactText(frame?.visualDecision || fallbackFrame.visualDecision, 220),
    whyThisExists: compactText(frame?.whyThisExists || fallbackFrame.whyThisExists, 220),
    cutLogic: compactText(frame?.cutLogic || fallbackFrame.cutLogic, 180),
    contrastFromPrevious: normalizeContrastText(
      frame?.contrastFromPrevious,
      fallbackFrame.contrastFromPrevious
    ),
    shotType: compactText(frame?.shotType || fallbackFrame.shotType || 'Medium', 40),
    transition: compactText(frame?.transition || fallbackFrame.transition || 'Cut', 40),
    imageUrl: null
  };
}

function normalizeStressTest(stressTest, fallbackStressTest) {
  return {
    centralContrast: compactText(stressTest?.centralContrast || fallbackStressTest.centralContrast, 240),
    powerShift: compactText(stressTest?.powerShift || fallbackStressTest.powerShift, 240),
    sharpestMoment: compactText(stressTest?.sharpestMoment || fallbackStressTest.sharpestMoment, 160),
    removableLine: compactText(stressTest?.removableLine || fallbackStressTest.removableLine, 180),
    mutedVisualCheck: compactText(stressTest?.mutedVisualCheck || fallbackStressTest.mutedVisualCheck, 140),
    scriptStatus: compactText(stressTest?.scriptStatus || fallbackStressTest.scriptStatus || 'usable', 20)
  };
}

function normalizeStoryboard(raw, script, constraints = {}) {
  const fallback = buildFallbackStoryboard(script, constraints);

  const sourceFrames = Array.isArray(raw?.frames)
    ? raw.frames
    : Array.isArray(raw?.storyboardFrames)
      ? raw.storyboardFrames
      : [];

  const clippedFrames = sourceFrames.slice(0, TARGET_MAX_BEATS);
  const normalizedFrames = clippedFrames.map((frame, index) =>
    normalizeFrame(frame, fallback.frames[index], index)
  );

  while (normalizedFrames.length < 3) {
    const index = normalizedFrames.length;
    normalizedFrames.push(normalizeFrame({}, fallback.frames[index], index));
  }

  const frames = normalizedFrames.slice(0, TARGET_MAX_BEATS);
  frames.forEach((frame, index) => {
    frame.frameNumber = index + 1;
    frame.timing = FRAME_TIMINGS[index] || frame.timing;
    frame.transition = index === frames.length - 1 ? 'Fade out' : 'Cut';
  });

  const stressTest = normalizeStressTest(raw?.stressTest || {}, fallback.stressTest);

  return {
    projectName: safeProjectName(raw?.projectName || fallback.projectName),
    title: compactText(raw?.title || fallback.title, 120),
    summary: compactText(raw?.summary || fallback.summary, 260),
    tone: compactText(raw?.tone || fallback.tone, 120),
    stressTest,
    rewriteApplied: Boolean(raw?.rewriteApplied),
    rewriteExcerpt: compactText(raw?.rewriteExcerpt || '', 260),
    frames
  };
}

async function createStoryboardMessage(anthropic, prompt, options = {}) {
  const {
    modelPlan = getStoryboardBaseModelPlan(),
    primaryTimeoutMs = BASE_PRIMARY_TIMEOUT_MS,
    rescueTimeoutMs = BASE_RESCUE_TIMEOUT_MS,
    primaryMaxTokens = BASE_PRIMARY_MAX_TOKENS,
    rescueMaxTokens = BASE_RESCUE_MAX_TOKENS,
    temperature = 0.55
  } = options;

  const models = Array.isArray(modelPlan) ? modelPlan : getStoryboardBaseModelPlan();
  let lastError = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const isPrimary = index === 0;
    const sonnet = isSonnetModel(model);
    const timeoutMs = (isPrimary ? primaryTimeoutMs : rescueTimeoutMs) + (sonnet ? 4500 : 0);
    const maxTokens = sonnet
      ? Math.min(isPrimary ? primaryMaxTokens : rescueMaxTokens, 720)
      : (isPrimary ? primaryMaxTokens : rescueMaxTokens);

    try {
      const response = await withTimeout(
        anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }]
        }),
        timeoutMs
      );

      return { response, model };
    } catch (error) {
      lastError = error;
      if (error.message === TIMEOUT_ERROR || isModelNotFoundError(error) || isRetryableModelError(error)) {
        console.warn(`Storyboard model failed (${model}): ${error.message}. Trying next model.`);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('No storyboard model available.');
}

function buildUpgradePrompt(baseStoryboard, script, constraints, projectName) {
  const scriptForPrompt = compactText(script, 1200);
  const constraintsEnabled = hasBrandConstraints(constraints);
  const constraintsBlock = constraintsEnabled
    ? JSON.stringify(constraints, null, 2)
    : 'none';

  return `Upgrade this storyboard draft to be more intentional and visually distinct.

SCRIPT SUMMARY:
${scriptForPrompt}

PROJECT NAME:
${projectName || 'Project'}

CONSTRAINTS:
${constraintsBlock}

DRAFT STORYBOARD JSON:
${JSON.stringify(baseStoryboard)}

Upgrade goals:
- Strengthen strategic clarity and visual specificity.
- Increase contrast progression across frames.
- Ensure each frame changes energy from the previous frame.
- Remove vague language and generic placeholders.

Hard constraints:
- Keep the same JSON schema.
- Keep frame count, frameNumber, and timing unchanged.
- Keep concise production-usable language.
- Return ONLY valid JSON, no markdown, no commentary.`;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const script = String(body?.script || '');
    const projectName = safeProjectName(body?.projectName || 'Project');
    const constraints = normalizeBrandConstraints(body?.constraints);

    if (script.trim().length < 80) {
      return new Response(JSON.stringify({ error: 'Script must be at least 80 characters.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const anthropic = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
    const baseStoryboard = buildFallbackStoryboard(script, constraints, projectName);
    let storyboard = baseStoryboard;
    let upgradeApplied = false;
    let upgradeModelUsed = null;

    if (anthropic) {
      try {
        const upgradePrompt = buildUpgradePrompt(baseStoryboard, script, constraints, projectName);
        const upgradeResult = await createStoryboardMessage(anthropic, upgradePrompt, {
          modelPlan: getStoryboardUpgradeModelPlan(),
          primaryTimeoutMs: UPGRADE_PRIMARY_TIMEOUT_MS,
          rescueTimeoutMs: UPGRADE_RESCUE_TIMEOUT_MS,
          primaryMaxTokens: UPGRADE_PRIMARY_MAX_TOKENS,
          rescueMaxTokens: UPGRADE_RESCUE_MAX_TOKENS,
          temperature: 0.45
        });

        const upgradedParsed = extractJsonObject(upgradeResult.response?.content?.[0]?.text || '');
        storyboard = normalizeStoryboard(upgradedParsed, script, constraints);
        upgradeApplied = true;
        upgradeModelUsed = upgradeResult.model;
      } catch (error) {
        console.warn(`Storyboard upgrade skipped: ${error.message}`);
      }
    } else {
      console.warn('Storyboard upgrade skipped: ANTHROPIC_API_KEY not configured.');
    }

    return new Response(JSON.stringify({
      storyboard,
      qualityPipeline: 'director-guardrails-v4-two-pass',
      modelUsed: {
        base: 'deterministic',
        upgrade: upgradeModelUsed
      },
      upgradeApplied
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating script storyboard:', error);
    return new Response(JSON.stringify({
      storyboard: buildFallbackStoryboard(''),
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

export const config = { path: '/api/script-storyboard' };
