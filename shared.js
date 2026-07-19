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

// --- Level (National / Regional) ---

function getSelectedLevel() {
    var stored = localStorage.getItem('selectedLevel');
    return stored === 'regional' ? 'regional' : 'national';
}

/**
 * Filter terms for regional mode: questions containing these are national-only.
 * Covers all 4 languages (DE/EN/FR/IT).
 *
 * League abbreviations are matched case-sensitively as whole words ("LAS" the
 * league, never the "las" inside "verlassen"/"lasciare"). Keywords are matched
 * case-insensitively from a word start, so plurals and compounds still match
 * ("ramasseurs", "escoresheet") but mid-word hits do not ("clasped").
 */
var NATIONAL_ONLY_ABBREVS = ['NLA', 'NLB', 'LNA', 'LNB', 'LFP', 'GFL', 'JFL', 'LAS'];

var NATIONAL_ONLY_KEYWORDS = [
    // eScoresheet
    'escoresheet', 'e-scoresheet', 'escore',
    // Ball boys
    'ballholer', 'raccattapalle', 'raccoglipalle', 'ramasseur', 'ball boy', 'ball-boy', 'ball retriever',
    // Speaker
    'speaker',
    // Substitution paddles
    'paletta', 'palette', 'plaquette', 'paddle',
];

// Matched anywhere in the word: German compounds ("Auswechseltafel") and the
// "e-Scoorsheet" typo that appears verbatim in the question data.
var NATIONAL_ONLY_SUBSTRINGS = ['wechseltafel', 'scoorsheet'];

var NATIONAL_ONLY_PATTERNS = NATIONAL_ONLY_ABBREVS.map(function (abbr) {
    return new RegExp('\\b' + abbr + '\\b');
}).concat(NATIONAL_ONLY_KEYWORDS.map(function (term) {
    return new RegExp('\\b' + term, 'i');
})).concat(NATIONAL_ONLY_SUBSTRINGS.map(function (term) {
    return new RegExp(term, 'i');
}));

/**
 * Union of pattern matches across ALL FOUR language files. Translations word
 * things differently (FR "feuille de match" where DE says "e-Scoresheet"), so
 * per-language text matching alone would filter different questions per
 * language. This pinned set keeps the regional pool identical everywhere.
 * Regenerate after question updates by running isNationalOnly over every
 * questions_*.json and taking the union (see CLAUDE.md).
 */
var NATIONAL_ONLY_QUESTION_NUMBERS = new Set([
    1, 13, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53,
    89, 92, 93, 115, 129, 166, 176, 186, 187, 188, 189, 193, 247,
]);

/**
 * Check if a question is national-only (should be hidden in regional mode).
 * Uses the pinned cross-language set first, then falls back to text patterns
 * so newly added questions are still caught before the set is regenerated.
 * @param {Object} question - Raw question object
 * @returns {boolean} true if national-only
 */
function isNationalOnly(question) {
    if (NATIONAL_ONLY_QUESTION_NUMBERS.has(question.question_number)) return true;
    var text = question.question + ' ' + Object.values(question.answers).join(' ');
    return NATIONAL_ONLY_PATTERNS.some(function (re) { return re.test(text); });
}

/**
 * Filter questions based on current level setting.
 * In regional mode, removes national-only questions and any linked sub-questions
 * whose base question was removed.
 * @param {Array} questions - Raw question array
 * @returns {Array} Filtered array
 */
function filterByLevel(questions) {
    if (getSelectedLevel() === 'national') return questions;

    // Find which base question numbers to exclude
    var excludedBases = new Set();
    questions.forEach(function (q) {
        if (isNationalOnly(q)) {
            excludedBases.add(q.question_number);
            if (q.linked_to) excludedBases.add(q.linked_to);
        }
    });

    return questions.filter(function (q) {
        if (excludedBases.has(q.question_number)) return false;
        if (q.linked_to && excludedBases.has(q.linked_to)) return false;
        return true;
    });
}

// --- Data Loading ---

var DATA_VERSION_KEY = 'offlineDataVersion';

/**
 * Compare metadata.json's lastUpdated stamp with the cached one and drop all
 * offline caches when the published data has changed. No-op while offline or
 * when metadata.json is unavailable, so cached data keeps working.
 * @returns {Promise<Object|null>} Parsed metadata, or null if unavailable
 */
