/**
 * content.js
 * 
 * Persistent content script that runs on every page.
 * Provides Shadow DOM traversal, CSS-in-JS detection, and extraction utilities.
 */

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRACT_TOKENS") {
    const tokens = extractDesignSystem();
    sendResponse(tokens);
  } else if (request.type === "CAPTURE_SCREENSHOT") {
    captureScreenshot(request.options)
      .then(screenshot => sendResponse({ success: true, screenshot }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  } else if (request.type === "SCROLL_PAGE") {
    scrollToPosition(request.y)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (request.type === "GET_PAGE_INFO") {
    const info = getPageInfo();
    sendResponse(info);
  }
  return true;
});

/**
 * Main extraction function - extracts design system from the page
 */
function extractDesignSystem() {
  const allElements = gatherAllElements();
  const sampleElements = sampleFromElements(allElements, 150);

  return {
    metadata: getMetadata(),
    colors: {
      cssVariables: getCSSVariables(),
      background: getTopValues(getFrequencyMap(sampleElements, 'backgroundColor'), 10),
      text: getTopValues(getFrequencyMap(sampleElements, 'color'), 10),
      border: getTopValues(getFrequencyMap(sampleElements, 'borderColor'), 10)
    },
    typography: {
      fontFamilies: getTopValues(getFrequencyMap(sampleElements, 'fontFamily'), 5),
      fontSizes: getTopValues(getFrequencyMap(sampleElements, 'fontSize'), 8),
      fontWeights: getTopValues(getFrequencyMap(sampleElements, 'fontWeight'), 5),
      lineHeights: getTopValues(getFrequencyMap(sampleElements, 'lineHeight'), 8),
      letterSpacings: getTopValues(getFrequencyMap(sampleElements, 'letterSpacing'), 5)
    },
    spacing: {
      padding: getTopValues(getFrequencyMap(sampleElements, 'padding'), 10),
      margin: getTopValues(getFrequencyMap(sampleElements, 'margin'), 10)
    },
    borders: {
      radius: getTopValues(getFrequencyMap(sampleElements, 'borderRadius'), 5)
    },
    effects: {
      boxShadows: getTopValues(getFrequencyMap(sampleElements, 'boxShadow', ['none']), 5)
    },
    animations: {
      transitions: getTopValues(getFrequencyMap(sampleElements, 'transitionDuration', ['0s']), 5)
    },
    cssInJs: detectCSSInJS(),
    tailwind: detectTailwind(),
    pseudoElements: extractPseudoElements(sampleElements),
    keyframes: extractKeyframes()
  };
}

/**
 * Gather all elements including Shadow DOM
 */
function gatherAllElements() {
  const elements = [];
  
  function traverse(root) {
    try {
      const children = root.querySelectorAll('*');
      for (const el of children) {
        elements.push(el);
        // Traverse into shadow DOMs
        if (el.shadowRoot) {
          traverse(el.shadowRoot);
        }
      }
    } catch (e) {
      // Cross-origin or security restrictions
    }
  }

  traverse(document);
  
  // Also get elements from open shadow roots
  const allShadowHosts = document.querySelectorAll('*');
  for (const host of allShadowHosts) {
    if (host.shadowRoot && host.shadowRoot.mode === 'open') {
      traverse(host.shadowRoot);
    }
  }

  return elements;
}

/**
 * Smart sampling that covers semantic element types
 */
function sampleFromElements(elements, limit) {
  if (elements.length <= limit) return elements;

  // Group by tag name for semantic coverage
  const byTag = {};
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    if (!byTag[tag]) byTag[tag] = [];
    byTag[tag].push(el);
  }

  const sampled = [];
  
  // Always include body
  sampled.push(document.body);
  
  // Sample from each tag group
  const tags = Object.keys(byTag);
  const perTag = Math.max(1, Math.floor((limit - 1) / Math.min(tags.length, 20)));
  
  for (const tag of tags) {
    const group = byTag[tag];
    if (group.length <= perTag) {
      sampled.push(...group);
    } else {
      // Random sample from group
      const shuffled = group.sort(() => 0.5 - Math.random());
      sampled.push(...shuffled.slice(0, perTag));
    }
    if (sampled.length >= limit) break;
  }

  return sampled.slice(0, limit);
}

/**
 * Detect CSS-in-JS frameworks
 */
