/*!
 * app.js : The main Kiwix User Interface implementation
 * This file handles the interaction between the Kiwix JS back end and the user
 *
 * Copyright 2013-2024 Mossroy, Jaifroid and contributors
 * Licence GPL v3:
 *
 * This file is part of Kiwix.
 *
 * Kiwix is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public Licence as published by
 * the Free Software Foundation, either version 3 of the Licence, or
 * (at your option) any later version.
 *
 * Kiwix is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public Licence for more details.
 *
 * You should have received a copy of the GNU General Public Licence
 * along with Kiwix (file LICENSE-GPLv3.txt).  If not, see <http://www.gnu.org/licenses/>
 */

'use strict';

// The global parameters object is defined in init.js
/* global params, webpMachine */

// import styles from '../css/app.css' assert { type: "css" };
// import bootstrap from '../css/bootstrap.min.css' assert { type: "css" };
import '../../node_modules/@fortawesome/fontawesome-free/js/all.js';
import zimArchiveLoader from './lib/zimArchiveLoader.js';
import uiUtil from './lib/uiUtil.js';
import popovers from './lib/popovers.js';
import settingsStore from './lib/settingsStore.js';
import abstractFilesystemAccess from './lib/abstractFilesystemAccess.js';
import translateUI from './lib/translateUI.js';
import kiwixLibrary from './lib/kiwixLibrary.js';

if (params.abort) {
    // If the app was loaded only to pass a message from the remote code, then we exit immediately
    throw new Error('Managed error: exiting local extension code.')
}

/**
 * The name of the Cache API cache to use for caching Service Worker requests and responses for certain asset types
 * We need access to the cache name in app.js in order to complete utility actions when Service Worker is not initialized,
 * so we have to duplicate it here
 * @type {String}
 */
// DEV: Ensure this matches the name defined in service-worker.js (a check is provided in refreshCacheStatus() below)
const ASSETS_CACHE = 'kiwixjs-assetsCache';

/**
 * A global object for storing app state
 *
 * @type Object
 */
var appstate = {};

/**
 * @type ZIMArchive | null
 */
var selectedArchive = null;

// An object to hold the current search and its state (allows cancellation of search across modules)
appstate['search'] = {
    prefix: '', // A field to hold the original search string
    status: '', // The status of the search: ''|'init'|'interim'|'cancelled'|'complete'
    type: '' // The type of the search: 'basic'|'full' (set automatically in search algorithm)
};

// A Boolean to store the update status of the PWA version (currently only used with Firefox Extension)
appstate['pwaUpdateNeeded'] = false; // This will be set to true if the Service Worker has an update waiting

// Placeholders for the article container, the article window, and the search-article area
const articleContainer = document.getElementById('articleContent');
const articleWindow = articleContainer.contentWindow;
const region = document.getElementById('search-article');

switchHomeKeyToFocusSearchBar();

// We check here if we have to warn the user that we switched to ServiceWorkerMode
// This is only needed if the ServiceWorker mode is available, or we are in an Extension that supports Service Workers
// outside of the extension environment, AND the user's settings are stuck on jQuery mode, AND the user has not already been
// alerted about the switch to ServiceWorker mode by default
if ((isServiceWorkerAvailable() || isMessageChannelAvailable() && /^(moz|chrome)-extension:/i.test(window.location.protocol)) &&
    params.contentInjectionMode === 'jquery' && !params.defaultModeChangeAlertDisplayed) {
    // Attempt to upgrade user to ServiceWorker mode
    params.contentInjectionMode = 'serviceworker';
} else if (params.contentInjectionMode === 'serviceworker') {
    // User is already in SW mode, so we will never need to display the upgrade alert
    params.defaultModeChangeAlertDisplayed = true;
    settingsStore.setItem('defaultModeChangeAlertDisplayed', true, Infinity);
}
if (!/^chrome-extension:/i.test(window.location.protocol)) {
    document.getElementById('serviceWorkerLocal').style.display = 'none';
    document.getElementById('serviceWorkerLocalDescription').style.display = 'none';
}

// At launch, we set the correct content injection mode
setContentInjectionMode(params.contentInjectionMode);

// Define frequently used UI elements
const globalDropZone = document.getElementById('search-article');
const folderSelect = document.getElementById('folderSelect');
const archiveFiles = document.getElementById('archiveFiles');

// Unique identifier of the article expected to be displayed
appstate.expectedArticleURLToBeDisplayed = '';

// define and store dark preference for matchMedia
var darkPreference = window.matchMedia('(prefers-color-scheme:dark)');
// if 'prefers-color-scheme' is not supported in the browser, then the "auto" options are not displayed to the user
if (window.matchMedia('(prefers-color-scheme)').media === 'not all') {
    var optionsToBeRemoved = document.getElementById('appThemeSelect').querySelectorAll('.auto');
    for (var i = 0; i < optionsToBeRemoved.length; i++) {
        optionsToBeRemoved[i].parentNode.removeChild(optionsToBeRemoved[i]);
    }
}
// Apply previously stored appTheme
uiUtil.applyAppTheme(params.appTheme);

// Whenever the system theme changes, call applyAppTheme function
darkPreference.onchange = function () {
    uiUtil.applyAppTheme(params.appTheme);
}

/**
 * Resize the IFrame height, so that it fills the whole available height in the window
 */
function resizeIFrame () {
    const headerStyles = getComputedStyle(document.getElementById('top'));
    const library = document.getElementById('library');
    const libraryContent = document.getElementById('libraryContent');
    const liHomeNav = document.getElementById('liHomeNav');
    const nestedFrame = libraryContent.contentWindow.document.getElementById('libraryIframe');
    // There is a race condition with the slide animations, so we have to wait more than 300ms
    setTimeout(function () {
        uiUtil.showSlidingUIElements();
        if (library.style.display !== 'none') {
            // We are in Library, so we set the height of the library iframes to the window height minus the header height
            const headerHeight = parseFloat(headerStyles.height) + parseFloat(headerStyles.marginBottom);
            libraryContent.style.height = window.innerHeight + 'px';
            nestedFrame.style.height = window.innerHeight - headerHeight + 'px';
            region.style.overflowY = 'hidden';
        } else if (!liHomeNav.classList.contains('active')) {
            // We are not in Home, so we reset the region height
            region.style.height = 'auto';
            region.style.overflowY = 'auto';
        } else {
            // Get  header height *including* its bottom margin
            const headerHeight = parseFloat(headerStyles.height) + parseFloat(headerStyles.marginBottom);
            articleContainer.style.height = window.innerHeight - headerHeight + 'px';
            // Hide the scrollbar of Configure / About
            region.style.overflowY = 'hidden';
        }
    // IE cannot retrieve computed headerStyles till the next paint, so we wait a few ticks even if UI animations are disabled
    }, params.showUIAnimations ? 400 : 100);

    // Get the contentWindow of the iframe to operate on
    var thisArticleWindow = articleWindow;
    if (articleWindow.document && articleWindow.document.getElementById('replay_iframe')) {
        thisArticleWindow = articleContainer.contentWindow.document.getElementById('replay_iframe').contentWindow;
    }

    // Remove and add the scroll event listener to the new article window
    // Note that IE11 doesn't support wheel or touch events on the iframe, but it does support keydown and scroll
    thisArticleWindow.removeEventListener('scroll', uiUtil.scroller);
    thisArticleWindow.removeEventListener('touchstart', uiUtil.scroller);
    thisArticleWindow.removeEventListener('touchend', uiUtil.scroller);
    thisArticleWindow.removeEventListener('wheel', uiUtil.scroller);
    thisArticleWindow.removeEventListener('keydown', uiUtil.scroller);
    if (params.slideAway) {
        thisArticleWindow.addEventListener('scroll', uiUtil.scroller);
        thisArticleWindow.addEventListener('touchstart', uiUtil.scroller);
        thisArticleWindow.addEventListener('touchend', uiUtil.scroller);
        thisArticleWindow.addEventListener('wheel', uiUtil.scroller);
        thisArticleWindow.addEventListener('keydown', uiUtil.scroller);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    getDefaultLanguageAndTranslateApp();
    resizeIFrame();
    abstractFilesystemAccess.loadPreviousZimFile();
});
window.addEventListener('resize', resizeIFrame);

// Define behavior of HTML elements
var searchArticlesFocused = false;
const searchArticle = document.getElementById('searchArticles')
searchArticle.addEventListener('click', function () {
    var prefix = document.getElementById('prefix').value;
    // Do not initiate the same search if it is already in progress
    if (prefix !== '' && appstate.search.prefix === prefix && !/^(cancelled|complete)$/.test(appstate.search.status)) return;
    document.getElementById('welcomeText').style.display = 'none';
    document.querySelector('.kiwix-alert').style.display = 'none';
    document.getElementById('searchingArticles').style.display = '';
    pushBrowserHistoryState(null, prefix);
    const footerHeight = document.getElementById('footer').getBoundingClientRect().height;
    region.style.height = window.innerHeight - footerHeight + 'px';
    region.style.overflowY = 'auto';
    // Initiate the search
    searchDirEntriesFromPrefix(prefix);
    var navbarCollapse = document.querySelector('.navbar-collapse');
    navbarCollapse.classList.remove('show');
    document.getElementById('prefix').focus();
    // This flag is set to true in the mousedown event below
    searchArticlesFocused = false;
});
searchArticle.addEventListener('mousedown', function () {
    // We set the flag so that the blur event of #prefix can know that the searchArticles button has been clicked
    searchArticlesFocused = true;
});
document.getElementById('formArticleSearch').addEventListener('submit', function () {
    document.getElementById('searchArticles').click();
});

function getDefaultLanguageAndTranslateApp () {
    var defaultBrowserLanguage = uiUtil.getBrowserLanguage();
    // DEV: Be sure to add supported language codes here
    // TODO: Add a supported languages object elsewhere and use it here
    if (!params.overrideBrowserLanguage) {
        if (/^en|es|fr$/.test(defaultBrowserLanguage.base)) {
            console.log('Supported default browser language is: ' + defaultBrowserLanguage.base + ' (' + defaultBrowserLanguage.locale + ')');
        } else {
            console.warn('Unsupported browser language! ' + defaultBrowserLanguage.base + ' (' + defaultBrowserLanguage.locale + ')');
            console.warn('Reverting to English');
            defaultBrowserLanguage.base = 'en';
            defaultBrowserLanguage.name = 'GB';
            params.overrideBrowserLanguage = 'en';
        }
    } else {
        console.log('User-selected language is: ' + params.overrideBrowserLanguage);
    }
    // Use the override language if set, or else use the browser default
    var languageCode = params.overrideBrowserLanguage || defaultBrowserLanguage.base;
    translateUI.translateApp(languageCode)
        .catch(function (err) {
            if (languageCode !== 'en') {
                var message = '<p>We cannot load the translation strings for language code <code>' + languageCode + '</code>';
                // if (/^file:\/\//.test(window.location.href)) {
                //     message += ' because you are accessing Kiwix from the file system. Try using a web server instead';
                // }
                message += '.</p><p>Falling back to English...</p>';
                if (err) message += '<p>The error message was:</p><code>' + err + '</code>';
                uiUtil.systemAlert(message);
                document.getElementById('languageSelector').value = 'en';
                return translateUI.translateApp('en');
            }
        });
}

// Add a listener for the language selection dropdown which will change the language of the app
document.getElementById('languageSelector').addEventListener('change', function (e) {
    var language = e.target.value;
    if (language === 'other') {
        uiUtil.systemAlert((translateUI.t('dialog-other-language-message') ||
            'We are working hard to bring you more languages! If you are interested in helping to translate the interface to your language, please create an issue on our GitHub. Thank you!'),
        (translateUI.t('configure-language-selector-other') || 'More soon...')).then(function () {
            document.getElementById('languageSelector').value = params.overrideBrowserLanguage || 'default';
        });
    } else if (language === 'default') {
        params.overrideBrowserLanguage = null;
        settingsStore.removeItem('languageOverride');
    } else {
        params.overrideBrowserLanguage = language;
        settingsStore.setItem('languageOverride', language, Infinity);
    }
    getDefaultLanguageAndTranslateApp();
});

const prefixElement = document.getElementById('prefix');
// Handle keyboard events in the prefix (article search) field
var keyPressHandled = false;
prefixElement.addEventListener('keydown', function (e) {
    // If user presses Escape...
    // IE11 returns "Esc" and the other browsers "Escape"; regex below matches both
    if (/^Esc/.test(e.key)) {
        // Hide the article list
        e.preventDefault();
        e.stopPropagation();
        document.getElementById('articleListWithHeader').style.display = 'none';
        document.getElementById('articleContent').focus();
        keyPressHandled = true;
    }
    // Arrow-key selection code adapted from https://stackoverflow.com/a/14747926/9727685
    // IE11 produces "Down" instead of "ArrowDown" and "Up" instead of "ArrowUp"
    if (/^((Arrow)?Down|(Arrow)?Up|Enter)$/.test(e.key)) {
        // User pressed Down arrow or Up arrow or Enter
        e.preventDefault();
        e.stopPropagation();
        // This is needed to prevent processing in the keyup event : https://stackoverflow.com/questions/9951274
        keyPressHandled = true;
        var activeElement = document.querySelector('#articleList .hover') || document.querySelector('#articleList a');
        if (!activeElement) return;
        // If user presses Enter, read the dirEntry
        if (/Enter/.test(e.key)) {
            if (activeElement.classList.contains('hover')) {
                var dirEntryId = activeElement.getAttribute('dirEntryId');
                findDirEntryFromDirEntryIdAndLaunchArticleRead(decodeURIComponent(dirEntryId));
                return;
            }
        }
        // If user presses ArrowDown...
        // (NB selection is limited to five possibilities by regex above)
        if (/Down/.test(e.key)) {
            if (activeElement.classList.contains('hover')) {
                activeElement.classList.remove('hover');
                activeElement = activeElement.nextElementSibling || activeElement;
                var nextElement = activeElement.nextElementSibling || activeElement;
                if (!uiUtil.isElementInView(nextElement, true)) nextElement.scrollIntoView(false);
            }
        }
        // If user presses ArrowUp...
        if (/Up/.test(e.key)) {
            activeElement.classList.remove('hover');
            activeElement = activeElement.previousElementSibling || activeElement;
            var previousElement = activeElement.previousElementSibling || activeElement;
            if (!uiUtil.isElementInView(previousElement, true)) previousElement.scrollIntoView();
            if (previousElement === activeElement) document.getElementById('top').scrollIntoView();
        }
        activeElement.classList.add('hover');
    }
});
// Search for titles as user types characters
prefixElement.addEventListener('keyup', function (e) {
    if (selectedArchive !== null && selectedArchive.isReady()) {
        // Prevent processing by keyup event if we already handled the keypress in keydown event
        if (keyPressHandled) { keyPressHandled = false; } else { onKeyUpPrefix(e); }
    }
});
// Restore the search results if user goes back into prefix field
prefixElement.addEventListener('focus', function () {
    if (document.getElementById('prefix').value !== '') {
        region.style.overflowY = 'auto';
        const footerHeight = document.getElementById('footer').getBoundingClientRect().height;
        region.style.height = window.innerHeight - footerHeight + 'px';
        document.getElementById('articleListWithHeader').style.display = '';
    }
});
// Hide the search results if user moves out of prefix field
prefixElement.addEventListener('blur', function () {
    if (!searchArticlesFocused) {
        appstate.search.status = 'cancelled';
        region.style.overflowY = 'hidden';
        region.style.height = 'auto';
        uiUtil.spinnerDisplay(false);
        document.getElementById('articleListWithHeader').style.display = 'none';
    }
});
document.getElementById('btnRandomArticle').addEventListener('click', function (event) {
    event.preventDefault();
    document.getElementById('prefix').value = '';
    goToRandomArticle();
    document.getElementById('welcomeText').style.display = 'none';
    document.getElementById('articleListWithHeader').style.display = 'none';
    var navbarCollapse = document.querySelector('.navbar-collapse');
    navbarCollapse.classList.remove('show');
});

document.getElementById('btnRescanDeviceStorage').addEventListener('click', function () {
    searchForArchivesInStorage();
});
// Bottom bar :
document.getElementById('btnBack').addEventListener('click', function (event) {
    event.preventDefault();
    history.back();
});
document.getElementById('btnForward').addEventListener('click', function (event) {
    event.preventDefault();
    history.forward();
});

document.getElementById('btnHomeBottom').addEventListener('click', function (event) {
    event.preventDefault();
    document.getElementById('btnHome').click();
});
document.getElementById('btnTop').addEventListener('click', function (event) {
    event.preventDefault();
    var articleContent = document.getElementById('articleContent');
    articleContent.contentWindow.scrollTo({ top: 0, behavior: 'smooth' });
});

// Top menu :
document.getElementById('btnHome').addEventListener('click', function (event) {
    // Highlight the selected section in the navbar
    event.preventDefault();
    document.getElementById('liHomeNav').setAttribute('class', 'active');
    document.getElementById('liConfigureNav').setAttribute('class', '');
    document.getElementById('liAboutNav').setAttribute('class', '');
    var navbarCollapse = document.querySelector('.navbar-collapse');
    navbarCollapse.classList.remove('show');
    // Show the selected content in the page
    uiUtil.tabTransitionToSection('home', params.showUIAnimations);

    // Give the focus to the search field, and clean up the page contents
    document.getElementById('prefix').value = '';
    if (params.useHomeKeyToFocusSearchBar) document.getElementById('prefix').focus();
    var articleList = document.getElementById('articleList');
    var articleListHeaderMessage = document.getElementById('articleListHeaderMessage');
    while (articleList.firstChild) articleList.removeChild(articleList.firstChild);
    while (articleListHeaderMessage.firstChild) articleListHeaderMessage.removeChild(articleListHeaderMessage.firstChild);
    uiUtil.spinnerDisplay(false);
    // document.getElementById('articleContent').style.display = 'none';
    // Empty and purge the article contents
    var articleContent = document.getElementById('articleContent');
    var articleContentDoc = articleContent ? articleContent.contentDocument : null;
    while (articleContentDoc.firstChild) articleContentDoc.removeChild(articleContentDoc.firstChild);
    if (selectedArchive !== null && selectedArchive.isReady()) {
        document.getElementById('welcomeText').style.display = 'none';
        goToMainArticle();
    }
    // Use a timeout of 400ms because uiUtil.applyAnimationToSection uses a timeout of 300ms
    setTimeout(resizeIFrame, 400);
});

document.getElementById('btnConfigure').addEventListener('click', function (event) {
    event.preventDefault();
    if (uiUtil.fromSection() === 'config') {
        uiUtil.returnToCurrentPage();
    } else {
        // Highlight the selected section in the navbar
        document.getElementById('liHomeNav').setAttribute('class', '');
        document.getElementById('liConfigureNav').setAttribute('class', 'active');
        document.getElementById('liAboutNav').setAttribute('class', '');
        var navbarCollapse = document.querySelector('.navbar-collapse');
        navbarCollapse.classList.remove('show');
        // Show the selected content in the page
        uiUtil.tabTransitionToSection('config', params.showUIAnimations);
        refreshAPIStatus();
        refreshCacheStatus();
        uiUtil.checkUpdateStatus(appstate);
        // Use a timeout of 400ms because uiUtil.applyAnimationToSection uses a timeout of 300ms
        setTimeout(resizeIFrame, 400);
    }
});
document.getElementById('btnAbout').addEventListener('click', function (event) {
    event.preventDefault();
    if (uiUtil.fromSection() === 'about') {
        uiUtil.returnToCurrentPage();
    } else {
        // Highlight the selected section in the navbar
        document.getElementById('liHomeNav').setAttribute('class', '');
        document.getElementById('liConfigureNav').setAttribute('class', '');
        document.getElementById('liAboutNav').setAttribute('class', 'active');
        var navbarCollapse = document.querySelector('.navbar-collapse');
        navbarCollapse.classList.remove('show');
        // Show the selected content in the page
        uiUtil.tabTransitionToSection('about', params.showUIAnimations);
        // Use a timeout of 400ms because uiUtil.applyAnimationToSection uses a timeout of 300ms
        setTimeout(resizeIFrame, 400);
    }
});
document.querySelectorAll('input[name="contentInjectionMode"][type="radio"]').forEach(function (element) {
    element.addEventListener('change', function () {
        // Do the necessary to enable or disable the Service Worker
        setContentInjectionMode(this.value);
    })
});
document.getElementById('useCanvasElementsCheck').addEventListener('change', function () {
    if (this.checked) {
        // User can only *disable* this auto-determined setting, not force it on, so we do not store a value of true
        settingsStore.removeItem('useCanvasElementsForWebpTranscoding');
        uiUtil.determineCanvasElementsWorkaround();
        this.checked = params.useCanvasElementsForWebpTranscoding;
    } else {
        params.useCanvasElementsForWebpTranscoding = false;
        settingsStore.setItem('useCanvasElementsForWebpTranscoding', false, Infinity);
    }
});
document.getElementById('btnReset').addEventListener('click', function () {
    uiUtil.systemAlert((translateUI.t('dialog-reset-warning-message') || 'This will reset the app to a freshly installed state, deleting all app caches and settings!'),
        (translateUI.t('dialog-reset-warning-title') || 'WARNING!'), true).then(function (response) {
        if (response) {
            settingsStore.reset();
        }
    })
});
document.getElementById('bypassAppCacheCheck').addEventListener('change', function () {
    if (params.contentInjectionMode !== 'serviceworker') {
        uiUtil.systemAlert(translateUI.t('dialog-bypassappcachecheck-message') || 'This setting can only be used in ServiceWorker mode!');
        this.checked = false;
    } else {
        params.appCache = !this.checked;
        settingsStore.setItem('appCache', params.appCache, Infinity);
        settingsStore.reset('cacheAPI');
    }
    // This will also send any new values to Service Worker
    refreshCacheStatus();
});

