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

    // Use streaming to avoid Vercel's 10s timeout on Hobby plan
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullText = '';

    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: {"status":"generating"}\n\n`);
    });

    const finalMessage = await stream.finalMessage();
    fullText = finalMessage.content[0].text;

    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.write(`data: {"error":"Failed to parse refined concept from Claude response"}\n\n`);
      res.end();
      return;
    }

    const refined = JSON.parse(jsonMatch[0]);
    res.write(`data: ${JSON.stringify({ concept: refined })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error refining concept:', error);
    res.write(`data: ${JSON.stringify({ error: 'Failed to refine concept', details: error.message })}\n\n`);
    res.end();
  }
}
