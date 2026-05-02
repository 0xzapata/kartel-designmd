/**
 * popup.js
 * 
 * Main UI controller for the designmd Chrome extension.
 */

const DEFAULT_MODELS = {
  Gemini: 'gemini-2.0-flash',
  OpenAI: 'gpt-4o',
  Claude: 'claude-sonnet-4-20250514',
  Ollama: 'llama3',
  Custom: 'gpt-4o'
};

let currentTokens = null;
let currentScreenshot = null;
let abortController = null;

// =============== INITIALIZATION ===============

document.addEventListener('DOMContentLoaded', async () => {
  initDarkMode();
  loadSettings();
  initEventListeners();
  await loadHistory();
});

function initDarkMode() {
  const saved = localStorage.getItem('designmd-dark-mode');
  if (saved === 'false') {
    document.body.classList.add('light-mode');
  }
}

function loadSettings() {
  chrome.storage.local.get(['provider', 'model', 'apiKey', 'baseUrl', 'customEndpoint', 'screenshotFormat'], (data) => {
    const provider = data.provider || 'Gemini';
    inputProvider.value = provider;
    inputApiKey.value = data.apiKey || '';
    inputBaseUrl.value = data.baseUrl || 'http://localhost:11434';
    inputCustomEndpoint.value = data.customEndpoint || '';
    inputScreenshotFormat.value = data.screenshotFormat || 'jpeg';

    populateModelDropdown([data.model || DEFAULT_MODELS[provider]]);
    inputModel.value = data.model || DEFAULT_MODELS[provider];

    updateHeader(provider, inputModel.value);
    toggleProviderFields(provider);
  });
}

function initEventListeners() {
  // Provider change
  inputProvider.addEventListener('change', (e) => {
    const provider = e.target.value;
    populateModelDropdown([DEFAULT_MODELS[provider]]);
    inputModel.value = DEFAULT_MODELS[provider];
    inputModelCustom.value = '';
    toggleProviderFields(provider);
  });

  // Toggle API key visibility
  btnToggleKeyVis.addEventListener('click', () => {
    inputApiKey.type = inputApiKey.type === 'password' ? 'text' : 'password';
  });

  // Fetch models
  btnFetchModels.addEventListener('click', fetchModels);

  // Navigation
  btnSettings.addEventListener('click', () => showScreen('settings'));
  btnBack.addEventListener('click', () => showScreen('main'));
  btnOpenHistory.addEventListener('click', () => showScreen('history'));
  btnBackFromHistory.addEventListener('click', () => showScreen('main'));

  // Dark mode toggle
  btnToggleDarkMode.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('designmd-dark-mode', !document.body.classList.contains('light-mode'));
  });

  // Save settings
  btnSaveSettings.addEventListener('click', saveSettings);

  // Export settings
  btnExportSettings.addEventListener('click', exportSettings);

  // Import settings
  btnImportSettings.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = importSettings;
    input.click();
  });

  // Clear history
  btnClearHistory.addEventListener('click', clearHistory);

  // Generate
  btnGenerate.addEventListener('click', generate);

  // Cancel
  btnCancel.addEventListener('click', cancelGeneration);

  // Copy
  btnCopy.addEventListener('click', copyOutput);

  // Download
  btnDownload.addEventListener('click', downloadOutput);

  // Token editor
  btnEditTokens.addEventListener('click', () => showTokenEditor());
  btnCloseTokenEditor.addEventListener('click', () => hideTokenEditor());
  btnCancelTokenEdit.addEventListener('click', () => hideTokenEditor());
  btnSaveTokenEdit.addEventListener('click', saveTokenEdit);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      generate();
    }
    if (e.ctrlKey && e.key === 'c' && document.activeElement !== elOutput) {
      copyOutput();
    }
  });

  // Listen for background messages
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
}

// =============== DOM ELEMENTS ===============

const screens = {
  main: document.getElementById('main-screen'),
  settings: document.getElementById('settings-screen'),
  history: document.getElementById('history-screen')
};

// Settings elements
const inputProvider = document.getElementById('provider');
const inputModel = document.getElementById('model');
const inputModelCustom = document.getElementById('model-custom');
const inputApiKey = document.getElementById('api-key');
const inputBaseUrl = document.getElementById('base-url');
const inputScreenshotFormat = document.getElementById('screenshot-format');
const containerApiKey = document.getElementById('api-key-container');
const containerBaseUrl = document.getElementById('base-url-container');
const inputCustomEndpoint = document.getElementById('custom-endpoint');