async function checkDataVersion() {
    try {
        var response = await fetch('metadata.json', { cache: 'no-store' });
        if (!response.ok) return null;
        var metadata = await response.json();
        var version = String(metadata.dataVersion || metadata.lastUpdated || '');
        if (version && localStorage.getItem(DATA_VERSION_KEY) !== version) {
            SUPPORTED_LANGS.forEach(function (lang) {
                localStorage.removeItem('offlineQuestions_' + lang);
            });
            localStorage.removeItem('offlineDiagrams');
            localStorage.removeItem('offlineQuestions'); // legacy unsuffixed key
            localStorage.setItem(DATA_VERSION_KEY, version);
            console.log('Question data updated (' + version + '), offline caches cleared');
        }
        return metadata;
    } catch (e) {
        return null;
    }
}

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

    // Drop stale caches if the published data changed (no-op offline)
    await checkDataVersion();

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
        try {
            localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (e) { /* quota exceeded — keep serving the fetched data */ }
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

    // Apply level filter (regional hides national-only questions)
    data = filterByLevel(data);

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

// --- UI Translations ---

var UI_STRINGS = {
    de: {
        subtitle: 'Schweizer Volleyball Schiedsrichter Prüfungsvorbereitung',
        language: 'Sprache',
        studyMode: 'Lernmodus',
        cardGame: 'Memory Cards',
        cardGameDesc: 'Karteikarten-Training, eine Frage nach der anderen',
        level: 'Stufe',
        national: 'National',
        regional: 'Regional',
        testMode: 'Testmodus',
        testModeDesc: 'Simuliere die echte Prüfung mit 25 zufälligen Fragen',
        answerHint: 'Hinweis: Eine, mehrere, alle oder keine Antworten können richtig sein.',
        checkQuestions: 'Fragen durchsuchen',
        checkQuestionsDesc: 'Alle Fragen mit Antworten durchsuchen',
        questionsLoaded: ' Fragen geladen',
        loading: 'Fragen werden geladen...',
        question: 'Frage',
        checkAnswer: 'Antwort prüfen',
        next: 'Weiter',
        nextLinked: 'Nächste verknüpfte Frage',
        correct: 'Richtig! Gut gemacht!',
        incorrectSingle: 'Falsch. Die richtige Antwort ist:',
        incorrectMulti: 'Falsch. Die richtigen Antworten sind:',
        allCompleted: 'Alle Fragen beantwortet!',
        allCompletedSub: 'Du hast alle verfügbaren Fragen in dieser Sitzung beantwortet.',
        startNewSession: 'Neue Sitzung starten',
        newTest: 'Neuer Test',
        finish: 'Beenden',
        clear: 'Löschen',
        questions: 'Fragen',
        testResults: 'Testergebnis',
        score: 'Ergebnis',
        checkAnswers: 'Antworten prüfen',
        search: 'Suchtext in Fragen oder Antworten...',
        noResults: 'Keine Fragen gefunden',
        noResultsSub: 'Versuche einen anderen Suchbegriff.',
        linked: 'Verknüpft',
        linkedQuestions: 'Verknüpfte Fragen',
        errorLoading: 'Fehler beim Laden der Fragen.',
        clickNewTest: 'Klicke <strong>Neuer Test</strong> um eine Prüfungssimulation mit 25 Fragen zu starten.',
        results: 'Ergebnis',
        home: 'Startseite',
        gradeDetails: 'Bewertungsskala',
        sehr_gut: 'SEHR GUT',
        sehr_gut_desc: 'Note 4 — NLA-Spiele',
        gut: 'GUT',
        gut_desc: 'Note 3 — Gruppen 1 & 2',
        genuegend: 'GENÜGEND',
        genuegend_desc: 'Note 2 — Nur Einsatz als 2. SR in NLB',
        ungenuegend: 'UNGENÜGEND',
        ungenuegend_desc: 'Note 1 — Dispensation für die laufende Saison',
        gradeWarning: 'Wird im Theorietest in zwei aufeinanderfolgenden Jahren nicht mindestens einmal GUT erreicht (≥ 80%), erfolgt eine Dispensation.',
        disclaimerTitle: 'Privates Lerntool — inoffiziell',
        disclaimerBody: 'Dieses Tool ist vollständig privat und eine nach bestem Wissen wortgetreue Kopie der offiziellen Prüfungsfragen, ausschliesslich zum persönlichen Training. Allfällige Fehler oder Abweichungen sind nicht Swiss Volley zuzuschreiben. Kein offizielles Produkt von Swiss Volley — Nutzung ausschliesslich in inoffiziellem Rahmen.',
    },
    en: {
        subtitle: 'Swiss Volleyball Referee Exam Training',
        language: 'Language',
        level: 'Level',
        national: 'National',
        regional: 'Regional',
        studyMode: 'Study Mode',
        cardGame: 'Memory Cards',
        cardGameDesc: 'Flashcard-style practice, one question at a time',
        testMode: 'Test Mode',
        testModeDesc: 'Simulate the real exam with 25 random questions',
        answerHint: 'Note: One, more than one, all, or none of the answers can be correct.',
        checkQuestions: 'Check Questions',
        checkQuestionsDesc: 'Browse and search all questions with answers',
        questionsLoaded: ' questions loaded',
        loading: 'Loading questions...',
        question: 'Question',
        checkAnswer: 'Check Answer',
        next: 'Next',
        nextLinked: 'Next Linked Question',
        correct: 'Correct! Well done!',
        incorrectSingle: 'Incorrect. The correct answer is:',
        incorrectMulti: 'Incorrect. The correct answers are:',
        allCompleted: 'All questions completed!',
        allCompletedSub: "You've answered all available questions in this session.",
        startNewSession: 'Start New Session',
        newTest: 'New Test',
        finish: 'Finish',
        clear: 'Clear',
        questions: 'Questions',
        testResults: 'Test Results',
        score: 'Score',
        checkAnswers: 'Check Answers',
        search: 'Search text in questions or answers...',
        noResults: 'No questions found',
        noResultsSub: 'Try a different search term.',
        linked: 'Linked',
        linkedQuestions: 'Linked Questions',
        errorLoading: 'Error loading questions.',
        clickNewTest: 'Click <strong>New Test</strong> to start a 25-question exam simulation.',
        results: 'Results',
        home: 'Home',
        gradeDetails: 'Grading Scale',
        sehr_gut: 'EXCELLENT',
        sehr_gut_desc: 'Grade 4 — NLA games',
        gut: 'GOOD',
        gut_desc: 'Grade 3 — Groups 1 & 2',
        genuegend: 'SUFFICIENT',
        genuegend_desc: 'Grade 2 — Only as 2nd referee in NLB',
        ungenuegend: 'INSUFFICIENT',
        ungenuegend_desc: 'Grade 1 — Dispensation for the current season',
        gradeWarning: 'If GOOD (≥ 80%) is not achieved at least once in two consecutive years, a dispensation will follow.',
        disclaimerTitle: 'Private study tool — unofficial',
        disclaimerBody: 'This tool is kept completely private and is a best-effort verbatim copy of the official exam questions, intended solely for personal training. Any errors or inconsistencies, if present, are not attributable to Swiss Volley. Not an official Swiss Volley product — to be used in a fully unofficial manner.',
    },
    fr: {
        subtitle: 'Préparation examen arbitre volleyball suisse',
        language: 'Langue',
        level: 'Niveau',
        national: 'National',
        regional: 'Régional',
        studyMode: "Mode d'étude",
        cardGame: 'Memory Cards',
        cardGameDesc: 'Entraînement par fiches, une question à la fois',
        testMode: 'Mode examen',
        testModeDesc: "Simuler l'examen réel avec 25 questions aléatoires",
        answerHint: 'Remarque : une, plusieurs, toutes ou aucune des réponses peuvent être correctes.',
        checkQuestions: 'Consulter les questions',
        checkQuestionsDesc: 'Parcourir et rechercher toutes les questions avec réponses',
        questionsLoaded: ' questions chargées',
        loading: 'Chargement des questions...',
        question: 'Question',
        checkAnswer: 'Vérifier la réponse',
        next: 'Suivant',
        nextLinked: 'Question liée suivante',
        correct: 'Correct ! Bien joué !',
        incorrectSingle: 'Incorrect. La bonne réponse est :',
        incorrectMulti: 'Incorrect. Les bonnes réponses sont :',
        allCompleted: 'Toutes les questions complétées !',
        allCompletedSub: 'Vous avez répondu à toutes les questions disponibles dans cette session.',
        startNewSession: 'Nouvelle session',
        newTest: 'Nouveau test',
        finish: 'Terminer',
        clear: 'Effacer',
        questions: 'Questions',
        testResults: "Résultats de l'examen",
        score: 'Score',
        checkAnswers: 'Vérifier les réponses',
        search: 'Rechercher dans les questions ou réponses...',
        noResults: 'Aucune question trouvée',
        noResultsSub: 'Essayez un autre terme de recherche.',
        linked: 'Liée',
        linkedQuestions: 'Questions liées',
        errorLoading: 'Erreur lors du chargement des questions.',
        clickNewTest: 'Cliquez sur <strong>Nouveau test</strong> pour démarrer une simulation de 25 questions.',
        results: 'Résultats',
        home: 'Accueil',
        gradeDetails: 'Échelle de notation',
        sehr_gut: 'TRÈS BIEN',
        sehr_gut_desc: 'Note 4 — Matchs NLA',
        gut: 'BIEN',
        gut_desc: 'Note 3 — Groupes 1 & 2',
        genuegend: 'SUFFISANT',
        genuegend_desc: 'Note 2 — Uniquement comme 2e arbitre en NLB',
        ungenuegend: 'INSUFFISANT',
        ungenuegend_desc: 'Note 1 — Dispensation pour la saison en cours',
        gradeWarning: "Si BIEN (≥ 80%) n'est pas atteint au moins une fois en deux années consécutives, une dispensation s'ensuit.",
        disclaimerTitle: 'Outil d’étude privé — non officiel',
        disclaimerBody: 'Cet outil reste entièrement privé et constitue une copie des questions d’examen officielles, fidèle dans la mesure du possible, destinée uniquement à l’entraînement personnel. Toute erreur ou incohérence éventuelle n’est pas imputable à Swiss Volley. Ce n’est pas un produit officiel de Swiss Volley — utilisation exclusivement à titre non officiel.',
    },
    it: {
        subtitle: 'Preparazione esame arbitro pallavolo svizzera',
        language: 'Lingua',
        level: 'Livello',
        national: 'Nazionale',
        regional: 'Regionale',
        studyMode: 'Modalità di studio',
        cardGame: 'Memory Cards',
        cardGameDesc: 'Esercitazione con flashcard, una domanda alla volta',
        testMode: 'Modalità esame',
        testModeDesc: "Simula l'esame reale con 25 domande casuali",
        answerHint: 'Nota: una, più di una, tutte o nessuna delle risposte possono essere corrette.',
        checkQuestions: 'Controlla domande',
        checkQuestionsDesc: 'Sfoglia e cerca tutte le domande con le risposte',
        questionsLoaded: ' domande caricate',
        loading: 'Caricamento domande...',
        question: 'Domanda',
        checkAnswer: 'Verifica risposta',
        next: 'Avanti',
        nextLinked: 'Domanda collegata successiva',
        correct: 'Corretto! Ben fatto!',
        incorrectSingle: 'Sbagliato. La risposta corretta è:',
        incorrectMulti: 'Sbagliato. Le risposte corrette sono:',
        allCompleted: 'Tutte le domande completate!',
        allCompletedSub: 'Hai risposto a tutte le domande disponibili in questa sessione.',
        startNewSession: 'Nuova sessione',
        newTest: 'Nuovo test',
        finish: 'Fine',
        clear: 'Cancella',
        questions: 'Domande',
        testResults: "Risultati dell'esame",
        score: 'Punteggio',
        checkAnswers: 'Controlla risposte',
        search: 'Cerca testo nelle domande o risposte...',
        noResults: 'Nessuna domanda trovata',
        noResultsSub: 'Prova un altro termine di ricerca.',
        linked: 'Collegata',
        linkedQuestions: 'Domande collegate',
        errorLoading: 'Errore nel caricamento delle domande.',
        clickNewTest: 'Clicca <strong>Nuovo test</strong> per avviare una simulazione di 25 domande.',
        results: 'Risultati',
        home: 'Home',
        gradeDetails: 'Scala di valutazione',
        sehr_gut: 'OTTIMO',
        sehr_gut_desc: 'Nota 4 — Partite NLA',
        gut: 'BUONO',
        gut_desc: 'Nota 3 — Gruppi 1 & 2',
        genuegend: 'SUFFICIENTE',
        genuegend_desc: 'Nota 2 — Solo come 2° arbitro in NLB',
        ungenuegend: 'INSUFFICIENTE',
        ungenuegend_desc: 'Nota 1 — Dispensazione per la stagione in corso',
        gradeWarning: 'Se BUONO (≥ 80%) non viene raggiunto almeno una volta in due anni consecutivi, segue una dispensazione.',
        disclaimerTitle: 'Strumento di studio privato — non ufficiale',
        disclaimerBody: 'Questo strumento è mantenuto completamente privato ed è una copia, per quanto possibile fedele, delle domande d’esame ufficiali, destinata esclusivamente all’allenamento personale. Eventuali errori o incongruenze non sono attribuibili a Swiss Volley. Non è un prodotto ufficiale di Swiss Volley — da utilizzare esclusivamente in ambito non ufficiale.',
    }
};

/**
 * Get a translated UI string for the current language.
 * @param {string} key
 * @returns {string}
 */
function t(key) {
    var lang = getSelectedLang();
    return (UI_STRINGS[lang] && UI_STRINGS[lang][key]) || UI_STRINGS.en[key] || key;
}

// --- HTML Escaping & Icons ---

/**
 * Escape text for safe interpolation into HTML (element content or
 * double/single-quoted attribute values).
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Render lucide icons if the library loaded; the app must keep working
 * (offline, blocked CDN) when it did not.
 */
function createIconsSafe() {
    if (window.lucide && typeof lucide.createIcons === 'function') {
        try { lucide.createIcons(); } catch (e) { /* icons are cosmetic */ }
    }
}

// --- Search Normalization & Highlight ---

/**
 * Fold text for search matching: lowercase, typographic apostrophes to ',
 * diacritics stripped (è -> e). Output has the same length as the input so
 * match indices map directly back to the original string.
 * @param {string} text
 * @returns {string}
 */
function normalizeForSearch(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (ch === '’' || ch === '‘' || ch === '´' || ch === '`') {
            out += "'";
            continue;
        }
        var base = ch.normalize ? ch.normalize('NFD').charAt(0) : ch;
        var low = base.toLowerCase();
        out += low.length === 1 ? low : ch;
    }
    return out;
}

