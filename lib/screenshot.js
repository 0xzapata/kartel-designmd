/**
 * lib/screenshot.js
 * 
 * Screenshot capture and stitching utilities.
 */

/**
 * Capture full-page screenshot with scrolling and stitching.
 * 
 * @param {Object} options
 * @param {number} options.maxSteps - Maximum scroll steps (default: 20)
 * @param {number} options.maxDimension - Max dimension in pixels (default: 2560)
 * @param {string} options.format - 'jpeg' or 'png' (default: 'jpeg')
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.85)
 * @param {boolean} options.detectSticky - Try to detect and handle sticky headers
 */
export async function captureFullPageScreenshot(tabId, pageInfo, options = {}) {
  const {
    maxSteps = 20,
    maxDimension = 2560,
    format = 'jpeg',
    quality = format === 'png' ? 1 : 0.85,
    detectSticky = true
  } = options;

  const { scrollHeight, clientHeight, clientWidth, devicePixelRatio } = pageInfo;

  // Single viewport capture
  if (scrollHeight <= clientHeight) {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format, quality });
    return dataUrl;
  }

  // Multi-scroll capture with progress callback
  const numSteps = Math.min(Math.ceil(scrollHeight / clientHeight), maxSteps);
  const captures = [];

  // Store original scroll
  const originalScroll = await executeScript(tabId, () => ({
    x: window.scrollX,
    y: window.scrollY
  }));

  // Detect sticky header height
  let stickyHeaderHeight = 0;
  if (detectSticky) {
    stickyHeaderHeight = await executeScript(tabId, () => {
      const header = document.querySelector('header, nav, [role="banner"]');
      if (header) {
        const style = window.getComputedStyle(header);
        if (style.position === 'fixed' || style.position === 'sticky') {
          return header.offsetHeight;
        }
      }
      return 0;
    });
  }

  // Capture each viewport
  for (let i = 0; i < numSteps; i++) {
    const yOffset = i === numSteps - 1
      ? scrollHeight - clientHeight
      : i * clientHeight;

    // Scroll to position
    await executeScript(tabId, (y) => window.scrollTo(0, y), yOffset);

    // Wait for any animations to settle
    await sleep(300);

    // Capture
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format, quality: 100 });
    captures.push({ dataUrl, yOffset });

    // Yield to prevent UI blocking
    if (i % 3 === 0) {
      await sleep(10);
    }
  }

  // Restore original scroll
  await executeScript(tabId, (pos) => window.scrollTo(pos.x, pos.y), originalScroll);

  // Stitch images together
  const stitchedImage = await stitchImages(captures, clientWidth, scrollHeight, devicePixelRatio);

  // Resize if needed
  const finalImage = await resizeIfNeeded(stitchedImage, maxDimension, format, quality);

  return finalImage;
}

/**
 * Execute script in tab context
 */
async function executeScript(tabId, fn, args = null) {
  const options = {
    target: { tabId },
    func: fn
  };
  if (args !== null) {
    options.args = [args];
  }

  const [result] = await chrome.scripting.executeScript(options);
  return result.result;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Stitch multiple captures into one image
 */
async function stitchImages(captures, width, height, devicePixelRatio) {
  const canvas = new OffscreenCanvas(
    width * devicePixelRatio,
    height * devicePixelRatio
  );
  const ctx = canvas.getContext('2d');

  for (const cap of captures) {
    try {
      const imgBlob = await fetch(cap.dataUrl).then(r => r.blob());
      const imgBitmap = await createImageBitmap(imgBlob);
      ctx.drawImage(imgBitmap, 0, cap.yOffset * devicePixelRatio, canvas.width, clientHeight * devicePixelRatio);
      imgBitmap.close();
    } catch (e) {
      console.warn('[Screenshot] Failed to stitch image:', e);
    }
  }

  return canvas;
}

/**
 * Resize image if dimensions exceed max
 */
async function resizeIfNeeded(canvas, maxDim, format, quality) {
  if (canvas.width <= maxDim && canvas.height <= maxDim) {
    return canvasToDataUrl(canvas, format, quality);
  }

  const scale = maxDim / Math.max(canvas.width, canvas.height);
  const resized = new OffscreenCanvas(
    Math.floor(canvas.width * scale),
    Math.floor(canvas.height * scale)
  );

  const ctx = resized.getContext('2d');
  ctx.drawImage(canvas, 0, 0, resized.width, resized.height);

  return canvasToDataUrl(resized, format, quality);
}

/**
 * Convert OffscreenCanvas to data URL
 */
async function canvasToDataUrl(canvas, format, quality) {
  const blob = await canvas.convertToBlob({ type: `image/${format}`, quality });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Capture just the visible viewport
 */
export async function captureViewport(format = 'jpeg', quality = 0.85) {
  return await chrome.tabs.captureVisibleTab(null, { format, quality });
}

/**
 * Detect if page might have infinite scroll
 */
export async function detectInfiniteScroll(tabId) {
  return await executeScript(tabId, () => {
    // Look for common infinite scroll indicators
    const indicators = [
      document.querySelector('[data-infinite-scroll]'),
      document.querySelector('.infinite-scroll'),
      document.querySelector('[aria-label="Load more"]'),
      document.querySelector('.load-more'),
      // Intersection observer is commonly used for infinite scroll
      window.IntersectionObserver !== undefined
    ];

    return {
      hasInfiniteScroll: indicators.some(Boolean),
      observerPresent: typeof window.IntersectionObserver === 'function'
    };
  });
}

/**
 * Create thumbnail from screenshot
 */
export async function createThumbnail(imageDataUrl, maxWidth = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
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

// Helper to get client height for stitching (used in other contexts)
const clientHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
