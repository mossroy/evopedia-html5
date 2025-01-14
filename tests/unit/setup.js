/* eslint-disable no-prototype-builtins */
/* eslint-disable import/no-named-default */
/**
 * Mocha test environment setup
 *
 * This file configures the test environment for Mocha tests,
 * including any global setup, hooks, or configuration needed
 * before running the tests.
 */

import { JSDOM } from 'jsdom';
import { expect, assert } from 'chai';
import * as sinon from 'sinon';
import { default as jQuery } from 'jquery';

// Initialize params before anything else
globalThis.params = {
    sourceVerification: false
};

// Create JSDOM instance
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    referrer: 'http://localhost',
    contentType: 'text/html',
    includeNodeLocations: true,
    storageQuota: 10000000,
    pretendToBeVisual: true,
    resources: 'usable'
});

// Set up the global environment properly
const { window } = dom;
const { document } = window;

// Define self (used in web workers and browser environments)
globalThis.self = globalThis;
window.self = window;

// Define Image class before setting up window
class Image {
    constructor () {
        this.height = 0;
        this.onload = null;
        this.onerror = null;

        setTimeout(() => {
            this.height = 2;
            if (typeof this.onload === 'function') {
                this.onload();
            }
        }, 0);
    }

    set src (value) {
        this._src = value;
        if (this.onload) {
            setTimeout(this.onload, 0);
        }
    }

    get src () {
        return this._src;
    }
}

// Copy window properties to global
Object.defineProperty(globalThis, 'window', {
    value: window,
    writable: true,
    enumerable: true,
    configurable: true
});

Object.defineProperty(globalThis, 'document', {
    value: document,
    writable: true,
    enumerable: true,
    configurable: true
});

// Make params available on window as well
Object.defineProperty(window, 'params', {
    value: globalThis.params,
    writable: true,
    enumerable: true,
    configurable: true
});

// Add Image to both global and window
Object.defineProperty(globalThis, 'Image', {
    value: Image,
    writable: true,
    enumerable: true,
    configurable: true
});

Object.defineProperty(window, 'Image', {
    value: Image,
    writable: true,
    enumerable: true,
    configurable: true
});

// Mock Worker if needed for xzdec_wrapper.js
class Worker {
    constructor (stringUrl) {
        this.url = stringUrl;
        this.onmessage = null;
        this.onerror = null;
    }

    postMessage (msg) {
        // Implement any worker simulation logic here if needed
        if (this.onmessage) {
            setTimeout(() => {
                this.onmessage({ data: {} });
            }, 0);
        }
    }

    terminate () {
        // Cleanup logic if needed
    }
}

globalThis.Worker = Worker;
window.Worker = Worker;

// Add other required globals
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;
globalThis.Node = window.Node;
globalThis.location = window.location;
globalThis.history = window.history;
globalThis.Element = window.Element;

// Mock webpHero
globalThis.webpHero = {
    WebpMachine: class WebpMachine {
        constructor (options) {
            this.options = options;
        }
    }
};

// Setup jQuery
const $ = jQuery(window);
Object.defineProperty(globalThis, '$', {
    value: $,
    writable: true,
    enumerable: true,
    configurable: true
});
Object.defineProperty(globalThis, 'jQuery', {
    value: $,
    writable: true,
    enumerable: true,
    configurable: true
});

// Setup test utilities
globalThis.expect = expect;
globalThis.assert = assert;
globalThis.sinon = sinon;

// Add custom test helpers
globalThis.createTestElement = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.firstElementChild;
};

// Clean up function for tests
globalThis.cleanupDOM = () => {
    document.body.innerHTML = '';
};

// Mock createElement for script tags
const originalCreateElement = document.createElement.bind(document);
document.createElement = (tagName) => {
    const element = originalCreateElement(tagName);
    if (tagName.toLowerCase() === 'script') {
        setTimeout(() => {
            if (element.onload) {
                element.onload();
            }
        }, 0);
    }
    return element;
};

// Add necessary DOM APIs that might be missing
if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function (callback) {
        return setTimeout(callback, 0);
    };
}

if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function (id) {
        clearTimeout(id);
    };
}

// Set up localStorage mock
if (!window.localStorage) {
    window.localStorage = {
        getItem: function (key) {
            return this[key] || null;
        },
        setItem: function (key, value) {
            this[key] = value.toString();
        },
        removeItem: function (key) {
            delete this[key];
        },
        clear: function () {
            for (const key in this) {
                if (this.hasOwnProperty(key)) {
                    delete this[key];
                }
            }
        }
    };
}
