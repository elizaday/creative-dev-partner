export const TIMEOUT_ERROR = 'ANTHROPIC_TIMEOUT';

export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(TIMEOUT_ERROR)), ms);
    })
  ]);
}

function isModelNotFoundError(error) {
  const status = error?.status ?? error?.statusCode;
  const message = String(error?.message || '');
  return status === 404 || message.includes('not_found_error') || message.includes('model:');
}

function getModelCandidates() {
  const envModels = (process.env.ANTHROPIC_MODELS || process.env.ANTHROPIC_MODEL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const defaults = [
    'claude-sonnet-4-6',
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022'
  ];

  return [...new Set([...envModels, ...defaults])];
}

export async function createMessageWithFallback(anthropic, params) {
  const candidates = getModelCandidates();
  let lastError = null;

  for (const model of candidates) {
    try {
      const response = await anthropic.messages.create({
        ...params,
        model
      });
      return { response, model };
    } catch (error) {
      lastError = error;
      if (isModelNotFoundError(error)) {
        console.warn(`Anthropic model not available: ${model}. Trying next model.`);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('No Anthropic models available for this account.');
}
