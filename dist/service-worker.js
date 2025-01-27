/**
 * service-worker.js : Service Worker implementation,
 * in order to capture the HTTP requests made by an article, and respond with the
 * corresponding content, coming from the archive
 *
 * Copyright 2022 Mossroy, Jaifroid and contributors
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

/* global chrome */

/* eslint-disable prefer-const */

/**
 * App version number - ENSURE IT MATCHES VALUE IN init.js
 * DEV: Changing this will cause the browser to recognize that the Service Worker has changed, and it will
 * download and install a new copy; we have to hard code this here because it is needed before any other file
 * is cached in APP_CACHE
 */
const appVersion = '4.1.2';

/**
 * The name of the Cache API cache in which assets defined in regexpCachedContentTypes will be stored
 * The value is sometimes needed here before it can be passed from app.js, so we have to duplicate it
 * @type {String}
 */
// DEV: Ensure this matches the name defined in app.js
const ASSETS_CACHE = 'kiwixjs-assetsCache';

/**
 * The name of the application cache to use for caching online code so that it can be used offline
 * The cache name is made up of the prefix below and the appVersion: this is necessary so that when
 * the app is updated, a new cache is created. The new cache will start being used after the user
 * restarts the app, when we will also delete the old cache.
 * @type {String}
 */
const APP_CACHE = 'kiwixjs-appCache-' + appVersion;

/**
 * A global Boolean that governs whether ASSETS_CACHE will be used
 * Caching is on by default but can be turned off by the user in Configuration
 * @type {Boolean}
 */
var useAssetsCache = true;

/**
 * A global Boolean that governs whether the APP_CACHE will be used
 * This is an expert setting in Configuration
 * @type {Boolean}
 */
var useAppCache = true;

/**
 * A global Boolean that records whether the ReplayWorker is available
 */
let isReplayWorkerAvailable = false;

/**
 * A regular expression that matches the Content-Types of assets that may be stored in ASSETS_CACHE
 * Add any further Content-Types you wish to cache to the regexp, separated by '|'
 * @type {RegExp}
 */
const regexpCachedContentTypes = /text\/css|\/javascript|application\/javascript/i;

/**
 * A regular expression that excludes listed schemata from caching attempts
 * As of 08-2019 the chrome-extension: schema is incompatible with the Cache API
 * 'example-extension' is included to show how to add another schema if necessary
 * @type {RegExp}
 */
const regexpExcludedURLSchema = /^(?:file|chrome-extension|example-extension):/i;

/**
 * Pattern for ZIM file namespace: see https://wiki.openzim.org/wiki/ZIM_file_format#Namespaces
 * In our case, there is also the ZIM file name used as a prefix in the URL
 * @type {RegExp}
 */
const regexpZIMUrlWithNamespace = /(?:^|\/)([^/]+\/)([-ABCHIJMUVWX])\/(.+)/;

/**
 * Pattern to parse the first offset of a "range" request header
 * NB: this only reads the first offset of the first byte range, where the spec allows several ranges, and several units.
 * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range
 * But, in our case, we send a header to tell the browser we only accept the bytes unit.
 * I did not see multiple ranges asked by a browser.
 *
 * @type {RegExp}
 */
const regexpByteRangeHeader = /^\s*bytes=(\d+)-/;

/**
 * The list of files that the app needs in order to run entirely from offline code
 */
const precacheFiles = [
    '.', // This caches the redirect to www/index.html, in case a user launches the app from its root directory
    'manifest.json',
    'replayWorker.js',
    'service-worker.js',
    'i18n/en.jsonp.js',
    'i18n/es.jsonp.js',
    'i18n/fr.jsonp.js',
    'www/css/app.css',
    'www/css/kiwixJS_invert.css',
    'www/css/kiwixJS_mwInvert.css',
    'www/css/transition.css',
    'www/img/icons/kiwix-256.png',
    'www/img/icons/kiwix-32.png',
    'www/img/icons/kiwix-60.png',
    'www/img/icons/new_window_black.svg',
    'www/img/icons/new_window_white.svg',
    'www/img/spinner.gif',
    'www/img/Icon_External_Link.png',
    'www/index.html',
    'www/article.html',
    'www/library.html',
    'www/main.html',
    'www/topFrame.html',
    'www/js/bundle.js',
    'www/js/init.js',
    'www/js/bootstrap.bundle.min.js',
    'www/js/bootstrap.bundle.min.js.map',
    'www/css/bootstrap.min.css',
    'www/css/bootstrap.min.css.map',
    'www/js/jquery.slim.min.js',
    'www/js/jquery.slim.min.map'
];

