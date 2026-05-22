/**
 * NotebookLM Hybrid Exporter - Popup Script
 * Combined logic for Quiz and Flashcard extraction.
 */

const resultElement = document.getElementById('result');
const quizSection = document.getElementById('quiz-section');
const flashcardSection = document.getElementById('flashcard-section');
const noDataMsg = document.getElementById('no-data-msg');
const quizCountEl = document.getElementById('quiz-count');
const flashCountEl = document.getElementById('flash-count');
const includeQuizToggle = document.getElementById('includeQuizAnswers');
const includeFlashToggle = document.getElementById('includeFlashAnswers');

let currentQuizData = null;
let currentFlashData = null;

const clean = (text) => {
    if (!text) return "";
    let cleaned = text.replace(/\$([^$]+)\$/g, '$1');
    cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
    return cleaned.trim();
};

const escapeCsv = (str) => {
    if (!str) return '""';
    return '"' + str.replace(/"/g, '""') + '"';
};

const downloadFile = (content, fileName, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const init = () => {
    resultElement.innerText = 'Taranıyor...';

    const scanTimeout = setTimeout(() => {
        if (!currentQuizData && !currentFlashData) {
            const noDataEl = document.querySelector('#no-data-msg p');
            if (noDataEl) {
                noDataEl.innerHTML = "<b>Veri bulunamadı.</b><br>Lütfen NotebookLM'de bir Çalışma Rehberi (Test veya Çalışma Kartları) açtığınızdan emin olun.";
                resultElement.innerText = "Bekleniyor...";
            }
        }
    }, 4000);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];

        if (!activeTab || !activeTab.url.includes('https://notebooklm.google.com/')) {
            clearTimeout(scanTimeout);
            resultElement.innerText = 'Başlamak için NotebookLM sayfasına gidin.';
            return;
        }

        chrome.scripting.executeScript(
            { target: { tabId: activeTab.id, allFrames: true }, files: ['content.js'] },
            () => {
                if (chrome.runtime.lastError) {
                    clearTimeout(scanTimeout);
                    resultElement.innerText = `Bağlantı hatası: ${chrome.runtime.lastError.message}`;
                    return;
                }

                chrome.tabs.sendMessage(activeTab.id, { action: "extractData" }, (response) => {
                    if (chrome.runtime.lastError || !response || !response.success) {
                        return;
                    }

                    clearTimeout(scanTimeout);

                    const hasQuiz = response.quiz && response.quiz.length > 0;
                    const hasFlash = response.flashcards && response.flashcards.length > 0;

                    if (hasQuiz || hasFlash) {
                        noDataMsg.classList.add('hidden');
                        resultElement.innerText = 'Doküman Hazır.';
                    }

                    if (hasQuiz) {
                        currentQuizData = response.quiz;
                        quizSection.classList.remove('hidden');
                        quizCountEl.innerText = `${response.quiz.length} Soru`;
                    }

                    if (hasFlash) {
                        currentFlashData = response.flashcards;
                        flashcardSection.classList.remove('hidden');
                        flashCountEl.innerText = `${response.flashcards.length} Kart`;
                    }
                });
            }
        );
    });
};

