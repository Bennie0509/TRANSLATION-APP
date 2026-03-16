
const LANG_BCP47 = {
  en:   'en-US',
  fr:   'fr-FR',
  es:   'es-ES',
  de:   'de-DE',
  it:   'it-IT',
  pt:   'pt-PT',
  zh:   'zh-CN',
  ar:   'ar-SA',
  ja:   'ja-JP',
  ru:   'ru-RU',
  auto: 'en-US'   // Fallback when language is being detected
};

// How long (milliseconds) to wait after the user stops typing
// before we automatically fire a translation.
// 600ms = 0.6 seconds — feels instant but avoids spamming the API.
const DEBOUNCE_DELAY = 600;

// Maximum number of characters allowed in the input box.
const MAX_CHARS = 500;

// How long (milliseconds) the toast notification stays visible.
const TOAST_DURATION = 2200;


/* ────────────────────────────────────────────────────────────────
   2. DOM REFERENCES
   We grab every HTML element we need once at the top.
   This is better than calling getElementById() repeatedly.
──────────────────────────────────────────────────────────────── */
const inputText      = document.getElementById('inputText');
const outputText     = document.getElementById('outputText');
const sourceLang     = document.getElementById('sourceLang');
const targetLang     = document.getElementById('targetLang');
const translateBtn   = document.getElementById('translateBtn');
const switchBtn      = document.getElementById('switchBtn');
const themeToggle    = document.getElementById('themeToggle');
const themeIcon      = document.getElementById('themeIcon');
const themeLabel     = document.getElementById('themeLabel');
const charCount      = document.getElementById('charCount');
const errorBanner    = document.getElementById('errorBanner');
const detectBadge    = document.getElementById('detectBadge');
const toast          = document.getElementById('toast');
const listenInputBtn  = document.getElementById('listenInputBtn');
const listenOutputBtn = document.getElementById('listenOutputBtn');
const copyInputBtn    = document.getElementById('copyInputBtn');
const copyOutputBtn   = document.getElementById('copyOutputBtn');


/* ────────────────────────────────────────────────────────────────
   3. STATE VARIABLES
   Values that CAN change while the app is running.
──────────────────────────────────────────────────────────────── */

// Tracks whether dark mode is currently on or off.
let isDarkMode = false;

// Holds the ID returned by setTimeout() for our debounce timer.
// We need this so we can cancel the timer if the user types again
// before it fires. Starts as null because no timer is running yet.
let debounceTimerId = null;

// Holds the ID of the toast auto-hide timer.
let toastTimerId = null;



function debouncedTranslate() {
  // Step 1: Cancel the previous scheduled translation (if one exists).
  //         If debounceTimerId is null, clearTimeout() does nothing — that's fine.
  clearTimeout(debounceTimerId);

  // Step 2: Schedule a NEW translation to run after DEBOUNCE_DELAY ms.
  //         We save the timer ID so we can cancel it again if needed.
  debounceTimerId = setTimeout(function () {
    // This code only runs if DEBOUNCE_DELAY ms pass without another keystroke.
    translate();
  }, DEBOUNCE_DELAY);
}


 
function onInput() {
  const currentLength = inputText.value.length;

  // Update the "18/500" counter text
  charCount.textContent = currentLength + '/' + MAX_CHARS;

  // Turn the counter red when the user is close to the limit
  if (currentLength >= 450) {
    charCount.classList.add('warn');
  } else {
    charCount.classList.remove('warn');
  }

  // Schedule a translation using debounce
  // (does NOT translate immediately — waits for user to stop typing)
  debouncedTranslate();
}


/* ────────────────────────────────────────────────────────────────
   5. LANGUAGE CHANGE HANDLER
   Called when either language dropdown changes.
──────────────────────────────────────────────────────────────── */

/**
 * handleLangChange()
 * Clears the detected language badge (if visible) and re-translates.
 */
function handleLangChange() {
  // If the user switched away from "Detect Language", hide the badge
  if (sourceLang.value !== 'auto') {
    detectBadge.classList.remove('visible');
    detectBadge.textContent = '';
  }

  // Translate immediately when the language is manually changed
  translate();
}


/* ────────────────────────────────────────────────────────────────
   6. SWITCH LANGUAGES
   Swaps the source and target language AND swaps the text.
──────────────────────────────────────────────────────────────── */