if ('WebAssembly' in self) {
    precacheFiles.push(
        'www/js/xzdec-wasm.wasm',
        'www/js/zstddec-wasm.wasm',
        'www/js/libzim-wasm.js',
        'www/js/libzim-wasm.wasm'
    );
} else {
    precacheFiles.push(
        'www/js/libzim-asm.js'
    );
}

/**
 * If we're in a Chromium extension, add a listener to launch the tab when the icon is clicked
 */
if (typeof chrome !== 'undefined' && chrome.action) {
    chrome.action.onClicked.addListener(function () {
        var newURL = chrome.runtime.getURL('www/index.html');
        chrome.tabs.create({ url: newURL });
    });
}

// Process install event
self.addEventListener('install', function (event) {
    console.debug('[SW] Install Event processing');
    // DEV: We can't skip waiting because too many params are loaded at an early stage from the old file before the new one can activate...
    // self.skipWaiting();
    // We try to circumvent the browser's cache by adding a header to the Request, and it ensures all files are explicitly versioned
    var requests = precacheFiles.map(function (urlPath) {
        return new Request(urlPath + '?v' + appVersion, { cache: 'no-cache' });
    });
    if (!regexpExcludedURLSchema.test(requests[0].url)) {
        event.waitUntil(caches.open(APP_CACHE).then(function (cache) {
            return Promise.all(
                requests.map(function (request) {
                    return fetch(request).then(function (response) {
                        // Fail on 404, 500 etc
                        if (!response.ok) throw Error('Could not fetch ' + request.url);
                        return cache.put(request.url.replace(/\?v[^?/]+$/, ''), response);
                    }).catch(function (err) {
                        console.error('There was an error pre-caching files', err);
                    });
                })
            );
        }));
    }
});

// Allow sw to control current page
self.addEventListener('activate', function (event) {
    console.debug('[SW] Activate Event processing');
    // "Claiming" the ServiceWorker is necessary to make it work right away,
    // without the need to reload the page.
    // See https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim
    event.waitUntil(self.clients.claim());
    console.debug('[SW] Claiming clients for current page');
    // Check all the cache keys, and delete any old caches
    event.waitUntil(
        caches.keys().then(function (keyList) {
            return Promise.all(keyList.map(function (key) {
                console.debug('[SW] Current cache key is ' + key);
                if (key !== APP_CACHE && key !== ASSETS_CACHE) {
                    console.debug('[SW] App updated to version ' + appVersion + ': deleting old cache');
                    return caches.delete(key);
                } else {
                    return Promise.resolve();
                }
            }));
        })
    );
});

// Wrapped in try-catch
try {
    // Import ReplayWorker
    self.importScripts('./replayWorker.js');
    isReplayWorkerAvailable = true;
    console.log('[SW] ReplayWorker is available');
} catch (err) {
    console.warn('[SW ReplayWorker is NOT available', err);
    isReplayWorkerAvailable = false;
}

let replayCollectionsReloaded;

// Instruct the ReplayWorker to reload all collections, and adjust the root configuration (this is necessary after thw SW has stopped and restarted)
if (isReplayWorkerAvailable) {
    replayCollectionsReloaded = self.sw.collections.listAll().then(function (colls) {
        if (colls) {
            console.debug('[SW] Reloading ReplayWorker collections', colls);
            return Promise.all(colls.map(function (coll) {
                // console.debug('[SW] Reloading ReplayWorker collection ' + coll.name);
                return self.sw.collections.reload(coll.name);
            })).then(function () {
                // Adjust the root configuration
                if (self.sw.collections.root) {
                    console.debug('[SW] Adjusting ReplayWorker root configuration to ' + self.sw.collections.root);
                    return setReplayCollectionAsRoot(self.sw.collections.colls[self.sw.collections.root].config.sourceUrl, self.sw.collections.root);
                }
            });
        } else {
            console.debug('[SW] No ReplayWorker collections to reload');
        }
    });
}

// For PWA functionality, this should be true unless explicitly disabled, and in fact currently it is never disabled
let fetchCaptureEnabled = true;