function detectCSSInJS() {
  const detected = [];

  // styled-components
  const styledComponents = document.querySelector('style[id^="styled-components"]');
  if (styledComponents || document.querySelector('[data-styled]')) {
    detected.push('styled-components');
  }

  // Emotion
  const emotionStyles = document.querySelectorAll('style[data-emotion]');
  if (emotionStyles.length > 0 || document.querySelector('[data-emotion]')) {
    detected.push('emotion');
  }

  // JSS
  const jssSheets = document.querySelectorAll('[data-jss]');
  if (jssSheets.length > 0) {
    detected.push('jss');
  }

  // Goober
  if (document.querySelector('style[id^="goober"]')) {
    detected.push('goober');
  }

  // Extract inline styles that look like CSS-in-JS
  const inlineStyles = document.querySelectorAll('style');
  for (const style of inlineStyles) {
    const text = style.textContent || '';
    if (text.includes('function') && text.includes('style')) {
      if (!detected.includes('lit')) detected.push('lit');
    }
    // Check for emotion/styled-components pattern
    if (text.match(/\bc\s*=/)) {
      if (!detected.includes('emotion')) detected.push('emotion-suspicious');
    }
  }

  return [...new Set(detected)];
}

/**
 * Detect Tailwind CSS usage
 */
function detectTailwind() {
  const indicators = {
    hasTailwindClasses: false,
    hasTailwindConfig: false,
    detectedVersion: null
  };

  // Check for Tailwind-specific class patterns
  // Common patterns: bg-, text-, px-, py-, flex-, grid-, etc.
  const tailwindPatterns = [
    /\bbg-[a-z]+\d*\b/,
    /\btext-[a-z]+\d*\b/,
    /\bpx-\d+\b/,
    /\bpy-\d+\b/,
    /\bm-\d+\b/,
    /\bp-\d+\b/,
    /\bflex\b/,
    /\bgrid\b/,
    /\bblock\b/,
    /\binline\b/,
    /\bhover:[a-z-]+\d*\b/,
    /\bsm:[a-z-]+\d*\b/,
    /\bmd:[a-z-]+\d*\b/,
    /\blg:[a-z-]+\d*\b/
  ];

  // Scan class attributes
  const allElements = document.querySelectorAll('[class]');
  let matchCount = 0;

  for (const el of allElements) {
    const className = el.className || '';
    for (const pattern of tailwindPatterns) {
      if (pattern.test(className)) {
        matchCount++;
        if (matchCount >= 5) {
          indicators.hasTailwindClasses = true;
          break;
        }
      }
    }
    if (indicators.hasTailwindClasses) break;
  }

  // Check for Tailwind config script
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const text = script.textContent || '';
    if (text.includes('tailwind') && text.includes('config')) {
      indicators.hasTailwindConfig = true;
    }
    // Check for Tailwind CDN or script
    if (text.includes('cdn.tailwindcss.com') || text.includes('unpkg.com/tailwindcss')) {
      indicators.detectedVersion = 'cdn';
    }
  }

  // Check link tags for Tailwind
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  for (const link of links) {
    const href = link.href || '';
    if (href.includes('tailwind')) {
      indicators.hasTailwindConfig = true;
    }
  }

  return indicators;
}

/**
 * Extract pseudo-element styles
 */
function extractPseudoElements(elements) {
  const pseudoStyles = {
    '::before': [],
    '::after': [],
    '::first-line': [],
    '::first-letter': [],
    '::selection': []
  };

  const testElements = elements.slice(0, 50);
  
  for (const el of testElements) {
    try {
      const style = getComputedStyle(el);
      
      for (const pseudo of Object.keys(pseudoStyles)) {
        const content = style.getPropertyValue('content', pseudo);
        const bgColor = style.getPropertyValue('background-color', pseudo);
        const color = style.getPropertyValue('color', pseudo);
        
        if (content && content !== 'none' && content !== '""') {
          pseudoStyles[pseudo].push({
            element: el.tagName.toLowerCase(),
            content: content,
            bgColor: bgColor,
            color: color
          });
        }
      }
    } catch (e) {
      // Skip elements where we can't get pseudo styles
    }
  }

  // Dedupe and limit
  for (const pseudo of Object.keys(pseudoStyles)) {
    const seen = new Set();
    pseudoStyles[pseudo] = pseudoStyles[pseudo].filter(item => {
      const key = item.content + item.bgColor;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }

  return pseudoStyles;
}

/**
 * Extract keyframe animations
 */
function extractKeyframes() {
  const keyframes = {};

  try {
    const sheets = document.styleSheets;
    
    for (const sheet of sheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            const name = rule.name;
            const steps = [];
            
            for (let i = 0; i < rule.cssRules.length; i++) {
              const step = rule.cssRules[i];
              steps.push({
                percent: step.keyText,
                properties: step.style.cssText
              });
            }
            
            keyframes[name] = {
              steps: steps.slice(0, 10),
              from: rule.cssText
            };
          }
        }
      } catch (e) {
        // Skip cross-origin sheets
      }
    }
  } catch (e) {
    // Security restrictions
  }

  return keyframes;
}

