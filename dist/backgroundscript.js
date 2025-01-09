/**
 * backgroundscript.js: Background script for the WebExtension Manifest V2
 *
 * Copyright 2017 Mossroy and contributors
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

/* global chrome, browser */

// In order to work on both Firefox and Chromium/Chrome (and derivatives).
// browser and chrome variables expose almost the same APIs
var genericBrowser;
if (typeof browser !== 'undefined') {
    // Firefox
    genericBrowser = browser;
} else {
    // Chromium/Chrome
    genericBrowser = chrome;
}
// DEV: For a Mozilla MV3 extension, we have to use 'action' instead of 'browserAction'
var genericAction = genericBrowser.browserAction || genericBrowser.action;
genericAction.onClicked.addListener(function () {
    var newURL = genericBrowser.runtime.getURL('www/index.html');
    genericBrowser.tabs.create({ url: newURL });
});