const exportQuiz = (format) => {
    if (!currentQuizData) return;

    if (format === 'csv') {
        let csvContent = '\uFEFF';
        csvContent += 'Soru;A Seçeneği;B Seçeneği;C Seçeneği;D Seçeneği;Doğru Cevap;Açıklama\n';
        currentQuizData.forEach(q => {
            const options = (q.answerOptions || []).map(opt => escapeCsv(clean(opt.text)));
            while (options.length < 4) options.push('""');
            const correctIndex = (q.answerOptions || []).findIndex(o => o.isCorrect);
            const correctLetter = correctIndex !== -1 ? String.fromCharCode(65 + correctIndex) : '';
            const correctText = q.answerOptions[correctIndex]?.text || '';
            const includeAnswers = includeQuizToggle.checked;

            const row = [
                escapeCsv(clean(q.question)),
                ...options.slice(0, 4),
                includeAnswers ? escapeCsv(`${correctLetter}) ${clean(correctText)}`) : '""',
                includeAnswers ? escapeCsv(clean(q.answerOptions[correctIndex]?.rationale || '')) : '""'
            ];
            csvContent += row.join(';') + '\n';
        });
        downloadFile(csvContent, 'notebooklm_test_questions.csv', 'text/csv;charset=utf-8;');
    } else {
        const rows = currentQuizData.map((q, index) => {
            const correctIndex = (q.answerOptions || []).findIndex(o => o.isCorrect);
            const correctLetter = correctIndex !== -1 ? String.fromCharCode(65 + correctIndex) : '';
            const includeAnswers = includeQuizToggle.checked;

            const optionsHtml = q.answerOptions.map((opt, i) =>
                `<div>${String.fromCharCode(65 + i)}) ${clean(opt.text)}</div>`
            ).join('');

            return `
                <div style="margin-bottom: 20px;">
                    <div style="font-weight: bold; background: #f0f0f0; padding: 10px;">${index + 1}. ${clean(q.question)}</div>
                    <div style="padding: 10px;">${optionsHtml}</div>
                    ${includeAnswers ? `
                        <div style="color: green; font-weight: bold;">Doğru Cevap: ${correctLetter}) ${clean(q.answerOptions[correctIndex]?.text || '')}</div>
                        <div style="font-style: italic; color: #666;">Açıklama: ${clean(q.answerOptions[correctIndex]?.rationale || '')}</div>
                    ` : ''}
                </div>`;
        }).join('<hr>');
        const html = `
            <html>
                <body style="font-family: Arial; padding: 20px;">
                    <h2 style="color: #4f46e5; padding-bottom: 10px;">NotebookLM Test Soruları</h2>
                    ${rows}
                </body>
            </html>`;
        downloadFile('\uFEFF' + html, 'notebooklm_test_questions.doc', 'application/msword;charset=utf-8');
    }
};

const exportFlash = (format) => {
    if (!currentFlashData) return;

    if (format === 'csv') {
        const includeAnswers = includeFlashToggle.checked;
        const csvData = currentFlashData.map(card => {
            const front = escapeCsv(clean(card.f));
            const back = includeAnswers ? escapeCsv(clean(card.b)) : '""';
            return `${front};${back}`;
        }).join('\n');
        downloadFile('\uFEFF' + csvData, 'notebooklm_flashcards.csv', 'text/csv;charset=utf-8;');
    } else {
        const includeAnswers = includeFlashToggle.checked;
        const rows = currentFlashData.map(card => `
            <tr>
              <td style="border: 1px solid #ccc; padding: 10px; width: 40%; vertical-align: top;">${clean(card.f)}</td>
              <td style="border: 1px solid #ccc; padding: 10px; width: 60%; vertical-align: top;">${includeAnswers ? clean(card.b) : ''}</td>
            </tr>`).join('');
        const html = `
            <html>
                <body style="font-family: Arial; padding: 20px;">
                    <h2 style="color: #4f46e5; padding-bottom: 10px;">NotebookLM Çalışma Kartları</h2>
                    <table style="border-collapse: collapse; width: 100%;">
                        <thead><tr style="background-color: #f2f2f2;"><th>Soru</th><th>Cevap</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </body>
            </html>`;
        downloadFile('\uFEFF' + html, 'notebooklm_flashcards.doc', 'application/msword;charset=utf-8');
    }
};

document.getElementById('extractQuizCsv').addEventListener('click', () => exportQuiz('csv'));
document.getElementById('extractQuizWord').addEventListener('click', () => exportQuiz('word'));
document.getElementById('extractFlashCsv').addEventListener('click', () => exportFlash('csv'));
document.getElementById('extractFlashWord').addEventListener('click', () => exportFlash('word'));

init();
