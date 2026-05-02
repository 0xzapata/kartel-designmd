/**
 * lib/adapter.js
 * 
 * Enhanced AI adapter with retry logic, timeouts, and caching.
 */

const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff
const CACHE_TTL = 3600000; // 1 hour

// Simple in-memory cache
const cache = new Map();

/**
 * Main entry point for AI calls
 */
export async function callAI({ provider, apiKey, model, baseUrl, tokens, screenshotBase64 }) {
  const prompt = buildPrompt(tokens);

  // Check cache
  const cacheKey = generateCacheKey(provider, model, tokens);
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log('[Adapter] Using cached response');
    return cached;
  }

  try {
    let result;

    switch (provider.toLowerCase()) {
      case 'gemini':
        result = await callWithRetry(() => callGemini({ apiKey, model, prompt, screenshotBase64 }));
        break;
      case 'openai':
        result = await callWithRetry(() => callOpenAI({ apiKey, model, prompt, screenshotBase64 }));
        break;
      case 'claude':
        result = await callWithRetry(() => callClaude({ apiKey, model, prompt, screenshotBase64 }));
        break;
      case 'ollama':
        result = await callWithRetry(() => callOllama({ baseUrl: baseUrl || 'http://localhost:11434', model, prompt, screenshotBase64 }));
        break;
      case 'custom':
        result = await callWithRetry(() => callCustom({ baseUrl: baseUrl || '', model, prompt, screenshotBase64, apiKey }));
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Cache successful response
    if (result) {
      setInCache(cacheKey, result);
    }

    return result;

  } catch (error) {
    console.error(`[AI Adapter - ${provider}]:`, error);
    throw new Error(`${provider} API Error: ${error.message}`);
  }
}

/**
 * Retry wrapper with exponential backoff
 */
async function callWithRetry(fn, retries = MAX_RETRIES) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }

      if (i < retries) {
        const delay = RETRY_DELAYS[i] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.log(`[Adapter] Retrying in ${delay}ms (attempt ${i + 1}/${retries})`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Check if error is non-retryable
 */
function isNonRetryableError(error) {
  const message = error.message?.toLowerCase() || '';
  return (
    message.includes('invalid api key') ||
    message.includes('unauthorized') ||
    message.includes('payment') ||
    message.includes('quota')
  );
}

/**
 * Generate cache key from request
 */
function generateCacheKey(provider, model, tokens) {
  const str = `${provider}:${model}:${JSON.stringify(tokens)}`;
  // Simple hash
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Cache operations
 */
function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setInCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============== PROMPT BUILDER ===============

function buildPrompt(tokens) {
  return `You are an expert design system analyst. You will receive:
1. Raw CSS tokens extracted from the page (JSON)
2. A screenshot of the page (image)

Tokens:
${JSON.stringify(tokens, null, 2)}

Generate a design.md file. Follow these rules strictly:

---

RULE 1 — SCREENSHOT IS THE SOURCE OF TRUTH
The JSON tokens give you exact values (colors, sizes, spacing numbers).
The screenshot tells you what actually matters visually.
Always cross-check. If a token value is not visually significant, ignore it.

RULE 2 — DETECT THE PLATFORM
If you detect Squarespace, Webflow, Shopify, WordPress or any other platform
from the CSS variable naming patterns (e.g. --sqs-*, --wf-*, etc):
- Name the platform in the Overview section
- Mark any platform-internal CSS variables clearly as "platform internal"
- Do NOT treat platform variables as intentional custom design tokens

RULE 3 — BRAND ACCENT COLOR
Do not determine the brand accent color from token frequency.
Look at the screenshot and identify which color carries the most visual weight
and brand identity. That is the accent. A color appearing in the logo only
is a logo color, not a brand accent.
If a color only appears as a 1px underline on one element, it is NOT 
the brand accent. The brand accent must appear in at least 2-3 
significant visual contexts to qualify.

RULE 4 — NAVIGATION
Look at the screenshot carefully and describe:
- Whether the logo is an image or text
- The exact case of nav links (ALL CAPS, Title Case, lowercase)
- The header background color and density (sparse, dense, centered, split)
- Do not describe the nav generically

RULE 5 — LAYOUT PATTERNS
Identify the dominant layout pattern from the screenshot:
- Full-bleed edge-to-edge images
- Card grids
- Editorial columns
- Sidebar layouts
- Centered narrow content
Whatever you see, name it explicitly. This is one of the most important
things a developer needs to know.

RULE 6 — PHOTOGRAPHY & IMAGERY
If the site uses real photography as a primary design element, say so.
Describe how images are used (full-bleed, contained, overlaid with text).
Describe the photographic style (candid, studio, stock, documentary).
If imagery is the emotional carrier of the brand, say that clearly.

RULE 7 — BRAND VOICE MUST BE SPECIFIC
The brand voice section must be specific to this exact site.
Read the actual copy in the screenshot.
Identify the real tone, real naming conventions, real content style.
A brand voice section that could apply to any website in the same industry
is a failure. Include specific evidence from the page copy.

RULE 8 — ONLY WHAT YOU SEE
Only list components, patterns, and elements that are actually visible
in the screenshot. Do not invent typical components that might exist.

RULE 9 — SCROLL THE FULL PAGE
The screenshot may only show the viewport. Assume the page has more content
below the fold. When analyzing layout patterns, do not conclude from just
the hero section. If you see a two-column layout in one section but the
overall page structure appears to be vertically stacked full-width sections,
describe the dominant pattern as vertical stacked sections, and note the
two-column as a sub-pattern within a specific section.

RULE 10 — BRAND ASSETS & KEY CONCEPTS
Look for:
- Book titles, product names, or named frameworks
- Named concepts the speaker/brand has coined
- Therapy animals, mascots, or personal elements that appear in copy
- Deliberate content philosophy (e.g. "no 10-step frameworks")
- Speaking topic naming style (are they one-word? blunt? metaphorical?)
Add a "Brand Assets & Key Concepts" section to the md if any are found.

RULE 11 — CSS-IN-JS DETECTION
If the extracted tokens show signs of CSS-in-JS frameworks (styled-components, 
emotion, Tailwind), note this in the Overview. These frameworks often 
produce different class naming patterns that affect token extraction.

RULE 12 — ANIMATIONS & TRANSITIONS
If the page has notable animations or transitions detected in the CSS,
describe them. Note timing, easing, and what elements are animated.

---

OUTPUT FORMAT:
Clean markdown only. No preamble. No explanation. No code fences.
Start directly with: # Design System

Sections in order:
## 1. Overview
## 2. Colors
## 3. Typography
## 4. Spacing & Layout
## 5. Photography & Visual Style (skip if no significant imagery)
## 6. Elevation & Shadows
## 7. Border & Shape
## 8. Components
## 9. Content Structure Pattern
## 10. Brand Voice
## 11. Brand Assets & Key Concepts (include if found)
## 12. Animations & Transitions (include if notable)
## 13. Do's and Don'ts`;
}

// =============== PROVIDER IMPLEMENTATIONS ===============

async function callGemini({ apiKey, model, prompt, screenshotBase64 }) {
  if (!apiKey) throw new Error('API key is required for Gemini');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts = [{ text: prompt }];

  if (screenshotBase64) {
    const base64Data = screenshotBase64.split(',')[1] || screenshotBase64;
    const mimeType = screenshotBase64.match(/data:(.*?);base64/)?.[1] || 'image/png';
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64Data
      }
    });
  }

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }]
    })
  }, REQUEST_TIMEOUT);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('Unexpected response structure from Gemini API');
}

