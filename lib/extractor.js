/**
 * lib/extractor.js
 * 
 * DOM/CSS extraction logic - used by content script for token extraction.
 * This is a fallback/reference implementation that can be injected directly.
 */

function extractDesignSystem() {
  const allElements = Array.from(document.querySelectorAll('body *'));
  const sampleElements = allElements.length > 150
    ? [document.body, ...getRandomSample(allElements, 150)]
    : [document.body, ...allElements];

  const designSystem = {
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
    }
  };

  return designSystem;

  function getRandomSample(arr, size) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
  }

  function getMetadata() {
    const title = document.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    return {
      title: title || 'No Title',
      description: metaDesc ? metaDesc.getAttribute('content') : ''
    };
  }

  function getFrequencyMap(elements, cssProperty, ignoreValues = []) {
    const freqMap = {};
    const defaultIgnore = ['rgba(0, 0, 0, 0)', 'transparent', '0px', 'none', 'normal', 'auto', '0s', '0px 0px', '0px 0px 0px'];
    const skipValues = new Set([...defaultIgnore, ...ignoreValues]);

    elements.forEach(el => {
      try {
        const style = window.getComputedStyle(el);
        const value = style[cssProperty];
        if (value && !skipValues.has(value) && !value.includes('initial')) {
          freqMap[value] = (freqMap[value] || 0) + 1;
        }
      } catch (e) {}
    });
    return freqMap;
  }

  function getTopValues(freqMap, limit) {
    return Object.entries(freqMap)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, limit);
  }

  function getCSSVariables() {
    const variables = {};
    try {
      for (const sheet of document.styleSheets) {
        if (sheet.href && !sheet.href.startsWith(window.location.origin)) continue;
        try {
          for (const rule of sheet.cssRules) {
            if (rule.style) {
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                if (prop.startsWith('--')) {
                  variables[prop] = rule.style.getPropertyValue(prop).trim();
                }
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
    return variables;
  }
}

// For direct execution
if (typeof window !== 'undefined') {
  window.extractDesignSystem = extractDesignSystem;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractDesignSystem };
}