const btnBack = document.getElementById('back-btn');
const btnSettings = document.getElementById('open-settings');
const btnFetchModels = document.getElementById('fetch-models');
const btnFetchModelsText = document.getElementById('fetch-models-text');
const btnToggleKeyVis = document.getElementById('toggle-key-vis');
const btnSaveSettings = document.getElementById('save-settings');
const btnExportSettings = document.getElementById('export-settings');
const btnImportSettings = document.getElementById('import-settings');

// Header elements
const elCurrentProvider = document.getElementById('current-provider');
const elCurrentModel = document.getElementById('current-model');

// Main screen elements
const btnGenerate = document.getElementById('generate-btn');
const btnGenerateText = document.getElementById('generate-btn-text');
const btnOpenHistory = document.getElementById('open-history');
const btnToggleDarkMode = document.getElementById('toggle-dark-mode');

// Preview elements
const elPreviewContainer = document.getElementById('preview-container');
const elPreviewTokens = document.getElementById('preview-tokens');
const elPreviewThumbnail = document.getElementById('preview-thumbnail');
const btnEditTokens = document.getElementById('edit-tokens');

// Loading elements
const elLoadingContainer = document.getElementById('loading-container');
const elLoadingText = document.getElementById('loading-text');
const elProgressFill = document.getElementById('progress-fill');
const elProgressPercent = document.getElementById('progress-percent');
const btnCancel = document.getElementById('cancel-btn');

// Output elements
const elOutputContainer = document.getElementById('output-container');
const elOutput = document.getElementById('output');
const btnCopy = document.getElementById('copy-btn');
const btnCopyText = document.getElementById('copy-btn-text');
const btnDownload = document.getElementById('download-btn');

// History elements
const elHistoryList = document.getElementById('history-list');
const btnBackFromHistory = document.getElementById('back-from-history');
const btnClearHistory = document.getElementById('clear-history');

// Token editor elements
const elTokenEditor = document.getElementById('token-editor');
const elTokenEditorInput = document.getElementById('token-editor-input');
const btnCloseTokenEditor = document.getElementById('close-token-editor');
const btnCancelTokenEdit = document.getElementById('cancel-token-edit');
const btnSaveTokenEdit = document.getElementById('save-token-edit');

// Toast
const elToast = document.getElementById('toast');
let toastTimeout = null;

// =============== SCREEN NAVIGATION ===============

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// =============== TOAST ===============

function showToast(message, type = 'info') {
  clearTimeout(toastTimeout);
  elToast.textContent = message;
  elToast.className = 'toast ' + type;
  requestAnimationFrame(() => elToast.classList.add('visible'));
  toastTimeout = setTimeout(() => elToast.classList.remove('visible'), 3000);
}

// =============== SETTINGS ===============

function toggleProviderFields(provider) {
  const customEndpointContainer = document.getElementById('custom-model-container');
  
  if (provider === 'Ollama' || provider === 'Custom') {
    containerApiKey.classList.add('hidden');
    containerBaseUrl.classList.remove('hidden');
    // Show API Endpoint for Custom
    if (provider === 'Custom') {
      customEndpointContainer.classList.remove('hidden');
    } else {
      customEndpointContainer.classList.add('hidden');
    }
  } else {
    containerApiKey.classList.remove('hidden');
    containerBaseUrl.classList.add('hidden');
    customEndpointContainer.classList.add('hidden');
  }
}

function updateHeader(provider, model) {
  elCurrentProvider.textContent = provider;
  elCurrentModel.textContent = model;
}

function populateModelDropdown(models) {
  inputModel.innerHTML = '';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    inputModel.appendChild(opt);
  });
}

function saveSettings() {
  const selectedModel = inputModelCustom.value.trim() || inputModel.value;
  const config = {
    provider: inputProvider.value,
    model: selectedModel,
    apiKey: inputApiKey.value,
    baseUrl: inputBaseUrl.value,
    customEndpoint: inputCustomEndpoint.value,
    screenshotFormat: inputScreenshotFormat.value
  };
  chrome.storage.local.set(config, () => {
    updateHeader(config.provider, config.model);
    showScreen('main');
    showToast('Settings saved', 'success');
  });
}