if (params.useLibzim) document.getElementById('libzimMode').style.display = '';
document.getElementById('libzimModeSelect').addEventListener('change', function (e) {
    settingsStore.setItem('libzimMode', e.target.value);
    window.location.reload();
});

document.getElementById('useLibzim').addEventListener('click', function (e) {
    settingsStore.setItem('useLibzim', !params.useLibzim);
    window.location.reload();
});

document.getElementById('disableDragAndDropCheck').addEventListener('change', function () {
    params.disableDragAndDrop = !!this.checked;
    settingsStore.setItem('disableDragAndDrop', params.disableDragAndDrop, Infinity);
    uiUtil.systemAlert((translateUI.t('dialog-disabledragdrop-message') || '<p>We will now attempt to reload the app to apply the new setting.</p>' +
        '<p>(If you cancel, then the setting will only be applied when you next start the app.)</p>'), (translateUI.t('dialog-disabledragdrop-title') || 'Reload app'), true).then(function (result) {
        if (result) {
            window.location.reload();
        }
    });
});
// Handle switching from jQuery to serviceWorker modes.
document.getElementById('serviceworkerModeRadio').addEventListener('click', async function () {
    document.getElementById('enableSourceVerificationCheckBox').style.display = '';
    if (selectedArchive.isReady() && !(settingsStore.getItem('trustedZimFiles').includes(selectedArchive.file.name)) && params.sourceVerification) {
        await verifyLoadedArchive(selectedArchive);
    }
});
document.getElementById('jqueryModeRadio').addEventListener('click', function () {
    if (this.checked) {
        document.getElementById('enableSourceVerificationCheckBox').style.display = 'none';
    }
});
// Handle switching to serviceWorkerLocal mode for chrome-extension
document.getElementById('serviceworkerLocalModeRadio').addEventListener('click', async function () {
    document.getElementById('enableSourceVerificationCheckBox').style.display = '';
    if (selectedArchive.isReady() && !(settingsStore.getItem('trustedZimFiles').includes(selectedArchive.file.name)) && params.sourceVerification) {
        await verifyLoadedArchive(selectedArchive);
    }
});

// Source verification is only makes sense in SW mode as doing the same in jQuery mode is redundant.
document.getElementById('enableSourceVerificationCheckBox').style.display = params.contentInjectionMode === ('serviceworker' || 'serviceworkerlocal') ? 'block' : 'none';

document.getElementById('enableSourceVerification').addEventListener('change', function () {
    params.sourceVerification = this.checked;
    settingsStore.setItem('sourceVerification', this.checked, Infinity);
});
document.querySelectorAll('input[type="checkbox"][name=hideActiveContentWarning]').forEach(function (element) {
    element.addEventListener('change', function () {
        params.hideActiveContentWarning = !!this.checked;
        settingsStore.setItem('hideActiveContentWarning', params.hideActiveContentWarning, Infinity);
    })
});
document.getElementById('hideExternalLinkWarningCheck').addEventListener('change', function () {
    params.hideExternalLinkWarning = this.checked;
    settingsStore.setItem('hideExternalLinkWarning', params.hideExternalLinkWarning, Infinity);
})
document.getElementById('slideAwayCheck').addEventListener('change', function (e) {
    params.slideAway = e.target.checked;
    if (typeof navigator.getDeviceStorages === 'function') {
        // We are in Firefox OS, which may have a bug with this setting turned on - see [kiwix-js #1140]
        uiUtil.systemAlert(translateUI.t('dialog-slideawaycheck-message') || ('This setting may not work correctly on Firefox OS. ' +
                'If you find that some ZIM links become unresponsive, try turning this setting off.'), translateUI.t('dialog-warning') || 'Warning');
    }
    settingsStore.setItem('slideAway', params.slideAway, Infinity);
    // This has methods to add or remove the event listeners needed
    resizeIFrame();
});
document.querySelectorAll('input[type="checkbox"][name=showUIAnimations]').forEach(function (element) {
    element.addEventListener('change', function () {
        params.showUIAnimations = !!this.checked;
        settingsStore.setItem('showUIAnimations', params.showUIAnimations, Infinity);
    })
});
document.getElementById('useHomeKeyToFocusSearchBarCheck').addEventListener('change', function (e) {
    params.useHomeKeyToFocusSearchBar = e.target.checked;
    settingsStore.setItem('useHomeKeyToFocusSearchBar', params.useHomeKeyToFocusSearchBar, Infinity);
    switchHomeKeyToFocusSearchBar();
    if (params.useHomeKeyToFocusSearchBar && params.slideAway) {
        uiUtil.systemAlert(translateUI.t('dialog-focussearchbarcheck-message') || 'Please note that this setting focuses the search bar when you go to a ZIM landing page, disabling sliding away of header and footer on that page (only).',
            translateUI.t('dialog-warning') || 'Warning');
    }
});
document.querySelectorAll('input[type="checkbox"][name=openExternalLinksInNewTabs]').forEach(function (element) {
    element.addEventListener('change', function () {
        params.openExternalLinksInNewTabs = !!this.checked;
        settingsStore.setItem('openExternalLinksInNewTabs', params.openExternalLinksInNewTabs, Infinity);
    })
});
document.getElementById('reopenLastArchiveCheck').addEventListener('change', function (e) {
    params.reopenLastArchive = e.target.checked;
    settingsStore.setItem('reopenLastArchive', params.reopenLastArchive, Infinity);
});
document.getElementById('appThemeSelect').addEventListener('change', function (e) {
    params.appTheme = e.target.value;
    settingsStore.setItem('appTheme', params.appTheme, Infinity);
    uiUtil.applyAppTheme(params.appTheme);
    refreshCacheStatus();
});
document.getElementById('cachedAssetsModeRadioTrue').addEventListener('change', function (e) {
    if (e.target.checked) {
        settingsStore.setItem('assetsCache', true, Infinity);
        params.assetsCache = true;
        refreshCacheStatus();
    }
});
document.getElementById('cachedAssetsModeRadioFalse').addEventListener('change', function (e) {
    if (e.target.checked) {
        settingsStore.setItem('assetsCache', false, Infinity);
        params.assetsCache = false;
        // Delete all caches
        resetCssCache();
        if ('caches' in window) caches.delete(ASSETS_CACHE);
        refreshCacheStatus();
    }
});
var titleSearchRangeVal = document.getElementById('titleSearchRangeVal');
document.getElementById('titleSearchRange').addEventListener('change', function (e) {
    settingsStore.setItem('maxSearchResultsSize', e.target.value, Infinity);
    params.maxSearchResultsSize = e.target.value;
    titleSearchRangeVal.textContent = e.target.value;
});
document.getElementById('titleSearchRange').addEventListener('input', function (e) {
    titleSearchRangeVal.textContent = e.target.value;
});
document.getElementById('showPopoverPreviewsCheck').addEventListener('change', function (e) {
    params.showPopoverPreviews = e.target.checked;
    settingsStore.setItem('showPopoverPreviews', params.showPopoverPreviews, Infinity);
});
// Add event listeners to the About links in Configuration, so that they jump to the linked sections
document.querySelectorAll('.aboutLinks').forEach(function (link) {
    link.addEventListener('click', function () {
        var anchor = link.getAttribute('href');
        document.getElementById('btnAbout').click();
        // We have to use a timeout or the scroll is cancelled by the slide transtion animation
        // @TODO This is a workaround. The regression should be fixed as it affects the Active content warning
        // links as well.
        setTimeout(function () {
            document.querySelector(anchor).scrollIntoView();
        }, 600);
    });
});
// Do update checks 7s after startup
setTimeout(function () {
    console.log('Checking for updates to the PWA...');
    uiUtil.checkUpdateStatus(appstate);
}, 7000);

// Adds an event listener to kiwix logo and bottom navigation bar which gets triggered when these elements are dragged.
// Returning false prevents their dragging (which can cause some unexpected behavior)
// Doing that in javascript is the only way to make it cross-browser compatible
document.getElementById('kiwixLogo').ondragstart = function () { return false; }
document.getElementById('navigationButtons').ondragstart = function () { return false; }

// focus search bar (#prefix) if Home key is pressed
function focusPrefixOnHomeKey (event) {
    // check if home key is pressed
    if (event.key === 'Home') {
        // wait to prevent interference with scrolling (default action)
        setTimeout(function () {
            document.getElementById('prefix').focus();
        }, 0);
    }
}

/**
 * Verifies the given archive and switches contentInjectionMode accourdingly
 * @param {ZIMArchive} archive The archive that needs verification
 * */
async function verifyLoadedArchive (archive) {
    // We construct an HTML element to show the user the alert with the metadata contained in it
    const metadataLabels = {
        name: translateUI.t('dialog-metadata-name') || 'Name: ',
        creator: translateUI.t('dialog-metadata-creator') || 'Creator: ',
        publisher: translateUI.t('dialog-metadata-publisher') || 'Publisher: ',
        scraper: translateUI.t('dialog-metadata-scraper') || 'Scraper: '
    }

    const verificationBody = document.createElement('div');

    // Text & metadata box
    const verificationText = document.createElement('p');
    verificationText.innerHTML = translateUI.t('dialog-sourceverification-alert') || 'Is this ZIM archive from a trusted source?\n If not, you can still read the ZIM file in Restricted Mode. Closing this window also opens the file in Restricted Mode. This option can be disabled in Expert Settings.';

    const metadataBox = document.createElement('div');
    metadataBox.id = 'modal-archive-metadata-container';

    const verifyName = document.createElement('p');
    verifyName.id = 'confirm-archive-name';
    verifyName.classList.add('archive-metadata');
    verifyName.innerText = metadataLabels.name + (archive.name || '-');

    const verifyCreator = document.createElement('p');
    verifyCreator.id = 'confirm-archive-creator';
    verifyCreator.classList.add('archive-metadata')
    verifyCreator.innerText = metadataLabels.creator + (archive.creator || '-');

    const verifyPublisher = document.createElement('p');
    verifyPublisher.id = 'confirm-archive-publisher';
    verifyPublisher.classList.add('archive-metadata');
    verifyPublisher.innerText = metadataLabels.publisher + (archive.publisher || '-');

    const verifyScraper = document.createElement('p');
    verifyScraper.id = 'confirm-archive-scraper';
    verifyScraper.classList.add('archive-metadata');
    verifyScraper.innerText = metadataLabels.scraper + (archive.scraper || '-');

    const verifyWarning = document.createElement('p');
    verifyWarning.id = 'modal-archive-metadata-warning';
    verifyWarning.innerHTML = translateUI.t('dialog-metadata-warning') || 'Warning: above data can be spoofed!';

    metadataBox.append(verifyName, verifyCreator, verifyPublisher, verifyScraper);
    verificationBody.append(verificationText, metadataBox, verifyWarning);

    const response = await uiUtil.systemAlert(
        verificationBody.outerHTML,
        translateUI.t('dialog-sourceverification-title') || 'Security alert!',
        true,
        translateUI.t('dialog-sourceverification-restricted-mode-button') || 'Open in Restricted Mode',
        translateUI.t('dialog-sourceverification-trust-button') || 'Trust Source'
    );

    if (response) {
        params.contentInjectionMode = 'serviceworker';
        var trustedZimFiles = settingsStore.getItem('trustedZimFiles');
        var updatedTrustedZimFiles = trustedZimFiles + archive.file.name + '|';
        settingsStore.setItem('trustedZimFiles', updatedTrustedZimFiles, Infinity);
        // Change radio buttons accordingly
        if (params.serviceWorkerLocal) {
            document.getElementById('serviceworkerLocalModeRadio').checked = true;
        } else {
            document.getElementById('serviceworkerModeRadio').checked = true;
        }
    } else {
        // Switch to Restricted mode
        params.contentInjectionMode = 'jquery';
        document.getElementById('jqueryModeRadio').checked = true;
    }
}
// switch on/off the feature to use Home Key to focus search bar
function switchHomeKeyToFocusSearchBar () {
    var iframeContentWindow = document.getElementById('articleContent').contentWindow;
    // Test whether iframe is accessible (because if not, we do not want to throw an error at this point, before we can tell the user what is wrong)
    var isIframeAccessible = true;
    try {
        iframeContentWindow.removeEventListener('keydown', focusPrefixOnHomeKey);
    } catch (err) {
        console.error('The iframe is probably not accessible', err);
        isIframeAccessible = false;
    }
    if (!isIframeAccessible) return;
    // when the feature is in active state
    if (params.useHomeKeyToFocusSearchBar) {
        // Handle Home key press inside window(outside iframe) to focus #prefix
        window.addEventListener('keydown', focusPrefixOnHomeKey);
        // only for initial empty iFrame loaded using `src` attribute
        // in any other case listener gets removed on reloading of iFrame content
        iframeContentWindow.addEventListener('keydown', focusPrefixOnHomeKey);
    } else {
        // When the feature is not active, remove event listener for window (outside iframe)
        window.removeEventListener('keydown', focusPrefixOnHomeKey);
        // if feature is deactivated and no zim content is loaded yet
        iframeContentWindow.removeEventListener('keydown', focusPrefixOnHomeKey);
    }
}

/**
 * Checks whether we need to display an alert that the default Content Injection Mode has now been switched to ServiceWorker Mode
 */
function checkAndDisplayInjectionModeChangeAlert () {
    var message;
    if (!params.defaultModeChangeAlertDisplayed && isServiceWorkerAvailable() && isServiceWorkerReady()) {
        message = [(translateUI.t('dialog-serviceworker-defaultmodechange-message') ||
            '<p>We have switched you to ServiceWorker mode (this is now the default). ' +
            'It supports more types of ZIM archives and is much more robust.</p>' +
            '<p>If you experience problems with this mode, you can switch back to Restricted mode. ' +
            'In that case, please report the problems you experienced to us (see About section).</p>'),
        (translateUI.t('dialog-serviceworker-defaultmodechange-title') || 'Change of default content injection mode')];
        uiUtil.systemAlert(message[0], message[1]).then(function () {
            settingsStore.setItem('defaultModeChangeAlertDisplayed', true, Infinity);
        });
    } else if (!params.defaultModeChangeAlertDisplayed && params.contentInjectionMode === 'jquery') {
        message = [(translateUI.t('dialog-serviceworker-unsupported-message') ||
            '<p>Unfortunately, your browser does not appear to support ServiceWorker mode, which is now the default for this app.</p>' +
            '<p>You can continue to use the app in Restricted mode, but note that this mode only works well with ' +
            'ZIM archives that have static content, such as Wikipedia / Wikimedia ZIMs or Stackexchange.</p>' +
            '<p>If you can, we recommend that you update your browser to a version that supports ServiceWorker mode.</p>'),
        (translateUI.t('dialog-serviceworker-unsupported-title') || 'ServiceWorker mode unsupported')];
        uiUtil.systemAlert(message[0], message[1], true, null, (translateUI.t('dialog-ok') || 'Okay')).then(function (result) {
            if (result) {
                // If user selected OK, then do not display again ever
                settingsStore.setItem('defaultModeChangeAlertDisplayed', true, Infinity);
            }
        });
    }
    // This prevents the alert being displayed again this session
    params.defaultModeChangeAlertDisplayed = true;
}

/**
 * Displays or refreshes the API status shown to the user
 */
function refreshAPIStatus () {
    // We have to delay refreshing the API status until the translation service has been initialized
    setTimeout(function () {
        var apiStatusPanel = document.getElementById('apiStatusDiv');
        apiStatusPanel.classList.remove('card-success', 'card-warning', 'card-danger');
        var apiPanelClass = 'card-success';
        var messageChannelStatus = document.getElementById('messageChannelStatus');
        var serviceWorkerStatus = document.getElementById('serviceWorkerStatus');
        if (isMessageChannelAvailable()) {
            messageChannelStatus.textContent = translateUI.t('api-messagechannel-available') || 'MessageChannel API available';
            messageChannelStatus.classList.remove('apiAvailable', 'apiUnavailable');
            messageChannelStatus.classList.add('apiAvailable');
        } else {
            apiPanelClass = 'card-warning';
            messageChannelStatus.textContent = translateUI.t('api-messagechannel-unavailable') || 'MessageChannel API unavailable';
            messageChannelStatus.classList.remove('apiAvailable', 'apiUnavailable');
            messageChannelStatus.classList.add('apiUnavailable');
        }
        if (isServiceWorkerAvailable()) {
            if (isServiceWorkerReady()) {
                serviceWorkerStatus.textContent = translateUI.t('api-serviceworker-available-registered') || 'ServiceWorker API available, and registered';
                serviceWorkerStatus.classList.remove('apiAvailable', 'apiUnavailable');
                serviceWorkerStatus.classList.add('apiAvailable');
            } else {
                apiPanelClass = 'card-warning';
                serviceWorkerStatus.textContent = translateUI.t('api-serviceworker-available-unregistered') || 'ServiceWorker API available, but not registered';
                serviceWorkerStatus.classList.remove('apiAvailable', 'apiUnavailable');
                serviceWorkerStatus.classList.add('apiUnavailable');
            }
        } else {
            apiPanelClass = 'card-warning';
            serviceWorkerStatus.textContent = translateUI.t('api-serviceworker-unavailable') || 'ServiceWorker API unavailable';
            serviceWorkerStatus.classList.remove('apiAvailable', 'apiUnavailable');
            serviceWorkerStatus.classList.add('apiUnavailable');
        }
        // Update Settings Store section of API panel with API name
        var settingsStoreStatusDiv = document.getElementById('settingsStoreStatus');
        var apiName = params.storeType === 'cookie' ? (translateUI.t('api-cookie') || 'Cookie') : params.storeType === 'local_storage' ? (translateUI.t('api-localstorage') || 'Local Storage') : (translateUI.t('api-none') || 'None');
        settingsStoreStatusDiv.textContent = (translateUI.t('api-storage-used-label') || 'Settings Storage API in use:') + ' ' + apiName;
        settingsStoreStatusDiv.classList.remove('apiAvailable', 'apiUnavailable');
        settingsStoreStatusDiv.classList.add(params.storeType === 'none' ? 'apiUnavailable' : 'apiAvailable');
        apiPanelClass = params.storeType === 'none' ? 'card-warning' : apiPanelClass;
        // Update Decompressor API section of panel
        var decompAPIStatusDiv = document.getElementById('decompressorAPIStatus');
        apiName = params.decompressorAPI.assemblerMachineType;
        apiPanelClass = params.decompressorAPI.errorStatus ? 'card-danger' : apiName === 'WASM' ? apiPanelClass : 'card-warning';
        decompAPIStatusDiv.className = apiName ? params.decompressorAPI.errorStatus ? 'apiBroken' : apiName === 'WASM' ? 'apiAvailable' : 'apiSuboptimal' : 'apiUnavailable';
        // Add the last used decompressor, if known, to the apiName
        if (apiName && params.decompressorAPI.decompressorLastUsed) {
            apiName += ' [&nbsp;' + params.decompressorAPI.decompressorLastUsed + '&nbsp;]';
        }
        apiName = params.decompressorAPI.errorStatus || apiName || (translateUI.t('api-error-uninitialized_feminine') || 'Not initialized');
        // innerHTML is used here because the API name may contain HTML entities like &nbsp;
        decompAPIStatusDiv.innerHTML = (translateUI.t('api-decompressor-label') || 'Decompressor API:') + ' ' + apiName;
        // Update Search Provider
        uiUtil.reportSearchProviderToAPIStatusPanel(params.searchProvider);
        // Update PWA origin
        var pwaOriginStatusDiv = document.getElementById('pwaOriginStatus');
        pwaOriginStatusDiv.className = 'apiAvailable';
        pwaOriginStatusDiv.innerHTML = (translateUI.t('api-pwa-origin-label') || 'PWA Origin:') + ' ' + window.location.origin;
        // Add a warning colour to the API Status Panel if any of the above tests failed
        apiStatusPanel.classList.add(apiPanelClass);
        // Set visibility of UI elements according to mode
        document.getElementById('bypassAppCacheDiv').style.display = params.contentInjectionMode === 'serviceworker' ? 'block' : 'none';
        // Check to see whether we need to alert the user that we have switched to ServiceWorker mode by default
        if (!params.defaultModeChangeAlertDisplayed) checkAndDisplayInjectionModeChangeAlert();
    }, 250);
}

