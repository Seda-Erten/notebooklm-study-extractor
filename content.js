/**
 * NotebookLM Hybrid Exporter - Content Script
 * Extracts both Quiz and Flashcard data from app-root.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractData") {
    if (window !== window.top) {
      try {
        var appRoot = document.querySelector('app-root');
        if (appRoot) {
          const dataAttr = appRoot.getAttribute('data-app-data');
          if (dataAttr) {
            const jsonData = JSON.parse(dataAttr);
            
            const quizData = jsonData['quiz'] || null;
            const flashcardsData = jsonData['flashcards'] || null;
            
            if ((!quizData || quizData.length === 0) && (!flashcardsData || flashcardsData.length === 0)) {
              sendResponse({ error: "Bu bölümde ne test ne de flashcard verisi bulunamadı." });
              return true;
            }

            sendResponse({ 
              success: true, 
              quiz: (quizData && Array.isArray(quizData)) ? quizData : [],
              flashcards: (flashcardsData && Array.isArray(flashcardsData)) ? flashcardsData : []
            });
            return true;
          }
        }
      } catch (error) {
        sendResponse({ error: `Hata: ${error.message}` });
        return true;
      }
    }
  }
  return true;
});
