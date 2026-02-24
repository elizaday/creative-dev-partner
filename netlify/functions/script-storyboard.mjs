import Anthropic from '@anthropic-ai/sdk';
import { TIMEOUT_ERROR, withTimeout, createMessageWithFallback } from './_anthropic.mjs';

const ANTHROPIC_TIMEOUT_MS = 14000;
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

function extractJsonObject(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found');
  return JSON.parse(match[0]);
}

function splitScriptIntoAnchors(script) {
  const normalized = String(script || '')
    .replace(/\r/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const chunks = normalized
    .split(/\n|(?<=[.!?])\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^[-\s]+/, '').replace(/[\s]+/g, ' '));

  if (!chunks.length) {
    return Array.from({ length: TARGET_FRAME_COUNT }, (_, index) => `Script beat ${index + 1}`);
  }

  const anchors = [];
  const step = Math.max(1, Math.floor(chunks.length / TARGET_FRAME_COUNT));
  for (let i = 0; i < TARGET_FRAME_COUNT; i += 1) {
    const idx = Math.min(chunks.length - 1, i * step);
    anchors.push(chunks[idx]);
  }

  return anchors;
}

function buildFallbackStoryboard(script) {
  const anchors = splitScriptIntoAnchors(script);

  return {
    title: 'Script Storyboard',
    summary: 'Eight-frame storyboard generated directly from script beats.',
    tone: 'Cinematic and script-faithful',
    frames: anchors.map((anchor, index) => ({
      frameNumber: index + 1,
      timing: FRAME_TIMINGS[index],
      shotType: ['Wide', 'Medium', 'Close-up', 'Wide', 'Medium', 'Close-up', 'POV', 'Hero'][index] || 'Wide',
      visual: `Visualize this script beat with clear cinematic composition: ${anchor}`,
      action: `Advance the narrative using this beat: ${anchor}`,
      audio: `Use script-aligned dialogue/VO from: ${anchor}`,
      dialogue: anchor,
      scriptAnchor: anchor,
      transition: index === TARGET_FRAME_COUNT - 1 ? 'Fade out' : 'Cut',
      imageUrl: null
    }))
  };
}

function normalizeFrame(frame, fallbackFrame, index) {
  return {
    frameNumber: index + 1,
    timing: frame?.timing || fallbackFrame.timing,
    shotType: frame?.shotType || fallbackFrame.shotType,
    visual: frame?.visual || fallbackFrame.visual,
    action: frame?.action || fallbackFrame.action,
    audio: frame?.audio || fallbackFrame.audio,
    dialogue: frame?.dialogue || fallbackFrame.dialogue,
    scriptAnchor: frame?.scriptAnchor || fallbackFrame.scriptAnchor,
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
    normalizeFrame(sourceFrames[index], fallback.frames[index], index)
  );

  return {
    title: raw?.title || fallback.title,
    summary: raw?.summary || fallback.summary,
    tone: raw?.tone || fallback.tone,
    frames
  };
}

async function createMessage(anthropic, prompt, maxTokens = 1700) {
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

    const { script } = await req.json();
    if (!script || script.trim().length < 80) {
      return new Response(JSON.stringify({ error: 'Script must be at least 80 characters.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `You are a professional storyboard artist and script breakdown specialist.\n\nSCRIPT:\n${script}\n\nTask:\nCreate an 8-frame storyboard that stays highly aligned to this script's narrative order and language.\n\nReturn ONLY valid JSON object with keys:\n- title\n- summary\n- tone\n- frames (array of exactly 8 objects)\n\nEach frame must include:\n- frameNumber (1-8)\n- timing (e.g. 0:00-0:04)\n- shotType\n- visual\n- action\n- audio\n- dialogue (direct line or faithful short excerpt from script)\n- scriptAnchor (exact quote from script, <=18 words)\n- transition\n\nHard rules:\n- Maintain script chronology from beginning to end\n- Do not invent unrelated story events\n- Keep visual/action language specific and production-usable\n- 8 frames exactly.`;

    let parsed;
    try {
      const message = await createMessage(anthropic, prompt, 1900);
      parsed = extractJsonObject(message.content?.[0]?.text || '');
    } catch (error) {
      if (error.message === TIMEOUT_ERROR) {
        const storyboard = buildFallbackStoryboard(script);
        return new Response(JSON.stringify({ storyboard, fallback: true, partial: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }

    const storyboard = normalizeStoryboard(parsed, script);

    return new Response(JSON.stringify({ storyboard, qualityPipeline: 'script-breakdown-8f' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating script storyboard:', error);
    return new Response(JSON.stringify({
      storyboard: buildFallbackStoryboard(''),
      fallback: true,
      partial: true,
      details: error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/script-storyboard' };