/**
 * Get page metadata
 */
function getMetadata() {
  return {
    title: document.title || 'No Title',
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    url: window.location.href,
    platform: detectPlatform()
  };
}

/**
 * Detect known platforms
 */
function detectPlatform() {
  const html = document.documentElement.outerHTML;
  
  const platforms = {
    'squarespace': /sqs-grid|page-content|squarespace/i,
    'webflow': /wf-|webflow-|cms-/i,
    'shopify': /shopify|shopify-theme/i,
    'wordpress': /wp-content|wordpress/i,
    'wix': /wix|dyn|wixEditor/i,
    'framer': /framer|framer-motion/i,
    'nextjs': /__next|NEXT_DATA|next-js/i,
    'react': /react|vite|_jsx/i,
    'gatsby': /gatsby|__gatsby|i18next/i,
    'vue': /vuejs|nuxt|Vue/,
    'angular': /ng-|angular/i
  };

  for (const [name, pattern] of Object.entries(platforms)) {
    if (pattern.test(html)) return name;
  }

  return 'unknown';
}

/**
 * Get CSS variables from all stylesheets
 */
function getCSSVariables() {
  const variables = {};

  try {
    for (const sheet of document.styleSheets) {
      if (sheet.href && !sheet.href.startsWith(window.location.origin)) {
        // Try to fetch cross-origin sheet
        continue;
      }
      
      try {
        for (const rule of sheet.cssRules) {
          extractVarsFromRule(rule, variables);
        }
      } catch (e) {
        // Skip inaccessible rules
      }
    }
  } catch (e) {
    // Security restrictions
  }

  // Also get from inline styles
  const inlineStyles = document.querySelectorAll('style');
  for (const style of inlineStyles) {
    try {
      const sheet = style.sheet;
      if (sheet) {
        for (const rule of sheet.cssRules) {
          extractVarsFromRule(rule, variables);
        }
      }
    } catch (e) {}
  }

  return variables;
}

function extractVarsFromRule(rule, variables) {
  if (rule.style) {
    for (let i = 0; i < rule.style.length; i++) {
      const prop = rule.style[i];
      if (prop.startsWith('--')) {
        variables[prop] = rule.style.getPropertyValue(prop).trim();
      }
    }
  }
  
  if (rule.cssRules) {
    for (const child of rule.cssRules) {
      extractVarsFromRule(child, variables);
    }
  }
}

/**
 * Get frequency map for computed styles
 */
function getFrequencyMap(elements, cssProperty, ignoreValues = []) {
  const freqMap = {};
  const defaultIgnore = ['rgba(0, 0, 0, 0)', 'transparent', '0px', 'none', 'normal', 'auto', '0s', '0px 0px', '0px 0px 0px', 'initial', 'inherit'];
  const skipValues = new Set([...defaultIgnore, ...ignoreValues]);

  for (const el of elements) {
    try {
      const style = window.getComputedStyle(el);
      const value = style[cssProperty];
      if (value && !skipValues.has(value) && !value.includes('initial')) {
        freqMap[value] = (freqMap[value] || 0) + 1;
      }
    } catch (e) {}
  }

  return freqMap;
}

/**
 * Get top values from frequency map
 */
function getTopValues(freqMap, limit) {
  return Object.entries(freqMap)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0])
    .slice(0, limit);
}

/**
 * Capture screenshot at current viewport
 */
async function captureScreenshot(options = {}) {
  const { format = 'jpeg', quality = 85 } = options;
  
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'CAPTURE_VIEWPORT',
      format,
      quality
    }, response => {
      if (response.success) {
        resolve(response.dataUrl);
      } else {
        reject(new Error(response.error || 'Screenshot failed'));
      }
    });
  });
}

/**
 * Scroll to a specific Y position
 */
async function scrollToPosition(y) {
  return new Promise((resolve) => {
    window.scrollTo(0, y);
    setTimeout(resolve, 300);
  });
}

/**
 * Get page dimensions info
 */
function getPageInfo() {
  return {
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    devicePixelRatio: window.devicePixelRatio || 1,
    scrollY: window.scrollY,
    scrollX: window.scrollX
  };
}

// Signal that content script is ready
console.log('[designmd] Content script loaded');
