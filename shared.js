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

// --- UI Translations ---

var UI_STRINGS = {
    de: {
        subtitle: 'Schweizer Volleyball Schiedsrichter Prüfungsvorbereitung',
        language: 'Sprache',
        studyMode: 'Lernmodus',
        cardGame: 'Kartenspiel',
        cardGameDesc: 'Karteikarten-Training, eine Frage nach der anderen',
        testMode: 'Testmodus',
        testModeDesc: 'Simuliere die echte Prüfung mit 25 zufälligen Fragen',
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
        search: 'Fragen, Antworten oder Fragennummer suchen...',
        noResults: 'Keine Fragen gefunden',
        noResultsSub: 'Versuche einen anderen Suchbegriff.',
        linked: 'Verknüpft',
        linkedQuestions: 'Verknüpfte Fragen',
        errorLoading: 'Fehler beim Laden der Fragen.',
        clickNewTest: 'Klicke <strong>Neuer Test</strong> um eine Prüfungssimulation mit 25 Fragen zu starten.',
        sehr_gut: 'SEHR GUT (Gruppen 1 & 2)',
        gut: 'GUT (Gruppe 3)',
        genuegend: 'GENÜGEND (2SR)',
        ungenuegend: 'UNGENÜGEND (Keine Spiele)',
    },
    en: {
        subtitle: 'Swiss Volleyball Referee Exam Training',
        language: 'Language',
        studyMode: 'Study Mode',
        cardGame: 'Card Game',
        cardGameDesc: 'Flashcard-style practice, one question at a time',
        testMode: 'Test Mode',
        testModeDesc: 'Simulate the real exam with 25 random questions',
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
        search: 'Search questions, answers, or question number...',
        noResults: 'No questions found',
        noResultsSub: 'Try a different search term.',
        linked: 'Linked',
        linkedQuestions: 'Linked Questions',
        errorLoading: 'Error loading questions.',
        clickNewTest: 'Click <strong>New Test</strong> to start a 25-question exam simulation.',
        sehr_gut: 'EXCELLENT (Groups 1 & 2)',
        gut: 'GOOD (Group 3)',
        genuegend: 'SUFFICIENT (2SR)',
        ungenuegend: 'INSUFFICIENT (No games)',
    },
    fr: {
        subtitle: 'Préparation examen arbitre volleyball suisse',
        language: 'Langue',
        studyMode: "Mode d'étude",
        cardGame: 'Jeu de cartes',
        cardGameDesc: 'Entraînement par fiches, une question à la fois',
        testMode: 'Mode examen',
        testModeDesc: "Simuler l'examen réel avec 25 questions aléatoires",
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
        search: 'Rechercher questions, réponses ou numéro...',
        noResults: 'Aucune question trouvée',
        noResultsSub: 'Essayez un autre terme de recherche.',
        linked: 'Liée',
        linkedQuestions: 'Questions liées',
        errorLoading: 'Erreur lors du chargement des questions.',
        clickNewTest: 'Cliquez sur <strong>Nouveau test</strong> pour démarrer une simulation de 25 questions.',
        sehr_gut: 'TRÈS BIEN (Groupes 1 & 2)',
        gut: 'BIEN (Groupe 3)',
        genuegend: 'SUFFISANT (2SR)',
        ungenuegend: 'INSUFFISANT (Pas de matchs)',
    },
    it: {
        subtitle: 'Preparazione esame arbitro pallavolo svizzera',
        language: 'Lingua',
        studyMode: 'Modalità di studio',
        cardGame: 'Gioco a carte',
        cardGameDesc: 'Esercitazione con flashcard, una domanda alla volta',
        testMode: 'Modalità esame',
        testModeDesc: "Simula l'esame reale con 25 domande casuali",
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
        search: 'Cerca domande, risposte o numero...',
        noResults: 'Nessuna domanda trovata',
        noResultsSub: 'Prova un altro termine di ricerca.',
        linked: 'Collegata',
        linkedQuestions: 'Domande collegate',
        errorLoading: 'Errore nel caricamento delle domande.',
        clickNewTest: 'Clicca <strong>Nuovo test</strong> per avviare una simulazione di 25 domande.',
        sehr_gut: 'OTTIMO (Gruppi 1 & 2)',
        gut: 'BUONO (Gruppo 3)',
        genuegend: 'SUFFICIENTE (2SR)',
        ungenuegend: 'INSUFFICIENTE (Nessuna partita)',
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
