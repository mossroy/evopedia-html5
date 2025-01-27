/*!
 * init.js : Configuration for the app
 * This file sets the app's main parameters and variables
 *
 * Copyright 2013-2023 Mossroy, Jaifroid and contributors
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

/* global webpHero */

/**
 * A global parameter object for storing variables that need to be remembered between page loads,
 * or across different functions and modules
 *
 * @typedef {Object} AppParams
 * @property {string} appVersion - The version number of the application.
 * @property {string} PWAServer - The URL of the PWA server for use with the browser extensions in ServiceWorker mode.
 * @property {string} storeType - A parameter to determine the Settings Store API in use.
 * @property {string} keyPrefix - The key prefix used by the settingsStore.js.
 * @property {boolean} hideActiveContentWarning - A boolean indicating whether to hide the active content warning.
 * @property {boolean} hideExternalLinkWarning - A boolean indicating whether to hide the external link warning.
 * @property {boolean} slideAway - A boolean indicating whether to slide away the header and footer when scrolling.
 * @property {boolean} showUIAnimations - A boolean indicating whether to show UI animations.
 * @property {number} maxSearchResultsSize - The maximum number of article titles to return.
 * @property {boolean} assetsCache - A boolean indicating whether to cache assets.
 * @property {boolean} appCache - A boolean indicating whether to cache the PWA's code.
 * @property {string} appTheme - A parameter to set the app theme and, if necessary, the CSS theme for article content.
 * @property {boolean} useHomeKeyToFocusSearchBar - A global parameter to turn on/off the use of Keyboard HOME Key to focus search bar.
 * @property {boolean} openExternalLinksInNewTabs - A global parameter to turn on/off opening external links in new tab (for ServiceWorker mode).
 * @property {string} overrideBrowserLanguage - A global language override.
 * @property {boolean} disableDragAndDrop - A parameter to disable drag-and-drop.
 * @property {string} referrerExtensionURL - A parameter to access the URL of any extension that this app was launched from.
 * @property {boolean} defaultModeChangeAlertDisplayed - A parameter to keep track of the fact that the user has been informed of the switch to SW mode by default.
 * @property {string} contentInjectionMode - A parameter to set the content injection mode ('jquery' or 'serviceworker') used by this app.
 * @property {boolean} useCanvasElementsForWebpTranscoding - A parameter to circumvent anti-fingerprinting technology in browsers that do not support WebP natively by substituting images directly with the canvas elements produced by the WebP polyfill.
 * @property {string} libraryUrl - The URL of the Kiwix library.
 * @property {string} altLibraryUrl - The alternative URL of the Kiwix library in non-supported browsers.
 * @property {string} cacheAPI - Name of the prefix used to identify the cache in Cache API
 * @property {string} cacheIDB - Name of the Indexed DB database
 * @property {boolean} isFileSystemApiSupported - A boolean indicating whether the FileSystem API is supported.
 * @property {boolean} isWebkitDirApiSupported - A boolean indicating whether the Webkit Directory API is supported.
 * @property {boolean} useLibzim - A boolean indicating whether to use the libzim to load zim files.
 * @property {boolean} showPopoverPreviews - A boolean indicating whether to show previews of ZIM links (currently only for Wikimedia archives)
 * @property {"wasm-dev" | 'wasm' | 'asm' | 'asm-dev' | 'default'} libzimMode - A value indicating which libzim mode is selected.
 * @property {DecompressorAPI} decompressorAPI

/**
 * A property of the global params object to track the assembler machine type and the last used decompressor (for reporting to the API panel)
 * This is populated in the Emscripten wrappers
 * @typedef {Object} DecompressorAPI
 * @property {String} assemblerMachineType The assembler machine type supported and/or loaded by this app: 'ASM' or 'WASM'
 * @property {String} decompressorLastUsed The decompressor that was last used to decode a compressed cluster (currently 'XZ' or 'ZSTD')
 * @property {String} errorStatus A description of any detected error in loading a decompressor
 */

/**
 * @type {AppParams}
 */
var params = {};

/**
 * Set parameters from the Settings Store, together with any defaults
 * Note that the params global object is declared in init.js so that it is available to modules
 * WARNING: Only change these parameters if you know what you are doing
 */
