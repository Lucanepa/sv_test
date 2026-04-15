/* ============================================================
   SSK ZK Prep — Shared Utilities
   Used by all quiz pages (card_game, test_real, check_question)
   ============================================================ */

// --- Language ---

var SUPPORTED_LANGS = ['de', 'en', 'fr', 'it'];

function getSelectedLang() {
    var stored = localStorage.getItem('selectedLang');
    if (SUPPORTED_LANGS.indexOf(stored) !== -1) return stored;

    // Detect from browser language (e.g. "de-CH" -> "de")
    var browserLangs = (navigator.languages || [navigator.language || '']);
    for (var i = 0; i < browserLangs.length; i++) {
        var code = browserLangs[i].split('-')[0].toLowerCase();
        if (SUPPORTED_LANGS.indexOf(code) !== -1) return code;
    }

    return 'en';
}

// --- Data Loading ---

/**
 * Load question data for the current language.
 * Tries localStorage cache first, falls back to fetching the JSON file.
 * Resolves cached diagram base64 URLs.
 * @returns {Promise<Array>} Raw question array
 */
async function loadQuestionData() {
    var lang = getSelectedLang();
    var cacheKey = 'offlineQuestions_' + lang;
    var data = null;

    // Try localStorage cache
    var cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            data = JSON.parse(cached);
            console.log('Using cached questions for ' + lang.toUpperCase());
        } catch (e) {
            localStorage.removeItem(cacheKey);
        }
    }

    // Fetch from file
    if (!data) {
        var response = await fetch('questions_' + lang + '.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        data = await response.json();
        console.log('Loaded questions from server for ' + lang.toUpperCase());
    }

    // Replace image URLs with cached base64 diagrams
    var cachedDiagrams = localStorage.getItem('offlineDiagrams');
    if (cachedDiagrams) {
        try {
            var diagrams = JSON.parse(cachedDiagrams);
            data.forEach(function (question) {
                if (question.image_url && diagrams[question.image_url]) {
                    question.image_url = diagrams[question.image_url];
                }
            });
        } catch (e) { /* ignore parse errors */ }
    }

    return data;
}

// --- Shuffle ---

/**
 * Fisher-Yates shuffle with crypto.getRandomValues when available.
 * @param {Array} array
 * @returns {Array} New shuffled array
 */
function shuffleArray(array) {
    var shuffled = array.slice();
    var randomValues;

    try {
        randomValues = new Uint32Array(shuffled.length);
        crypto.getRandomValues(randomValues);
    } catch (e) {
        randomValues = new Uint32Array(shuffled.length);
        for (var i = 0; i < shuffled.length; i++) {
            randomValues[i] = Math.floor(Math.random() * 0x100000000);
        }
    }

    for (var i = shuffled.length - 1; i > 0; i--) {
        var j = randomValues[i] % (i + 1);
        var temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
    }

    return shuffled;
}

// --- Linked Question Helpers ---

/**
 * Build a Map of linked question groups from raw question data.
 * Each key is the base question number, value is an array sorted by link_order.
 * @param {Array} questions - Raw question array
 * @returns {Map}
 */
function buildLinkGroups(questions) {
    var linkGroups = new Map();

    questions.forEach(function (question) {
        if (question.linked_to) {
            var baseNumber = question.linked_to;
            if (!linkGroups.has(baseNumber)) {
                linkGroups.set(baseNumber, []);
            }
            linkGroups.get(baseNumber).push(question);
        }
    });

    linkGroups.forEach(function (groupQuestions) {
        groupQuestions.sort(function (a, b) { return a.link_order - b.link_order; });
    });

    return linkGroups;
}

/**
 * Check if a question is referenced as a linked_to target by any other question.
 * @param {Object} question
 * @param {Array} allQuestions
 * @returns {boolean}
 */
function isLinkedTarget(question, allQuestions) {
    return allQuestions.some(function (q) {
        return q.linked_to === question.question_number;
    });
}

// --- Search Highlight ---

/**
 * Highlight search term matches in text (HTML output).
 * Escapes regex special characters to prevent crashes.
 * @param {string} text
 * @param {string} searchTerm
 * @returns {string} HTML with <span class="highlight"> wrappers
 */
function highlightSearchTerm(text, searchTerm) {
    if (!searchTerm) return text;
    var escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('(' + escaped + ')', 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}
