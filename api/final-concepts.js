import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-20250514';

const FAL_API_KEY = process.env.FAL_API_KEY;

async function generateImage(prompt) {
  if (!FAL_API_KEY) return null;

  try {
    const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: 'landscape_16_9',
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    return result.images?.[0]?.url || null;
  } catch {
    return null;
  }
}

async function generateStoryboardFrames(frames, brandContext) {
  if (!FAL_API_KEY) {
    return frames.map(frame => ({ ...frame, imageUrl: null }));
  }

  const imagePromises = frames.map(async (frame) => {
    const prompt = `Professional commercial advertisement frame, ${frame.shotType} shot. ${frame.visual}. ${frame.action}. ${brandContext}. Cinematic lighting, high-end commercial photography, professional production quality, 16:9 aspect ratio, advertising style.`;
    const imageUrl = await generateImage(prompt);
    return { ...frame, imageUrl };
  });

  return Promise.all(imagePromises);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { brief, selectedVariations } = req.body;

    if (!brief || !selectedVariations || selectedVariations.length === 0) {
      return res.status(400).json({ error: 'Brief and selected variations are required' });
    }

    if (selectedVariations.length > 3) {
      return res.status(400).json({ error: 'Maximum 3 variations can be selected' });
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
3. STORYBOARD FRAMES (5-8 frames for a 30-second spot) - Each frame must include:
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
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    });

    const response_text = message.content[0].text;
    const jsonMatch = response_text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse final concepts from Claude response');
    }

    let concepts = JSON.parse(jsonMatch[0]);

    // Generate storyboard images
    for (const concept of concepts) {
      if (concept.storyboardFrames?.length > 0) {
        const brandContext = `${concept.title}. ${concept.description}`;
        concept.storyboardFrames = await generateStoryboardFrames(
          concept.storyboardFrames,
          brandContext
        );
      }
    }

    res.status(200).json({ concepts });
  } catch (error) {
    console.error('Error developing final concepts:', error);
    res.status(500).json({ error: 'Failed to develop final concepts', details: error.message });
  }
}