// The current version number of this app
params['appVersion'] = '4.1.2'; // **IMPORTANT** Ensure this is the same as the version number in service-worker.js
// The PWA server (for use with the browser extensions in ServiceWorker mode)
params['PWAServer'] = 'https://browser-extension.kiwix.org/current/'; // Include final slash!
// params['PWAServer'] = 'https://kiwix.github.io/kiwix-js/'; // DEV: Uncomment this line for testing code on GitHub Pages
// params['PWAServer'] = 'http://localhost:8080/'; // DEV: Uncomment this line (and adjust) for local testing
// A parameter to determine the Settings Store API in use
params['storeType'] = getBestAvailableStorageAPI();
// The key prefix used by the settingsStore.js (see comment there for explanation), but we also need it below
params['keyPrefix'] = 'kiwixjs-';
params['hideActiveContentWarning'] = getSetting('hideActiveContentWarning') === true;
params['hideExternalLinkWarning'] = getSetting('hideExternalLinkWarning') === true;
// A parameter to determine whether to slide away the header and footer when scrolling (defaults to true except on Firefox OS devices which may be buggy with this setting)
params['slideAway'] = getSetting('slideAway') === false ? false : typeof navigator.getDeviceStorages !== 'function';
params['showUIAnimations'] = getSetting('showUIAnimations') === true;
// Maximum number of article titles to return (range is 5 - 50, default 25)
params['maxSearchResultsSize'] = getSetting('maxSearchResultsSize') || 25;
// Turns caching of assets on or off and deletes the cache (it defaults to true unless explicitly turned off in UI)
params['assetsCache'] = getSetting('assetsCache') !== false;
// Turns caching of the PWA's code on or off and deletes the cache (it defaults to true unless the bypass option is set in Expert Settings)
params['appCache'] = getSetting('appCache') !== false;
// A parameter to set the app theme and, if necessary, the CSS theme for article content (defaults to 'light')
params['appTheme'] = getSetting('appTheme') || 'light'; // Currently implemented: light|dark|dark_invert|dark_mwInvert|auto|auto_invert|auto_mwInvert|
// A global parameter to turn on/off the use of Keyboard HOME Key to focus search bar
params['useHomeKeyToFocusSearchBar'] = getSetting('useHomeKeyToFocusSearchBar') === true;
// A global parameter to turn on/off opening external links in new tab (for ServiceWorker mode)
params['openExternalLinksInNewTabs'] = getSetting('openExternalLinksInNewTabs') !== false;
// A global language override
params['overrideBrowserLanguage'] = getSetting('languageOverride');
// A parameter to disable drag-and-drop
params['disableDragAndDrop'] = getSetting('disableDragAndDrop') === true;
// A parameter to access the URL of any extension that this app was launched from
params['referrerExtensionURL'] = getSetting('referrerExtensionURL');
// A parameter to keep track of the fact that the user has been informed of the switch to SW mode by default
params['defaultModeChangeAlertDisplayed'] = getSetting('defaultModeChangeAlertDisplayed');
// A parameter to set the content injection mode ('jquery' or 'serviceworker') used by this app
params['contentInjectionMode'] = getSetting('contentInjectionMode') ||
    // Defaults to serviceworker mode when the API is available
    (('serviceWorker' in navigator) ? 'serviceworker' : 'jquery');
// A parameter to circumvent anti-fingerprinting technology in browsers that do not support WebP natively by substituting images
// directly with the canvas elements produced by the WebP polyfill [kiwix-js #835]. NB This is only currently used in jQuery mode.
params['useCanvasElementsForWebpTranscoding'] = null; // Value is determined in uiUtil.determineCanvasElementsWorkaround(), called when setting the content injection mode
params['libraryUrl'] = 'https://library.kiwix.org/'; // Url for iframe that will be loaded to download new zim files
params['altLibraryUrl'] = 'https://download.kiwix.org/zim/'; // Alternative Url for iframe (for use with unsupported browsers) that will be loaded to download new zim files
params['kiwixDownloadMirrors'] = ['https://ftp.fau.de/kiwix/zim/', 'https://mirrors.dotsrc.org/kiwix/zim/',
    'https://www.mirrorservice.org/sites/download.kiwix.org/zim/', 'https://md.mirrors.hacktegic.com/kiwix-md/zim/',
    'https://laotzu.ftp.acc.umu.se/mirror/kiwix.org/zim/', 'https://saimei.ftp.acc.umu.se/mirror/kiwix.org/zim/'];
