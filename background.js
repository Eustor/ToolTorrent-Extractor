/**
 * ToolTorrent Extractor — background.js
 * Service worker mínimo: apenas gerencia downloads via chrome.downloads API,
 * pois essa API não está disponível em content scripts.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    chrome.downloads.download(
      {
        url: message.url,
        filename: message.filename,
        saveAs: message.saveAs || false,
        conflictAction: 'uniquify',
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      }
    );
    // Retorna true para manter o canal sendResponse aberto de forma assíncrona
    return true;
  }
});