async function callOpenAI({ apiKey, model, prompt, screenshotBase64 }) {
  if (!apiKey) throw new Error('API key is required for OpenAI');

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt }
      ]
    }
  ];

  if (screenshotBase64) {
    const imageUrl = screenshotBase64.startsWith('data:')
      ? screenshotBase64
      : `data:image/png;base64,${screenshotBase64}`;
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: imageUrl }
    });
  }

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages
    })
  }, REQUEST_TIMEOUT);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  throw new Error('Unexpected response structure from OpenAI API');
}

async function callClaude({ apiKey, model, prompt, screenshotBase64 }) {
  if (!apiKey) throw new Error('API key is required for Claude');

  const content = [
    { type: 'text', text: prompt }
  ];

  if (screenshotBase64) {
    const base64Data = screenshotBase64.split(',')[1] || screenshotBase64;
    const mimeType = screenshotBase64.match(/data:(.*?);base64/)?.[1] || 'image/png';
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: base64Data
      }
    });
  }

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4096,
      messages: [{ role: 'user', content }]
    })
  }, REQUEST_TIMEOUT);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.content?.[0]?.text) {
    return data.content[0].text;
  }
  throw new Error('Unexpected response structure from Claude API');
}

async function callOllama({ baseUrl, model, prompt, screenshotBase64 }) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/generate`;

  const bodyPayload = {
    model: model || 'llama3',
    prompt: prompt,
    stream: true // Enable streaming for Ollama
  };

  if (screenshotBase64) {
    const base64Data = screenshotBase64.split(',')[1] || screenshotBase64;
    bodyPayload.images = [base64Data];
  }

  // For Ollama, we'll collect the full response
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload)
  }, REQUEST_TIMEOUT);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(errText || `HTTP error ${response.status}`);
  }

  // Ollama streaming response handler
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.trim()) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            fullResponse += data.response;
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    }
  }

  return fullResponse;
}

/**
 * Custom OpenAI-compatible API endpoint
 */
async function callCustom({ baseUrl, model, prompt, screenshotBase64, apiKey }) {
  if (!baseUrl) throw new Error('API endpoint URL is required for Custom provider');

  const endpoint = baseUrl.replace(/\/$/, '');

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt }
      ]
    }
  ];

  if (screenshotBase64) {
    const imageUrl = screenshotBase64.startsWith('data:')
      ? screenshotBase64
      : `data:image/png;base64,${screenshotBase64}`;
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: imageUrl }
    });
  }

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model: model,
      messages: messages
    })
  }, REQUEST_TIMEOUT);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  throw new Error('Unexpected response structure from Custom API');
}

// =============== UTILITIES ===============

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Async generator for streaming responses (for providers that support it)
 */
export async function* createStreamingIterator(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    yield chunk;
  }
}