async function fetchModels() {
  const provider = inputProvider.value;
  const apiKey = inputApiKey.value;
  const baseUrl = inputBaseUrl.value;

  if (provider !== 'Ollama' && !apiKey) {
    showToast(`Enter your ${provider} API key first`, 'error');
    return;
  }

  try {
    btnFetchModels.classList.add('loading');
    btnFetchModelsText.textContent = 'Fetching…';
    let models = [];

    if (provider === 'Gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) throw new Error('Invalid API key');
      const data = await res.json();
      models = data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .sort();

    } else if (provider === 'OpenAI') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!res.ok) throw new Error('Invalid API key');
      const data = await res.json();
      models = data.data.map(m => m.id).filter(id => /^(gpt-|o[1-9])/.test(id)).sort();

    } else if (provider === 'Claude') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        }
      });
      if (!res.ok) throw new Error('Invalid API key');
      const data = await res.json();
      models = (data.data || []).map(m => m.id).sort();

    } else if (provider === 'Ollama') {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/api/tags`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Cannot connect to Ollama');
      const data = await res.json();
      models = (data.models || []).map(m => m.name).sort();

    } else if (provider === 'Custom') {
      // For custom endpoints, fetch from the provided endpoint's /models path
      const endpoint = inputBaseUrl.value.replace(/\/$/, '');
      try {
        const res = await fetch(`${endpoint}/models`, {
          headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
        });
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();
        models = (data.data || data.models || []).map(m => m.id || m.name).sort();
      } catch (e) {
        // If /models fails, just use the custom model directly
        showToast('Could not fetch models, enter manually', 'warning');
      }
    }

    if (models.length > 0) {
      populateModelDropdown(models);
      inputModel.value = models[0];
      showToast(`Found ${models.length} models`, 'success');
    } else {
      showToast('No models found', 'warning');
    }

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnFetchModels.classList.remove('loading');
    btnFetchModelsText.textContent = 'Fetch';
  }
}

function exportSettings() {
  chrome.storage.local.get(['provider', 'model', 'apiKey', 'baseUrl', 'screenshotFormat'], (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'designmd-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Settings exported', 'success');
  });
}

function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      chrome.storage.local.set(data, () => {
        showToast('Settings imported', 'success');
        loadSettings();
      });
    } catch (err) {
      showToast('Invalid settings file', 'error');
    }
  };
  reader.readAsText(file);
}

// =============== GENERATION ===============

async function generate() {
  elOutput.value = '';
  elOutputContainer.classList.add('hidden');
  elPreviewContainer.classList.add('hidden');
  btnGenerate.classList.add('hidden');
  elLoadingContainer.classList.remove('hidden');
  btnCancel.classList.remove('hidden');
  setProgress(0, 'Extracting DOM styles...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');

    // Extract tokens
    setProgress(10, 'Extracting DOM styles...');
    const tokensResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Request tokens from content script
    const tokens = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_TOKENS' }, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });

    if (!tokens) throw new Error('Failed to extract tokens');
    currentTokens = tokens;

    setProgress(30, 'Capturing screenshot...');

    // Get page info
    const pageInfo = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, resolve);
    });

    // Capture screenshot
    const format = inputScreenshotFormat.value;
    const screenshot = await captureFullPageScreenshot(tab.id, pageInfo, format);
    currentScreenshot = screenshot;

    setProgress(50, 'Preparing preview...');

    // Show preview
    showPreview(tokens, screenshot);

    setProgress(60, 'Sending to AI...');
    btnCancel.classList.add('hidden');

    // Send to background for AI processing
    const settings = await new Promise(resolve => chrome.storage.local.get(['provider', 'model', 'apiKey', 'baseUrl', 'customEndpoint'], resolve));

    abortController = new AbortController();

    // Send generate request
    chrome.runtime.sendMessage({
      type: 'GENERATE',
      provider: settings.provider || 'Gemini',
      model: settings.model || DEFAULT_MODELS['Gemini'],
      apiKey: settings.apiKey,
      baseUrl: settings.customEndpoint || settings.baseUrl,
      tokens: currentTokens,
      screenshotBase64: currentScreenshot
    }, (response) => {
      if (response.error) {
        showToast(response.error, 'error');
        resetUI();
      }
    });

    elOutputContainer.classList.remove('hidden');

  } catch (err) {
    resetUI();
    showToast(err.message, 'error');
  }
}

function setProgress(percent, text) {
  elProgressFill.style.width = `${percent}%`;
  elProgressPercent.textContent = `${percent}%`;
  elLoadingText.textContent = text;
}

function showPreview(tokens, screenshot) {
  const summary = JSON.stringify(tokens, null, 2).slice(0, 500) + '...';
  elPreviewTokens.textContent = summary;

  if (screenshot) {
    elPreviewThumbnail.innerHTML = `<img src="${screenshot}" alt="Preview">`;
  }

  elPreviewContainer.classList.remove('hidden');
}

async function captureFullPageScreenshot(tabId, pageInfo, format = 'jpeg') {
  const { scrollHeight, clientHeight, clientWidth, devicePixelRatio } = pageInfo;

  // If page fits in viewport, just capture
  if (scrollHeight <= clientHeight) {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format, quality: 85 });
    return dataUrl;
  }

  // Multi-scroll capture
  const maxSteps = 10; // Limit to avoid rate limiting
  const captures = [];

  // Store original scroll position
  const originalScroll = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({ x: window.scrollX, y: window.scrollY })
  });
  const originalPos = originalScroll[0].result;

  const numSteps = Math.min(Math.ceil(scrollHeight / clientHeight), maxSteps);

  for (let i = 0; i < numSteps; i++) {
    const yOffset = i === numSteps - 1 ? scrollHeight - clientHeight : i * clientHeight;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y) => window.scrollTo(0, y),
      args: [yOffset]
    });

    // Wait for scroll to settle and respect rate limit (1 capture/sec)
    await new Promise(r => setTimeout(r, 1000));

    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format, quality: 100 });
    captures.push({ dataUrl, yOffset });

    setProgress(30 + (15 * i / numSteps), `Capturing screenshot ${i + 1}/${numSteps}...`);
  }

  // Restore original scroll
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (pos) => window.scrollTo(pos.x, pos.y),
    args: [{ x: originalPos.x, y: originalPos.y }]
  });

  // Stitch images
  const canvas = new OffscreenCanvas(
    clientWidth * devicePixelRatio,
    scrollHeight * devicePixelRatio
  );
  const ctx = canvas.getContext('2d');

  for (const cap of captures) {
    const imgBlob = await fetch(cap.dataUrl).then(r => r.blob());
    const imgBitmap = await createImageBitmap(imgBlob);
    ctx.drawImage(imgBitmap, 0, cap.yOffset * devicePixelRatio);
    imgBitmap.close();
  }

  // Resize if too large
  const MAX_DIM = 2560;
  let finalCanvas = canvas;
  if (canvas.width > MAX_DIM || canvas.height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(canvas.width, canvas.height);
    finalCanvas = new OffscreenCanvas(canvas.width * scale, canvas.height * scale);
    const scaledCtx = finalCanvas.getContext('2d');
    scaledCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);
  }

  const finalBlob = await finalCanvas.convertToBlob({ 
    type: `image/${format}`, 
    quality: format === 'png' ? 1 : 0.85 
  });

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(finalBlob);
  });
}

function cancelGeneration() {
  if (abortController) {
    abortController.abort();
    showToast('Generation cancelled', 'warning');
  }
  resetUI();
}

function resetUI() {
  elLoadingContainer.classList.add('hidden');
  btnGenerate.classList.remove('hidden');
  btnCancel.classList.add('hidden');
  elProgressFill.style.width = '0%';
}

function handleBackgroundMessage(msg) {
  if (msg.type === 'CHUNK') {
    setProgress(70 + (msg.percent || 0), 'Receiving response...');
    elOutput.value += msg.text;
    elOutput.scrollTop = elOutput.scrollHeight;
  } else if (msg.type === 'DONE') {
    setProgress(100, 'Complete!');
    setTimeout(() => {
      resetUI();
      btnGenerateText.textContent = 'Regenerate';
      showToast('design.md generated successfully', 'success');
      saveToHistory();
    }, 500);
  } else if (msg.type === 'ERROR') {
    showToast(msg.message, 'error');
    resetUI();
  } else if (msg.type === 'PROGRESS') {
    setProgress(msg.percent, msg.text);
  }
}

async function saveToHistory() {
  if (!currentTokens) return;

  try {
    const settings = await new Promise(resolve => chrome.storage.local.get(['provider', 'model'], resolve));

    // Create thumbnail
    let thumbnail = null;
    if (currentScreenshot) {
      thumbnail = await createThumbnail(currentScreenshot);
    }

    // Save to IndexedDB via background
    chrome.runtime.sendMessage({
      type: 'SAVE_HISTORY',
      data: {
        url: window.location?.href || 'unknown',
        title: currentTokens.metadata?.title || 'Untitled',
        tokens: currentTokens,
        screenshot: currentScreenshot,
        screenshotThumbnail: thumbnail,
        output: elOutput.value,
        provider: settings.provider,
        model: settings.model
      }
    });
  } catch (err) {
    console.warn('Failed to save history:', err);
  }
}

async function createThumbnail(imageDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const maxWidth = 200;
      const ratio = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * ratio;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

// =============== OUTPUT ACTIONS ===============

function copyOutput() {
  navigator.clipboard.writeText(elOutput.value).then(() => {
    btnCopy.classList.add('copied');
    btnCopyText.textContent = 'Copied!';
    showToast('Copied to clipboard', 'success');
    setTimeout(() => {
      btnCopy.classList.remove('copied');
      btnCopyText.textContent = 'Copy';
    }, 2000);
  });
}

function downloadOutput() {
  const blob = new Blob([elOutput.value], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'design.md';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloading design.md', 'success');
}

// =============== HISTORY ===============

async function loadHistory() {
  try {
    const history = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, resolve);
    });

    elHistoryList.innerHTML = '';

    if (!history || history.length === 0) {
      elHistoryList.innerHTML = '<div class="history-empty">No extractions yet</div>';
      return;
    }

    for (const item of history) {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        ${item.screenshotThumbnail ? `<img class="history-thumbnail" src="${item.screenshotThumbnail}" alt="">` : '<div class="history-thumbnail"></div>'}
        <div class="history-info">
          <div class="history-title">${escapeHtml(item.title || 'Untitled')}</div>
          <div class="history-url">${escapeHtml(item.url || '')}</div>
          <div class="history-meta">${item.provider} · ${item.model} · ${formatDate(item.timestamp)}</div>
        </div>
        <div class="history-actions">
          <button class="btn-sm load-history" data-id="${item.id}">Load</button>
          <button class="btn-sm delete-history" data-id="${item.id}">Delete</button>
        </div>
      `;
      elHistoryList.appendChild(el);
    }

    // Add event listeners
    elHistoryList.querySelectorAll('.load-history').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadHistoryItem(btn.dataset.id);
      });
    });

    elHistoryList.querySelectorAll('.delete-history').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHistoryItem(btn.dataset.id);
      });
    });

  } catch (err) {
    elHistoryList.innerHTML = '<div class="history-empty">Failed to load history</div>';
  }
}

