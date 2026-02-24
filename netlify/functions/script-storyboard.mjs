import Anthropic from '@anthropic-ai/sdk';
import { TIMEOUT_ERROR, withTimeout, createMessageWithFallback } from './_anthropic.mjs';

const ANTHROPIC_TIMEOUT_MS = 18000;
const TARGET_FRAME_COUNT = 8;
const FRAME_TIMINGS = [
  '0:00-0:04',
  '0:04-0:08',
  '0:08-0:12',
  '0:12-0:16',
  '0:16-0:20',
  '0:20-0:24',
  '0:24-0:27',
  '0:27-0:30'
];

const STORY_FUNCTIONS = [
  'Establish world and current state',
  'Introduce protagonist objective',
  'Surface tension or obstacle',
  'Escalate stakes',
  'Force a choice or reveal',
  'Drive toward resolution',
  'Show consequence and emotional shift',
  'Land final payoff'
];

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(text) {
  return normalizeWhitespace(String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ''));
}

function toExcerpt(text, maxWords = 18) {
  const words = normalizeWhitespace(text).split(' ').filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function isLikelySpeakerCue(line) {
  const value = normalizeWhitespace(line);
  if (!value) return false;
  if (value.length > 30) return false;
  if (!/^[A-Z0-9 .'-]+$/.test(value)) return false;
  const wordCount = value.split(' ').filter(Boolean).length;
  return wordCount > 0 && wordCount <= 4;
}

function inferShotType(unit, index) {
  if (unit?.kind === 'scene') return 'Wide';
  if (unit?.kind === 'dialogue') {
    return ['Medium Two-Shot', 'Close-up', 'Over-Shoulder', 'Close-up'][index % 4];
  }
  return ['Wide', 'Medium', 'Close-up', 'Tracking'][index % 4];
}

function inferIntent(unit, index) {
  if (unit?.kind === 'scene') {
    return 'Orient viewer in location and power dynamics before dialogue begins.';
  }
  if (unit?.kind === 'dialogue') {
    return 'Capture subtext and reaction so spoken line carries emotional meaning.';
  }
  return index < 4
    ? 'Clarify cause-and-effect through physical behavior and staging.'
    : 'Increase momentum toward emotional and narrative payoff.';
}

function inferEmotion(unit, index) {
  if (unit?.kind === 'dialogue') return 'Read the emotional subtext behind the line.';
  if (unit?.kind === 'scene') return index === 0 ? 'Create orientation and anticipation.' : 'Reframe stakes through environment.';
  return index < 4 ? 'Build pressure and curiosity.' : 'Release tension with consequence.';
}

function parseScriptUnits(script) {
  const lines = String(script || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const units = [];
  let pendingSpeaker = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';

    if (/^(INT\.|EXT\.|INT\/EXT\.|EST\.|SCENE\s)/i.test(line)) {
      pendingSpeaker = null;
      units.push({ kind: 'scene', text: line });
      continue;
    }

    const colonDialogueMatch = line.match(/^([A-Z][A-Z0-9 .'-]{1,30}):\s*(.+)$/);
    if (colonDialogueMatch) {
      pendingSpeaker = null;
      units.push({
        kind: 'dialogue',
        speaker: normalizeWhitespace(colonDialogueMatch[1]),
        text: `${normalizeWhitespace(colonDialogueMatch[1])}: ${normalizeWhitespace(colonDialogueMatch[2])}`
      });
      continue;
    }

    if (isLikelySpeakerCue(line) && nextLine && !isLikelySpeakerCue(nextLine)) {
      pendingSpeaker = line;
      continue;
    }

    if (pendingSpeaker) {
      units.push({
        kind: 'dialogue',
        speaker: pendingSpeaker,
        text: `${pendingSpeaker}: ${line}`
      });
      pendingSpeaker = null;
      continue;
    }

    units.push({ kind: 'action', text: line });
  }

  if (!units.length) {
    units.push({ kind: 'action', text: 'No script beats parsed.' });
  }

  return units;
}

function buildBeatAnchors(script) {
  const units = parseScriptUnits(script);
  const anchors = [];

  for (let i = 0; i < TARGET_FRAME_COUNT; i += 1) {
    const index = Math.round((i * (units.length - 1)) / Math.max(1, TARGET_FRAME_COUNT - 1));
    const unit = units[index] || units[units.length - 1];
    const nextUnit = units[Math.min(index + 1, units.length - 1)] || unit;

    const scriptAnchor = toExcerpt(unit.text, 18);
    const dialogue = unit.kind === 'dialogue' ? toExcerpt(unit.text, 24) : '';

    anchors.push({
      beatNumber: i + 1,
      sourceType: unit.kind,
      scriptAnchor,
      dialogue,
      context: toExcerpt(`${unit.text} ${nextUnit?.text || ''}`, 28),
      storyFunction: STORY_FUNCTIONS[i],
      shotTypeHint: inferShotType(unit, i),
      intentHint: inferIntent(unit, i),
      emotionalObjectiveHint: inferEmotion(unit, i)
    });
  }

  return anchors;
}

function buildFallbackFrame(beat, index) {
  return {
    frameNumber: index + 1,
    timing: FRAME_TIMINGS[index],
    shotType: beat.shotTypeHint || 'Medium',
    storyFunction: beat.storyFunction,
    intent: beat.intentHint,
    emotionalObjective: beat.emotionalObjectiveHint,
    visual: `Compose a ${beat.shotTypeHint || 'medium'} frame that clearly stages: ${beat.context}`,
    action: `Progress the story beat by showing cause and response around: ${beat.scriptAnchor}`,
    audio: beat.dialogue
      ? `Prioritize line delivery and reaction: ${beat.dialogue}`
      : `Use sound design that reinforces this beat: ${beat.scriptAnchor}`,
    dialogue: beat.dialogue || beat.scriptAnchor,
    scriptAnchor: beat.scriptAnchor,
    transition: index === TARGET_FRAME_COUNT - 1 ? 'Fade out' : 'Cut',
    imageUrl: null
  };
}

function buildFallbackStoryboard(script) {
  const beats = buildBeatAnchors(script);
  return {
    title: 'Script Storyboard',
    summary: 'Eight intentional frames mapped to script beats and narrative function.',
    tone: 'Script-faithful and purpose-driven',
    frames: beats.map((beat, index) => buildFallbackFrame(beat, index))
  };
}

function cleanGenericText(value, fallbackValue) {
  const text = normalizeWhitespace(value);
  if (!text) return fallbackValue;
  if (/visualize this script beat|advance the narrative using this beat|use script-aligned/i.test(text)) {
    return fallbackValue;
  }
  return text;
}

function ensureAnchorIsFromScript(anchor, script, fallbackAnchor) {
  const normalizedScript = normalizeForMatch(script);
  const candidate = normalizeWhitespace(anchor);
  if (!candidate) return fallbackAnchor;

  const normalizedCandidate = normalizeForMatch(candidate);
  if (!normalizedCandidate) return fallbackAnchor;

  return normalizedScript.includes(normalizedCandidate) ? candidate : fallbackAnchor;
}

function normalizeFrame(frame, fallbackFrame, script, index) {
  const scriptAnchor = ensureAnchorIsFromScript(
    frame?.scriptAnchor,
    script,
    fallbackFrame.scriptAnchor
  );

  return {
    frameNumber: index + 1,
    timing: frame?.timing || fallbackFrame.timing,
    shotType: frame?.shotType || fallbackFrame.shotType,
    storyFunction: cleanGenericText(frame?.storyFunction, fallbackFrame.storyFunction),
    intent: cleanGenericText(frame?.intent, fallbackFrame.intent),
    emotionalObjective: cleanGenericText(frame?.emotionalObjective, fallbackFrame.emotionalObjective),
    visual: cleanGenericText(frame?.visual, fallbackFrame.visual),
    action: cleanGenericText(frame?.action, fallbackFrame.action),
    audio: cleanGenericText(frame?.audio, fallbackFrame.audio),
    dialogue: cleanGenericText(frame?.dialogue, fallbackFrame.dialogue),
    scriptAnchor,
    transition: frame?.transition || fallbackFrame.transition,
    imageUrl: null
  };
}

function normalizeStoryboard(raw, script) {
  const fallback = buildFallbackStoryboard(script);
  const sourceFrames = Array.isArray(raw?.frames)
    ? raw.frames
    : Array.isArray(raw?.storyboardFrames)
      ? raw.storyboardFrames
      : [];

  const frames = Array.from({ length: TARGET_FRAME_COUNT }, (_, index) =>
    normalizeFrame(sourceFrames[index], fallback.frames[index], script, index)
  );

  return {
    title: raw?.title || fallback.title,
    summary: raw?.summary || fallback.summary,
    tone: raw?.tone || fallback.tone,
    frames
  };
}

async function createMessage(anthropic, prompt, maxTokens = 2300) {
  const result = await withTimeout(
    createMessageWithFallback(anthropic, {
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
    ANTHROPIC_TIMEOUT_MS
  );

  return result.response;
}

function extractJsonObject(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found');
  return JSON.parse(match[0]);
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

    const { script } = await req.json();
    if (!script || script.trim().length < 80) {
      return new Response(JSON.stringify({ error: 'Script must be at least 80 characters.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const beatAnchors = buildBeatAnchors(script);

    const prompt = `You are a senior director + storyboard artist.\n\nSCRIPT:\n${script}\n\nBEAT_ANCHORS (JSON, chronological):\n${JSON.stringify(beatAnchors)}\n\nReturn ONLY valid JSON object with keys:\n- title\n- summary\n- tone\n- frames (array of exactly 8 objects)\n\nEach frame must map to the same beatNumber and include:\n- frameNumber\n- timing\n- shotType\n- storyFunction\n- intent (why this camera/staging choice helps the story)\n- emotionalObjective (what audience should feel)\n- visual\n- action\n- audio\n- dialogue\n- scriptAnchor\n- transition\n\nHard rules:\n- Keep chronology exactly aligned to BEAT_ANCHORS order\n- scriptAnchor must be a direct quote or faithful excerpt from its beat\n- Avoid generic placeholders and vague language\n- Make each shot intentional, specific, and production-usable\n- Do not invent unrelated events\n- 8 frames exactly.`;

    let parsed;
    try {
      const message = await createMessage(anthropic, prompt, 2500);
      parsed = extractJsonObject(message.content?.[0]?.text || '');
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        const storyboard = buildFallbackStoryboard(script);
        return new Response(JSON.stringify({ storyboard, fallback: true, partial: true, fallbackReason: 'timeout' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    const storyboard = normalizeStoryboard(parsed, script);

    return new Response(JSON.stringify({ storyboard, qualityPipeline: 'beat-anchors+intent' }), {
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
