import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-20250514';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured in Vercel environment variables' });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

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

    // Use streaming to avoid Vercel's 10s timeout on Hobby plan
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullText = '';

    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: {"status":"generating"}\n\n`);
    });

    const finalMessage = await stream.finalMessage();
    fullText = finalMessage.content[0].text;

    const jsonMatch = fullText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      res.write(`data: {"error":"Failed to parse final concepts from Claude response"}\n\n`);
      res.end();
      return;
    }

    let concepts = JSON.parse(jsonMatch[0]);

    // Set imageUrl to null — image generation is separate from this endpoint
    for (const concept of concepts) {
      if (concept.storyboardFrames?.length > 0) {
        concept.storyboardFrames = concept.storyboardFrames.map(frame => ({
          ...frame,
          imageUrl: null
        }));
      }
    }

    res.write(`data: ${JSON.stringify({ concepts })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error developing final concepts:', error);
    res.write(`data: ${JSON.stringify({ error: 'Failed to develop final concepts', details: error.message })}\n\n`);
    res.end();
  }
}
