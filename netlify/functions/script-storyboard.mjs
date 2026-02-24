import Anthropic from '@anthropic-ai/sdk';
import { TIMEOUT_ERROR, withTimeout, createMessageWithFallback } from './_anthropic.mjs';

const ANTHROPIC_TIMEOUT_MS = 17000;
const TARGET_MAX_BEATS = 5;
const FRAME_TIMINGS = [
  '0:00-0:06',
  '0:06-0:12',
  '0:12-0:18',
  '0:18-0:24',
  '0:24-0:30'
];

const CONTRAST_DIMENSIONS = ['composition', 'camera stability', 'distance', 'lighting', 'rhythm'];

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
  return String(script || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
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
  if (unit?.kind === 'scene') return 'Wide';
  if (unit?.kind === 'dialogue') return ['Medium', 'Close-up', 'Over-Shoulder'][index % 3];
  return ['Tracking', 'Medium', 'Close-up', 'Wide'][index % 4];
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

function buildFallbackFrame(beatNumber, unit, projectContext, index) {
  const shotType = inferShotType(unit, index);
  const source = compactText(unit?.text || projectContext, 120);

  return {
    frameNumber: beatNumber,
    timing: FRAME_TIMINGS[index] || '',
    beat: compactText(source || `Beat ${beatNumber}`, 90),
    purpose: index === 0
      ? 'Set the baseline power dynamic and narrative objective.'
      : 'Push the power dynamic into a new strategic state.',
    visualDecision: `Use a ${shotType.toLowerCase()} setup with hard subject priority and clean negative space.`,
    whyThisExists: index === TARGET_MAX_BEATS - 1
      ? 'Converts accumulated tension into a clear final payoff.'
      : 'Introduces a meaningful transformation rather than coverage.',
    cutLogic: index === TARGET_MAX_BEATS - 1
      ? 'Hold half-beat longer, then resolve to end card with certainty.'
      : 'Cut on a directional action to force forward momentum.',
    contrastFromPrevious: inferContrastFromPrevious(index),
    shotType,
    transition: index === TARGET_MAX_BEATS - 1 ? 'Fade out' : 'Cut',
    imageUrl: null
  };
}

function buildFallbackStoryboard(script, constraints = {}) {
  const units = parseScriptUnits(script);
  const projectContext = units.map((unit) => unit.text).join(' ');

  const frames = Array.from({ length: TARGET_MAX_BEATS }, (_, index) => {
    const unitIndex = Math.round((index * (units.length - 1)) / Math.max(1, TARGET_MAX_BEATS - 1));
    const unit = units[unitIndex] || units[units.length - 1];
    return buildFallbackFrame(index + 1, unit, projectContext, index);
  });

  const stressTest = {
    centralContrast: 'Current state versus transformed state is present but can be sharpened.',
    powerShift: 'Power moves from uncertainty to decisive control by the final beat.',
    sharpestMoment: frames[2]?.beat || frames[1]?.beat || 'Escalation beat',
    removableLine: 'Trim repetitive exposition that does not alter visual stakes.',
    mutedVisualCheck: 'Pass - the arc remains readable without dialogue.',
    scriptStatus: 'usable'
  };

  return {
    projectName: safeProjectName('Project'),
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

async function createStoryboardMessage(anthropic, prompt) {
  const { response, model } = await withTimeout(
    createMessageWithFallback(anthropic, {
      max_tokens: 1800,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }]
    }),
    ANTHROPIC_TIMEOUT_MS
  );

  return { response, model };
}

function buildPrompt(script, constraints, projectName) {
  const constraintsEnabled = hasBrandConstraints(constraints);

  const constraintsBlock = constraintsEnabled
    ? `BRAND / TONAL CONSTRAINTS (MANDATORY):\n${JSON.stringify(constraints, null, 2)}`
    : 'BRAND / TONAL CONSTRAINTS: none provided. Proceed narrative-first and avoid product-category assumptions.';

  return `GLOBAL RULE
You are a director, not a formatter.
Do not protect weak writing.
Do not generate coverage.
Do not restate the script.
Only visualize change.
If nothing changes, merge or delete.

SCRIPT:
${script}

PROJECT NAME:
${projectName || 'Project'}

${constraintsBlock}

Run this sequence strictly:

PHASE 1 — SCRIPT STRESS TEST (mandatory):
1) central contrast
2) power shift
3) sharpest moment
4) one removable line
5) if muted, does visual arc still read
If contrast is weak or power shift is unclear, rewrite the weak section before storyboarding.

PHASE 2 — REDUCE THE STORY:
Select no more than ${TARGET_MAX_BEATS} beats.
Each beat must cause transformation via power shift, tone shift, or visual escalation.
Merge redundant beats.

PHASE 3 — COMMIT TO VISUAL DECISIONS:
For each beat return: beat, purpose, visualDecision, whyThisExists, cutLogic, contrastFromPrevious.
No dialogue duplication. No script anchors. No emotional labels. No alternatives. No "could be".

CONTRAST RULE:
Each frame must explicitly differ from the previous frame in at least one of: composition, camera stability, distance, lighting, rhythm.

FILLER ELIMINATION:
No reaction shots without tonal shift.
No dialogue continuation frames.
No redundant escalation.
Only film transformation.

QUALITY CONTROL BEFORE OUTPUT:
- most important moment is visually dominant
- power shift is clear
- contrast progression is clear
- muted arc is readable
- no frame exists only because a line exists

Return ONLY valid JSON object with this schema:
{
  "projectName": "${safeProjectName(projectName || 'Project')}",
  "title": "string",
  "summary": "string",
  "tone": "string",
  "stressTest": {
    "centralContrast": "string",
    "powerShift": "string",
    "sharpestMoment": "string",
    "removableLine": "string",
    "mutedVisualCheck": "Pass|Fail + short reason",
    "scriptStatus": "usable|rewritten"
  },
  "rewriteApplied": true,
  "rewriteExcerpt": "string",
  "frames": [
    {
      "frameNumber": 1,
      "timing": "0:00-0:06",
      "beat": "string",
      "purpose": "string",
      "visualDecision": "string",
      "whyThisExists": "string",
      "cutLogic": "string",
      "contrastFromPrevious": "string",
      "shotType": "Wide|Medium|Close-up|Tracking|POV|Over-Shoulder",
      "transition": "Cut|Match Cut|Smash Cut|Dissolve|Fade out"
    }
  ]
}

Hard output rules:
- frames length must be 3 to ${TARGET_MAX_BEATS}
- no markdown
- no comments
- no extra keys
- concise, production-usable language only.`;
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
    const script = String(body?.script || '');
    const projectName = safeProjectName(body?.projectName || 'Project');
    const constraints = normalizeBrandConstraints(body?.constraints);

    if (script.trim().length < 80) {
      return new Response(JSON.stringify({ error: 'Script must be at least 80 characters.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = buildPrompt(script, constraints, projectName);

    let parsed;
    let modelUsed;
    try {
      const modelResult = await createStoryboardMessage(anthropic, prompt);
      modelUsed = modelResult.model;
      parsed = extractJsonObject(modelResult.response?.content?.[0]?.text || '');
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        const storyboard = buildFallbackStoryboard(script, constraints);
        return new Response(JSON.stringify({
          storyboard,
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

    const storyboard = normalizeStoryboard(parsed, script, constraints);

    return new Response(JSON.stringify({
      storyboard,
      qualityPipeline: 'director-guardrails-v3',
      modelUsed
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