/**
 * Queries Service Worker if possible to determine cache capability and returns an object with cache attributes
 * If Service Worker is not available, the attributes of the memory cache are returned instead
 * @returns {Promise<Object>} A Promise for an object with cache attributes 'type', 'description', and 'count'
 */
function getAssetsCacheAttributes () {
    return new Promise(function (resolve, reject) {
        if (params.contentInjectionMode === 'serviceworker' && navigator.serviceWorker && navigator.serviceWorker.controller) {
            // Create a Message Channel
            var channel = new MessageChannel();
            // Handler for recieving message reply from service worker
            channel.port1.onmessage = function (event) {
                var cache = event.data;
                if (cache.error) {
                    reject(cache.error);
                } else {
                    if (cache.type === 'cacheAPI' && selectedArchive && selectedArchive.zimType === 'zimit' && appstate.isReplayWorkerAvailable) {
                        cache.type = 'replayWorker';
                        cache.description = 'ReplayWorker';
                        cache.count = '-';
                    }
                    resolve(cache);
                }
            };
            // Ask Service Worker for its cache status and asset count
            navigator.serviceWorker.controller.postMessage({
                action: {
                    assetsCache: params.assetsCache ? 'enable' : 'disable',
                    appCache: params.appCache ? 'enable' : 'disable',
                    checkCache: window.location.href
                }
            }, [channel.port2]);
        } else {
            // No Service Worker has been established, so we resolve the Promise with cssCache details only
            resolve({
                type: params.assetsCache ? 'memory' : 'none',
                name: 'cssCache',
                description: params.assetsCache ? 'Memory' : 'None',
                count: selectedArchive ? selectedArchive.cssCache.size : 0
            });
        }
    });
}

/**
 * Refreshes the UI (Configuration) with the cache attributes obtained from getAssetsCacheAttributes()
 */
function refreshCacheStatus () {
    // Update radio buttons and checkbox
    document.getElementById('cachedAssetsModeRadio' + (params.assetsCache ? 'True' : 'False')).checked = true;
    // Change app's background colour if the bypass appCacche setting is enabled, as a visible warning
    if (params.appCache) {
        document.documentElement.style.removeProperty('background');
    } else {
        document.documentElement.style.background = /^dark/.test(document.documentElement.dataset.theme) ? '#300000' : 'mistyrose';
    }
    // Hide or show the jqueryCompatibility info
    document.getElementById('jqueryCompatibility').style.display = params.contentInjectionMode === 'jquery' ? '' : 'none';
    // Get cache attributes, then update the UI with the obtained data
    getAssetsCacheAttributes().then(function (cache) {
        if (cache.type === 'cacheAPI' && ASSETS_CACHE !== cache.name) {
            console.error('DEV: The ASSETS_CACHE defined in app.js does not match the ASSETS_CACHE defined in service-worker.js!');
        }
        document.getElementById('cacheUsed').textContent = cache.description;
        document.getElementById('assetsCount').textContent = cache.count;
        var cacheSettings = document.getElementById('performanceSettingsDiv');
        var cacheStatusPanel = document.getElementById('cacheStatusPanel');
        [cacheSettings, cacheStatusPanel].forEach(function (card) {
            // IE11 cannot remove more than one class from a list at a time
            card.classList.remove('card-success');
            card.classList.remove('card-warning');
            if (params.assetsCache) card.classList.add('card-success');
            else card.classList.add('card-warning');
        });
    });
}

var serviceWorkerRegistration = null;

/**
 * Sends an 'init' message to the ServiceWorker and inititalizes the onmessage event
 * It is called when the Service Worker is first activated, and also when a new archive is loaded
 * When a message is received, it will provide a MessageChannel port to respond to the ServiceWorker
 */
function initServiceWorkerMessaging () {
    if (!(isServiceWorkerAvailable() && isMessageChannelAvailable())) {
        console.warn('Cannot initiate ServiceWorker messaging, because one or more API is unavailable!');
        return;
    };
    // Create a message listener
    navigator.serviceWorker.onmessage = function (event) {
        if (event.data.error) {
            console.error('Error in MessageChannel', event.data.error);
            throw event.data.error;
        } else if (event.data.action === 'acknowledge') {
            // The Service Worker is acknowledging receipt of init message
            console.log('SW acknowledged init message');
            serviceWorkerRegistration = true;
            refreshAPIStatus();
        } else if (event.data.action === 'askForContent') {
            // The Service Worker is asking for content. Check we have a loaded ZIM in this instance.
            // DEV: This can happen if there are various instances of the app open in different tabs or windows, and no archive has been selected in this instance.
            if (!selectedArchive) {
                console.warn('Message from SW received, but no archive is selected!');
                return;
            }
            // See below for explanation of this exception
            const videoException = selectedArchive.zimType === 'zimit' && /\/\/youtubei.*player/.test(event.data.title);
            // Check that the zimFileId in the messageChannel event data is the same as the one in the currently open archive
            // Because the SW broadcasts its request to all open tabs or windows, we need to check that the request is for this instance
            if (event.data.zimFileName !== selectedArchive.file.name && !videoException) {
                // Do nothing if the request is not for this instance
                // console.debug('SW request does not match this instance', '[zimFileName:' + event.data.zimFileName + ' !== ' + selectedArchive.file.name + ']');
            } else {
                if (videoException) {
                    // DEV: This is a hack to allow YouTube videos to play in Zimit archives:
                    // Because links are embedded in a nested iframe, the SW cannot identify the top-level window from which to request the ZIM content
                    // Until we find a way to tell where it is coming from, we allow the request through on all controlled clients and try to load the content
                    console.warn('>>> Allowing passthrough of SW request to process Zimit video <<<');
                }
                if (params.useLibzim) handleMessageChannelByLibzim(event);
                else handleMessageChannelMessage(event);
            }
        } else if (event.data.msg_type) {
            // Messages received from the ReplayWorker
            if (event.data.msg_type === 'colAdded') {
                console.debug('ReplayWorker added a collection');
            }
        } else {
            console.error('Invalid message received', event.data);
        }
    };
    // Send the init message to the ServiceWorker
    if (navigator.serviceWorker.controller) {
        console.log('Initializing SW messaging...');
        navigator.serviceWorker.controller.postMessage({
            action: 'init'
        });
    } else if (serviceWorkerRegistration) {
        // If this is the first time we are initiating the SW, allow Promises to complete and assets to be fetched by delaying potential reload
        console.warn('The Service Worker needs more time to load, or else the app was force-refreshed...');
        serviceWorkerRegistration = null;
        setTimeout(initServiceWorkerMessaging, 3000);
    } else if (params.contentInjectionMode === 'serviceworker') {
        console.error('The Service Worker is not controlling the current page! We have to reload.');
        // Turn off failsafe, as this is a controlled reboot
        settingsStore.setItem('lastPageLoad', 'rebooting', Infinity);
        if (!appstate.preventAutoReboot) window.location.reload();
    } else if (/^https/.test(window.location.protocol) && navigator && navigator.serviceWorker && !navigator.serviceWorker.controller) {
        if (!params.noPrompts) {
            uiUtil.systemAlert('<p>No Service Worker is registered, meaning this app will not currently work offline!</p><p>Would you like to switch to ServiceWorker mode?</p>',
                'Offline use is disabled!', true).then(function (response) {
                if (response) {
                    setContentInjectionMode('serviceworker');
                    if (selectedArchive) {
                        setTimeout(function () {
                            params.themeChanged = true;
                            document.getElementById('btnHome').click();
                        }, 800);
                    }
                }
            });
        }
    }
}

/**
 * Function that handles a message of the messageChannel.
 * This function will deal with the messages if useLibzim is set to true
 *
 * @param {Event} event The event object of the message channel
 */
async function handleMessageChannelByLibzim (event) {
    // We received a message from the ServiceWorker
    // The ServiceWorker asks for some content
    const title = event.data.title;
    const messagePort = event.ports[0];
    try {
        const ret = await selectedArchive.callLibzimWorker({ action: 'getEntryByPath', path: title })
        if (ret === null) {
            console.error('Title ' + title + ' not found in archive.');
            messagePort.postMessage({ action: 'giveContent', title: title, content: '' });
            return;
        }

        if (ret.mimetype === 'unknown') {
            // We have a redirect to follow
            // this is still a bit flawed, as we do not check if it's a redirect or the file doesn't exist
            // We have no way to know if the file exists or not, so we have to assume it does and its just a redirect

            const dirEntry = await new Promise((resolve, _reject) => selectedArchive.getMainPageDirEntry((value) => resolve(value)));
            if (dirEntry.redirect) {
                const redirect = await new Promise((resolve, _reject) => selectedArchive.resolveRedirect(dirEntry, (v) => resolve(v)));
                const ret = await selectedArchive.callLibzimWorker({ action: 'getEntryByPath', path: redirect.namespace + '/' + redirect.url })
                const message = { action: 'giveContent', title: title, content: ret.content, mimetype: ret.mimetype };
                messagePort.postMessage(message);
                return;
            }
        }

        // Let's send the content to the ServiceWorker
        const message = { action: 'giveContent', title: title, content: ret.content, mimetype: ret.mimetype };
        messagePort.postMessage(message);
    } catch (error) {
        const message = { action: 'giveContent', title: title, content: new Uint8Array(), mimetype: '' };
        messagePort.postMessage(message);
    }
}

/**
 * Sets the given injection mode.
 * This involves registering (or re-enabling) the Service Worker if necessary
 * It also refreshes the API status for the user afterwards.
 *
 * @param {String} value The chosen content injection mode : 'jquery' or 'serviceworker'
 */
function setContentInjectionMode (value) {
    console.debug('Setting content injection mode to', value);
    params.oldInjectionMode = params.serviceWorkerLocal ? 'serviceworkerlocal' : params.contentInjectionMode;
    params.serviceWorkerLocal = false;
    if (value === 'serviceworkerlocal') {
        value = 'serviceworker';
        params.serviceWorkerLocal = true;
    }
    params.contentInjectionMode = value;
    params.originalContentInjectionMode = null;
    var message = '';
    if (value === 'jquery') {
        if (!params.appCache) {
            uiUtil.systemAlert((translateUI.t('dialog-bypassappcache-conflict-message') || 'You must deselect the "Bypass AppCache" option before switching to Restricted mode!'),
                (translateUI.t('dialog-bypassappcache-conflict-title') || 'Deselect "Bypass AppCache"')).then(function () {
                setContentInjectionMode('serviceworker');
            })
            return;
        }
        if (params.referrerExtensionURL) {
            // We are in an extension, and the user may wish to revert to local code
            message = translateUI.t('dialog-launchlocal-message') || 'This will switch to using locally packaged code only. Some configuration settings may be lost.<br/><br/>' +
                'WARNING: After this, you may not be able to switch back to SW mode without an online connection!';
            var launchLocal = function () {
                settingsStore.setItem('allowInternetAccess', false, Infinity);
                var uriParams = '?allowInternetAccess=false&contentInjectionMode=jquery&hideActiveContentWarning=false';
                uriParams += '&appTheme=' + params.appTheme;
                uriParams += '&showUIAnimations=' + params.showUIAnimations;
                window.location.href = params.referrerExtensionURL + '/www/index.html' + uriParams;
                console.log('Beam me down, Scotty!');
            };
            uiUtil.systemAlert(message, (translateUI.t('dialog-launchlocal-title') || 'Warning!'), true).then(function (response) {
                if (response) {
                    launchLocal();
                } else {
                    setContentInjectionMode('serviceworker');
                }
            });
            return;
        }
        // Because the Service Worker must still run in a PWA app so that it can work offline, we don't actually disable the SW in this context,
        // but it will no longer be intercepting requests for ZIM assets (only requests for the app's own code)
        if ('serviceWorker' in navigator) {
            serviceWorkerRegistration = null;
        }
        // User has switched to jQuery mode, so no longer needs ASSETS_CACHE
        // We should empty it and turn it off to prevent unnecessary space usage
        if ('caches' in window && isMessageChannelAvailable()) {
            if (isServiceWorkerAvailable() && navigator.serviceWorker.controller) {
                var channel = new MessageChannel();
                navigator.serviceWorker.controller.postMessage({
                    action: { assetsCache: 'disable' }
                }, [channel.port2]);
            }
            caches.delete(ASSETS_CACHE);
        }
        refreshAPIStatus();
    } else if (value === 'serviceworker') {
        var protocol = window.location.protocol;
        // Since Firefox 103, the ServiceWorker API is not available any more in Webextensions. See https://hg.mozilla.org/integration/autoland/rev/3a2907ad88e8 and https://bugzilla.mozilla.org/show_bug.cgi?id=1593931
        // Previously, the API was available, but failed to register (which we could trap a few lines below).
        // So we now need to suggest a switch to the PWA if we are inside a Firefox Extension and the ServiceWorker API is unavailable.
        // Even if some older firefox versions do not support ServiceWorkers at all (versions 42, 43, 45ESR, 52ESR, 60ESR and 68ESR, based on https://caniuse.com/serviceworkers). In this case, the PWA will not work either.
        if (/^(moz|chrome)-extension:/.test(protocol) && !params.serviceWorkerLocal) {
            launchBrowserExtensionServiceWorker();
        } else {
            if (!isServiceWorkerAvailable()) {
                message = translateUI.t('dialog-launchpwa-unsupported-message') ||
                    '<p>Unfortunately, your browser does not appear to support ServiceWorker mode, which is now the default for this app.</p>' +
                    '<p>You can continue to use the app in Restricted mode, but note that this mode only works well with ' +
                    'ZIM archives that have static content, such as Wikipedia / Wikimedia ZIMs or Stackexchange.</p>' +
                    '<p>If you can, we recommend that you update your browser to a version that supports ServiceWorker mode.</p>';
                if (!params.noPrompts) {
                    uiUtil.systemAlert(message, (translateUI.t('dialog-launchpwa-unsupported-title') || 'ServiceWorker API not available'), true, null,
                        (translateUI.t('dialog-serviceworker-unsupported-fallback') || 'Use Restricted mode')).then(function (response) {
                        if (params.referrerExtensionURL && response) {
                            var uriParams = '?allowInternetAccess=false&contentInjectionMode=jquery&defaultModeChangeAlertDisplayed=true';
                            window.location.href = params.referrerExtensionURL + '/www/index.html' + uriParams;
                        } else {
                            setContentInjectionMode(params.oldInjectionMode || 'jquery');
                        }
                    });
                } else {
                    setContentInjectionMode(params.oldInjectionMode || 'jquery');
                }
                return;
            }
            if (!isMessageChannelAvailable()) {
                uiUtil.systemAlert((translateUI.t('dialog-messagechannel-unsupported-message') || 'The MessageChannel API is not available on your device. Falling back to Restricted mode...'),
                    (translateUI.t('dialog-messagechannel-unsupported-title') || 'MessageChannel API not available')).then(function () {
                    setContentInjectionMode('jquery');
                });
                return;
            }
            if (!isServiceWorkerReady()) {
                var serviceWorkerStatus = document.getElementById('serviceWorkerStatus');
                serviceWorkerStatus.textContent = 'ServiceWorker API available : trying to register it...';
                if (navigator.serviceWorker.controller) {
                    console.log('Active Service Worker found, no need to register');
                    serviceWorkerRegistration = true;
                    // Remove any jQuery hooks from a previous jQuery session
                    var articleContent = document.getElementById('articleContent');
                    while (articleContent.firstChild) {
                        articleContent.removeChild(articleContent.firstChild);
                    }
                    // Create the MessageChannel and send 'init'
                    refreshAPIStatus();
                } else {
                    navigator.serviceWorker.register('../service-worker.js').then(function (reg) {
                        // The ServiceWorker is registered
                        serviceWorkerRegistration = reg;
                        // We need to wait for the ServiceWorker to be activated
                        // before sending the first init message
                        var serviceWorker = reg.installing || reg.waiting || reg.active;
                        serviceWorker.addEventListener('statechange', function (statechangeevent) {
                            if (statechangeevent.target.state === 'activated') {
                                // Remove any jQuery hooks from a previous jQuery session
                                var articleContent = document.getElementById('articleContent');
                                while (articleContent.firstChild) {
                                    articleContent.removeChild(articleContent.firstChild);
                                }
                                // We need to refresh cache status here on first activation because SW was inaccessible till now
                                // We also initialize the ASSETS_CACHE constant in SW here
                                refreshCacheStatus();
                                refreshAPIStatus();
                            }
                        });
                        refreshCacheStatus();
                        refreshAPIStatus();
                    }).catch(function (err) {
                        if (protocol === 'moz-extension:') {
                            // This is still useful for Firefox<103 extensions, where the ServiceWorker API is available, but fails to register
                            launchBrowserExtensionServiceWorker();
                        } else {
                            console.error('Error while registering serviceWorker', err);
                            refreshAPIStatus();
                            var message = (translateUI.t('dialog-serviceworker-registration-failure-message') || 'The Service Worker could not be properly registered. Switching back to Restricted mode... Error message:') + ' ' + err;
                            if (protocol === 'file:') {
                                message += (translateUI.t('dialog-serviceworker-registration-failure-fileprotocol') ||
                                '<br/><br/>You seem to be opening kiwix-js with the file:// protocol. You should open it through a web server: either through a local one (http://localhost/...) or through a remote one (but you need a secure connection: https://webserver.org/...)');
                            }
                            appstate.preventAutoReboot = true;
                            if (!params.noPrompts) {
                                uiUtil.systemAlert(message, (translateUI.t('dialog-serviceworker-registration-failure-title') || 'Failed to register Service Worker')).then(function () {
                                    setContentInjectionMode('jquery');
                                    // We need to wait for the previous dialogue box to unload fully before attempting to display another
                                    setTimeout(function () {
                                        params.defaultModeChangeAlertDisplayed = false;
                                        settingsStore.removeItem('defaultModeChangeAlertDisplayed');
                                        checkAndDisplayInjectionModeChangeAlert();
                                    }, 1200);
                                });
                            }
                        }
                    });
                }
            } else {
                // We need to set this variable earlier else the Service Worker does not get reactivated
                params.contentInjectionMode = value;
                // initOrKeepAliveServiceWorker();
            }
        }
    }
    document.querySelectorAll('input[name=contentInjectionMode]').forEach(function (radio) {
        radio.checked = false;
    });
    var trueMode = params.serviceWorkerLocal ? value + 'local' : value;
    var radioToCheck = document.querySelector('input[name=contentInjectionMode][value="' + trueMode + '"]');
    if (radioToCheck) {
        radioToCheck.checked = true;
    }
    // Save the value in the Settings Store, so that to be able to keep it after a reload/restart
    settingsStore.setItem('contentInjectionMode', trueMode, Infinity);
    refreshCacheStatus();
    refreshAPIStatus();
    // Even in JQuery mode, the PWA needs to be able to serve the app in offline mode
    setTimeout(initServiceWorkerMessaging, 600);
    // Set the visibility of WebP workaround after change of content injection mode
    // Note we need a timeout because loading the webpHero script in init.js is asynchronous
    setTimeout(uiUtil.determineCanvasElementsWorkaround, 1500);
}

/**
 * Detects whether the ServiceWorker API is available
 * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker
 * @returns {Boolean}
 */
function isServiceWorkerAvailable () {
    return 'serviceWorker' in navigator;
}

/**
 * Detects whether the MessageChannel API is available
 * https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel
 * @returns {Boolean}
 */
function isMessageChannelAvailable () {
    try {
        var dummyMessageChannel = new MessageChannel();
        if (dummyMessageChannel) return true;
    } catch (e) {
        return false;
    }
    return false;
}

/**
 * Tells if the ServiceWorker is registered, and ready to capture HTTP requests
 * and inject content in articles.
 * @returns {Boolean}
 */
function isServiceWorkerReady () {
    // Return true if the serviceWorkerRegistration is not null and not undefined
    return serviceWorkerRegistration;
}

