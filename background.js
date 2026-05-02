/**
 * background.js
 * 
 * Service worker for the designmd Chrome extension.
 * Handles AI API calls, message routing, and history persistence.
 */

import { callAI } from './lib/adapter.js';

// Abort controllers for cancellation
const activeRequests = new Map();

// =============== MESSAGE LISTENERS ===============

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE') {
    handleGenerate(request)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (request.type === 'SAVE_HISTORY') {
    handleSaveHistory(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'GET_HISTORY') {
    handleGetHistory()
      .then(result => sendResponse(result))
      .catch(err => sendResponse([]));
    return true;
  }

  if (request.type === 'LOAD_HISTORY_ITEM') {
    handleLoadHistoryItem(request.id)
      .then(result => sendResponse(result))
      .catch(err => sendResponse(null));
    return true;
  }

  if (request.type === 'DELETE_HISTORY') {
    handleDeleteHistory(request.id)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'CLEAR_HISTORY') {
    handleClearHistory()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return true;
});

// =============== GENERATION HANDLER ===============

async function handleGenerate(request) {
  const { provider, apiKey, model, baseUrl, tokens, screenshotBase64 } = request;

  try {
    // Await the callAI promise
    const result = await callAI({ provider, apiKey, model, baseUrl, tokens, screenshotBase64 });

    // Handle streaming response
    if (result && typeof result[Symbol.asyncIterator] === 'function') {
      let buffer = '';
      for await (const chunk of result) {
        buffer += chunk;
        chrome.runtime.sendMessage({
          type: 'CHUNK',
          text: chunk
        });
      }
      chrome.runtime.sendMessage({ type: 'DONE' });
      return { success: true, output: buffer };
    }

    // Non-streaming response - send as single chunk
    chrome.runtime.sendMessage({
      type: 'CHUNK',
      text: result
    });
    chrome.runtime.sendMessage({ type: 'DONE' });
    return { success: true, output: result };

  } catch (error) {
    console.error('[Background] Generation error:', error);
    chrome.runtime.sendMessage({
      type: 'ERROR',
      message: error.message || 'Generation failed'
    });
    return { error: error.message };
  }
}

// =============== HISTORY HANDLERS ===============

async function handleSaveHistory(data) {
  const { saveExtraction, createThumbnail } = await import('./lib/db.js');

  // Create thumbnail if we have a screenshot
  let thumbnail = null;
  if (data.screenshot) {
    // We need to do this in the context of the page, so we'll receive it pre-made
    thumbnail = data.screenshotThumbnail;
  }

  await saveExtraction({
    url: data.url,
    title: data.title,
    tokens: data.tokens,
    screenshot: data.screenshot,
    screenshotThumbnail: thumbnail,
    output: data.output,
    provider: data.provider,
    model: data.model
  });
}

async function handleGetHistory() {
  const { getHistory } = await import('./lib/db.js');
  return await getHistory(20);
}

async function handleLoadHistoryItem(id) {
  const { getExtraction } = await import('./lib/db.js');
  return await getExtraction(parseInt(id));
}

async function handleDeleteHistory(id) {
  const { deleteExtraction } = await import('./lib/db.js');
  await deleteExtraction(parseInt(id));
}

async function handleClearHistory() {
  const { clearHistory } = await import('./lib/db.js');
  await clearHistory();
}

// =============== LIFECYCLE ===============

chrome.runtime.onInstalled.addListener(() => {
  console.log('[designmd] Extension installed');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[designmd] Extension startup');
});
