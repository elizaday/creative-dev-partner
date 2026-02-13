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

    const { brief, concept, feedback } = req.body;

    if (!brief || !concept || !feedback) {
      return res.status(400).json({ error: 'Brief, concept, and feedback are required' });
    }

    const prompt = `You are an expert creative director refining a concept based on client feedback.

ORIGINAL BRIEF:
${brief}

CURRENT CONCEPT:
Title: ${concept.title}
Description: ${concept.description}

CLIENT FEEDBACK:
${feedback}

Revise the concept to address the feedback while maintaining what works. Return a JSON object with the same structure as the original concept, but improved based on the feedback.

Return ONLY the JSON object, no other text.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const response_text = message.content[0].text;
    const jsonMatch = response_text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse refined concept from Claude response');
    }

    const refined = JSON.parse(jsonMatch[0]);
    res.status(200).json({ concept: refined });
  } catch (error) {
    console.error('Error refining concept:', error);
    res.status(500).json({ error: 'Failed to refine concept', details: error.message });
  }
}