/**
 * Intercept selected Fetch requests from the browser window
 */
self.addEventListener('fetch', function (event) {
    // console.debug('[SW] Fetch Event processing', event.request.url);
    // Only handle GET or POST requests (POST is intended to handle video in Zimit ZIMs)
    if (!/GET|POST/.test(event.request.method)) return;
    var rqUrl = event.request.url;
    // Filter out requests that do not match the scope of the Service Worker
    if (/\/dist\/(www|[^/]+?\.zim)\//.test(rqUrl) && !/\/dist\//.test(self.registration.scope)) return;
    var urlObject = new URL(rqUrl);
    // Test the URL with parameters removed
    var strippedUrl = urlObject.pathname;
    // Select cache depending on request format
    var cache = /\.zim\//i.test(strippedUrl) ? ASSETS_CACHE : APP_CACHE;
    if (cache === ASSETS_CACHE && !fetchCaptureEnabled) return;
    // For APP_CACHE assets, we should ignore any querystring (whereas it should be conserved for ZIM assets,
    // especially .js assets, where it may be significant). Anchor targets are irreleveant in this context.
    if (cache === APP_CACHE) rqUrl = strippedUrl;
    return event.respondWith(
        // First see if the content is in the cache
        fromCache(cache, rqUrl).then(function (response) {
            // The response was found in the cache so we respond with it
            return response;
        }, function () {
            // The response was not found in the cache so we look for it in the ZIM
            // and add it to the cache if it is an asset type (css or js)
            return zimitResolver(event).then(function (modRequestOrResponse) {
                if (modRequestOrResponse instanceof Response) {
                    // The request was modified by the ReplayWorker and it returned a modified response, so we return it
                    // console.debug('[SW] Returning modified response from ReplayWorker', modRequest);
                    return cacheAndReturnResponseForAsset(event, modRequestOrResponse);
                }
                rqUrl = modRequestOrResponse.url;
                urlObject = new URL(rqUrl);
                strippedUrl = urlObject.pathname;
                if (cache === ASSETS_CACHE && regexpZIMUrlWithNamespace.test(strippedUrl)) {
                    const range = modRequestOrResponse.headers.get('range');
                    return fetchUrlFromZIM(urlObject, range).then(function (response) {
                        return cacheAndReturnResponseForAsset(event, response);
                    }).catch(function (msgPortData) {
                        console.error('Invalid message received from app.js for ' + strippedUrl, msgPortData);
                        return msgPortData;
                    });
                } else {
                    // It's not an asset, or it doesn't match a ZIM URL pattern, so we should fetch it with Fetch API
                    return fetch(modRequestOrResponse).then(function (response) {
                        // If request was successful, add or update it in the cache, but be careful not to cache the ZIM archive itself!
                        if (!regexpExcludedURLSchema.test(rqUrl) && !/\.zim\w{0,2}$/i.test(strippedUrl)) {
                            event.waitUntil(updateCache(APP_CACHE, rqUrl, response.clone()));
                        }
                        return response;
                    }).catch(function (error) {
                        console.debug('[SW] Network request failed and no cache.', error);
                    });
                }
            });
        })
    );
});

/**
 * Handle custom commands sent from app.js
 */
self.addEventListener('message', function (event) {
    if (event.data.action) {
        if (event.data.action === 'init') {
            // On 'init' message, we enable the fetchEventListener
            fetchCaptureEnabled = true;
            // Acdknowledge the init message to all clients
            self.clients.matchAll().then(function (clientList) {
                clientList.forEach(function (client) {
                    client.postMessage({ action: 'acknowledge' });
                });
            });
        } else if (event.data.action === 'disable') {
            // On 'disable' message, we disable the fetchEventListener
            // Note that this code doesn't currently run because the app currently never sends a 'disable' message
            // This is because the app may be running as a PWA, and still needs to be able to fetch assets even in Restricted mode
            fetchCaptureEnabled = false;
        }
        var oldValue;
        if (event.data.action.assetsCache) {
            // Turns caching on or off (a string value of 'enable' turns it on, any other string turns it off)
            oldValue = useAssetsCache;
            useAssetsCache = event.data.action.assetsCache === 'enable';
            if (useAssetsCache !== oldValue) console.debug('[SW] Use of assetsCache was switched to: ' + useAssetsCache);
        }
        if (event.data.action.appCache) {
            // Enables or disables use of appCache
            oldValue = useAppCache;
            useAppCache = event.data.action.appCache === 'enable';
            if (useAppCache !== oldValue) console.debug('[SW] Use of appCache was switched to: ' + useAppCache);
        }
        if (event.data.action === 'getCacheNames') {
            event.ports[0].postMessage({ app: APP_CACHE, assets: ASSETS_CACHE });
        }
        if (event.data.action.checkCache) {
            // Checks and returns the caching strategy: checkCache key should contain a sample URL string to test
            testCacheAndCountAssets(event.data.action.checkCache).then(function (cacheArr) {
                event.ports[0].postMessage({ type: cacheArr[0], name: cacheArr[1], description: cacheArr[2], count: cacheArr[3] });
            });
        }
    } else if (event.data.msg_type) {
        // Messages for the ReplayWorker
        if (event.data.msg_type === 'addColl') {
            console.debug('[SW] addColl message received from app.js');
            if (!self.sw) {
                console.error('[SW] Zimit ZIMs in ServiceWorker mode are not supported in this browser');
                // Reply to the message port with an error
                event.ports[0].postMessage({ error: 'ReplayWorker is unsupported!' });
            } else {
                event.waitUntil(
                    self.sw.collections._handleMessage(event).then(function () {
                        setReplayCollectionAsRoot(event.data.prefix, event.data.name);
                        // Reply to the message port with a success message
                        event.ports[0].postMessage({ success: 'ReplayWorker is supported!' });
                    })
                );
            }
        }
    }
});

/**
 * Sets a Replay collection as the root configuration, so that the Replay Worker will deal correctly with requests to the collection
 *
 * @param {String} prefix The URL prefix where assets are loaded, consisting of the local path to the ZIM file plus the namespace
 * @param {String} name The name of the ZIM file (wihtout any extension), used as the Replay root
 */
function setReplayCollectionAsRoot (prefix, name) {
    // Guard against prototype pollution attack
    if (typeof prefix !== 'string' || typeof name !== 'string') {
        console.error('Invalid prefix or name');
        return;
    }
    const dangerousProps = ['__proto__', 'constructor', 'prototype'];
    if (dangerousProps.includes(prefix) || dangerousProps.includes(name)) {
        console.error('Potentially dangerous prefix or name');
        return;
    }
    self.sw.prefix = prefix;
    self.sw.replayPrefix = prefix;
    self.sw.distPrefix = prefix + 'dist/';
    self.sw.apiPrefix = prefix + 'api/';
    self.sw.staticPrefix = prefix + 'static/';
    self.sw.api.collections.prefixes = {
        main: self.sw.prefix,
        root: self.sw.prefix,
        static: self.sw.staticPrefix
    }
    // If we want to be able to get the static data URL directly from the map, we need to replace the keyes, but as this is quite costly (moving a lot of static)
    // data around, we're using another way to get the static data URL from the map in zimitResolver()
    // let newMap = new Map();
    // for (let [key, value] of self.sw.staticData.entries()) {
    //     const newKey = /wombat\.js/i.test(key) ? self.sw.staticPrefix + 'wombat.js' : /wombatWorkers\.js/i.test(key) ? self.sw.staticPrefix + 'wombatWorkers.js' : key;
    //     newMap.set(newKey, value);
    // }
    // self.sw.staticData = newMap;
    if (self.sw.collections.colls[name]) {
        self.sw.collections.colls[name].prefix = self.sw.prefix;
        self.sw.collections.colls[name].rootPrefix = self.sw.prefix;
        self.sw.collections.colls[name].staticPrefix = self.sw.staticPrefix;
        self.sw.collections.root = name;
    }
}

/**
 * Handles resolving content for Zimit-style ZIM archives
 *
 * @param {FetchEvent} event The FetchEvent to be processed
 * @returns {Promise<Response>} A Promise for the Response, or rejects with the invalid message port data
 */
function zimitResolver (event) {
    var rqUrl = event.request.url;
    var zimStem = rqUrl.replace(/^.*?\/([^/]+?)\.zim\w?\w?\/.*/, '$1');
    if (/\/A\/load\.js$/.test(rqUrl)) {
        // If the request is for load.js, we should filter its contents to load the mainUrl, as we don't need the other stuff
        // concerning registration of the ServiceWorker and postMessage handling
        console.debug('[SW] Filtering content of load.js', rqUrl);
        // First we have to get the contents of load.js from the ZIM, because it is a common name, and there is no way to be sure
        // that the request will be for the Zimit load.js
        return fetchUrlFromZIM(new URL(rqUrl)).then(function (response) {
            // The response was found in the ZIM so we respond with it
            // Clone the response before reading its body
            var clonedResponse = response.clone();
            return response.text().then(function (contents) {
                // We need to replace the entire contents with a single function that loads mainUrl
                if (/\.register\([^;]+?sw\.js\?replayPrefix/.test(contents)) {
                    var newContents = "window.location.href = window.location.href.replace(/index\\.html/, window.mainUrl.replace('https://', ''));";
                    var responseLoadJS = contsructResponse(newContents, 'text/javascript');
                    return responseLoadJS;
                } else {
                    // The contents of load.js are not as expected, so we should return the original response
                    return clonedResponse;
                }
            });
        });
    // Check that the requested URL is for a ZIM that we already have loaded
    } else if (zimStem !== rqUrl && isReplayWorkerAvailable) {
        // Wait for the ReplayWorker to initialize and reload all collections
        return replayCollectionsReloaded.then(function () {
            if (self.sw.collections.colls && self.sw.collections.colls[zimStem]) {
                if (self.sw.collections.root !== zimStem) {
                    setReplayCollectionAsRoot(self.sw.collections.colls[zimStem].config.sourceUrl, zimStem);
                }
                if (/\/A\/static\//.test(rqUrl)) {
                    // If the request is for static data from the replayWorker, we should get them from the Worker's cache
                    // DEV: This extracts both wombat.js and wombatWorkers.js from the staticData Map
                    var staticDataUrl = rqUrl.replace(/^(.*?\/)[^/]+?\.zim\w?\w?\/[AC/]{2,4}(.*)/, '$1$2')
                    if (self.sw.staticData) {
                        var staticData = self.sw.staticData.get(staticDataUrl);
                        if (staticData) {
                            console.debug('[SW] Returning static data from ReplayWorker', rqUrl);
                            // Construct a new Response with headers to return the static data
                            var responseStaticData = contsructResponse(staticData.content, staticData.type);
                            return Promise.resolve(responseStaticData);
                        } else {
                            // Return a 404 response
                            return Promise.resolve(new Response('', { status: 404, statusText: 'Not Found' }));
                        }
                    }
                } else {
                    // console.debug('[SW] Asking ReplayWorker to handleFetch', rqUrl);
                    return self.sw.handleFetch(event);
                }
            } else {
                // The requested ZIM is not loaded, or it is a regular non-Zimit request
                return event.request;
            }
        });
    } else {
        // The loaded ZIM archive is not a Zimit archive, or sw-Zimit is unsupported, so we should just return the request
        return Promise.resolve(event.request);
    }
}

function contsructResponse (content, contentType) {
    var headers = new Headers();
    headers.set('Content-Length', content.length);
    headers.set('Content-Type', contentType);
    var responseInit = {
        status: 200,
        statusText: 'OK',
        headers: headers
    };
    return new Response(content, responseInit);
}

// Caches and returns the event and response pair for an asset. Do not use this for non-asset requests!
function cacheAndReturnResponseForAsset (event, response) {
    // Add css or js assets to ASSETS_CACHE (or update their cache entries) unless the URL schema is not supported
    if (regexpCachedContentTypes.test(response.headers.get('Content-Type')) &&
        !regexpExcludedURLSchema.test(event.request.url)) {
        event.waitUntil(updateCache(ASSETS_CACHE, event.request.url, response.clone()));
    }
    return response;
}

/**
 * Handles URLs that need to be extracted from the ZIM archive. They can be strings or URL objects, and should be URI encoded.
 *
 * @param {URL|String} urlObjectOrString The URL object, or a simple string representation, to be processed for extraction from the ZIM
 * @param {String} range Optional byte range string (mostly used for video or audio streams)
 * @param {String} expectedHeaders Optional comma-separated list of headers to be expected in the response (for error checking). Note that although
 *     Zimit requests may be for a range of bytes, in fact video (at least) is stored as a blob, so the appropriate response will just be a normal 200.
 * @returns {Promise<Response>} A Promise for the Response, or rejects with the invalid message port data
 */
function fetchUrlFromZIM (urlObjectOrString, range, expectedHeaders) {
    return new Promise(function (resolve, reject) {
        var pathname = typeof urlObjectOrString === 'string' ? urlObjectOrString : urlObjectOrString.pathname;
        // Note that titles may contain bare question marks or hashes, so we must use only the pathname without any URL parameters.
        // Be sure that you haven't encoded any querystring along with the URL (Zimit files, however, require encoding of the querystring)
        var barePathname = decodeURIComponent(pathname);
        var partsOfZIMUrl = regexpZIMUrlWithNamespace.exec(barePathname);
        var prefix = partsOfZIMUrl ? partsOfZIMUrl[1] : '';
        var nameSpace = partsOfZIMUrl ? partsOfZIMUrl[2] : '';
        var title = partsOfZIMUrl ? partsOfZIMUrl[3] : barePathname;
        var anchorTarget = '';
        var uriComponent = '';
        if (typeof urlObjectOrString === 'object') {
            anchorTarget = urlObjectOrString.hash.replace(/^#/, '');
            uriComponent = urlObjectOrString.search.replace(/\?kiwix-display/, '');
        }
        var titleWithNameSpace = nameSpace + '/' + title;
        var zimName = prefix.replace(/\/$/, '');

        // console.debug('[SW] Asking app.js for ' + titleWithNameSpace + ' from ' + zimName + '...');

        var messageListener = function (msgPortEvent) {
            if (msgPortEvent.data.action === 'giveContent') {
                // Content received from app.js (note that null indicates that the content was not found in the ZIM)
                var contentLength = msgPortEvent.data.content !== null ? (msgPortEvent.data.content.byteLength || msgPortEvent.data.content.length) : null;
                var contentType = msgPortEvent.data.mimetype;
                var zimType = msgPortEvent.data.zimType;
                var headers = new Headers();
                if (contentLength !== null) headers.set('Content-Length', contentLength);
                // Set Content-Security-Policy to sandbox the content (prevent XSS attacks from malicious ZIMs)
                headers.set('Content-Security-Policy', "default-src 'self' data: file: blob: about: chrome-extension: moz-extension: https://browser-extension.kiwix.org https://kiwix.github.io 'unsafe-inline' 'unsafe-eval'; sandbox allow-scripts allow-same-origin allow-modals allow-popups allow-forms allow-downloads;");
                headers.set('Referrer-Policy', 'no-referrer');
                if (contentType) headers.set('Content-Type', contentType);

                // Test if the content is a video or audio file. In this case, Chrome & Edge need us to support ranges.
                // NB, the Replay Worker adds its own Accept-Ranges header, so we don't add it here for such requests.
                // See kiwix-js #519 and openzim/zimwriterfs #113 for why we test for invalid types like "mp4" or "webm" (without "video/")
                // The full list of types produced by zimwriterfs is in https://github.com/openzim/zimwriterfs/blob/master/src/tools.cpp
                if (zimType !== 'zimit' && contentLength >= 1 && /^(video|audio)|(^|\/)(mp4|webm|og[gmv]|mpeg)$/i.test(contentType)) {
                    headers.set('Accept-Ranges', 'bytes');
                }

                var slicedData = msgPortEvent.data.content;

                if (range && zimType === 'zimit') {
                    headers.set('Content-Range', range + '/*');
                } else if (range && slicedData !== null) {
                    // The browser asks for a range of bytes (usually for a video or audio stream)
                    // In this case, we partially honor the request: if it asks for offsets x to y,
                    // we send partial contents starting at x offset, till the end of the data (ignoring y offset)
                    // Our backend can currently only read the whole content from the ZIM file.
                    // So it's probably better to send all we have: hopefully it will avoid some subsequent requests of
                    // the browser to get the following chunks (which would trigger some other complete reads in the ZIM file)
                    // This might be improved in the future with the libzim wasm backend, that should be able to handle ranges.
                    const partsOfRangeHeader = regexpByteRangeHeader.exec(range);
                    const begin = partsOfRangeHeader[1];
                    const end = contentLength - 1;
                    slicedData = slicedData.slice(begin);

                    headers.set('Content-Range', 'bytes ' + begin + '-' + end + '/' + contentLength);
                    headers.set('Content-Length', end - begin + 1);
                }

                var responseInit = {
                    // HTTP status is usually 200, but has to be 206 when partial content (range) is sent
                    status: range ? 206 : 200,
                    statusText: 'OK',
                    headers: headers
                };
                // Deal with a not-found dirEntry
                if (slicedData === null) {
                    responseInit.status = 404;
                    responseInit.statusText = 'Not Found';
                }

                if (slicedData === null) slicedData = '';

                // if (expectedHeaders) {
                //     console.debug('[SW] Expected headers were', Object.fromEntries(expectedHeaders));
                //     console.debug('[SW] Constructed headers are', Object.fromEntries(headers));
                // }

                var httpResponse = new Response(slicedData, responseInit);

                // Let's send the content back from the ServiceWorker
                resolve(httpResponse);
            } else if (msgPortEvent.data.action === 'sendRedirect') {
                console.debug('[SW] Redirecting to ' + msgPortEvent.data.redirectUrl);
                resolve(Response.redirect(prefix + msgPortEvent.data.redirectUrl));
            } else {
                reject(msgPortEvent.data, titleWithNameSpace);
            }
        };
        // Get all the clients currently being controlled and send them a message
        self.clients.matchAll().then(function (clientList) {
            clientList.forEach(function (client) {
                if (client.frameType !== 'top-level') return;
                // Let's instantiate a new messageChannel, to allow app.js to give us the content
                var messageChannel = new MessageChannel();
                messageChannel.port1.onmessage = messageListener;
                client.postMessage({
                    action: 'askForContent',
                    title: titleWithNameSpace,
                    search: uriComponent,
                    anchorTarget: anchorTarget,
                    zimFileName: zimName
                }, [messageChannel.port2]);
            });
        });
    });
}

/**
 * Looks up a Request in a cache and returns a Promise for the matched Response
 * @param {String} cache The name of the cache to look in
 * @param {String} requestUrl The Request URL to fulfill from cache
 * @returns {Promise<Response>} A Promise for the cached Response, or rejects with strings 'disabled' or 'no-match'
 */
function fromCache (cache, requestUrl) {
    // Prevents use of Cache API if user has disabled it
    if (!(useAppCache && cache === APP_CACHE || useAssetsCache && cache === ASSETS_CACHE)) {
        return Promise.reject(new Error('Cache disabled'));
    }
    return caches.open(cache).then(function (cacheObj) {
        return cacheObj.match(requestUrl).then(function (matching) {
            if (!matching || matching.status === 404) {
                return Promise.reject(new Error('no-match'));
            }
            console.debug('[SW] Supplying ' + requestUrl + ' from ' + cache + '...');
            return matching;
        });
    });
}

/**
 * Stores or updates in a cache the given Request/Response pair
 * @param {String} cache The name of the cache to open
 * @param {Request|String} request The original Request object or the URL string requested
 * @param {Response} response The Response received from the server/ZIM
 * @returns {Promise} A Promise for the update action
 */
function updateCache (cache, request, response) {
    // Prevents use of Cache API if user has disabled it
    if (!response.ok || !(useAppCache && cache === APP_CACHE || useAssetsCache && cache === ASSETS_CACHE)) {
        return Promise.resolve();
    }
    return caches.open(cache).then(function (cacheObj) {
        var reqKey = request.url || request;
        console.debug('[SW] Adding ' + reqKey + ' to ' + cache + '...');
        return cacheObj.put(reqKey, response);
    });
}

/**
 * Tests the caching strategy available to this app and if it is Cache API, count the
 * number of assets in ASSETS_CACHE
 * @param {String} url A URL to test against excludedURLSchema
 * @returns {Promise<Array>} A Promise for an array of format [cacheType, cacheDescription, assetCount]
 */
function testCacheAndCountAssets (url) {
    if (regexpExcludedURLSchema.test(url)) return Promise.resolve(['custom', 'custom', 'Custom', '-']);
    if (!useAssetsCache) return Promise.resolve(['none', 'none', 'None', 0]);
    return caches.open(ASSETS_CACHE).then(function (cache) {
        return cache.keys().then(function (keys) {
            return ['cacheAPI', ASSETS_CACHE, 'Cache API', keys.length];
        }).catch(function (err) {
            return err;
        });
    }).catch(function (err) {
        return err;
    });
}