/**
 * switchLanguages()
 * Swaps source ↔ target language AND input ↔ output text.
 * Does nothing if source is set to "Detect Language" (can't swap unknown).
 */
function switchLanguages() {
  // Block swap when detect is active — we don't know what language it is yet
  if (sourceLang.value === 'auto') {
    showToast('Cannot swap while "Detect Language" is selected');
    return;
  }

  // --- Swap the language dropdown values ---
  const tempLang    = sourceLang.value;
  sourceLang.value  = targetLang.value;
  targetLang.value  = tempLang;

  // --- Swap the text content ---
  const tempText    = inputText.value;
  inputText.value   = outputText.value;
  outputText.value  = tempText;

  // Update the character counter to match the new input text
  charCount.textContent = inputText.value.length + '/' + MAX_CHARS;

  // Translate with the new language pair
  translate();
}


/* ────────────────────────────────────────────────────────────────
   7. MAIN TRANSLATE FUNCTION
   Sends the input text to the MyMemory API and displays the result.
──────────────────────────────────────────────────────────────── */

/**
 * translate()
 * This is an ASYNC function — it uses  await  to pause and wait
 * for the API response without freezing the browser.
 *
 * Flow:
 *   1. Read input text and selected languages
 *   2. Show loading spinner on the button
 *   3. Call the MyMemory API
 *   4. Display the translated text (or show an error)
 *   5. Hide the loading spinner
 */
async function translate() {
  const text    = inputText.value.trim();   // Remove leading/trailing spaces
  const srcCode = sourceLang.value;
  const tgtCode = targetLang.value;

  // Hide any previous error message
  errorBanner.classList.remove('visible');
  errorBanner.textContent = '';

  // If the input is empty, clear the output and stop here
  if (text === '') {
    outputText.value = '';
    return;
  }

  // Build the language pair string the API expects e.g. "en|fr"
  // When detecting language, the API wants "autodetect|fr"
  const langPair = (srcCode === 'auto') ? ('autodetect|' + tgtCode) : (srcCode + '|' + tgtCode);

  // --- Show loading state ---
  translateBtn.classList.add('loading');
  translateBtn.disabled = true;

  try {
    // Build the full API URL with the text and language pair as query parameters.
    // encodeURIComponent() makes the text safe to use in a URL
    // (e.g. spaces become %20, & becomes %26, etc.)
    const apiUrl = 'https://api.mymemory.translated.net/get'
                 + '?q='        + encodeURIComponent(text)
                 + '&langpair=' + encodeURIComponent(langPair);

    // Send the request to the API and wait for a response
    const response = await fetch(apiUrl);

    // If the server returned a non-OK status (e.g. 500, 404), throw an error
    if (!response.ok) {
      throw new Error('Server error: ' + response.status);
    }

    // Convert the raw response to a JavaScript object we can read
    const data = await response.json();

    // The API uses responseStatus 200 to indicate success
    if (data.responseStatus !== 200) {
      throw new Error(data.responseDetails || 'Translation failed. Please try again.');
    }

    // ✅ SUCCESS — put the translated text in the output box
    outputText.value = data.responseData.translatedText;

    // If "Detect Language" was on, show which language was detected
    if (srcCode === 'auto' && data.detectedLanguage) {
      const detectedCode = data.detectedLanguage.language;
      if (detectedCode) {
        detectBadge.textContent = 'Detected: ' + detectedCode.toUpperCase();
        detectBadge.classList.add('visible');
      }
    }

  } catch (error) {
    // ❌ FAILURE — show a friendly error message
    // error.message contains the reason (network issue, API error, etc.)
    errorBanner.textContent = '⚠️  ' + (error.message || 'Could not reach the translation service. Please check your internet connection.');
    errorBanner.classList.add('visible');

    // Clear the output so stale text isn't shown
    outputText.value = '';

  } finally {
    // This block ALWAYS runs, whether the API call succeeded or failed.
    // We use it to always remove the loading state.
    translateBtn.classList.remove('loading');
    translateBtn.disabled = false;
  }
}


/* ────────────────────────────────────────────────────────────────
   8. TEXT-TO-SPEECH  (Listen buttons)
──────────────────────────────────────────────────────────────── */

/**
 * listenText(panel)
 * Reads the text aloud using the browser's built-in Speech Synthesis API.
 *
 * @param {string} panel - Either 'input' or 'output'
 */
