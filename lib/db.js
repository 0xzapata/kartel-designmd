/**
 * lib/db.js
 * 
 * IndexedDB wrapper for storing extraction history.
 * Supports save, retrieve, delete, and list operations.
 */

const DB_NAME = 'designmd';
const DB_VERSION = 1;
const STORE_NAME = 'extractions';
const MAX_ITEMS = 20;

/**
 * Initialize the database
 */
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Save an extraction to history
 */
async function saveExtraction(data) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = {
      url: data.url,
      title: data.title,
      tokens: data.tokens,
      screenshot: data.screenshot, // full screenshot blob
      screenshotThumbnail: data.screenshotThumbnail, // resized thumbnail
      output: data.output,
      provider: data.provider,
      model: data.model,
      timestamp: Date.now()
    };

    const request = store.add(record);
    
    request.onsuccess = () => {
      // Enforce max items by deleting oldest
      enforceMaxItems(tx, store).then(() => {
        resolve(request.result);
      });
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enforce max items limit
 */
async function enforceMaxItems(tx, store) {
  return new Promise((resolve, reject) => {
    const countRequest = store.count();
    
    countRequest.onsuccess = () => {
      if (countRequest.result >= MAX_ITEMS) {
        // Get oldest items
        const index = store.index('timestamp');
        const cursorRequest = index.openCursor();
        
        let deleteCount = countRequest.result - MAX_ITEMS + 1;
        
        cursorRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && deleteCount > 0) {
            cursor.delete();
            deleteCount--;
            cursor.continue();
          } else {
            resolve();
          }
        };
        
        cursorRequest.onerror = () => reject(cursorRequest.error);
      } else {
        resolve();
      }
    };
    
    countRequest.onerror = () => reject(countRequest.error);
  });
}

/**
 * Get all extractions (newest first)
 */
async function getHistory(limit = MAX_ITEMS) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    
    const results = [];
    const cursorRequest = index.openCursor(null, 'prev'); // descending
    
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        const { screenshot, screenshotThumbnail, ...summary } = cursor.value;
        results.push({
          ...summary,
          // Don't include full screenshot in list view
          hasScreenshot: !!screenshot
        });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

/**
 * Get a single extraction by ID
 */
async function getExtraction(id) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a single extraction
 */
async function deleteExtraction(id) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all history
 */
async function clearHistory() {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Create a thumbnail from a screenshot
 */
async function createThumbnail(imageDataUrl, maxWidth = 200) {
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
    img.onerror = () => reject(new Error('Failed to create thumbnail'));
    img.src = imageDataUrl;
  });
}

/**
 * Export history to JSON
 */
async function exportHistory() {
  const history = await getHistory(MAX_ITEMS);
  return JSON.stringify(history, null, 2);
}

/**
 * Import history from JSON
 */
async function importHistory(jsonData) {
  const data = JSON.parse(jsonData);
  const db = await initDB();
  
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  let count = 0;
  for (const item of data) {
    delete item.id; // Let IndexedDB generate new IDs
    delete item.hasScreenshot;
    store.add(item);
    count++;
  }
  
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });
}

// Export for use in popup/background
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initDB,
    saveExtraction,
    getHistory,
    getExtraction,
    deleteExtraction,
    clearHistory,
    createThumbnail,
    exportHistory,
    importHistory
  };
}