params['cacheAPI'] = 'kiwix-js'; // Sets name of the prefix used to identify the cache in Cache API
params['cacheIDB'] = 'kiwix-zim'; // Sets name of the Indexed DB database
params['isFileSystemApiSupported'] = typeof window.showOpenFilePicker === 'function'; // Sets a boolean indicating whether the FileSystem API is supported
params['isWebkitDirApiSupported'] = 'webkitdirectory' in document.createElement('input'); // Sets a Boolean indicating whether the Webkit Directory API is supported
params['sourceVerification'] = params.contentInjectionMode === 'serviceworker' ? (getSetting('sourceVerification') === null ? true : getSetting('sourceVerification')) : false; // Sets a boolean indicating weather a user trusts the source of zim files
params['libzimMode'] = getSetting('libzimMode') || 'wasm'; // Sets a value indicating which libzim mode is selected
params['useLibzim'] = !!getSetting('useLibzim'); // Sets a value indicating which libzim mode is selected
params['previousZimFileName'] = getSetting('previousZimFileName') || ''; // Sets the name of the last opened zim file
params['reopenLastArchive'] = getSetting('reopenLastArchive') !== false; // Sets a Boolean defaulting to true indicating whether to reopen the last opened zim file if possible
params['showPopoverPreviews'] = getSetting('showPopoverPreviews') !== false; // Sets a Boolean defaulting to true indicating whether to show previews of article contents when hovering a ZIM link

/**
 * Apply any override parameters that might be in the querystring.
 * This is used for communication between the PWA and any local code (e.g. Firefox Extension), both ways.
 * It is also possible for DEV (or user) to launch the app with certain settings, or to unset potentially
 * problematic settings, by crafting the querystring appropriately.
 */
(function overrideParams () {
    var regexpUrlParams = /[?&]([^=]+)=([^&]+)/g;
    var matches = regexpUrlParams.exec(window.location.search);
    while (matches) {
        if (matches[1] && matches[2]) {
            var paramKey = decodeURIComponent(matches[1]);
            var paramVal = decodeURIComponent(matches[2]);
            if (paramKey !== 'title') {
                console.debug('Setting key-pair: ' + paramKey + ':' + paramVal);
                // Make values Boolean if 'true'/'false'
                paramVal = paramVal === 'true' || (paramVal === 'false' ? false : paramVal);
                setSetting(paramKey, paramVal);
                params[paramKey] = paramVal;
            }
        }
        matches = regexpUrlParams.exec(window.location.search);
    }
    // If we are in the PWA version launched from an extension, send a 'success' message to the extension
    if (params.referrerExtensionURL && ~window.location.href.indexOf(params.PWAServer)) {
        var message = '?PWA_launch=success';
        // DEV: To test failure of the PWA, you could pause on next line and set message to '?PWA_launch=fail'
        // Note that, as a failsafe, the PWA_launch key is set to 'fail' (in the extension) before each PWA launch
        // so we need to send a 'success' message each time the PWA is launched
        var frame = document.createElement('iframe');
        frame.id = 'kiwixComm';
        frame.style.display = 'none';
        document.body.appendChild(frame);
        frame.src = params.referrerExtensionURL + '/www/index.html' + message;
        // Now remove redundant frame. We cannot use onload, because it doesn't give time for the script to run.
        setTimeout(function () {
            var kiwixComm = document.getElementById('kiwixComm');
            // The only browser which does not support .remove() is IE11, but it will never run this code
            if (kiwixComm) kiwixComm.remove();
        }, 3000);
    }
})();

// Since contentInjectionMode can be overriden when returning from remote PWA to extension (for example), we have to prevent an infinite loop
// with code that warns the user to turn off the App Cache bypass in jQuery mode. Note that to turn OFF the bypass, we have to set the VALUE to true
params.appCache = params.contentInjectionMode === 'jquery' ? true : params.appCache;

/**
 * Set the State and UI settings associated with parameters defined above
 */
document.getElementById('hideActiveContentWarningCheck').checked = params.hideActiveContentWarning;
document.getElementById('hideExternalLinkWarningCheck').checked = params.hideExternalLinkWarning;
document.getElementById('disableDragAndDropCheck').checked = params.disableDragAndDrop;
document.getElementById('slideAwayCheck').checked = params.slideAway;
document.getElementById('showUIAnimationsCheck').checked = params.showUIAnimations;
document.getElementById('titleSearchRange').value = params.maxSearchResultsSize;
document.getElementById('titleSearchRangeVal').textContent = params.maxSearchResultsSize;
document.getElementById('appThemeSelect').value = params.appTheme;
document.getElementById('useHomeKeyToFocusSearchBarCheck').checked = params.useHomeKeyToFocusSearchBar;
document.getElementById('openExternalLinksInNewTabsCheck').checked = params.openExternalLinksInNewTabs;
document.getElementById('languageSelector').value = params.overrideBrowserLanguage || 'default';
document.getElementById('bypassAppCacheCheck').checked = !params.appCache;
document.getElementById('libzimModeSelect').value = params.libzimMode;
document.getElementById('useLibzim').checked = params.useLibzim;
document.getElementById('appVersion').textContent = 'Kiwix ' + params.appVersion;
document.getElementById('enableSourceVerification').checked = getSetting('sourceVerification') === null ? true : getSetting('sourceVerification');
document.getElementById('reopenLastArchiveCheck').checked = params.reopenLastArchive;
document.getElementById('showPopoverPreviewsCheck').checked = params.showPopoverPreviews;
// If the File System Access API is supported, unhide the reopenLastArchiveDiv
if (params.isFileSystemApiSupported) document.getElementById('reopenLastArchiveDiv').style.display = '';

