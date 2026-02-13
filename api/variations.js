import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-20250514';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { brief, selectedIdeas } = req.body;

    if (!brief || !selectedIdeas || selectedIdeas.length === 0) {
      return res.status(400).json({ error: 'Brief and selected ideas are required' });
    }

    if (selectedIdeas.length > 3) {
      return res.status(400).json({ error: 'Maximum 3 ideas can be selected for variations to avoid response truncation' });
    }

    const ideasText = selectedIdeas.map(idea =>
      `${idea.title}: ${idea.description}`
    ).join('\n\n');

    const prompt = `You are an expert creative director developing variations on selected concepts.

ORIGINAL BRIEF:
${brief}

SELECTED CONCEPTS:
${ideasText}

For each concept above, generate 3 distinct variations. Each variation should:
- Maintain the core idea but shift tone, pacing, or structure
- Offer a meaningfully different execution
- Include a clear "shift" explanation

Common variation types:
- Extended Cut (slower pacing, more silence)
- Ensemble Version (multiple characters/vignettes)
- Inverted (reversed structure)
- Darker/Lighter tone shifts
- Different setting or time period
- Different visual style

Format as JSON array:
[
  {
    "originalId": 1,
    "originalTitle": "The Expert Opinion",
    "variations": [
      {
        "letter": "A",
        "title": "The Expert Opinion — Extended Cut",
        "description": "Same core concept, but we hold on moments longer. Let the silence do the work. More observational, less rushed.",
        "shift": "Slower pacing, more uncomfortable pauses"
      },
      {
        "letter": "B",
        "title": "The Expert Opinion — Ensemble Version",
        "description": "Multiple expert panels across different industries, all reaching the same simple conclusion.",
        "shift": "Multiple vignettes instead of single narrative"
      },
      {
        "letter": "C",
        "title": "The Expert Opinion — Inverted",
        "description": "Start with the satisfied user, then flash back to show the absurd analysis they're NOT dealing with.",
        "shift": "Reversed structure, satisfaction first"
      }
    ]
  }
]

Return ONLY the JSON array, no other text.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 12000,
      messages: [{ role: 'user', content: prompt }],
    });

    const response_text = message.content[0].text;
    const jsonMatch = response_text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse variations from Claude response');
    }

    const variations = JSON.parse(jsonMatch[0]);
    res.status(200).json({ variations });
  } catch (error) {
    console.error('Error generating variations:', error);
    res.status(500).json({ error: 'Failed to generate variations', details: error.message });
  }
}