function launchBrowserExtensionServiceWorker () {
    // DEV: See explanation below for why we access localStorage directly here
    var PWASuccessfullyLaunched = localStorage.getItem(params.keyPrefix + 'PWA_launch') === 'success';
    var allowInternetAccess = settingsStore.getItem('allowInternetAccess') === 'true';
    var message = params.defaultModeChangeAlertDisplayed
        ? (translateUI.t('dialog-allow-internetaccess-message1') || '<p>To enable the Service Worker, we') + ' '
        : ((translateUI.t('dialog-allow-internetaccess-message2') || '<p>We shall attempt to switch you to ServiceWorker mode (this is now the default).') + ' ' +
        (translateUI.t('dialog-allow-internetaccess-message3') || 'It supports more types of ZIM archives and is much more robust.</p><p>We') + ' ');
    message += (translateUI.t('dialog-allow-internetaccess-message4') ||
        'need one-time access to our secure server so that the app can re-launch as a Progressive Web App (PWA). ' +
        'If available, the PWA will work offline, but will auto-update periodically when online as per the ' +
        'Service Worker spec.</p><p>You can switch back any time by returning to Restricted mode.</p>' +
        '<p>WARNING: This will attempt to access the following server:<br/>') + params.PWAServer + '</p>';
    var launchPWA = function () {
        uiUtil.spinnerDisplay(false);
        var uriParams = '?contentInjectionMode=serviceworker&allowInternetAccess=true';
        uriParams += '&referrerExtensionURL=' + encodeURIComponent(window.location.href.replace(/\/www\/index.html.*$/i, ''));
        if (!PWASuccessfullyLaunched || !allowInternetAccess) {
            // Add any further params that should only be passed when the user is intentionally switching to SW mode
            uriParams += '&appTheme=' + params.appTheme;
            uriParams += '&showUIAnimations=' + params.showUIAnimations;
        }
        settingsStore.setItem('contentInjectionMode', 'serviceworker', Infinity);
        // This is needed so that we get passthrough on subsequent launches
        settingsStore.setItem('allowInternetAccess', true, Infinity);
        // Signal failure of PWA until it has successfully launched (in init.js it will be changed to 'success')
        // DEV: We write directly to localStorage instead of using settingsStore here because we need 100% certainty
        // regarding the location of the key to be able to retrieve it in init.js before settingsStore is initialized
        localStorage.setItem(params.keyPrefix + 'PWA_launch', 'fail');
        window.location.href = params.PWAServer + 'www/index.html' + uriParams;
        console.log('Beam me up, Scotty!');
    };
    var checkPWAIsOnline = function () {
        uiUtil.spinnerDisplay(true, (translateUI.t('dialog-serveraccess-check') || 'Checking server access...'));
        uiUtil.checkServerIsAccessible(params.PWAServer + 'www/img/icons/kiwix-32.png', launchPWA, function () {
            uiUtil.spinnerDisplay(false);
            uiUtil.systemAlert((translateUI.t('dialog-serveraccess-check-failed') || 'The server is not currently accessible! ' +
                '<br/><br/>(Kiwix needs one-time access to the server to cache the PWA).' +
                '<br/>Please try again when you have a stable Internet connection.'), (translateUI.t('dialog-error-title') || 'Error!')).then(function () {
                settingsStore.setItem('allowInternetAccess', false, Infinity);
                setContentInjectionMode(params.oldInjectionMode || 'jquery');
            });
        });
    };
    if (settingsStore.getItem('allowInternetAccess') === 'true') {
        if (PWASuccessfullyLaunched) {
            launchPWA();
        } else {
            uiUtil.systemAlert((translateUI.t('dialog-launchpwa-fail-message') || 'The last attempt to launch the PWA appears to have failed.<br/><br/>Do you wish to try again?'),
                (translateUI.t('dialog-launchpwa-fail-title') || 'Confirmation to retry PWA launch'), true).then(function (response) {
                if (response) {
                    checkPWAIsOnline();
                } else {
                    settingsStore.setItem('allowInternetAccess', false, Infinity);
                    setContentInjectionMode(params.oldInjectionMode || 'jquery');
                }
            })
        }
    } else {
        uiUtil.systemAlert(message, (translateUI.t('dialog-allow-internetaccess-title') || 'Allow Internet access'), true).then(function (response) {
            if (response) {
                checkPWAIsOnline();
            } else {
                // User cancelled, so wants to stay in previous mode (so long as this wasn't SW mode)
                params.oldInjectionMode = params.oldInjectionMode === 'serviceworker' ? /^chrome-extension:/i.test(window.location.protocol) ? 'serviceworkerlocal' : null : params.oldInjectionMode;
                setContentInjectionMode(params.oldInjectionMode || 'jquery');
                settingsStore.setItem('allowInternetAccess', false, Infinity);
                // We should not bother user with the default mode change alert again
                params.defaultModeChangeAlertDisplayed = true;
                settingsStore.setItem('defaultModeChangeAlertDisplayed', true, Infinity)
            }
        });
    }
}

/**
 *
 * @type Array.<StorageFirefoxOS>
 */
var storages = [];
function searchForArchivesInPreferencesOrStorage () {
    // First see if the list of archives is stored in the Settings Store
    var listOfArchivesFromSettingsStore = settingsStore.getItem('listOfArchives');
    if (listOfArchivesFromSettingsStore !== null && listOfArchivesFromSettingsStore !== undefined && listOfArchivesFromSettingsStore !== '') {
        var directories = listOfArchivesFromSettingsStore.split('|');
        populateDropDownListOfArchives(directories);
    } else {
        searchForArchivesInStorage();
    }
}
function searchForArchivesInStorage () {
    // If DeviceStorage is available, we look for archives in it
    document.getElementById('btnConfigure').click();
    document.getElementById('scanningForArchives').style.display = '';
    zimArchiveLoader.scanForArchives(storages, populateDropDownListOfArchives, function () {
        // callbackError function is called in case of an error
        uiUtil.systemAlert().then(populateDropDownListOfArchives(null));
    });
}
if (navigator.getDeviceStorages && typeof navigator.getDeviceStorages === 'function') {
    // The method getDeviceStorages is available (FxOS>=1.1)
    storages = Array.from(navigator.getDeviceStorages('sdcard')).map(function (s) {
        return new abstractFilesystemAccess.StorageFirefoxOS(s);
    });
}

// @AUTOLOAD of archives starts here for frameworks or APIs that allow it
var willJumpToRemoteExtension = params.contentInjectionMode === 'serviceworker' && navigator.serviceWorker && /^(moz|chrome)-extension/.test(window.location.protocol) && localStorage.getItem(params.keyPrefix + 'PWA_launch') === 'success';

// If DeviceStorage is available (Firefox OS), we look for archives in it
if (storages !== null && storages.length > 0) {
    // Make a fake first access to device storage, in order to ask the user for confirmation if necessary.
    // This way, it is only done once at this moment, instead of being done several times in callbacks
    // After that, we can start looking for archives
    storages[0].get('fake-file-to-read').then(searchForArchivesInPreferencesOrStorage,
        searchForArchivesInPreferencesOrStorage);
// If the File System Access API is available, we may be able to autoload the last selected archive in Chromium > 122
// which has persistent permissions
} else if (params.reopenLastArchive && window.showOpenFilePicker && params.previousZimFileName) {
    displayFileSelect();
    abstractFilesystemAccess.getSelectedZimFromCache(params.previousZimFileName).then(function (files) {
        setLocalArchiveFromFileList(files);
    }).catch(function (err) {
        console.warn(err);
        if (!willJumpToRemoteExtension) {
            document.getElementById('btnConfigure').click();
        }
    });
// If no autoload API is available and we're not about to jump to the remote extension, we display the file select dialog
} else if (!willJumpToRemoteExtension) {
    displayFileSelect();
    if (archiveFiles.files && archiveFiles.files.length > 0) {
        // Archive files are already selected,
        setLocalArchiveFromFileSelect();
    } else {
        document.getElementById('btnConfigure').click();
    }
}

// Display the article when the user goes back in the browser history
window.onpopstate = function (event) {
    if (event.state) {
        var title = event.state.title;
        var titleSearch = event.state.titleSearch;
        document.getElementById('prefix').value = '';
        document.getElementById('welcomeText').style.display = 'none';
        uiUtil.spinnerDisplay(false);
        // Replacing $('.navbar-collapse').collapse('hide');
        var navbarCollapse = document.querySelector('.navbar-collapse');
        navbarCollapse.classList.remove('show');
        document.getElementById('configuration').style.display = 'none';
        document.getElementById('articleListWithHeader').style.display = 'none';
        // Replacing $('#articleContent').contents().empty();
        var articleContent = document.getElementById('articleContent');
        while (articleContent.firstChild) {
            articleContent.removeChild(articleContent.firstChild);
        }
        if (title && !(title === '')) {
            goToArticle(title);
        } else if (titleSearch && titleSearch !== '') {
            document.getElementById('prefix').value = titleSearch;
            if (titleSearch !== appstate.search.prefix) {
                searchDirEntriesFromPrefix(titleSearch);
            } else {
                document.getElementById('prefix').focus();
            }
        }
    }
};

/**
 * Populate the drop-down list of archives with the given list
 * @param {Array.<String>} archiveDirectories
 */
function populateDropDownListOfArchives (archiveDirectories) {
    document.getElementById('scanningForArchives').style.display = 'none';
    document.getElementById('chooseArchiveFromLocalStorage').style.display = '';
    document.getElementById('rescanButtonAndText').style.display = '';
    var comboArchiveList = document.getElementById('archiveList');
    comboArchiveList.options.length = 0;
    for (var i = 0; i < archiveDirectories.length; i++) {
        var archiveDirectory = archiveDirectories[i];
        if (archiveDirectory === '/') {
            uiUtil.systemAlert((translateUI.t('dialog-invalid-archivelocation-message') ||
                'It looks like you have put some archive files at the root of your sdcard (or internal storage). Please move them to a subdirectory'),
            (translateUI.t('dialog-invalid-archivelocation-title') || 'Error: invalid archive files location'));
        } else {
            comboArchiveList.options[i] = new Option(archiveDirectory, archiveDirectory);
        }
    }
    // Store the list of archives in the Settings Store, to avoid rescanning at each start
    settingsStore.setItem('listOfArchives', archiveDirectories.join('|'), Infinity);
    document.getElementById('archiveList').addEventListener('change', setLocalArchiveFromArchiveList);
    if (comboArchiveList.options.length > 0) {
        var lastSelectedArchive = settingsStore.getItem('lastSelectedArchive');
        if (lastSelectedArchive !== null && lastSelectedArchive !== undefined && lastSelectedArchive !== '') {
            // Attempt to select the corresponding item in the list, if it exists
            if (document.querySelector("#archiveList option[value='" + lastSelectedArchive + "']")) {
                document.getElementById('archiveList').value = lastSelectedArchive;
            }
        }
        // Set the localArchive as the last selected (or the first one if it has never been selected)
        setLocalArchiveFromArchiveList();
    } else {
        uiUtil.systemAlert((translateUI.t('dialog-welcome-message') || 'Welcome to Kiwix! This application needs at least a ZIM file in your SD-card (or internal storage). Please download one and put it on the device (see About section). Also check that your device is not connected to a computer through USB device storage (which often locks the SD-card content)'),
            (translateUI.t('dialog-welcome-title') || 'Welcome')).then(function () {
            document.getElementById('btnAbout').click();
            var isAndroid = (navigator.userAgent.indexOf('Android') !== -1);
            if (isAndroid) {
                uiUtil.systemAlert(translateUI.t('dialog-old-android') || "You seem to be using an Android device with DeviceStorage API. That must be a quite old Firefox version because this API has been removed in 2016. Be aware that there was a bug on Firefox, that prevents finding Wikipedia archives in a SD-card (at least on some devices). Please put the archive in the internal storage if the application can't find it.",
                    translateUI.t('dialog-launchlocal-title') || 'Warning!');
            }
        });
    }
}

/**
 * Sets the localArchive from the selected archive in the drop-down list
 */
function setLocalArchiveFromArchiveList () {
    var archiveDirectory = document.getElementById('archiveList').value;
    if (archiveDirectory && archiveDirectory.length > 0) {
        // Now, try to find which DeviceStorage has been selected by the user
        // It is the prefix of the archive directory
        var regexpStorageName = /^\/([^/]+)\//;
        var regexpResults = regexpStorageName.exec(archiveDirectory);
        var selectedStorage = null;
        if (regexpResults && regexpResults.length > 0) {
            var selectedStorageName = regexpResults[1];
            for (var i = 0; i < storages.length; i++) {
                var storage = storages[i];
                if (selectedStorageName === storage.storageName) {
                    // We found the selected storage
                    selectedStorage = storage;
                }
            }
            if (selectedStorage === null) {
                uiUtil.systemAlert((translateUI.t('dialog-devicestorage-error-message') || 'Unable to find which device storage corresponds to directory') + ' ' + archiveDirectory, 'Error: no matching storage');
            }
        } else {
            // This happens when the archiveDirectory is not prefixed by the name of the storage
            // (in the Simulator, or with FxOs 1.0, or probably on devices that only have one device storage)
            // In this case, we use the first storage of the list (there should be only one)
            if (storages.length === 1) {
                selectedStorage = storages[0];
            } else {
                uiUtil.systemAlert('Something weird happened with the DeviceStorage API: found a directory without prefix:' + ' ' +
                archiveDirectory + ', ' + 'but there were' + ' ' + storages.length +
                ' ' + 'storages found with getDeviceStorages instead of 1', 'Error: unprefixed directory');
            }
        }
        settingsStore.setItem('lastSelectedArchive', archiveDirectory, Infinity);
        zimArchiveLoader.loadArchiveFromDeviceStorage(selectedStorage, archiveDirectory, archiveReadyCallback, function (message, label) {
            // callbackError which is called in case of an error
            uiUtil.systemAlert(message, label);
        });
    }
}

/**
 * Resets the CSS Cache (used only in jQuery mode)
 */
function resetCssCache () {
    // Reset the cssCache if an archive is loaded
    if (selectedArchive) selectedArchive.cssCache = new Map();
}

let webKitFileList = null

/**
 * Displays the zone to select files from the archive
 */
function displayFileSelect () {
    const isFireFoxOsNativeFileApiAvailable = typeof navigator.getDeviceStorages === 'function';
    let isPlatformMobilePhone = false;
    if (/Android/i.test(navigator.userAgent)) isPlatformMobilePhone = true;
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) isPlatformMobilePhone = true;

    console.debug(`File system api is ${params.isFileSystemApiSupported ? '' : 'not '}supported`);
    console.debug(`Webkit directory api ${params.isWebkitDirApiSupported ? '' : 'not '}supported`);
    console.debug(`Firefox os native file ${isFireFoxOsNativeFileApiAvailable ? '' : 'not '}support api`)

    document.getElementById('openLocalFiles').style.display = 'block';
    if ((params.isFileSystemApiSupported || params.isWebkitDirApiSupported) && !isPlatformMobilePhone) {
        document.getElementById('chooseArchiveFromLocalStorage').style.display = '';
        document.getElementById('folderSelect').style.display = '';
    }

    // Set the main drop zone
    if (!params.disableDragAndDrop) {
        // Set a global drop zone, so that whole page is enabled for drag and drop
        globalDropZone.addEventListener('dragover', handleGlobalDragover);
        globalDropZone.addEventListener('dragleave', handleGlobalDragleave);
        globalDropZone.addEventListener('drop', handleFileDrop);
        globalDropZone.addEventListener('dragenter', handleGlobalDragenter);
    }

    if (isFireFoxOsNativeFileApiAvailable) {
        useLegacyFilePicker();
        return;
    }

    document.getElementById('archiveList').addEventListener('change', function (e) {
        // handle zim selection from dropdown if multiple files are loaded via webkitdirectory or filesystem api
        settingsStore.setItem('previousZimFileName', e.target.value, Infinity);
        if (params.isFileSystemApiSupported) {
            return abstractFilesystemAccess.getSelectedZimFromCache(e.target.value).then(function (files) {
                setLocalArchiveFromFileList(files);
            }).catch(function (err) {
                console.error(err);
                return uiUtil.systemAlert(translateUI.t('dialog-fielhandle-fail-message') || 'We were unable to retrieve a file handle for the selected archive. Please pick the file or folder again.',
                    translateUI.t('dialog-fielhandle-fail-title') || 'Error retrieving archive');
            });
        } else {
            if (webKitFileList === null) {
                const element = settingsStore.getItem('zimFilenames').split('|').length === 1 ? 'archiveFiles' : 'archiveFolders';
                if ('showPicker' in HTMLInputElement.prototype) {
                    document.getElementById(element).showPicker();
                    return;
                }
                document.getElementById(element).click()
                return;
            }
            const files = abstractFilesystemAccess.getSelectedZimFromWebkitList(webKitFileList, e.target.value);
            setLocalArchiveFromFileList(files);
        }
    });

    if (params.isFileSystemApiSupported) {
        // Handles Folder selection when showDirectoryPicker is supported
        folderSelect.addEventListener('click', async function (e) {
            e.preventDefault();
            const previousZimFiles = await abstractFilesystemAccess.selectDirectoryFromPickerViaFileSystemApi()
            if (previousZimFiles.length === 1) setLocalArchiveFromFileList(previousZimFiles);
        });
    }
    if (params.isWebkitDirApiSupported) {
        // Handles Folder selection when webkitdirectory is supported but showDirectoryPicker is not
        folderSelect.addEventListener('change', function (e) {
            e.preventDefault();
            var fileList = e.target.files;
            if (fileList) {
                var foundFiles = abstractFilesystemAccess.selectDirectoryFromPickerViaWebkit(fileList);
                var selectedZimfile = foundFiles.selectedFile;
                // This ensures the selected files are stored for use during this session (webKitFileList is a global object)
                webKitFileList = foundFiles.files;
                // This will load the old file if the selected folder contains the same file
                if (selectedZimfile.length !== 0) {
                    setLocalArchiveFromFileList(selectedZimfile);
                }
            }
        })
    }

    if (params.isFileSystemApiSupported) {
        // Handles File selection when showOpenFilePicker is supported and uses the filesystem api
        archiveFiles.addEventListener('click', async function (e) {
            e.preventDefault();
            const files = await abstractFilesystemAccess.selectFileFromPickerViaFileSystemApi(e);
            setLocalArchiveFromFileList(files);
        });
    } else {
        // Fallbacks to simple file input with multi file selection
        useLegacyFilePicker();
    }
    // Add keyboard activation for folder selection
    folderSelect.addEventListener('keydown', function (e) {
        // We have to include e.keyCode for IE11
        if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 32) {
            e.preventDefault();
            folderSelect.click();
        }
    });
}

/**
 * Adds a event listener to the file input to handle file selection (if no other file picker is supported)
 */
function useLegacyFilePicker () {
    // Fallbacks to simple file input with multi file selection
    archiveFiles.addEventListener('change', function (e) {
        if (params.isWebkitDirApiSupported || params.isFileSystemApiSupported) {
            const activeFilename = e.target.files[0].name;
            settingsStore.setItem('zimFilenames', [activeFilename].join('|'), Infinity);
            abstractFilesystemAccess.updateZimDropdownOptions([activeFilename], activeFilename);
        }
        setLocalArchiveFromFileSelect();
    });
}

// Add keyboard selection for the archiveFiles input
document.getElementById('archiveFilesLbl').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
        archiveFiles.click();
    }
});

/** Drag and Drop handling for ZIM files */

// Keep track of entrance event so we only fire the correct leave event
var enteredElement;

function handleGlobalDragenter (e) {
    e.preventDefault();
    // Disable pointer-events on children so they don't interfere with dragleave events
    globalDropZone.classList.add('dragging-over');
    enteredElement = e.target;
}

function handleGlobalDragover (e) {
    e.preventDefault();

    if (hasType(e.dataTransfer.types, 'Files') && !hasInvalidType(e.dataTransfer.types)) {
        e.dataTransfer.dropEffect = 'link';
        globalDropZone.classList.add('dragging-over');
        globalDropZone.style.border = '3px dashed red';
        document.getElementById('btnConfigure').click();
    }
}

function handleGlobalDragleave (e) {
    e.preventDefault();
    globalDropZone.style.border = '';
    if (enteredElement === e.target) {
        globalDropZone.classList.remove('dragging-over');
        // Only return to page if a ZIM is actually loaded
        if (selectedArchive && selectedArchive.isReady()) {
            uiUtil.returnToCurrentPage();
        }
    }
}

