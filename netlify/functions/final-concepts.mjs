import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-3-5-haiku-latest';
const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/schnell';
const MAX_IMAGE_FRAMES = 4;

async function generateFrameImage(frame, brandContext) {
  const falKey = process.env.FAL_API_KEY;
  if (!falKey) return null;

  const prompt = [
    `Professional commercial advertisement frame, ${frame.shotType || 'wide'} shot.`,
    frame.visual || '',
    frame.action || '',
    brandContext || '',
    'Cinematic lighting, high-end commercial photography, 16:9 aspect ratio.'
  ].join(' ');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        image_size: 'landscape_16_9',
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`FAL image generation failed (${response.status}):`, errText);
      return null;
    }

    const result = await response.json();
    return result?.images?.[0]?.url || null;
  } catch (error) {
    console.error('FAL image generation error:', error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { brief, selectedVariations } = await req.json();

    if (!brief || !selectedVariations || selectedVariations.length === 0) {
      return new Response(JSON.stringify({ error: 'Brief and selected variations are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (selectedVariations.length > 3) {
      return new Response(JSON.stringify({ error: 'Maximum 3 variations can be selected' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const variationsText = selectedVariations.map(v =>
      `${v.title}\n${v.description}\nShift: ${v.shift}`
    ).join('\n\n---\n\n');

    const prompt = `You are an expert creative director developing final presentation-ready concepts with detailed storyboard frames.

ORIGINAL BRIEF:
${brief}

SELECTED VARIATIONS:
${variationsText}

For each variation above, create a fully developed creative concept suitable for client presentation. Include:

1. Polished title and tagline
2. Expanded concept description (4-5 sentences)
3. STORYBOARD FRAMES (4-5 frames for a 30-second spot) - Each frame must include:
   - Frame number and timing (e.g., "Frame 1 (0:00-0:04)")
   - Shot type (Wide, Medium, Close-up, Extreme Close-up, Over-shoulder, POV, etc.)
   - Visual description (What we see - be specific about composition, lighting, subjects)
   - Action/Movement (What's happening in the frame)
   - Audio (Dialogue, sound effects, or music cues)
   - Transition (Cut, Fade, Dissolve, etc.)
4. Visual references description (describe 4 reference types/moods)
5. Production notes (tone, format, key considerations)
6. Rationale (why this works for the brief)

Format as JSON array:
[
  {
    "number": 1,
    "title": "The Expert Opinion",
    "tagline": "Experts analyzed it for hours. Their conclusion? It just works.",
    "description": "Full concept description here...",
    "storyboardFrames": [
      {
        "frameNumber": 1,
        "timing": "0:00-0:04",
        "shotType": "Wide",
        "visual": "Description of what we see",
        "action": "What is happening",
        "audio": "What we hear",
        "transition": "Cut"
      }
    ],
    "visualReferences": ["ref1", "ref2", "ref3", "ref4"],
    "productionNotes": ["note1", "note2"],
    "rationale": "Why this works..."
  }
]

Return ONLY the JSON array, no other text.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3200,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Failed to parse final concepts from Claude response' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    let concepts = JSON.parse(jsonMatch[0]);

    // Attempt image generation for a subset of frames to stay within serverless limits.
    for (const concept of concepts) {
      if (concept.storyboardFrames?.length > 0) {
        const brandContext = `${concept.title || ''}. ${concept.description || ''}`.trim();
        concept.storyboardFrames = await Promise.all(
          concept.storyboardFrames.map(async (frame, idx) => {
            if (idx >= MAX_IMAGE_FRAMES) {
              return { ...frame, imageUrl: null };
            }
            const imageUrl = await generateFrameImage(frame, brandContext);
            return { ...frame, imageUrl };
          })
        );
      }
    }

    return new Response(JSON.stringify({ concepts }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error developing final concepts:', error);
    return new Response(JSON.stringify({ error: 'Failed to develop final concepts', details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: "/api/final-concepts" };