function listenText(panel) {
  // Get the correct text depending on which Listen button was clicked
  const text = (panel === 'input') ? inputText.value : outputText.value;

  if (!text) {
    showToast('Nothing to listen to!');
    return;
  }

  // Stop any speech already playing before starting a new one
  window.speechSynthesis.cancel();

  // Get the language code for the correct panel
  const langCode = (panel === 'input') ? sourceLang.value : targetLang.value;

  // Create a speech utterance with the text and language
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang  = LANG_BCP47[langCode] || 'en-US';

  // Speak it!
  window.speechSynthesis.speak(utterance);
}


/* ────────────────────────────────────────────────────────────────
   9. COPY TO CLIPBOARD
──────────────────────────────────────────────────────────────── */

/**
 * copyText(panel)
 * Copies the input or output text to the user's clipboard.
 * Shows a toast notification to confirm it worked.
 *
 * @param {string} panel - Either 'input' or 'output'
 */
async function copyText(panel) {
  const text = (panel === 'input') ? inputText.value : outputText.value;

  if (!text) {
    showToast('Nothing to copy!');
    return;
  }

  try {
    // Modern clipboard API — works in all current browsers
    await navigator.clipboard.writeText(text);
    showToast('✓ Copied to clipboard!');

  } catch (error) {
    // Fallback method for older browsers that don't support clipboard API
    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = text;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    document.execCommand('copy');               // Old but widely supported
    document.body.removeChild(tempTextArea);
    showToast('✓ Copied!');
  }
}


/* ────────────────────────────────────────────────────────────────
   10. DARK MODE TOGGLE
──────────────────────────────────────────────────────────────── */

/**
 * toggleTheme()
 * Switches between light and dark mode by toggling a
 * data-theme="dark" attribute on the <html> element.
 * CSS reads this attribute and applies the dark colour variables.
 */
function toggleTheme() {
  isDarkMode = !isDarkMode;   // Flip the boolean

  // Apply or remove the dark theme attribute on <html>
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : '');

  // Update the button label and emoji
  themeIcon.textContent  = isDarkMode ? '☀️' : '🌙';
  themeLabel.textContent = isDarkMode ? 'Light Mode' : 'Dark Mode';
}


/* ────────────────────────────────────────────────────────────────
   11. TOAST NOTIFICATION HELPER
──────────────────────────────────────────────────────────────── */

/**
 * showToast(message)
 * Shows a small pop-up message at the bottom of the screen.
 * It automatically disappears after TOAST_DURATION milliseconds.
 *
 * @param {string} message - The text to display in the toast
 */
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');

  // Cancel any previous hide-timer so we don't hide too early
  clearTimeout(toastTimerId);

  // Schedule the toast to disappear after TOAST_DURATION ms
  toastTimerId = setTimeout(function () {
    toast.classList.remove('show');
  }, TOAST_DURATION);
}


/* ────────────────────────────────────────────────────────────────
   12. EVENT LISTENERS
   We attach all events here at the bottom, in one place.
   This keeps each function clean — they don't need to know
   what triggers them.
──────────────────────────────────────────────────────────────── */

// Input textarea — fires on every keystroke
inputText.addEventListener('input', onInput);

// Language dropdowns — fires when selection changes
sourceLang.addEventListener('change', handleLangChange);
targetLang.addEventListener('change', handleLangChange);

// Swap / switch button
switchBtn.addEventListener('click', switchLanguages);

// Translate button (manual trigger)
translateBtn.addEventListener('click', translate);

// Dark mode toggle button
themeToggle.addEventListener('click', toggleTheme);

// Listen buttons
listenInputBtn.addEventListener('click',  function () { listenText('input');  });
listenOutputBtn.addEventListener('click', function () { listenText('output'); });

// Copy buttons
copyInputBtn.addEventListener('click',  function () { copyText('input');  });
copyOutputBtn.addEventListener('click', function () { copyText('output'); });


/* ────────────────────────────────────────────────────────────────
   13. PAGE LOAD  —  Run the default translation on startup
──────────────────────────────────────────────────────────────── */

/**
 * This runs once when the page finishes loading.
 * It sets the initial character count and triggers the
 * default translation: "Hello, how are you" → French
 */
window.addEventListener('load', function () {
  // Set the initial character counter for the pre-filled text
  const initialLength = inputText.value.length;
  charCount.textContent = initialLength + '/' + MAX_CHARS;

  // Run the default translation immediately (no debounce needed on load)
  translate();
});