function loadHistoryItem(id) {
  chrome.runtime.sendMessage({ type: 'LOAD_HISTORY_ITEM', id }, (item) => {
    if (item) {
      currentTokens = item.tokens;
      currentScreenshot = item.screenshot;
      elOutput.value = item.output || '';
      elOutputContainer.classList.remove('hidden');

      if (item.screenshot) {
        elPreviewThumbnail.innerHTML = `<img src="${item.screenshot}" alt="Preview">`;
        elPreviewContainer.classList.remove('hidden');
      }

      showScreen('main');
      showToast('History item loaded', 'success');
    }
  });
}

function deleteHistoryItem(id) {
  chrome.runtime.sendMessage({ type: 'DELETE_HISTORY', id }, () => {
    loadHistory();
    showToast('Item deleted', 'success');
  });
}

async function clearHistory() {
  if (!confirm('Clear all history?')) return;

  chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
    loadHistory();
    showToast('History cleared', 'success');
  });
}

// =============== TOKEN EDITOR ===============

function showTokenEditor() {
  elTokenEditorInput.value = JSON.stringify(currentTokens, null, 2);
  elTokenEditor.classList.remove('hidden');
}

function hideTokenEditor() {
  elTokenEditor.classList.add('hidden');
}

function saveTokenEdit() {
  try {
    currentTokens = JSON.parse(elTokenEditorInput.value);
    elPreviewTokens.textContent = JSON.stringify(currentTokens, null, 2).slice(0, 500) + '...';
    elTokenEditor.classList.add('hidden');
    showToast('Tokens updated', 'success');
  } catch (err) {
    showToast('Invalid JSON', 'error');
  }
}

// =============== UTILITIES ===============

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}