function handleIframeDragover (e) {
    e.preventDefault();
    if (hasType(e.dataTransfer.types, 'Files') && !hasInvalidType(e.dataTransfer.types)) {
        globalDropZone.classList.add('dragging-over');
        e.dataTransfer.dropEffect = 'link';
        document.getElementById('btnConfigure').click();
    }
}

function handleIframeDrop (e) {
    e.preventDefault();
    e.stopPropagation();
}

// Add type check for chromium browsers, since they count images on the same page as files
function hasInvalidType (typesList) {
    for (var i = 0; i < typesList.length; i++) {
        // Use indexOf() instead of startsWith() for IE11 support. Also, IE11 uses Text instead of text (and so does Opera).
        // This is not comprehensive, but should cover most cases.
        if (typesList[i].indexOf('image') === 0 || typesList[i].indexOf('text') === 0 || typesList[i].indexOf('Text') === 0 || typesList[i].indexOf('video') === 0) {
            return true;
        }
    }
    return false;
}

// IE11 doesn't support .includes(), so custom function to check for presence of types
function hasType (typesList, type) {
    for (var i = 0; i < typesList.length; i++) {
        if (typesList[i] === type) {
            return true;
        }
    }
    return false;
}

async function handleFileDrop (packet) {
    packet.stopPropagation();
    packet.preventDefault();
    globalDropZone.style.border = '';
    globalDropZone.classList.remove('dragging-over');
    var files = packet.dataTransfer.files;
    document.getElementById('selectInstructions').style.display = 'none';
    document.getElementById('fileSelectionButtonContainer').style.display = 'none';
    document.getElementById('downloadInstruction').style.display = 'none';
    document.getElementById('selectorsDisplay').style.display = 'inline';
    archiveFiles.value = null;

    // Value will be set to true if a folder is dropped then there will be no need to
    // call the `setLocalArchiveFromFileList`
    let loadZim = true;

    // No previous file will be loaded in case of FileSystemApi
    if (params.isFileSystemApiSupported) loadZim = await abstractFilesystemAccess.handleFolderOrFileDropViaFileSystemAPI(packet);
    else if (params.isWebkitDirApiSupported) {
        const ret = await abstractFilesystemAccess.handleFolderOrFileDropViaWebkit(packet);
        loadZim = ret.loadZim;
        webKitFileList = ret.files;
    }
    if (loadZim) setLocalArchiveFromFileList(files);
}

const btnLibrary = document.getElementById('btnLibrary');
btnLibrary.addEventListener('click', function (e) {
    const libraryContent = document.getElementById('libraryContent');
    const libraryIframe = libraryContent.contentWindow.document.getElementById('libraryIframe');
    uiUtil.tabTransitionToSection('library', params.showUIAnimations);
    resizeIFrame();
    kiwixLibrary.loadLibrary(libraryIframe);
});
// Add keyboard activation for library button
btnLibrary.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
        btnLibrary.click();
    }
});

// Add event listener to link which allows user to show file selectors
document.getElementById('selectorsDisplayLink').addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('selectInstructions').style.display = 'block';
    document.getElementById('downloadInstruction').style.display = 'block';
    document.getElementById('fileSelectionButtonContainer').style.display = 'block';
    document.getElementById('selectorsDisplay').style.display = 'none';
});

function setLocalArchiveFromFileList (files) {
    // Check for usable file types
    for (var i = files.length; i--;) {
        // DEV: you can support other file types by adding (e.g.) '|dat|idx' after 'zim\w{0,2}'
        if (!/\.(?:zim\w{0,2})$/i.test(files[i].name)) {
            uiUtil.systemAlert((translateUI.t('dialog-invalid-zim-message') || 'One or more files does not appear to be a ZIM file!'),
                (translateUI.t('dialog-invalid-zim-title') || 'Invalid file format'));
            return;
        }
    }
    zimArchiveLoader.loadArchiveFromFiles(files, archiveReadyCallback, function (message, label) {
        // callbackError which is called in case of an error
        uiUtil.systemAlert(message, label);
    });
}

/**
 * Functions to be run immediately after the archive is loaded
 *
 * @param {ZIMArchive} archive The ZIM archive
 */
async function archiveReadyCallback (archive) {
    selectedArchive = archive;
    // A css cache significantly speeds up the loading of CSS files (used by default in jQuery mode)
    selectedArchive.cssCache = new Map();
    if (selectedArchive.zimType !== 'zimit') {
        if (params.originalContentInjectionMode) {
            params.contentInjectionMode = params.originalContentInjectionMode;
            params.originalContentInjectionMode = null;
        }
    }
    // This flag will be reset each time a new archive is loaded
    appstate.wikimediaZimLoaded = /wikipedia|wikivoyage|mdwiki|wiktionary/i.test(archive.file.name);
    // Set contentInjectionMode to serviceWorker when opening a new archive in case the user switched to Restricted Mode/jquery Mode when opening the previous archive
    if (params.contentInjectionMode === 'jquery') {
        params.contentInjectionMode = settingsStore.getItem('contentInjectionMode');
        // Change the radio buttons accordingly
        switch (settingsStore.getItem('contentInjectionMode')) {
        case 'serviceworker':
            document.getElementById('serviceworkerModeRadio').checked = true;
            break;
        case 'serviceworkerlocal':
            document.getElementById('serviceworkerLocalModeRadio').checked = true;
            break;
        }
    }
    if (settingsStore.getItem('trustedZimFiles') === null) {
        settingsStore.setItem('trustedZimFiles', '', Infinity);
    }
    // This is used for testing: if the noPrompts flag is set, we skip the source verification
    if (params.noPrompts) params.sourceVerification = false;
    if (params.sourceVerification && (params.contentInjectionMode === 'serviceworker' || params.contentInjectionMode === 'serviceworkerlocal')) {
        // Check if source of the zim file can be trusted.
        if (!(settingsStore.getItem('trustedZimFiles').includes(archive.file.name))) {
            await verifyLoadedArchive(archive);
        }
    }
    // When a new ZIM is loaded, we turn this flag to null, so that we don't get false positive attempts to use the Worker
    // It will be defined as false or true when the first article is loaded
    appstate.isReplayWorkerAvailable = null;
    // Initialize the Service Worker
    if (params.contentInjectionMode === 'serviceworker') {
        initServiceWorkerMessaging();
    }
    // The archive is set: go back to home page to start searching
    document.getElementById('btnHome').click();
    document.getElementById('downloadInstruction').style.display = 'none';
}

/**
 * Sets the localArchive from the File selects populated by user
 */
function setLocalArchiveFromFileSelect () {
    setLocalArchiveFromFileList(archiveFiles.files);
}
window.setLocalArchiveFromFileSelect = setLocalArchiveFromFileSelect;

/**
 * Reads a remote archive with given URL, and returns the response in a Promise.
 * This function is used by setRemoteArchives below, for UI tests
 *
 * @param {String} url The URL of the archive to read
 * @returns {Promise<Blob>} A promise for the requested file (blob)
 */
function readRemoteArchive (url) {
    return new Promise(function (resolve, reject) {
        var request = new XMLHttpRequest();
        request.open('GET', url);
        request.responseType = 'blob';
        request.onreadystatechange = function () {
            if (request.readyState === XMLHttpRequest.DONE) {
                if (request.status >= 200 && request.status < 300 || request.status === 0) {
                    // Hack to make this look similar to a file
                    request.response.name = url;
                    resolve(request.response);
                } else {
                    reject(new Error('HTTP status ' + request.status + ' when reading ' + url));
                }
            }
        };
        request.onabort = request.onerror = reject;
        request.send();
    });
}

/**
 * This is used in the testing interface to inject remote archives
 * @returns {Promise<Array>} A Promise for an array of archives
 */
window.setRemoteArchives = function () {
    var readRequests = [];
    Array.prototype.slice.call(arguments).forEach(function (arg) {
        readRequests.push(readRemoteArchive(arg));
    });
    return Promise.all(readRequests).then(function (arrayOfArchives) {
        setLocalArchiveFromFileList(arrayOfArchives);
    }).catch(function (e) {
        console.error('Unable to load remote archive(s)', e);
    });
};

/**
 * Handle key input in the prefix input zone
 * @param {Event} evt The event data to handle
 */
function onKeyUpPrefix () {
    // Use a timeout, so that very quick typing does not cause a lot of overhead
    // It is also necessary for the words suggestions to work inside Firefox OS
    if (window.timeoutKeyUpPrefix) {
        window.clearTimeout(window.timeoutKeyUpPrefix);
    }
    window.timeoutKeyUpPrefix = window.setTimeout(function () {
        var prefix = document.getElementById('prefix').value;
        if (prefix && prefix.length > 0 && prefix !== appstate.search.prefix) {
            document.getElementById('searchArticles').click();
        }
    }, 500);
}

/**
 * Search the index for DirEntries with title that start with the given prefix (implemented
 * with a binary search inside the index file)
 * @param {String} prefix The string that must appear at the start of any title searched for
 */
function searchDirEntriesFromPrefix (prefix) {
    if (selectedArchive !== null && selectedArchive.isReady()) {
        // Cancel the old search (zimArchive search object will receive this change)
        appstate.search.status = 'cancelled';
        // Initiate a new search object and point appstate.search to it (the zimArchive search object will continue to point to the old object)
        // DEV: Technical explanation: the appstate.search is a pointer to an underlying object assigned in memory, and we are here defining a new object
        // in memory {prefix: prefix, status: 'init', .....}, and pointing appstate.search to it; the old search object that was passed to selectedArchive
        // (zimArchive.js) continues to exist in the scope of the functions initiated by the previous search until all Promises have returned
        appstate.search = { prefix: prefix, status: 'init', type: '', size: params.maxSearchResultsSize };
        var activeContent = document.getElementById('activeContent');
        if (activeContent) activeContent.style.display = 'none';
        selectedArchive.findDirEntriesWithPrefix(appstate.search, populateListOfArticles);
    } else {
        uiUtil.spinnerDisplay(false);
        // We have to remove the focus from the search field,
        // so that the keyboard does not stay above the message
        document.getElementById('searchArticles').focus();
        uiUtil.systemAlert(translateUI.t('dialog-archive-notset-message') || 'Archive not set: please select an archive',
            translateUI.t('dialog-archive-notset-title') || 'No archive selected').then(function () {
            document.getElementById('btnConfigure').click();
        });
    }
}

/**
 * Display the list of articles with the given array of DirEntry
 * @param {Array} dirEntryArray The array of dirEntries returned from the binary search
 * @param {Object} reportingSearch The reporting search object
 */
function populateListOfArticles (dirEntryArray, reportingSearch) {
    // Do not allow cancelled searches to report
    if (reportingSearch.status === 'cancelled') return;
    var stillSearching = reportingSearch.status === 'interim';
    var articleListHeaderMessageDiv = document.getElementById('articleListHeaderMessage');
    var nbDirEntry = dirEntryArray ? dirEntryArray.length : 0;

    var message;
    if (stillSearching) {
        message = 'Searching [' + reportingSearch.type + ']... found: ' + nbDirEntry;
    } else if (nbDirEntry >= params.maxSearchResultsSize) {
        message = 'First ' + params.maxSearchResultsSize + ' articles found (refine your search).';
    } else {
        message = 'Finished. ' + (nbDirEntry || 'No') + ' articles found' + (
            reportingSearch.type === 'basic' ? ': try fewer words for full search.' : '.'
        );
    }

    articleListHeaderMessageDiv.textContent = message;

    var articleListDiv = document.getElementById('articleList');
    var articleListDivHtml = '';
    var listLength = dirEntryArray.length < params.maxSearchResultsSize ? dirEntryArray.length : params.maxSearchResultsSize;
    for (var i = 0; i < listLength; i++) {
        var dirEntry = dirEntryArray[i];
        // NB We use encodeURIComponent rather than encodeURI here because we know that any question marks in the title are not querystrings,
        // and should be encoded [kiwix-js #806]. DEV: be very careful if you edit the dirEntryId attribute below, because the contents must be
        // inside double quotes (in the final HTML string), given that dirEntryStringId may contain bare apostrophes
        // Info: encodeURIComponent encodes all characters except  A-Z a-z 0-9 - _ . ! ~ * ' ( )
        var dirEntryStringId = encodeURIComponent(dirEntry.toStringId());
        articleListDivHtml += '<a href="#" dirEntryId="' + dirEntryStringId +
            '" class="list-group-item">' + dirEntry.getTitleOrUrl() + '</a>';
    }

    // innerHTML required for this line
    articleListDiv.innerHTML = articleListDivHtml;
    // We have to use mousedown below instead of click as otherwise the prefix blur event fires first
    // and prevents this event from firing; note that touch also triggers mousedown
    document.querySelectorAll('#articleList a').forEach(function (link) {
        link.addEventListener('mousedown', function (e) {
            // Cancel search immediately
            appstate.search.status = 'cancelled';
            handleTitleClick(e);
            return false;
        });
    });
    if (!stillSearching) uiUtil.spinnerDisplay(false);
    document.getElementById('articleListWithHeader').style.display = '';
}

/**
 * Handles the click on the title of an article in search results
 * @param {Event} event The click event to handle
 * @returns {Boolean} Always returns false for JQuery event handling
 */
function handleTitleClick (event) {
    var dirEntryId = decodeURIComponent(event.target.getAttribute('dirEntryId'));
    findDirEntryFromDirEntryIdAndLaunchArticleRead(dirEntryId);
    return false;
}

/**
 * Creates an instance of DirEntry from given dirEntryId (including resolving redirects),
 * and call the function to read the corresponding article
 * @param {String} dirEntryId The stringified Directory Entry to parse and launch
 */
function findDirEntryFromDirEntryIdAndLaunchArticleRead (dirEntryId) {
    if (selectedArchive.isReady()) {
        var dirEntry = selectedArchive.parseDirEntryId(dirEntryId);
        // Remove focus from search field to hide keyboard and to allow navigation keys to be used
        document.getElementById('articleContent').contentWindow.focus();
        document.getElementById('searchingArticles').style.display = '';
        if (dirEntry.isRedirect()) {
            selectedArchive.resolveRedirect(dirEntry, readArticle);
        } else {
            params.isLandingPage = false;
            readArticle(dirEntry);
        }
    } else {
        uiUtil.systemAlert(translateUI.t('dialog-file-notset-message') || 'Data files not set',
            translateUI.t('dialog-file-notset-title') || 'Archive not ready');
    }
}

/**
 * Check whether the given URL from given dirEntry matches the expected article
 * @param {DirEntry} dirEntry The directory entry of the article to read
 */
function isDirEntryExpectedToBeDisplayed (dirEntry) {
    var curArticleURL = dirEntry.namespace + '/' + dirEntry.url;

    if (appstate.expectedArticleURLToBeDisplayed !== curArticleURL) {
        console.debug('url of current article :' + curArticleURL + ', does not match the expected url :' +
        appstate.expectedArticleURLToBeDisplayed);
        return false;
    }
    return true;
}

/**
 * Read the article corresponding to the given dirEntry
 * @param {DirEntry} dirEntry The directory entry of the article to read
 */
function readArticle (dirEntry) {
    if (dirEntry === null || dirEntry === undefined) {
        console.error('The directory entry for the requested article was not found (null or undefined)');
        uiUtil.spinnerDisplay(false);
        return;
    }

    // Reset search prefix to allow users to search the same string again if they want to
    appstate.search.prefix = '';
    // Only update for appstate.expectedArticleURLToBeDisplayed.
    appstate.expectedArticleURLToBeDisplayed = dirEntry.namespace + '/' + dirEntry.url;
    // Calculate the current article's ZIM baseUrl to use when processing relative links
    appstate.baseUrl = encodeURI(dirEntry.namespace + '/' + dirEntry.url.replace(/[^/]+$/, ''));
    // We must remove focus from UI elements in order to deselect whichever one was clicked (in both jQuery and SW modes),
    // but we should not do this when opening the landing page (or else one of the Unit Tests fails, at least on Chrome 58)
    if (!params.isLandingPage) articleContainer.contentWindow.focus();
    // Show the spinner with a loading message
    var message = dirEntry.url.match(/(?:^|\/)([^/]{1,13})[^/]*?$/);
    message = message ? message[1] + '...' : '...';
    uiUtil.spinnerDisplay(true, (translateUI.t('spinner-loading') || 'Loading') + ' ' + message);

    if (params.contentInjectionMode === 'serviceworker') {
        // In ServiceWorker mode, we simply set the iframe src.
        // (reading the backend is handled by the ServiceWorker itself)

        // We will need the encoded URL on article load so that we can set the iframe's src correctly,
        // but we must not encode the '/' character or else relative links may fail [kiwix-js #498]
        var encodedUrl = dirEntry.url.replace(/[^/]+/g, function (matchedSubstring) {
            return encodeURIComponent(matchedSubstring);
        });

        // Set up article onload handler
        articleLoader();

        if (!isDirEntryExpectedToBeDisplayed(dirEntry)) {
            return;
        }

        if (selectedArchive.zimType === 'zimit' && !appstate.isReplayWorkerAvailable) {
            if (window.location.protocol === 'chrome-extension:') {
                // Zimit archives contain content that is blocked in a local Chromium extension (on every page), so we must fall back to jQuery mode
                return handleUnsupportedReplayWorker(dirEntry);
            }
            var archiveName = selectedArchive.file.name.replace(/\.zim\w{0,2}$/i, '');
            var cns = selectedArchive.getContentNamespace();
            // Support type 0 and type 1 Zimit archives
            var replayCns = cns === 'C' ? '/C/A/' : '/A/';
            var base = window.location.href.replace(/^(.*?\/)www\/.*$/, '$1');
            var prefix = base + selectedArchive.file.name + replayCns;
            // Open a new message channel to the ServiceWorker
            var zimitMessageChannel = new MessageChannel();
            zimitMessageChannel.port1.onmessage = function (event) {
                if (event.data.error) {
                    console.error('Reading Zimit archives in ServiceWorker mode is not supported in this browser', event.data.error);
                    return handleUnsupportedReplayWorker(dirEntry);
                } else if (event.data.success) {
                    // console.debug(event.data.success);
                    appstate.isReplayWorkerAvailable = true;
                    // We put the ZIM filename as a prefix in the URL, so that browser caches are separate for each ZIM file
                    articleContainer.src = '../' + selectedArchive.file.name + '/' + dirEntry.namespace + '/' + encodedUrl;
                }
            };
            // If we are dealing with a Zimit ZIM, we need to instruct Replay to add the file as a new collection
            navigator.serviceWorker.controller.postMessage({
                msg_type: 'addColl',
                name: archiveName,
                prefix: prefix,
                file: { sourceUrl: 'proxy:' + prefix },
                root: true,
                skipExisting: false,
                extraConfig: {
                    // prefix: prefix, // If not set, Replay will use the proxy URL (without the 'proxy:' prefix)
                    sourceType: 'kiwix',
                    notFoundPageUrl: './404.html'/*,
                    baseUrl: base + selectedArchive.file.name + '/',
                    baseUrlHashReplay: false */
                },
                topTemplateUrl: './www/topFrame.html'
            }, [zimitMessageChannel.port2]);
        } else {
            // We put the ZIM filename as a prefix in the URL, so that browser caches are separate for each ZIM file
            articleContainer.src = '../' + selectedArchive.file.name + '/' + dirEntry.namespace + '/' + encodedUrl;
        }
    } else {
        // In jQuery mode, we read the article content in the backend and manually insert it in the iframe
        if (dirEntry.isRedirect()) {
            selectedArchive.resolveRedirect(dirEntry, readArticle);
        } else {
            // Line below was inserted to prevent the spinner being hidden, possibly by an async function, when pressing the Random button in quick succession
            // TODO: Investigate whether it is really an async issue or whether there is a rogue .hide() statement in the chain
            document.getElementById('searchingArticles').style.display = '';
            selectedArchive.readUtf8File(dirEntry, function (fileDirEntry, content) {
                // Because a Zimit landing page will change the dirEntry, we have to check again for a redirect, but not if we already have the correct dirEntry
                if (fileDirEntry.zimitRedirect && fileDirEntry.namespace + '/' + fileDirEntry.url !== fileDirEntry.zimitRedirect) {
                    return selectedArchive.getDirEntryByPath(fileDirEntry.zimitRedirect).then(readArticle);
                } else {
                    displayArticleContentInIframe(fileDirEntry, content);
                }
            });
        }
    }
}

/**
 * Selects the iframe to which to attach the onload event, and attaches it
 */
function articleLoader () {
    if (selectedArchive.zimType === 'zimit') {
        var doc = articleContainer.contentDocument || null;
        if (doc) {
            var replayIframe = doc.getElementById('replay_iframe');
            if (replayIframe) {
                replayIframe.onload = function () {
                    articleLoadedSW(replayIframe);
                };
            }
        }
    } else {
        articleContainer.onload = function () {
            articleLoadedSW(articleContainer);
        };
    }
}

