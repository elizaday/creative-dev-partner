const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/schnell';

function buildPrompt(frame, conceptTitle, conceptDescription) {
  return [
    `Professional commercial advertisement frame, ${frame?.shotType || 'Wide'} shot.`,
    frame?.visual || '',
    frame?.action || '',
    conceptTitle || '',
    conceptDescription || '',
    'Cinematic lighting, high-end commercial photography, 16:9 aspect ratio.'
  ].join(' ');
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    if (!process.env.FAL_API_KEY) {
      return new Response(JSON.stringify({ error: 'FAL_API_KEY is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { frame, conceptTitle, conceptDescription } = await req.json();
    if (!frame) {
      return new Response(JSON.stringify({ error: 'frame is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(FAL_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Key ${process.env.FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: buildPrompt(frame, conceptTitle, conceptDescription),
          image_size: 'landscape_16_9',
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const details = await response.text();
        return new Response(JSON.stringify({ error: 'Failed to generate image', details }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const result = await response.json();
      return new Response(JSON.stringify({ imageUrl: result?.images?.[0]?.url || null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to generate image', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/frame-image' };