/**
 * Highlight search term matches in text. Matching is apostrophe- and
 * diacritic-insensitive (via normalizeForSearch), and the returned HTML is
 * fully escaped — pass RAW text, not pre-escaped text.
 * @param {string} text
 * @param {string} searchTerm
 * @returns {string} Escaped HTML with <span class="highlight"> wrappers
 */
function highlightSearchTerm(text, searchTerm) {
    text = String(text);
    if (!searchTerm) return escapeHtml(text);
    var normText = normalizeForSearch(text);
    var normTerm = normalizeForSearch(String(searchTerm));
    if (!normTerm) return escapeHtml(text);

    var result = '';
    var pos = 0;
    var idx;
    while ((idx = normText.indexOf(normTerm, pos)) !== -1) {
        result += escapeHtml(text.slice(pos, idx));
        result += '<span class="highlight">' + escapeHtml(text.slice(idx, idx + normTerm.length)) + '</span>';
        pos = idx + normTerm.length;
    }
    result += escapeHtml(text.slice(pos));
    return result;
}

/**
 * Insert a paragraph break before numbered scenarios in multi-part questions
 * (e.g. "...in this situation? 1. ..." becomes "...in this situation?\n\n1. ...").
 * Relies on CSS `white-space: pre-line` on the rendering element.
 * @param {string} text
 * @returns {string}
 */
function formatQuestionText(text) {
    if (!text) return text;
    return text.replace(/\?\s+(\d+\.\s)/g, '?\n\n$1');
}
