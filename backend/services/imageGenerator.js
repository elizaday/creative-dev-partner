import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const FAL_API_KEY = process.env.FAL_API_KEY;

/**
 * Generate an image using fal.ai FLUX schnell (fast & cheap)
 * @param {string} prompt - The image generation prompt
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - URL of the generated image
 */
export async function generateImage(prompt, options = {}) {
  if (!FAL_API_KEY) {
    console.warn('⚠️  FAL_API_KEY not set, skipping image generation');
    return null;
  }

  try {
    const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        image_size: options.aspectRatio === '16:9' ? 'landscape_16_9' : 'landscape_4_3',
        num_inference_steps: 4, // schnell is optimized for 4 steps
        num_images: 1,
        enable_safety_checker: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ FAL API Error (${response.status}):`, error);

      // Check for common errors
      if (error.includes('Exhausted balance')) {
        console.error('💳 BILLING ISSUE: Your fal.ai account needs credits!');
        console.error('   Add credits at: https://fal.ai/dashboard/billing');
      }

      throw new Error(`FAL API error: ${response.status} - ${error}`);
    }

    const result = await response.json();

    if (result.images && result.images.length > 0) {
      return result.images[0].url;
    }

    throw new Error('No image returned from FAL API');
  } catch (error) {
    console.error('Error generating image:', error.message);
    return null;
  }
}

/**
 * Generate a storyboard frame image optimized for commercial/advertising
 * @param {Object} frame - The storyboard frame object
 * @param {string} brandContext - Additional brand context
 * @returns {Promise<string>} - URL of the generated image
 */
export async function generateStoryboardFrame(frame, brandContext = '') {
  const prompt = buildStoryboardPrompt(frame, brandContext);
  return await generateImage(prompt, { aspectRatio: '16:9' });
}

/**
 * Build an optimized prompt for storyboard frame generation
 */
function buildStoryboardPrompt(frame, brandContext) {
  // Build a concise, effective prompt for FLUX
  let prompt = `Professional commercial advertisement frame, ${frame.shotType} shot. `;
  prompt += `${frame.visual}. `;
  prompt += `${frame.action}. `;

  if (brandContext) {
    prompt += `${brandContext}. `;
  }

  prompt += `Cinematic lighting, high-end commercial photography, professional production quality, 16:9 aspect ratio, advertising style.`;

  return prompt;
}

/**
 * Generate multiple frames in parallel (with rate limiting)
 * @param {Array} frames - Array of frame objects
 * @param {string} brandContext - Brand context
 * @returns {Promise<Array>} - Array of frame objects with imageUrl added
 */
export async function generateMultipleFrames(frames, brandContext = '') {
  if (!FAL_API_KEY) {
    console.warn('⚠️  FAL_API_KEY not set, skipping all image generation');
    console.warn('   Add FAL_API_KEY to your .env file');
    return frames.map(frame => ({ ...frame, imageUrl: null }));
  }

  try {
    console.log(`🎨 Generating ${frames.length} storyboard images with FLUX schnell...`);
    console.log(`   API Key: ${FAL_API_KEY.substring(0, 20)}...`);

    // Generate all images in parallel for speed
    const imagePromises = frames.map(async (frame) => {
      try {
        console.log(`   🖼️  Frame ${frame.frameNumber}: ${frame.visual.substring(0, 50)}...`);
        const imageUrl = await generateStoryboardFrame(frame, brandContext);
        if (imageUrl) {
          console.log(`   ✅ Frame ${frame.frameNumber}: ${imageUrl}`);
        }
        return { ...frame, imageUrl };
      } catch (err) {
        console.error(`❌ Failed to generate frame ${frame.frameNumber}:`, err.message);
        return { ...frame, imageUrl: null };
      }
    });

    const framesWithImages = await Promise.all(imagePromises);

    const successCount = framesWithImages.filter(f => f.imageUrl).length;
    console.log(`✅ Successfully generated ${successCount}/${frames.length} images`);

    return framesWithImages;
  } catch (error) {
    console.error('Error generating multiple frames:', error);
    // Return frames without images on error
    return frames.map(frame => ({ ...frame, imageUrl: null }));
  }
}



