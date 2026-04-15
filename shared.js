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
 */
var NATIONAL_ONLY_TERMS = [
    // Leagues
    'nla', 'nlb', 'lfp', 'gfl', 'jfl', 'las',
    // eScoresheet
    'escoresheet', 'e-scoresheet', 'escore',
    // Ball boys
    'ballholer', 'raccattapalle', 'raccoglipalle', 'ramasseur', 'ball boy', 'ball-boy',
    // Speaker
    'speaker',
    // Substitution paddles
    'paletta', 'palette', 'wechseltafel', 'paddle',
];

/**
 * Check if a question is national-only (should be hidden in regional mode).
 * Checks question text and all answer texts.
 * @param {Object} question - Raw question object
 * @returns {boolean} true if national-only
 */
function isNationalOnly(question) {
    var text = (question.question + ' ' + Object.values(question.answers).join(' ')).toLowerCase();
    for (var i = 0; i < NATIONAL_ONLY_TERMS.length; i++) {
        if (text.indexOf(NATIONAL_ONLY_TERMS[i]) !== -1) return true;
    }
    return false;
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
        cardGame: 'Kartenspiel',
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
        incorrectPre: 'Falsch. Die richtige Antwort',
        incorrectIs: ' ist',
        incorrectAre: 'en sind',
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
    },
    en: {
        subtitle: 'Swiss Volleyball Referee Exam Training',
        language: 'Language',
        level: 'Level',
        national: 'National',
        regional: 'Regional',
        studyMode: 'Study Mode',
        cardGame: 'Card Game',
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
        incorrectPre: 'Incorrect. The correct answer',
        incorrectIs: ' is',
        incorrectAre: 's are',
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
    },
    fr: {
        subtitle: 'Préparation examen arbitre volleyball suisse',
        language: 'Langue',
        level: 'Niveau',
        national: 'National',
        regional: 'Régional',
        studyMode: "Mode d'étude",
        cardGame: 'Jeu de cartes',
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
        incorrectPre: 'Incorrect. La bonne réponse',
        incorrectIs: ' est',
        incorrectAre: 's sont',
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
        incorrectPre: 'Sbagliato. La risposta corretta',
        incorrectIs: ' è',
        incorrectAre: ' sono',
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
