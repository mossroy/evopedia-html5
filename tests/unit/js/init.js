/* eslint-disable no-useless-constructor */
/**
 * init.js : Configuration for the library require.js
 * This file handles the dependencies between javascript libraries, for the unit tests
 *
 * Copyright 2013-2014 Mossroy and contributors
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

// Define global params needed for tests to run on existing app code
// eslint-disable-next-line no-unused-vars
var params = {};
// We need to turn off source verification so that the test files can be loaded normally without interruption
params['sourceVerification'] = false;
// Test if WebP is natively supported, and if not, load a webpMachine instance. This is used in uiUtils.js.
// eslint-disable-next-line no-unused-vars
var webpMachine = false;

// Create a mock Image class for Node.js environment
if (typeof window === 'undefined') {
    // We're in Node.js
    global.Image = class Image {
        constructor () {
            this.height = 0;
            setTimeout(() => {
                // Simulate successful WebP support
                this.height = 2;
                if (typeof this.onload === 'function') {
                    this.onload();
                }
            }, 0);
        }
    };

    global.document = {
        head: {
            appendChild: function () {} // Mock appendChild
        },
        createElement: function () {
            return {
                onload: null,
                src: ''
            };
        }
    };

    global.webpHero = {
        WebpMachine: class WebpMachine {
            constructor () {}
        }
    };
}

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
        webpScript.src = '../../www/js/lib/webpHeroBundle_0.0.2.js';
        document.head.appendChild(webpScript);
    }
});