// Add event listener to iframe window to check for links to external resources
function filterClickEvent (event) {
    // Find the closest enclosing A tag (if any)
    var clickedAnchor = uiUtil.closestAnchorEnclosingElement(event.target);
    // If the anchor has a passthrough property, then we have already checked it is safe, so we can return
    if (clickedAnchor && clickedAnchor.passthrough) {
        clickedAnchor.passthrough = false;
        return;
    }
    // Remove any Kiwix Popovers that may be hanging around
    popovers.removeKiwixPopoverDivs(event.target.ownerDocument);
    if (params.contentInjectionMode === 'jquery' || !params.openExternalLinksInNewTabs && !clickedAnchor.newcontainer) return;
    if (clickedAnchor) {
        // This prevents any popover from being displayed when the user clicks on a link
        clickedAnchor.articleisloading = true;
        // Check for Zimit links that would normally be handled by the Replay Worker
        // DEV: '__WB_pmw' is a function inserted by wombat.js, so this detects links that have been rewritten in zimit2 archives
        // however, this misses zimit2 archives where the framework doesn't support wombat.js, so monitor if always processing zimit2 links
        // causes any adverse effects @TODO
        if (appstate.isReplayWorkerAvailable || '__WB_pmw' in clickedAnchor || selectedArchive.zimType === 'zimit2' &&
          articleWindow.location.href.replace(/[#?].*$/, '') !== clickedAnchor.href.replace(/[#?].*$/, '') && !clickedAnchor.hash) {
            return handleClickOnReplayLink(event, clickedAnchor);
        }
        // DEV: The href returned below is the href as written in the HTML, which may be relative
        var href = clickedAnchor.getAttribute('href');
        // We assume that, if an absolute http(s) link is hardcoded inside an HTML string, it means it's a link to an external website
        // (this assumption is only safe for non-Replay archives, but we deal with those separately above: they are routed to handleClickOnReplayLink).
        // Additionally, by comparing the protocols, we can filter out protocols such as `mailto:`, `tel:`, `skype:`, etc. (these should open in a new window).
        // DEV: The test for a protocol of ':' may no longer be needed. It needs careful testing in all browsers (particularly in Edge Legacy), and if no
        // longer triggered, it can be removed.
        if (/^http/i.test(href) || clickedAnchor.protocol && clickedAnchor.protocol !== ':' && articleWindow.location.protocol !== clickedAnchor.protocol) {
            console.debug('filterClickEvent opening external link in new tab');
            clickedAnchor.newcontainer = true;
            uiUtil.warnAndOpenExternalLinkInNewTab(event, clickedAnchor);
        } else if (clickedAnchor.newcontainer || /\.pdf([?#]|$)/i.test(href) && selectedArchive.zimType !== 'zimit') {
            // Due to the iframe sandbox, we have to prevent the PDF viewer from opening in the iframe and instead open it in a new tab. We also open
            // a new tab if the user has explicitly requested it: in this case the anchor will have a property 'newcontainer' (e.g. with popover control)
            event.preventDefault();
            event.stopPropagation();
            console.debug('filterClickEvent opening new window for PDF or requested new container');
            clickedAnchor.newcontainer = true;
            window.open(clickedAnchor.href, '_blank');
        } else if (/\/[-ABCIJMUVWX]\/.+$/.test(clickedAnchor.href)) { // clickedAnchor.href returns the absolute URL, including any namespace
            // Show the spinner if it's a ZIM link, but not an anchor
            if (!~href.indexOf('#')) {
                var message = href.match(/(?:^|\/)([^/]{1,13})[^/]*?$/);
                message = message ? message[1] + '...' : '...';
                uiUtil.spinnerDisplay(true, (translateUI.t('spinner-loading') || 'Loading') + ' ' + message);
                // In case of false positive, ensure spinner is eventually hidden
                setTimeout(function () {
                    uiUtil.spinnerDisplay(false);
                }, 4000);
                uiUtil.showSlidingUIElements();
            }
        }
        // Reset popup block
        setTimeout(function () {
            // Anchor may have been unloaded along with the page by the time this runs
            // but will still be present if user opened a new tab
            if (clickedAnchor) {
                clickedAnchor.articleisloading = false;
            }
        }, 1000);
    }
};

/**
 * Postprocessing required after the article contents are loaded
 * @param {HTMLIFrameElement} iframeArticleContent The iframe containing the article content
 */
function articleLoadedSW (iframeArticleContent) {
    // The content is fully loaded by the browser : we can hide the spinner
    document.getElementById('cachingAssets').textContent = translateUI.t('spinner-caching-assets') || 'Caching assets...';
    document.getElementById('cachingAssets').style.display = 'none';
    uiUtil.spinnerDisplay(false);
    // Set the requested appTheme
    uiUtil.applyAppTheme(params.appTheme);
    // Display the iframe content
    iframeArticleContent.style.display = '';
    articleContainer.style.display = '';
    // Deflect drag-and-drop of ZIM file on the iframe to Config
    if (!params.disableDragAndDrop) {
        var doc = iframeArticleContent.contentDocument ? iframeArticleContent.contentDocument.documentElement : null;
        var docBody = doc ? doc.getElementsByTagName('body') : null;
        docBody = docBody ? docBody[0] : null;
        if (docBody) {
            docBody.ondragover = handleIframeDragover;
            docBody.ondrop = handleIframeDrop;
        }
    }
    resizeIFrame();

    var iframeWindow = iframeArticleContent.contentWindow;
    if (iframeWindow) {
        // Configure home key press to focus #prefix only if the feature is in active state
        if (params.useHomeKeyToFocusSearchBar) { iframeWindow.onkeydown = focusPrefixOnHomeKey; }
        // Add event listeners to iframe window to check for links to external resources and for actions that trigger popovers
        iframeWindow.onclick = filterClickEvent;
        attachPopoverTriggerEvents(iframeWindow);
        // If we are in a zimit2 ZIM and params.serviceWorkerLocal is true, and it's a landing page, then we should display a warning
        if (!params.hideActiveContentWarning && params.isLandingPage && params.zimType === 'zimit2' && params.serviceWorkerLocal) {
            uiUtil.displayActiveContentWarning('ServiceWorkerLocal');
        }
        // Reset UI when the article is unloaded
        iframeArticleContent.contentWindow.onunload = function () {
            iframeArticleContent.loader = false;
            // remove eventListener to avoid memory leaks
            // iframeArticleContent.contentWindow.removeEventListener('keydown', focusPrefixOnHomeKey);
            var articleList = document.getElementById('articleList');
            var articleListHeaderMessage = document.getElementById('articleListHeaderMessage');
            while (articleList.firstChild) articleList.removeChild(articleList.firstChild);
            while (articleListHeaderMessage.firstChild) articleListHeaderMessage.removeChild(articleListHeaderMessage.firstChild);
            document.getElementById('articleListWithHeader').style.display = 'none';
            document.getElementById('prefix').value = '';
        };
    }
    params.isLandingPage = false;
};

/**
 * Attaches popover trigger events to the given window
 * @param {Window} win The window to which to attach popover trigger events
 */
function attachPopoverTriggerEvents (win) {
    const iframeDoc = win.document;
    // The popover feature requires as a minimum that the browser supports the css matches function
    // (having this condition prevents very erratic popover placement in IE11, for example, so the feature is disabled for such browsers)
    if (!iframeDoc || !appstate.wikimediaZimLoaded || !params.showPopoverPreviews || !('matches' in Element.prototype)) {
        return;
    }
    // Attach the popover CSS to the current article document
    popovers.attachKiwixPopoverCss(iframeDoc);
    // Add event listeners to the iframe window to check when anchors are hovered, focused or touched
    win.addEventListener('mouseover', evokePopoverEvents, true);
    win.addEventListener('focus', evokePopoverEvents, true);
    // Conditionally add event listeners to support touch events with fallback to pointer events
    if (window.navigator.maxTouchPoints > 0) {
        win.addEventListener('touchstart', evokePopoverEvents, true);
    } else {
        win.addEventListener('pointerdown', evokePopoverEvents, true);
    }
}

// Throttle for the popover event handler to prevent multiple activations with mouse movement
let popoverThrottle = false;

/**
 * Conditionally evokes popover events subject to a throttle
 * @param {Event} event The event produced by the calling action
 */
function evokePopoverEvents (event) {
    // Check if the hovered or focused element or its parent is a link
    if (popoverThrottle) return;
    popoverThrottle = true;
    setTimeout(function () {
        handlePopoverEvents(event);
        popoverThrottle = false;
    }, 10);
};

/**
 * Event handler for attaching preview popovers
 * @param {Event} event The event produced by the mouseover or focus action
 */
function handlePopoverEvents (ev) {
    let anchor = ev.target;
    const iframeDoc = anchor.ownerDocument;
    if (!iframeDoc) return;
    const iframeWindow = iframeDoc.defaultView;
    while (anchor && anchor !== iframeWindow && anchor.nodeName !== 'A') {
        anchor = anchor.parentNode;
    }
    // If we're not hovering a link, then we can exit
    if (!anchor || anchor.nodeName !== 'A') return;
    // console.debug(event.type, event.target, a);
    const suppressContextMenuHandler = function (e) {
        e.preventDefault();
        e.stopPropagation();
    };
    // Prevent context menu on this anchor element
    anchor.addEventListener('contextmenu', suppressContextMenuHandler, true);
    if (/touchstart|pointerdown/.test(ev.type)) {
        anchor.touched = true; // Used to prevent dismissal of popver on mouseout if initiated by touch
    }
    if (anchor.style.userSelect === undefined) {
        // This prevents selection of the text in a touched link in Safari for iOS and Edge Legacy / UWP
        anchor.style.webkitUserSelect = 'none';
        anchor.style.msUserSelect = 'none';
    }
    // Check if a popover div is currently being hovered
    const divArray = Array.from(iframeDoc.getElementsByClassName('kiwixtooltip'));
    const divIsHovered = divArray.some(div => div.matches(':hover'));
    // Only add a popover to the link if a current popover is not being hovered (prevents popovers showing for links in a popover)
    if (!divIsHovered) {
        // Prevent text selection while popover is open in modern browsers
        anchor.style.userSelect = 'none';
        // Resolve the true app theme
        const isDarkTheme = uiUtil.isDarkTheme(params.appTheme);
        // Get and populate the popover corresponding to the hovered or focused link
        popovers.populateKiwixPopoverDiv(ev, anchor, appstate, isDarkTheme, selectedArchive);
    }
    const outHandler = function (e) {
        setTimeout(function () {
            anchor.popoverisloading = false;
            if (/blur/.test(e.type) || !anchor.touched) {
                popovers.removeKiwixPopoverDivs(iframeDoc);
                anchor.touched = false;
            }
            anchor.style.webkitUserSelect = 'auto';
            anchor.style.msUserSelect = 'auto';
            anchor.style.userSelect = 'auto';
            anchor.removeEventListener(e.type, outHandler);
            anchor.removeEventListener('contextmenu', suppressContextMenuHandler, true);
        }, 250);
    };
    // Clean up when user stops hovering, lifts pointer, stops touching, or unfocuses (blurs) the link
    if (/mouseover/.test(ev.type)) {
        anchor.addEventListener('mouseleave', outHandler);
    }
    if (/pointerdown/.test(ev.type)) {
        anchor.addEventListener('pointerup', outHandler);
    }
    if (/touchstart/.test(ev.type)) {
        anchor.addEventListener('touchend', outHandler);
    }
    if (ev.type === 'focus') {
        anchor.addEventListener('blur', outHandler);
    }
}

// Handles a click on a Zimit link that has been processed by Wombat
function handleClickOnReplayLink (ev, anchor) {
    var basePath = window.location.href.replace(/^(.*?\/)www\/.*$/, '$1');
    var pathToZim = basePath + selectedArchive.file.name + '/';
    var pseudoNamespace = selectedArchive.zimitPseudoContentNamespace;
    var pseudoDomainPath = (anchor.hostname === window.location.hostname ? selectedArchive.zimitPrefix.replace(/\/$/, '') : anchor.hostname) + anchor.pathname;
    var containingDocDomainPath = anchor.ownerDocument.location.hostname + anchor.ownerDocument.location.pathname;
    // Normalize the protocols of the clicked anchor and the document, because some PDFs are served with a protocol of http: instead of https:
    var normalizedAnchorProtocol = anchor.protocol ? anchor.protocol.replace(/s:/, ':') : '';
    var normalizedDocumentProtocol = document.location.protocol.replace(/s:/, ':');
    // If the paths are identical, then we are dealing with a link to an anchor in the same document
    if (pseudoDomainPath === containingDocDomainPath) return;
    // If it's for a different protocol (e.g. javascript:) we may need to handle that, or if the user has pressed the ctrl or command key, the document
    // will open in a new window anyway, so we can return.
    if (normalizedAnchorProtocol && normalizedAnchorProtocol !== normalizedDocumentProtocol) {
        // DEV: Monitor whether you need to handle /blob:|data:|file:/ as well (probably not, as they would be blocked by the sandbox if loaded into iframe)
        if (/about:|javascript:/i.test(anchor.protocol) || ev.ctrlKey || ev.metaKey || ev.button === 1) return;
        // So it's probably a URI scheme or protocol like mailto: that would violate the CSP, so we need to open it explicitly in a new tab
        ev.preventDefault();
        ev.stopPropagation();
        console.debug('handleClickOnReplayLink opening custom protocol ' + anchor.protocol + ' in new tab');
        uiUtil.warnAndOpenExternalLinkInNewTab(ev, anchor);
        return;
    }
    var zimUrl;
    // If it starts with the path to the ZIM file, then we are dealing with an untransformed absolute local ZIM link
    if (!anchor.href.indexOf(pathToZim)) {
        zimUrl = anchor.href.replace(pathToZim, '');
    // If it is the same as the pseudoDomainPath, then we are dealing with an untransformed pseuodo relative link that looks like an absolute https:// link
    // (this probably only applies to zimit2 without Wombat)
    } else if (anchor.href.replace(/^[^:]+:\/\//, '') === pseudoDomainPath && /\.zim\/[CA]\//.test(anchor.href)) {
        zimUrl = anchor.href.replace(/^(?:[^.]|\.(?!zim\/[CA]\/))+\.zim\//, '');
    } else {
        zimUrl = pseudoNamespace + pseudoDomainPath + anchor.search;
    }
    // It is necessary to fully decode zimit2, as these archives follow OpenZIM spec
    if (params.zimType === 'zimit2') {
        zimUrl = decodeURIComponent(zimUrl);
    }
    // We need to test the ZIM link
    if (zimUrl) {
        ev.preventDefault();
        ev.stopPropagation();
        // Note that true in the fourth argument instructs getDirEntryByPath to follow redirects by looking up the Header
        // DEV: CURRENTLY NON-FUNCTION IN KIWIX-JS -- NEEDS FIXING
        return selectedArchive.getDirEntryByPath(zimUrl, null, null, true).then(function (dirEntry) {
            var processDirEntry = function (dirEntry) {
                var pathToArticleDocumentRoot = document.location.href.replace(/www\/index\.html.*$/, selectedArchive.file.name + '/');
                var mimetype = dirEntry.getMimetype();
                // Due to the iframe sandbox, we have to prevent the PDF viewer from opening in the iframe and instead open it in a new tab
                // Note that some Replay PDFs have html mimetypes, or can be redirects to PDFs, we need to check the URL as well
                if (/pdf/i.test(mimetype) || /\.pdf(?:[#?]|$)/i.test(anchor.href) || /\.pdf(?:[#?]|$)/i.test(dirEntry.url)) {
                    if (/Android/.test(params.appType) || window.nw) {
                        // User is on an Android device, where opening a PDF in a new tab is not sufficient to evade the sandbox
                        // so we need to download the PDF instead
                        var readAndDownloadBinaryContent = function (zimUrl) {
                            return selectedArchive.getDirEntryByPath(zimUrl).then(function (dirEntry) {
                                if (dirEntry) {
                                    selectedArchive.readBinaryFile(dirEntry, function (fileDirEntry, content) {
                                        var mimetype = fileDirEntry.getMimetype();
                                        uiUtil.displayFileDownloadAlert(zimUrl, true, mimetype, content);
                                        uiUtil.spinnerDisplay(false);
                                    });
                                } else {
                                    return uiUtil.systemAlert('We could not find a PDF document at ' + zimUrl, 'PDF not found');
                                }
                            });
                        };
                        // If the document is in fact an html redirect, we need to follow it first till we get the underlying PDF document
                        if (/\bx?html\b/.test(mimetype)) {
                            selectedArchive.readUtf8File(dirEntry, function (fileDirEntry, data) {
                                var redirectURL = data.match(/<meta[^>]*http-equiv="refresh"[^>]*content="[^;]*;url='?([^"']+)/i);
                                if (redirectURL) {
                                    redirectURL = redirectURL[1];
                                    var contentUrl = pseudoNamespace + redirectURL.replace(/^[^/]+\/\//, '');
                                    return readAndDownloadBinaryContent(contentUrl);
                                } else {
                                    return readAndDownloadBinaryContent(zimUrl);
                                }
                            });
                        } else {
                            return readAndDownloadBinaryContent(zimUrl);
                        }
                    } else {
                        window.open(pathToArticleDocumentRoot + zimUrl, params.windowOpener === 'tab' ? '_blank' : dirEntry.title,
                            params.windowOpener === 'window' ? 'toolbar=0,location=0,menubar=0,width=800,height=600,resizable=1,scrollbars=1' : null);
                    }
                } else {
                    // Handle middle-clicks and ctrl-clicks
                    if (ev.ctrlKey || ev.metaKey || ev.button === 1) {
                        var encodedTitle = encodeURIComponent(dirEntry.getTitleOrUrl());
                        var articleContainer = window.open(pathToArticleDocumentRoot + zimUrl,
                            params.windowOpener === 'tab' ? '_blank' : encodedTitle,
                            params.windowOpener === 'window' ? 'toolbar=0,location=0,menubar=0,width=800,height=600,resizable=1,scrollbars=1' : null
                        );
                        // Conditional, because opening a new window can be blocked by the browser
                        if (articleContainer) {
                            appstate.target = 'window';
                            articleContainer.kiwixType = appstate.target;
                        }
                        uiUtil.spinnerDisplay(false);
                    } else {
                        // Let Replay handle this link
                        anchor.passthrough = true;
                        articleContainer = document.getElementById('articleContent');
                        appstate.target = 'iframe';
                        articleContainer.kiwixType = appstate.target;
                        if (selectedArchive.zimType === 'zimit2') {
                            // Since we know the URL works, normalize the href (this is needed for zimit2 relative links)
                            // NB We mustn't do this for zimit classic because it breaks wombat rewriting of absolute links!
                            anchor.href = pathToArticleDocumentRoot + zimUrl;
                        }
                        anchor.click();
                        // Poll spinner with abbreviated title
                        uiUtil.spinnerDisplay(true, 'Loading ' + dirEntry.getTitleOrUrl().replace(/([^/]+)$/, '$1').substring(0, 18) + '...');
                    }
                }
            };
            if (dirEntry) {
                processDirEntry(dirEntry);
            } else {
                // If URL has final slash, we need to try it without the slash
                if (/\/$/.test(zimUrl)) {
                    zimUrl = zimUrl.replace(/\/$/, '');
                    return selectedArchive.getDirEntryByPath(zimUrl).then(function (dirEntry) {
                        if (dirEntry) {
                            processDirEntry(dirEntry);
                        } else {
                            // If dirEntry was still not-found, it's probably an external link, so warn user before opening a new tab/window
                            uiUtil.warnAndOpenExternalLinkInNewTab(null, anchor, selectedArchive);
                        }
                    });
                } else {
                    // It's probably an external link, so warn user before opening a new tab/window
                    uiUtil.warnAndOpenExternalLinkInNewTab(null, anchor, selectedArchive);
                }
            }
        }).catch(function (err) {
            console.error('Error getting dirEntry for ' + zimUrl, err);
            uiUtil.systemAlert('There was an error looking up ' + zimUrl, 'Error reading direcotry entry!');
        });
    }
}

function handleUnsupportedReplayWorker (unhandledDirEntry) {
    appstate.isReplayWorkerAvailable = false;
    params.originalContentInjectionMode = params.contentInjectionMode;
    params.contentInjectionMode = 'jquery';
    readArticle(unhandledDirEntry);
    // if (!params.hideActiveContentWarning) uiUtil.displayActiveContentWarning();
    return uiUtil.systemAlert(translateUI.t('dialog-unsupported-archivetype-message') || '<p>You are attempting to open a Zimit-style archive, ' +
        'which is not supported by your browser in ServiceWorker(Local) mode.</p><p>We have temporarily switched you to Restricted mode ' +
        'so you can view static content, but a lot of content is non-functional in this configuration.</p>',
    translateUI.t('dialog-unsupported-archivetype-title') || 'Unsupported archive type!');
}

/**
 * Function that handles a message of the messageChannel.
 * It tries to read the content in the backend, and sends it back to the ServiceWorker
 *
 * @param {Event} event The event object of the message channel
 */
function handleMessageChannelMessage (event) {
    // We received a message from the ServiceWorker
    // The ServiceWorker asks for some content
    var title = event.data.title;
    if (appstate.isReplayWorkerAvailable) {
        // Zimit ZIMs store assets with the querystring, so we need to add it. ReplayWorker handles encoding.
        title = title + event.data.search;
    } else if (params.zimType === 'zimit') {
        // Zimit classic ZIMs store assets encoded with the querystring, so we need to add it
        title = encodeURI(title) + event.data.search;
    }
    var messagePort = event.ports[0];
    var readFile = function (dirEntry) {
        if (dirEntry === null) {
            console.warn('Title ' + title.replace(/^(.{1,160}).*/, '$1...') + ' not found in archive.');
            // DEV: We send null for the content, so that the ServiceWorker knows that the article was not found (as opposed to being merely empty)
            messagePort.postMessage({ action: 'giveContent', title: title, content: null, zimType: selectedArchive.zimType });
        } else if (dirEntry.isRedirect()) {
            selectedArchive.resolveRedirect(dirEntry, function (resolvedDirEntry) {
                var redirectURL = resolvedDirEntry.namespace + '/' + resolvedDirEntry.url;
                // Ask the ServiceWorker to send an HTTP redirect to the browser.
                // We could send the final content directly, but it is necessary to let the browser know in which directory it ends up.
                // Else, if the redirect URL is in a different directory than the original URL,
                // the relative links in the HTML content would fail. See #312
                messagePort.postMessage({ action: 'sendRedirect', title: title, redirectUrl: redirectURL });
            });
        } else {
            // Let's read the content in the ZIM file
            selectedArchive.readBinaryFile(dirEntry, function (fileDirEntry, content) {
                var mimetype = fileDirEntry.getMimetype();
                // Show the spinner
                var shortTitle = dirEntry.getTitleOrUrl().replace(/^.*?([^/]{3,18})[^/]*\/?$/, '$1 ...');
                if (!/moved/i.test(shortTitle) && !/image|javascript|warc-headers|jsonp?/.test(mimetype)) {
                    uiUtil.spinnerDisplay(true, (translateUI.t('spinner-loading') || 'Loading') + ' ' + shortTitle);
                    clearTimeout(window.timeout);
                    window.timeout = setTimeout(function () {
                        uiUtil.spinnerDisplay(false);
                    }, 1000);
                    // Test for an HTML or XHTML article: note that some ZIMs have odd MIME type formatting like 'text/html;raw=true',
                    // or simply `html`, so this has to be as generic as possible
                    if (/\bx?html/i.test(mimetype)) {
                        // Calculate the current article's ZIM baseUrl to use when attaching popovers
                        appstate.baseUrl = encodeURI(dirEntry.namespace + '/' + dirEntry.url.replace(/[^/]+$/, ''));
                        appstate.expectedArticleURLToBeDisplayed = dirEntry.namespace + '/' + dirEntry.url;
                    }
                    // Ensure the article onload event gets attached to the right iframe
                    articleLoader();
                }
                // Let's send the content to the ServiceWorker
                var buffer = content.buffer ? content.buffer : content;
                var message = { action: 'giveContent', title: title, content: buffer, mimetype: mimetype, zimType: selectedArchive.zimType };
                messagePort.postMessage(message);
            });
        }
    };
    selectedArchive.getDirEntryByPath(title).then(readFile).catch(function () {
        messagePort.postMessage({ action: 'giveContent', title: title, content: new Uint8Array(), zimType: selectedArchive.zimType });
    });
}

// Compile some regular expressions needed to modify links
// Pattern to find a ZIM URL (with its namespace) - see https://wiki.openzim.org/wiki/ZIM_file_format#Namespaces
var regexpZIMUrlWithNamespace = /^[./]*([-ABCIJMUVWX]\/.+)$/;
// The case-insensitive regex below finds images, scripts, stylesheets and tracks with ZIM-type metadata and image namespaces.
// It first searches for <img, <script, <link, etc., then scans forward to find, on a word boundary, either src=["'] or href=["']
// (ignoring any extra whitespace), and it then tests the path of the URL with a non-capturing negative lookahead (?!...) that excludes
// absolute URIs with protocols that conform to RFC 3986 (e.g. 'http:', 'data:'). It then captures the whole of the URL up until any
// querystring (? character) which (if it is exists) is captured with its contents in another group. The regex then tests for the end
// of the URL with the opening delimiter (" or ', which is capture group \3) or a hash character (#). When the regex is used below, it
// will be further processed to calculate the ZIM URL from the relative path. This regex can cope with legitimate single quote marks (') in the URL.
var regexpTagsWithZimUrl = /(<(?:img|script|link|track)\b[^>]*?\s)(?:src|href)(\s*=\s*(["']))(?![a-z][a-z0-9+.-]+:)(.+?)(\?.*?)?(?=\3|#)([\s\S]*?>)/ig;
// Regex below tests the html of an article for active content [kiwix-js #466]
// It inspects every <script> block in the html and matches in the following cases: 1) the script is of type "module"; 2) the script
// loads a UI application called app.js, init.js, or other common scripts found in unsupported ZIMs; 3) the script block has inline
// content that does not contain "importScript()", "toggleOpenSection" or an "articleId" assignment (these strings are used widely in our
// fully supported wikimedia ZIMs, so they are excluded); 4) the script block is not of type "math" (these are MathJax markup scripts used
// extensively in Stackexchange ZIMs). Note that the regex will match ReactJS <script type="text/html"> markup, which is common in unsupported
// packaged UIs, e.g. PhET ZIMs.
var regexpActiveContent = /<script\b(?:(?![^>]+src\b)|(?=[^>]*type=["']module["'])|(?=[^>]+src\b=["'][^"']*?\b(?:app|init|ractive|l1[08]9)\.js))(?![^<]+(?:importScript\(\)|toggleOpenSection|articleId\s?=\s?['"]|window.NREUM))(?![^>]+type\s*=\s*["'](?:math\/|[^"']*?math))/i;
// DEV: The regex below matches ZIM links (anchor hrefs) that should have the html5 "donwnload" attribute added to
// the link. This is currently the case for epub and pdf files in Project Gutenberg ZIMs -- add any further types you need
// to support to this regex. The "zip" has been added here as an example of how to support further filetypes
var regexpDownloadLinks = /^.*?\.epub([?#]|$)|^.*?\.pdf([?#]|$)|^.*?\.odt([?#]|$)|^.*?\.zip([?#]|$)/i;
// A regex to find the Zimit prefix in a Zimit-based article
var regexpGetZimitPrefix = /link\s+rel=["']canonical["']\s+href="https?:\/\/([^/"]+)/i;
// A regex to find and help transform assets in an article in a Zimit-based archive
var regexpZimitHtmlLinks = /(<(?:a|img|script|link|track|meta|iframe)\b[^>]*?[\s;])(?:src\b|href|url)\s*(=\s*(["']))(?=[./]+|https?)((?:[^>](?!\3|\?|#))+[^>])([^>]*>)/ig;

// A string to hold any anchor parameter in clicked ZIM URLs (as we must strip these to find the article in the ZIM)
var anchorParameter;

/**
 * Display the the given HTML article in the web page,
 * and convert links to javascript calls
 * NB : in some error cases, the given title can be null, and the htmlArticle contains the error message
 * @param {DirEntry} dirEntry
 * @param {String} htmlArticle
 */
function displayArticleContentInIframe (dirEntry, htmlArticle) {
    if (!isDirEntryExpectedToBeDisplayed(dirEntry)) {
        return;
    }
    // Display Bootstrap warning alert if the landing page contains active content
    if (!params.hideActiveContentWarning && params.isLandingPage) {
        if (regexpActiveContent.test(htmlArticle) || /zimit/.test(selectedArchive.zimType)) {
            // Exempted scripts: active content warning will not be displayed if any listed script is in the html [kiwix-js #889]
            if (!/<script\b[^'"]+['"][^'"]*?mooc\.js/i.test(htmlArticle)) {
                uiUtil.displayActiveContentWarning();
            }
        }
    }

    // Calculate the current article's ZIM baseUrl to use when processing relative links
    // (duplicated because we sometimes bypass readArticle above)
    appstate.baseUrl = encodeURI(dirEntry.namespace + '/' + dirEntry.url.replace(/[^/]+$/, ''))

    // Add CSP to prevent external scripts and content - note that any existing CSP can only be hardened, not loosened
    htmlArticle = htmlArticle.replace(/(<head\b[^>]*>)\s*/, '$1\n    <meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: file: blob: about: chrome-extension: moz-extension: https://browser-extension.kiwix.org https://kiwix.github.io \'unsafe-inline\' \'unsafe-eval\';"></meta>\n    ');

    // Transform as many Zimit-style URLs as possible to their ZIM equivalents
    if (selectedArchive.zimType === 'zimit') {
        var rootDirectory = dirEntry.url === dirEntry.url.replace(/^((?:A\/)?[^/]+\/?).*/, '$1');
        // Try to get the Zimit prefix from any canonical URL in the article
        var zimitPrefix = htmlArticle.match(regexpGetZimitPrefix);
        // If we couldn't get it, reconstruct it from the archive's zimitPrefix
        zimitPrefix = zimitPrefix ? zimitPrefix[1] : selectedArchive.zimitPrefix.replace(/^\w\/([^/]+).*/, '$1');
        zimitPrefix = (dirEntry.namespace === 'C' ? 'A/' : '') + zimitPrefix;
        htmlArticle = htmlArticle.replace(regexpZimitHtmlLinks, function (match, blockStart, equals, quote, relAssetUrl, blockClose) {
            var newBlock = match;
            var assetUrl = relAssetUrl;
            // console.log('Asset URL: ' + assetUrl);
            // Remove google analytics and other analytics files that cause stall
            if (/analytics|typepad.*stats|googleads|doubleclick|syndication/i.test(assetUrl)) return '';
            // For root-relative links, we need to add the zimitPrefix
            assetUrl = assetUrl.replace(/^\/(?!\/)/, dirEntry.namespace + '/' + zimitPrefix + '/');
            // For Zimit assets that begin with https: or // the zimitPrefix is derived from the URL
            assetUrl = assetUrl.replace(/^(?:https?:)?\/\//i, dirEntry.namespace + '/' + (dirEntry.namespace === 'C' ? 'A/' : ''));
            // For fully relative links, we have to remove any '..' if we are in root directory
            if (rootDirectory) assetUrl = assetUrl.replace(/^(\.\.\/?)+/, dirEntry.namespace + '/' + zimitPrefix + '/');
            newBlock = newBlock.replace(relAssetUrl, assetUrl);
            // console.debug('Transform: \n' + match + '\n -> ' + newBlock);
            return newBlock;
        });
        // Deal with image srcsets
        htmlArticle = htmlArticle.replace(/<img\b[^>]+srcset=["']([^"']+)/ig, function (match, srcset) {
            var srcsetArr = srcset.split(',');
            for (var i = 0; i < srcsetArr.length; i++) {
                // For root-relative links, we need to add the zimitPrefix
                srcsetArr[i] = srcsetArr[i].replace(/^\s*\/(?!\/)/, dirEntry.namespace + '/' + zimitPrefix + '/');
                // Zimit prefix is in the URL for absolute URLs
                srcsetArr[i] = srcsetArr[i].replace(/^(?:\s*https?:)?\/\//i, dirEntry.namespace + '/' + (dirEntry.namespace === 'C' ? 'A/' : ''));
                if (rootDirectory) srcsetArr[i] = srcsetArr[i].replace(/^(\.\.\/?)+/, dirEntry.namespace + '/' + zimitPrefix + '/');
            }
            match = match.replace(srcset, srcsetArr.join(', '));
            match = match.replace(/srcset/i, 'data-kiwixsrcset');
            return match;
        });
    }

    // Replaces ZIM-style URLs of img, script, link and media tags with a data-kiwixurl to prevent 404 errors [kiwix-js #272 #376]
    // This replacement also processes the URL relative to the page's ZIM URL so that we can find the ZIM URL of the asset
    // with the correct namespace (this works for old-style -,I,J namespaces and for new-style C namespace)
    var newBlock;
    var assetZIMUrlEnc;
    var indexRoot = window.location.pathname.replace(/[^/]+$/, '') + encodeURI(selectedArchive.file.name) + '/';
    htmlArticle = htmlArticle.replace(regexpTagsWithZimUrl, function (match, blockStart, equals, quote, relAssetUrl, querystring, blockClose) {
        // Don't process data URIs (yet)
        if (/data:image/i.test(relAssetUrl)) return match;
        // We need to save the query string if any for Zimit-style archives
        querystring = querystring || '';
        if (/zimit/.test(params.zimType)) {
            assetZIMUrlEnc = relAssetUrl.replace(indexRoot, '');
            assetZIMUrlEnc = assetZIMUrlEnc + querystring;
        }
        if (params.zimType !== 'zimit') {
            // DEV: Note that deriveZimUrlFromRelativeUrl produces a *decoded* URL (and incidentally would remove any URI component
            // if we had captured it). We therefore re-encode the URI with encodeURI (which does not encode forward slashes) instead
            // of encodeURIComponent.
            assetZIMUrlEnc = encodeURI(uiUtil.deriveZimUrlFromRelativeUrl(relAssetUrl, appstate.baseUrl));
        }
        newBlock = blockStart + 'data-kiwixurl' + equals + assetZIMUrlEnc + blockClose;
        // Replace any srcset with data-kiwixsrcset
        newBlock = newBlock.replace(/\bsrcset\s*=/, 'data-kiwixsrcset=');
        return newBlock;
    });
    // We also need to process data:image/webp if the browser needs the WebPMachine
    if (webpMachine) htmlArticle = htmlArticle.replace(/(<img\b[^>]*?\s)src(\s*=\s*["'])(?=data:image\/webp)([^"']+)/ig, '$1data-kiwixurl$2$3');
    // Remove any empty media containers on page (they can cause layout issue in jQuery mode)
    htmlArticle = htmlArticle.replace(/(<(audio|video)\b(?:[^<]|<(?!\/\2))+<\/\2>)/ig, function (p0) {
        return /(?:src|data-kiwixurl)\s*=\s*["']/.test(p0) ? p0 : '';
    });

    // We also need to process data:image/webp if the browser needs the WebPMachine
    if (webpMachine) htmlArticle = htmlArticle.replace(/(<img\b[^>]*?\s)src(\s*=\s*["'])(?=data:image\/webp)([^"']+)/ig, '$1data-kiwixurl$2$3');

    // Extract any css classes from the html tag (they will be stripped when injected in iframe with .innerHTML)
    var htmlCSS = htmlArticle.match(/<html[^>]*class\s*=\s*["']\s*([^"']+)/i);
    // Normalize classList and convert to array
    htmlCSS = htmlCSS ? htmlCSS[1].replace(/\s+/g, ' ').split(' ') : [];

    // Tell jQuery we're removing the iframe document: clears jQuery cache and prevents memory leaks [kiwix-js #361]
    var articleContent = document.getElementById('articleContent');
    while (articleContent.firstChild) {
        articleContent.removeChild(articleContent.firstChild);
    }
    // Hide any alert box that was activated in uiUtil.displayFileDownloadAlert function
    var downloadAlert = document.getElementById('downloadAlert');
    if (downloadAlert) downloadAlert.style.display = 'none';

    var iframeArticleContent = document.getElementById('articleContent');

    iframeArticleContent.onload = function () {
        iframeArticleContent.onload = function () {};
        var articleList = document.getElementById('articleList');
        var articleListHeaderMessage = document.getElementById('articleListHeaderMessage');
        while (articleList.firstChild) articleList.removeChild(articleList.firstChild);
        while (articleListHeaderMessage.firstChild) articleListHeaderMessage.removeChild(articleListHeaderMessage.firstChild);
        document.getElementById('articleListWithHeader').style.display = 'none';
        document.getElementById('prefix').value = '';

        var iframeContentDocument = iframeArticleContent.contentDocument;
        if (!iframeContentDocument && window.location.protocol === 'file:') {
            uiUtil.systemAlert(translateUI.t('dialog-blocked-fileprotocol') ||
            '<p>You seem to be opening kiwix-js with the file:// protocol, which is blocked by your browser for security reasons.</p>' +
            '<p>The easiest way to run it is to download and run it as a browser extension (available for free from the vendor store).</p>' +
            '<p>Or else you can open it through a web server: either through a local one (http://localhost/...) or through a remote one (but you will need a secure connection, e.g.: https://webserver/...)</p>' +
            "<p>Another option is to force your browser to accept that (but you'll open a security breach): on Chrome/Edge, you can start it with --allow-file-access-from-files command-line argument;" +
            'on Firefox, you can set privacy.file_unique_origin to false in about:config</p>');
            return;
        }

        // Inject the new article's HTML into the iframe
        var articleContent = iframeContentDocument.documentElement;
        // innerHTML required in this line
        articleContent.innerHTML = htmlArticle;

        var docBody = articleContent.getElementsByTagName('body');
        docBody = docBody ? docBody[0] : null;
        if (docBody) {
            // Add any missing classes stripped from the <html> tag
            if (htmlCSS) {
                htmlCSS.forEach(function (cl) {
                    docBody.classList.add(cl);
                });
            }
            // Deflect drag-and-drop of ZIM file on the iframe to Config
            docBody.addEventListener('dragover', handleIframeDragover);
            docBody.addEventListener('drop', handleIframeDrop);
        }

        // Set the requested appTheme
        uiUtil.applyAppTheme(params.appTheme);
        // Allow back/forward in browser history
        pushBrowserHistoryState(dirEntry.namespace + '/' + dirEntry.url);

        parseAnchorsJQuery();
        loadImagesJQuery();
        // JavaScript is currently disabled, so we need to make the browser interpret noscript tags
        // NB : if javascript is properly handled in jQuery mode in the future, this call should be removed
        // and noscript tags should be ignored
        loadNoScriptTags();
        // loadJavaScriptJQuery();
        loadCSSJQuery();
        insertMediaBlobsJQuery();
        // Jump to any anchor parameter
        if (anchorParameter) {
            var target = iframeContentDocument.getElementById(anchorParameter);
            if (target) target.scrollIntoView();
            anchorParameter = '';
        }
        if (iframeArticleContent.contentWindow) {
            // Configure home key press to focus #prefix only if the feature is in active state
            if (params.useHomeKeyToFocusSearchBar) { iframeArticleContent.contentWindow.addEventListener('keydown', focusPrefixOnHomeKey); }
            // when unloaded remove eventListener to avoid memory leaks
            iframeArticleContent.contentWindow.onunload = function () {
                iframeArticleContent.contentWindow.removeEventListener('keydown', focusPrefixOnHomeKey);
            };
        }
        params.isLandingPage = false;
    };

    // Load the blank article to clear the iframe (NB iframe onload event runs *after* this)
    iframeArticleContent.src = 'article.html';

    function parseAnchorsJQuery () {
        var currentProtocol = location.protocol;
        var currentHost = location.host;
        // Percent-encode dirEntry.url and add regex escape character \ to the RegExp special characters - see https://www.regular-expressions.info/characters.html;
        // NB dirEntry.url can also contain path separator / in some ZIMs (Stackexchange). } and ] do not need to be escaped as they have no meaning on their own.
        var escapedUrl = encodeURIComponent(dirEntry.url).replace(/([\\$^.|?*+/()[{])/g, '\\$1');
        // Pattern to match a local anchor in an href even if prefixed by escaped url; will also match # on its own
        // Note that we exclude any # with a semicolon between it and the end of the string, to avoid accidentally matching e.g. &#39;
        var regexpLocalAnchorHref = new RegExp('^(?:#|' + escapedUrl + '#)([^#;]*$)');
        var iframe = iframeArticleContent.contentDocument;
        Array.prototype.slice.call(iframe.querySelectorAll('a, area')).forEach(function (anchor) {
            // Attempts to access any properties of 'this' with malformed URLs causes app crash in Edge/UWP [kiwix-js #430]
            try {
                var href = anchor.href;
            } catch (err) {
                console.error('Malformed href caused error:' + err.message);
                return;
            }
            href = anchor.getAttribute('href');
            if (href === null || href === undefined || /^javascript:/i.test(anchor.protocol)) return;
            var anchorTarget = href.match(regexpLocalAnchorHref);
            if (href.length === 0) {
                // It's a link with an empty href, pointing to the current page: do nothing.
                return;
            }
            if (anchorTarget) {
                // It's a local anchor link : remove escapedUrl if any (see above)
                anchor.setAttribute('href', '#' + anchorTarget[1]);
                return;
            }
            if ((anchor.protocol !== currentProtocol ||
              anchor.host !== currentHost) && params.openExternalLinksInNewTabs) {
                var newHref = href;
                if (selectedArchive.zimType === 'zimit') {
                    // We need to check that the link isn't from a domain contained in the Zimit archive
                    var zimitDomain = selectedArchive.zimitPrefix.replace(/^\w\/([^/]+).*/, '$1');
                    newHref = href.replace(anchor.protocol + '//' + zimitDomain + '/', '');
                }
                if (newHref === href) {
                    // It's an external URL : we should open it in a new tab
                    anchor.addEventListener('click', function (event) {
                        // Find the closest enclosing A tag
                        var clickedAnchor = uiUtil.closestAnchorEnclosingElement(event.target);
                        uiUtil.warnAndOpenExternalLinkInNewTab(event, clickedAnchor);
                    });
                    return;
                } else {
                    href = dirEntry.namespace + '/' + selectedArchive.zimitPrefix + newHref;
                }
            }
            // It's a link to an article or file in the ZIM
            var uriComponent = uiUtil.removeUrlParameters(href);
            var contentType;
            var downloadAttrValue;
            // Some file types need to be downloaded rather than displayed (e.g. *.epub)
            // The HTML download attribute can be Boolean or a string representing the specified filename for saving the file
            // For Boolean values, getAttribute can return any of the following: download="" download="download" download="true"
            // So we need to test hasAttribute first: see https://developer.mozilla.org/en-US/docs/Web/API/Element/getAttribute
            // However, we cannot rely on the download attribute having been set, so we also need to test for known download file types
            var isDownloadableLink = anchor.hasAttribute('download') || regexpDownloadLinks.test(href);
            if (isDownloadableLink) {
                downloadAttrValue = anchor.getAttribute('download');
                // Normalize the value to a true Boolean or a filename string or true if there is no download attribute
                downloadAttrValue = /^(download|true|\s*)$/i.test(downloadAttrValue) || downloadAttrValue || true;
                contentType = anchor.getAttribute('type');
            }
            // Add an onclick event to extract this article or file from the ZIM
            // instead of following the link
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                // Prevent display of any popovers because we're loading a new article
                anchor.articleisloading = true;
                anchorParameter = href.match(/#([^#;]+)$/);
                anchorParameter = anchorParameter ? anchorParameter[1] : '';
                var indexRoot = window.location.pathname.replace(/[^/]+$/, '') + encodeURI(selectedArchive.file.name) + '/';
                var zimRoot = indexRoot.replace(/^.+?\/www\//, '/');
                var zimUrl = href;
                // var zimUrlFullEncoding;
                // Some URLs are incorrectly given with spaces at the beginning and end, so we remove these
                zimUrl = zimUrl.replace(/^\s+|\s+$/g, '');
                if (/zimit/.test(params.zimType)) {
                    // Deal with root-relative URLs in zimit ZIMs
                    if (!zimUrl.indexOf(indexRoot)) { // If begins with indexRoot
                        zimUrl = zimUrl.replace(indexRoot, '').replace('#' + anchorParameter, '');
                    } else if (!zimUrl.indexOf(zimRoot)) { // If begins with zimRoot
                        zimUrl = zimUrl.replace(zimRoot, '').replace('#' + anchorParameter, '');
                    } else if (/^\//.test(zimUrl)) {
                        zimUrl = zimUrl.replace(/^\//, selectedArchive.zimitPseudoContentNamespace + selectedArchive.zimitPrefix.replace(/^A\//, ''));
                    } else if (!~zimUrl.indexOf(selectedArchive.zimitPseudoContentNamespace)) { // Doesn't begin with pseudoContentNamespace
                        // Zimit ZIMs store URLs percent-encoded and with querystring and
                        // deriveZimUrlFromRelativeUrls strips any querystring and decodes
                        var zimUrlToTransform = zimUrl;
                        zimUrl = encodeURI(uiUtil.deriveZimUrlFromRelativeUrl(zimUrlToTransform, appstate.baseUrl)) +
                            href.replace(uriComponent, '').replace('#' + anchorParameter, '');
                        // zimUrlFullEncoding = encodeURI(uiUtil.deriveZimUrlFromRelativeUrl(zimUrlToTransform, appstate.baseUrl) +
                        //     href.replace(uriComponent, '').replace('#' + anchorParameter, ''));
                    }
                } else {
                    // It's a relative URL, so we need to calculate the full ZIM URL
                    zimUrl = uiUtil.deriveZimUrlFromRelativeUrl(uriComponent, appstate.baseUrl);
                }
                goToArticle(zimUrl, downloadAttrValue, contentType);
                // DEV: There is no need to remove the anchor.articleisloading flag because we do not open new tabs for ZIM URLs in Restricted Mode
                // so the anchor will be erased form the DOM when the new article is loaded
            });
        });
        attachPopoverTriggerEvents(iframeArticleContent.contentWindow);
    }

    function loadImagesJQuery () {
        // Make an array from the images that need to be processed
        var images = Array.prototype.slice.call(iframeArticleContent.contentDocument.querySelectorAll('img[data-kiwixurl]'));
        // This ensures cancellation of image extraction if the user navigates away from the page before extraction has finished
        images.owner = appstate.expectedArticleURLToBeDisplayed;
        // DEV: This self-invoking function is recursive, calling itself only when an image has been fully processed into a
        // blob: or data: URI (or returns an error). This ensures that images are processed sequentially from the top of the
        // DOM, making for a better user experience (because images above the fold are extracted first)
        (function extractImage () {
            if (!images.length || images.busy || images.owner !== appstate.expectedArticleURLToBeDisplayed) return;
            images.busy = true;
            // Extract the image at the top of the images array and remove it from the array
            var image = images.shift();
            // Get any data-kiwixsrcset
            var srcset = image.getAttribute('data-kiwixsrcset');
            var srcsetArr = [];
            if (srcset) {
                // We need to get the array of images in the srcset
                srcsetArr = srcset.split(',');
            }
            // Get the image URL
            var imageUrl = image.getAttribute('data-kiwixurl');
            // Decode any WebP images that are encoded as dataURIs
            if (/^data:image\/webp/i.test(imageUrl)) {
                uiUtil.feedNodeWithDataURI(image, 'src', imageUrl, 'image/webp');
                images.busy = false;
                extractImage();
                return;
            }
            var url = decodeURIComponent(imageUrl);
            selectedArchive.getDirEntryByPath(url).then(function (dirEntry) {
                selectedArchive.readBinaryFile(dirEntry, function (fileDirEntry, content) {
                    var mimetype = dirEntry.getMimetype();
                    uiUtil.feedNodeWithDataURI(image, 'src', content, mimetype, function () {
                        images.busy = false;
                        if (srcsetArr.length) {
                            // We need to process each image in the srcset
                            // Empty or make a new srcset
                            image.srcset = '';
                            var srcsetCount = srcsetArr.length;
                            srcsetArr.forEach(function (imgAndResolutionUrl) {
                                srcsetCount--;
                                images.busy = true;
                                // Get the url and the resolution from the srcset entry
                                var urlMatch = imgAndResolutionUrl.match(/^\s*([^\s]+)\s+([0-9.]+\w+)\s*$/);
                                var url = urlMatch ? urlMatch[1] : '';
                                var resolution = urlMatch ? urlMatch[2] : '';
                                selectedArchive.getDirEntryByPath(url).then(function (srcEntry) {
                                    selectedArchive.readBinaryFile(srcEntry, function (fileDirEntry, content) {
                                        var mimetype = srcEntry.getMimetype();
                                        uiUtil.getDataUriFromUint8Array(content, mimetype).then(function (dataUri) {
                                            // Add the dataUri to the srcset
                                            image.srcset += (image.srcset ? ', ' : '') + dataUri + ' ' + resolution;
                                            images.busy = false;
                                            if (srcsetCount === 0) {
                                                extractImage();
                                            }
                                        }).catch(function (e) {
                                            console.error('Could not get dataUri for image:' + url, e);
                                            images.busy = false;
                                            if (srcsetCount === 0) extractImage();
                                        });
                                    });
                                }).catch(function (e) {
                                    console.error('Could not find DirEntry for image:' + url, e);
                                    images.busy = false;
                                    if (srcsetCount === 0) extractImage();
                                });
                            });
                        } else {
                            extractImage();
                        }
                    });
                });
            }).catch(function (e) {
                console.error('could not find DirEntry for image:' + url, e);
                images.busy = false;
                extractImage();
            });
        })();
    }

    function loadNoScriptTags () {
        // For each noscript tag, we replace it with its content, so that the browser interprets it
        var noscriptTags = iframeArticleContent.contentDocument.querySelectorAll('noscript');
        Array.prototype.forEach.call(noscriptTags, function (noscriptTag) {
            var content = noscriptTag.textContent;
            var replacementNode = iframeArticleContent.contentDocument.createElement('script');
            replacementNode.text = content;
            noscriptTag.parentNode.replaceChild(replacementNode, noscriptTag);
        });
    }

    function loadCSSJQuery () {
        // Ensure all sections are open for clients that lack JavaScript support, or that have some restrictive CSP [kiwix-js #355].
        // This is needed only for some versions of ZIM files generated by mwoffliner (at least in early 2018), where the article sections are closed by default on small screens.
        // These sections can be opened by clicking on them, but this is done with some javascript.
        // The code below is a workaround we still need for compatibility with ZIM files generated by mwoffliner in 2018.
        // A better fix has been made for more recent ZIM files, with the use of noscript tags : see https://github.com/openzim/mwoffliner/issues/324
        var iframe = iframeArticleContent.contentDocument;
        var collapsedBlocks = iframe.querySelectorAll('.collapsible-block:not(.open-block), .collapsible-heading:not(.open-block)');
        // Using decrementing loop to optimize performance : see https://stackoverflow.com/questions/3520688
        for (var i = collapsedBlocks.length; i--;) {
            collapsedBlocks[i].classList.add('open-block');
        }
        var cssCount = 0;
        var cssFulfilled = 0;
        Array.prototype.slice.call(iframe.querySelectorAll('link[data-kiwixurl]')).forEach(function (link) {
            cssCount++;
            var linkUrl = link.getAttribute('data-kiwixurl');
            var url = decodeURIComponent(selectedArchive.zimType === 'zimit' ? linkUrl : uiUtil.removeUrlParameters(linkUrl));
            if (selectedArchive.cssCache.has(url)) {
                var nodeContent = selectedArchive.cssCache.get(url);
                if (/stylesheet/i.test(link.rel)) uiUtil.replaceCSSLinkWithInlineCSS(link, nodeContent);
                else uiUtil.feedNodeWithDataURI(link, 'href', nodeContent, link.type || 'image');
                cssFulfilled++;
            } else {
                if (params.assetsCache) document.getElementById('cachingAssets').style.display = '';
                selectedArchive.getDirEntryByPath(url).then(function (dirEntry) {
                    if (!dirEntry) {
                        selectedArchive.cssCache.set(url, ''); // Prevent repeated lookups of this unfindable asset
                        throw new Error('DirEntry ' + typeof dirEntry);
                    }
                    var mimetype = dirEntry.getMimetype();
                    var readFile = /^text\//i.test(mimetype) ? 'readUtf8File' : 'readBinaryFile';
                    return selectedArchive[readFile](dirEntry, function (fileDirEntry, content) {
                        var fullUrl = fileDirEntry.namespace + '/' + fileDirEntry.url;
                        if (params.assetsCache) selectedArchive.cssCache.set(fullUrl, content);
                        if (/text\/css/i.test(mimetype)) uiUtil.replaceCSSLinkWithInlineCSS(link, content);
                        else uiUtil.feedNodeWithDataURI(link, 'href', content, mimetype);
                        cssFulfilled++;
                        renderIfCSSFulfilled(fileDirEntry.url);
                    });
                }).catch(function (e) {
                    console.error('Could not find DirEntry for link element: ' + url, e);
                    cssCount--;
                    renderIfCSSFulfilled();
                });
            }
        });
        renderIfCSSFulfilled();

        // Some pages are extremely heavy to render, so we prevent rendering by keeping the iframe hidden
        // until all CSS content is available [kiwix-js #381]
        function renderIfCSSFulfilled (title) {
            if (cssFulfilled >= cssCount) {
                document.getElementById('cachingAssets').textContent = translateUI.t('spinner-caching-assets') || 'Caching assets...';
                document.getElementById('cachingAssets').style.display = 'none';
                uiUtil.spinnerDisplay(false);
                document.getElementById('articleContent').style.display = '';
                // We have to resize here for devices with On Screen Keyboards when loading from the article search list
                resizeIFrame();
            } else {
                updateCacheStatus(title);
            }
        }
    }

    function insertMediaBlobsJQuery () {
        var iframe = iframeArticleContent.contentDocument;
        Array.prototype.slice.call(iframe.querySelectorAll('video, audio, source, track'))
            .forEach(function (mediaSource) {
                var source = mediaSource.getAttribute('src');
                source = source ? uiUtil.deriveZimUrlFromRelativeUrl(source, appstate.baseUrl) : null;
                // We have to exempt text tracks from using deriveZimUrlFromRelativeurl due to a bug in Firefox [kiwix-js #496]
                source = source || decodeURIComponent(mediaSource.dataset.kiwixurl);
                if (!source || !regexpZIMUrlWithNamespace.test(source)) {
                    if (source) console.error('No usable media source was found for: ' + source);
                    return;
                }
                var mediaElement = /audio|video/i.test(mediaSource.tagName) ? mediaSource : mediaSource.parentElement;
                // If the "controls" property is missing, we need to add it to ensure jQuery-only users can operate the video. See kiwix-js #760.
                if (/audio|video/i.test(mediaElement.tagName) && !mediaElement.hasAttribute('controls')) mediaElement.setAttribute('controls', '');
                selectedArchive.getDirEntryByPath(source).then(function (dirEntry) {
                    return selectedArchive.readBinaryFile(dirEntry, function (fileDirEntry, mediaArray) {
                        var mimeType = mediaSource.type ? mediaSource.type : dirEntry.getMimetype();
                        var blob = new Blob([mediaArray], { type: mimeType });
                        mediaSource.src = URL.createObjectURL(blob);
                        // In Firefox and Chromium it is necessary to re-register the inserted media source
                        // but do not reload for text tracks (closed captions / subtitles)
                        if (/track/i.test(mediaSource.tagName)) return;
                        mediaElement.load();
                    });
                });
            });
    }
}

/**
 * Displays a message to the user that a style or other asset is being cached
 * @param {String} title The title of the file to display in the caching message block
 */
function updateCacheStatus (title) {
    if (params.assetsCache && /\.css$|\.js$/i.test(title)) {
        var cacheBlock = document.getElementById('cachingAssets');
        cacheBlock.style.display = '';
        title = title.replace(/[^/]+\//g, '').substring(0, 18);
        cacheBlock.textContent = (translateUI.t('spinner-caching') || 'Caching') + ' ' + title + '...';
    }
}

/**
 * Changes the URL of the browser page, so that the user might go back to it
 *
 * @param {String} title
 * @param {String} titleSearch
 */
function pushBrowserHistoryState (title, titleSearch) {
    var stateObj = {};
    var urlParameters;
    var stateLabel;
    if (title && !(title === '')) {
        // Prevents creating a double history for the same page
        if (history.state && history.state.title === title) return;
        stateObj.title = title;
        urlParameters = '?title=' + title;
        stateLabel = 'Wikipedia Article : ' + title;
    } else if (titleSearch && !(titleSearch === '')) {
        stateObj.titleSearch = titleSearch;
        urlParameters = '?titleSearch=' + titleSearch;
        stateLabel = 'Wikipedia search : ' + titleSearch;
    } else {
        return;
    }
    window.history.pushState(stateObj, stateLabel, urlParameters);
}

/**
 * Extracts the content of the given article pathname, or a downloadable file, from the ZIM
 *
 * @param {String} path The pathname (namespace + filename) to the article or file to be extracted
 * @param {Boolean|String} download A Bolean value that will trigger download of title, or the filename that should
 *     be used to save the file in local FS (in HTML5 spec, a string value for the download attribute is optional)
 * @param {String} contentType The mimetype of the downloadable file, if known
 */
function goToArticle (path, download, contentType) {
    uiUtil.spinnerDisplay(true);
    selectedArchive.getDirEntryByPath(path).then(function (dirEntry) {
        var mimetype = contentType || dirEntry ? dirEntry.getMimetype() : '';
        if (dirEntry === null || dirEntry === undefined) {
            uiUtil.spinnerDisplay(false);
            uiUtil.systemAlert((translateUI.t('dialog-article-notfound-message') || 'Article with the following URL was not found in the archive:') + ' ' + path,
                translateUI.t('dialog-article-notfound-title') || 'Error: article not found');
        } else if (download || /\/(epub|pdf|zip|.*opendocument|.*officedocument|tiff|mp4|webm|mpeg|mp3|octet-stream)\b/i.test(mimetype)) {
            download = true;
            selectedArchive.readBinaryFile(dirEntry, function (fileDirEntry, content) {
                uiUtil.displayFileDownloadAlert(path, download, mimetype, content);
            });
        } else {
            params.isLandingPage = false;
            var activeContent = document.getElementById('activeContent');
            if (activeContent) activeContent.style.display = 'none';
            readArticle(dirEntry);
        }
    }).catch(function (e) {
        uiUtil.systemAlert((translateUI.t('dialog-article-readerror-message') || 'Error reading article with url:' + ' ' + path + ' : ' + e),
            translateUI.t('dialog-article-readerror-title') || 'Error reading article');
    });
}

function goToRandomArticle () {
    if (selectedArchive !== null && selectedArchive.isReady()) {
        document.getElementById('searchingArticles').style.display = '';
        selectedArchive.getRandomDirEntry(function (dirEntry) {
            if (dirEntry === null || dirEntry === undefined) {
                uiUtil.spinnerDisplay(false);
                uiUtil.systemAlert(translateUI.t('dialog-randomarticle-error-message') || 'Error finding random article',
                    translateUI.t('dialog-article-notfound-title') || 'Error: article not found');
            } else {
                // We fall back to the old A namespace to support old ZIM files without a text/html MIME type for articles
                // DEV: If articlePtrPos is defined in zimFile, then we are using a v1 article-only title listing. By definition,
                // all dirEntries in an article-only listing must be articles.
                if (selectedArchive.file.articlePtrPos || dirEntry.getMimetype() === 'text/html' || dirEntry.namespace === 'A') {
                    params.isLandingPage = false;
                    var activeContent = document.getElementById('activeContent');
                    if (activeContent) activeContent.style.display = 'none';
                    document.getElementById('searchingArticles').style.display = '';
                    readArticle(dirEntry);
                } else {
                    // If the random title search did not end up on an article,
                    // we try again, until we find one
                    goToRandomArticle();
                }
            }
        });
    } else {
        // Showing the relevant error message and redirecting to config page for adding the ZIM file
        uiUtil.systemAlert(translateUI.t('dialog-archive-notset-message') || 'Archive not set: please select an archive',
            translateUI.t('dialog-archive-notset-title') || 'No archive selected').then(function () {
            document.getElementById('btnConfigure').click();
        });
    }
}

function goToMainArticle () {
    document.getElementById('searchingArticles').style.display = '';
    selectedArchive.getMainPageDirEntry(function (dirEntry) {
        if (dirEntry === null || dirEntry === undefined) {
            console.error('Error finding main article.');
            uiUtil.spinnerDisplay(false);
            document.getElementById('welcomeText').style.display = '';
        } else {
            var setMainPage = function (dirEntry) {
                params.isLandingPage = true;
                selectedArchive.landingPageUrl = dirEntry.namespace + '/' + dirEntry.url;
                readArticle(dirEntry);
            }
            if (dirEntry.redirect) {
                selectedArchive.resolveRedirect(dirEntry, setMainPage);
            // DEV: see comment above under goToRandomArticle()
            } else if (/text/.test(dirEntry.getMimetype()) || dirEntry.namespace === 'A') {
                setMainPage(dirEntry);
            } else {
                params.isLandingPage = false;
                console.error('The main page of this archive does not seem to be an article');
                uiUtil.spinnerDisplay(false);
                document.getElementById('welcomeText').style.display = '';
            }
        }
    });
}

export default {};