// This is a simplified version of code in settingsStore, because that module is not available in init.js
function getSetting (name) {
    var result;
    if (params.storeType === 'cookie') {
        var regexp = new RegExp('(?:^|;)\\s*' + name + '=([^;]+)(?:;|$)');
        result = document.cookie.match(regexp);
        result = result && result.length > 1 ? decodeURIComponent(result[1]) : null;
    } else if (params.storeType === 'local_storage') {
        // Use localStorage instead
        result = localStorage.getItem(params.keyPrefix + name);
    }
    return result === null || result === 'undefined' ? null : result === 'true' ? true : result === 'false' ? false : result;
}

// This is a simplified version of code in settingsStore, because that module is not available in init.js
function setSetting (name, val) {
    if (params.storeType === 'cookie') {
        document.cookie = encodeURIComponent(name) + '=' + encodeURIComponent(val) + ';expires=Fri, 31 Dec 9999 23:59:59 GMT';
    }
    // Make Boolean value
    val = val === 'false' ? false : val === 'true' ? true : val;
    if (params.storeType === 'local_storage') {
        localStorage.setItem(params.keyPrefix + name, val);
    }
}

// Tests for available Storage APIs (document.cookie or localStorage) and returns the best available of these
// DEV: This function is replicated from settingsStore.js because it's not available from init
// It returns 'cookie' if the always-present contentInjectionMode is still in cookie, which
// means the store previously used cookies and hasn't upgraded yet: this won't be done till app.js is loaded
function getBestAvailableStorageAPI () {
    var type = 'none';
    var localStorageTest;
    try {
        localStorageTest = 'localStorage' in window && window['localStorage'] !== null;
        if (localStorageTest) {
            localStorage.setItem('tempKiwixStorageTest', '');
            localStorage.removeItem('tempKiwixStorageTest');
        }
    } catch (e) {
        localStorageTest = false;
    }
    document.cookie = 'tempKiwixCookieTest=working; expires=Fri, 31 Dec 9999 23:59:59 GMT; SameSite=Strict';
    var kiwixCookieTest = /tempKiwixCookieTest=working/.test(document.cookie);
    document.cookie = 'tempKiwixCookieTest=; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict';
    if (kiwixCookieTest) type = 'cookie';
    if (localStorageTest && !/contentInjectionMode=(?:jquery|serviceworker)/.test(document.cookie)) type = 'local_storage';
    return type;
}

// The following lines check the querystring for a communication from the PWA indicating it has successfully launched.
// If this querystring is received, then the app will set a success key in the extension's localStorage and then halt further processing.
// This is used to prevent a "boot loop" where the app will keep jumping to a failed install of the PWA.
if (/PWA_launch=/.test(window.location.search)) {
    var match = /PWA_launch=([^&]+)/.exec(window.location.search);
    localStorage.setItem(params.keyPrefix + 'PWA_launch', match[1]);
    // If we have successfully launched the PWA (even if there was no SW mode available), we prevent future default mode change alerts
    if (match[1] === 'success') localStorage.setItem(params.keyPrefix + 'defaultModeChangeAlertDisplayed', true);
    console.warn('Launch of PWA has been registered as "' + match[1] + '" by the extension.');
    // Set a flag to prevent further processing in app.js
    params.abort = true;
} else {
    // Test if WebP is natively supported, and if not, load a webpMachine instance. This is used in uiUtils.js.
    // eslint-disable-next-line no-unused-vars
    var webpMachine = false;

    // We use a self-invoking function here to avoid defining unnecessary global functions and variables
    (function (callback) {
        // Tests for native WebP support
        var webP = new Image();
        webP.onload = webP.onerror = function () {
            callback(webP.height === 2);
        };
        webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
    })(function (support) {
        if (!support) {
            // Note we set the location of this to be the directory where scripts reside **after bundling**
            var webpScript = document.createElement('script');
            webpScript.onload = function () {
                webpMachine = new webpHero.WebpMachine({ useCanvasElements: true });
            }
            webpScript.src = '../www/js/webpHeroBundle_0.0.2.js';
            document.head.appendChild(webpScript);
        }
    });
}
