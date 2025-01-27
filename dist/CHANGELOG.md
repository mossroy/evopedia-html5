# Changelog of Kiwix JS

Please note that this application has changed its name over time.
It was first called "Evopedia" (and was using the file format of Evopedia).
Then it was renamed to "Kiwix HTML5" (and used the ZIM file format). Finally it was renamed "Kiwix JS".

## Kiwix JS v4.1.0

Released on *2024-07-15*

* FEATURE: Preview a WikiMedia ZIM article in a popover by hovering, long-pressing, or tabbing into a link
* FEATURE: Automatically re-open the last selected archive in Chromium browsers > 122
* FEATURE: New security dialogue box when opening untrusted ZIMs now shows enhanced ZIM metadata
* ENHANCEMENT: Display active content warning when opening PhET ZIMs in Restricted mode
* ENHANCEMENT: Added option to turn off external link warning
* INFO: Translated Kiwix JS extension entries in Edge and Chrome Stores to Spanish and French
* UPDATE: JQuery mode is now renamed to Restricted mode to better indicate its effect
* UPDATE: JQuery is now fully removed from all first-party code
* UPDATE: Simplify active content warning for clarity and impact
* UPDATE: Allow more time for caching assets before rebooting if SW registration stalls
* FIX: Various issues with enumarating the contents of picked folders
* FIX: Bug with empty search box on initial ZIM load
* FIX: Bug which caused app to reload when accidentally dragging images or links in articles 
* FIX: Non-supported URI schemata (protocols) now open outside the sandbox
* FIX: Avoid accidentally opening the first ZIM archive in a picked directory of archives
* FIX: Several typos
* WORKAROUND: Overencoded querystrings in Zimit2 external links are now decoded
* DEV: Add i18n for extension manifests so that Add-on Store entries can be translated
* DEV: Change method for patching gitignore when adding NPM dependencies
* DEV: Some code reorganization
* DEPENDENCIES: Updates to follow-redirects, vite, braces, ws

## Kiwix JS v4.0.0

Released on *2024-02-22*

* FEATURE: High-fidelity Zinit archive reading, with fallback to static content for old browsers
* FEATURE: Added preliminary support for forthcoming Zimit 2.0 archive types
* FEATURE: Enabled multi-ZIM support (browsing different ZIMs simultaneously in different browser tabs or windows)
* FEATURE: Added a security warning on opening a ZIM for the first time with fallback to Secure Mode (aka JQuery)
* ENHANCEMENT: Support most Zimit (1/2) archives in jQuery mode if they have largely static content
* ENHANCEMENT: Better UX for dealing with unsupported Zimit archives, and auto fallback
* ENHANCEMENT: Added an active content warning when opening a Zimit 2 archive in ServiceWorkerLocal mode
* UPDATE: Better detection for opening PDFs and external links outside the sandbox
* KNOWN ISSUE: Dark mode inverts images in Zimit-based archives
* BUGFIX: Restored ability to scroll the search results with touch or mouse
* BUGFIX: Issue causing a bootloop in rare circumstances when the app is in JQuery mode
* FIX: Failure to handle PDFs in some OpenZIM archive types
* FIX: Opening of new tabs in Zimit-based archives
* FIX: Updated some broken links
* FIX: Added support for srcsets when reading a Zimit archive in JQuery mode
* WORKAROUND: Provide alternative zimit2 link handling for browsers that do not support wombat.js
* DEV: Added low-level support for zimit2, add added zimType to ZIMArchive properties shown in console
* DEV: Added possibility of using libzim for reading OpenZIM file contents (see Expert Settings)
* DEV: Provided a separate webmanifest for the PWA version
* DEV: Updated info for developers
* DEV: Added a generic version of browserAction in backgroundscript to support MV3 extensions
* DEV: Fixed some anomalies in tests
* DEV: Ensured consistent use of settingsStore prefix with localStorage keys
* DEV: Updated rollup-js to v4
* DEV: Updated libzim to v0.6
* DEV: Updated vite-js to v4.5.2
* DEV: Bumped GitHub actions/checkout@v3 to actions/checkout@v4

## Kiwix JS v3.11.0

Released on *2023-11-12*

* FEATURE: Integration of in-app ZIM Download Library based on library.kiwix.org
* FEATURE: Fallback to basic ZIM library for browsers that don't support library.kiwix.org
* FEATURE: Remember picked files and folders between app launches with File System Access API
* FEATURE: Slide away header and footer when scrolling an article, restored when scrolling up
* FEATURE: On non-scrollable pages use Ctrl/Cmd + UpArrow/DownArrow, long swipe or mousewheel/touchpad scroll to toggle header/footer
* ENHANCEMENT: Active content warning now fades out (auto-dismisses) when user starts scrolling
* UPDATE: Turn off auto-focus of search bar on landing pages (option added to Home key setting)
* UPDATE: Launch spinner as soon as possible and make it more informative
* FIX: Added sanity checks to prevent runaway case-insensitive title searches
* FIX: Active content warning now correctly detects new Kolibri-based archives
* FIX: Translated some untranslated UI elements for Firefox OS
* FIX: File/folder and library buttons now work with keyboard (tab to them, and space bar or enter to activate)
* CLEANUP: Transition animations code cleaned up and animations now off by default
* REGRESSION: ACtive content warning dismissed on changing tab
* DEV: Build both MV2 and MV3 packages for Mozilla extension
* DEV: Add facility to extract and set ZIM metadata (also displayed in console.debug)
* DEV: Ensure all built packages contain i18n files
* DEV: In the extension, completely exit local code when a success message is received from PWA
* DEV: Dependencies for babel-core updated and other vulnerabilities fixed

## Kiwix JS v3.10.1 (3.10.0)

Note: this release was originally numbered 3.10.0, but due to a publishing issue with the Mozilla extension
store, it had to be re-issued as 3.10.1.

Released on *2023-09-10*

* FEATURE: Full internationalization of the app in Spanish and French (more languages to follow)
* UPDATE: Improved availability of non-store Chromium extension files and installation instructions 
* UPDATE: Supported platform information in README
* UPDATE: Documentation updates throughout app
* FIX: Universal file picking in latest Chromium browsers for Android
* FIX: Failure to show active content warning for PhET ZIMs
* FIX: Instabilities in End-to-End tests
* DEV: Added End-to-End tests with Selenium and Mocha on GitHub Actions and BrowserStack
* DEV: Updated Unit tests to use TestCafé
* DEV: Move to modern ES6 bundling system with rollup.js and Vite development server
* DEV: Conversion of JQuery `.on` events to vanilla JS
* DEV: Add documentation for TESTS and adding dependencies for the bundling system
* DEV: Moved app's configuration code to top-level `init.js` outside of bundling system

## Kiwix JS v3.9.0

Released on *2023-06-16*

* ENHANCEMENT: Enabled full dynamic content in the Chromium extension via the PWA workaround
* ENHANCEMENT: Migrate to Manifest Version 3 for the Chromium browser extension
* ENHANCEMENT: Added a Promise queue to prevent overlapping dialogue boxes
* UPDATE: In-app documentation updated to reflect latest practices
* UPDATE: JQuery updated to v3.7.0
* UPDATE: PWA server URL updated to https://browser-extension.kiwix.org
* FIX: Restored dialogue box animations lost when JQuery was removed from the dialogue box code
* FIX: Increase the number of download types recognized by the JQuery mode code
* BUGFIX: Removed use of `Promise.finally()` incompatible with older browsers
* BUGFIX: Fixed infinite loop with the Bypass AppCache option when returning from PWA to local extension code
* CLEANUP: Added an ESLint configuration and dev dependency
* CLEANUP: Fixed style issues identified by ESLint
* DEV: Added a warning colour to Configuration when the appCache is disabled
* DEV: Compile xzdec and zstddec as ES6 modules (for future use)

## Kiwix JS v3.8.0

This version incorporates an interim version 3.7.2 that was only published to the moz-extension PWA

Released on *2023-04-23*

* NEW: Expert/troubleshooting setting to disable drag-and-drop
* SECURITY: Add sandbox to iframe to prevent third-party content and top-level navigation
* SECURITY: Apply a CSP for the app as a whole (via meta http-equiv)
* SECURITY: Apply a CSP for iframe contents in SW mode (via response headers)
* UPDATE: API status panel now displays the PWA origin
* UPDATE: The PWA version now notifies more reliably that an update is available
* UPDATE: JavaScript libzim updated to v0.2
* CLEANUP: Removed usage of jQuery in Bootstrap modals
* DEV: CI now uses the latest GitHub workflow actions
* DEV: Script provided (`npm run serve`) to launch local http-server for development and testing
* FIX: Full-text search results were not properly cancelled by user selecting a title search result
* FIX: Fall back to using MIME type to determine type of document being downloaded from the ZIM
* FIX: Broken epub downloads in IE11

## Kiwix JS v3.7.0

Released on *2023-01-04*

* FEATURE: Full-text search is now available in modern Firefox and Chromium if your ZIM archive has an ft index
* NEW: The API panel in Configuration now informs you if full-text searching is available for your ZIM and platform
* NEW: A new ZIM metadata property added in backend to show whether the loaded archive has an ft index
* NEW: Added code to initialize the new javascript-libzim W/ASM if needed
* UPDATE: Documentation updated to reflect the full-text searching capability 
* UPDATE: Renamed the GitHub Repository 'master' branch to 'main'
* UPDATE: Changed some hard-coded values in build script to dynamic
* UPDATE: Provide a Workflow dispatch option to set the build version number
* UPDATE: Release packages that do not need to be signed are now automatically uploaded to the release server 
* CLEANUP: Many deprecated JQuery statements have been converted to native DOM equivalents, speeding up code
* CLEANUP: Removed most usage of .innerHTML in the code
* FIX: Tweaks to Wikimedia dark theme for greater compatibility with LaTeX images 

## Kiwix JS v3.6.0

Released on *2022-12-11*

* FEATURE: ServiceWorker Mode is now the default, and compatible clients upgrade automatically to this mode
* FEATURE: On first run after update, the user is informed of the ServiceWorker Mode upgrade status (upgraded or incompatible)
* NEW: A warning (with suggestions) is provided if user opens an incompatible Zimit (warc2zim) archive type
* COMPATIBILITY: Minimum Firefox version has been raised to >=52, due to lack of full Extension APIs in earlier versions 
* UPDATE: Detection of active content updated for compatibility with more no-namespace ZIM archives
* UPDATE: Nightly packages on the download server now include the date in their filenames
* FIX: Kiwix icon now has an outline so that it is visible against dark OS backgrounds

## Kiwix JS v3.5.0

Released on *2022-08-05*

* FEATURE: The Enter key is now handled in Bootstrap dialogue boxes, triggering the default action
* FIX: Switch to ServiceWorker mode via PWA workaround was broken due to a behaviour change in Firefox 103
* FIX: Video seeking in ServiceWorker mode was not always working in some browser extensions
* FIX: In ServiceWorker mode, open external links in new tabs (instead of inside the iframe, which could fail), and warn the user
* FIX: Directory Entries were wrongly assumed to be no larger than 2048 bytes (this could lead to some infinite loop, with some very specific ZIM files)
* UPDATE: Update logo on Firefox and Windows stores

## Kiwix JS v3.4.0

Released on *2022-04-10*

* FEATURE: Provide automatic dark mode switching (based on the underlying OS theme) in browsers supporting theme detection
* FEATURE: Use bootstrap modal for alert and confirm dialogue boxes instead of native browser dialogues
* WORKAROUND: For WebP image conversion in older browsers that implement some specific canvas anti-fingerprinting techniques, like IceCat 60.7
* FIX: Partially remove dependency of backend on the User Interface
* FIX: Provide an alert if user selects random button when no ZIM is loaded
* FIX: Nightly builds are now uploaded to a new server (with sftp instead of ssh)
* FIX: Deploy PWA image on a k8s cluster
* FIX: PWA images are now uploaded to ghcr.io instead of Docker Hub. When a new image is uploaded, we also restart the pod to make it use the latest image
* UPDATE: Routine updates to dependencies: Karma, node-fetch, follow-redirects, minimist

## Kiwix JS v3.3.1

Released on *2022-02-12*

* NOTICE: This is a bugfix release to fix critical errors with the Ubuntu Touch app. For main changelog, see v3.3.0 below.
* FIX: Improve packaging for the Ubuntu Touch app
* FIX: Provide a platform-compliant hook name for the Ubuntu Touch app (note that settings may be lost when upgrading to this version)
* BUGFIX: Correct the handling of version numbers in GitHub publishing workflow
* BUGFIX: Correct race condition preventing initialization of decompressors in some contexts (e.g. file:// protocol)

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/28?closed=1

## Kiwix JS v3.3.0

Released on *2022-02-06*

* FEATURE: Provided a workaround to enable Service Worker mode in Firefox extensions (via a PWA)
* NEW: App now defaults to Service Worker mode if accessed directly as a PWA (does not apply to browser extensions)
* NEW: Provided methods for resetting the app and bypassing the appCache from the UI
* NEW: Support for non-http URLs in img and link tags (e.g. data: javascript:) in JQuery mode
* NEW: Added helpful tooltips to icons and settings in the app
* NEW: Provided Code of Conduct and procedure for reporting bugs, for contributors (repository)
* NEW: Provided contributing guidelines and information for future developers (repository)
* FIX: Added missing 'controls' property to media containers in jQuery mode
* FIX: Scrolling to anchor targets in JQuery mode
* FIX: Caching of ZIM assets now includes any required query string in SW mode
* FIX: Any favicon declared by the ZIM is now extracted and attached in JQuery mode
* BUGFIX: Corrected the theme selection box height
* BUGFIX: Aligned the search bar with the search button
* BUGFIX: Disabled dragging of some UI elements
* BUGFIX: Incorrect processing of titles with question marks or hashes prevented display of some articles

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/26?closed=1

## Kiwix JS v3.2.0

Released on *2021-08-22*

* NEW: Support latest format of ZIM archives (with no namespace)
* NEW: Optimization of title search by eliminating redundancies
* NEW: Support new format of title listings (v1) in no-namespace ZIM archives
* NEW: 'Home' key can now be used to focus the search field
* NEW: Use native Promises (or modern polyfill where required) instead of Q, improving performance in modern browsers and IE11
* NEW: Use fast binary WASM decoders with fallback to ASM if necessary
* UPDATE: Clearer and more extensive documentation for end users in About
* UPDATE: Unit testing updated to latest QUnit, and use Karma instead of Nightwatch
* UPDATE: Replace Travis by GitHub Actions for continuous integration
* UPDATE: Added helper scripts and instructions for recompiling decompressors with Docker
* BUGFIX: Issue with calculation for selection of random articles
* BUGFIX: Incorrect syntax in usage of classList method that caused an exception in older browsers with rare ZIM types

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/25?closed=1

## Kiwix JS v3.1.0

Released on *2020-12-12*

* NEW: Low-level block cache significantly improves binary search speed, and can speed up resource loading in most browsers
* NEW: Archives with WebP-encoded images are now decoded in legacy browsers via a polyfill
* UPDATE: Images are now extracted sequentially in jQuery mode from the top of the DOM
* BUGFIX: Running binary searches are now cancelled completely if user enters new search term or navigates away
* BUGFIX: Active content warning was erroneously showing on some ZSTD WikiMedia landing pages in jQuery mode

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/24?closed=1

## Kiwix JS v3.0.0

Released on *2020-10-04*

* NEW: Add support for reading ZIM archives compressed with the zstandard compression algorithm
* UPDATE: Make Privacy Policy publicly accessible

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/23?closed=1

## Kiwix JS v2.8.0

Released on *2020-07-11*

* NEW: Intelligently select the best Storage API for storing settings between sessions (`cookie` or `localStorage`)
* NEW: Display title search results progressively instead of waiting for search to complete before displaying them
* NEW: User can change depth of title search from Configuration
* UPDATE: Better handling of case in title search, returning more accurate search results
* UPDATE: Use `const` to declare constants, enabling better app memory management
* UPDATE: Use `SameSite=Strict` for any residual cookie usage to conform to new security standards
* BUGFIX: Major blocking bug causing high memory usage and slow load times when reading MIME type table of recent ZIM archives

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/22?closed=1

## Kiwix JS v2.7.0

Released on *2020-03-29*

* NEW: Selectable dark mode for app UI and for articles (does not work on IE11)
* NEW: Optional transition between app pages
* NEW: Native asset caching in Service Worker mode - considerably speeds up article load times in some contexts
* UPDATE: Privacy Policy
* UPDATE: Minor changes to Kiwix icon
* UPDATE: Bootstrap updated to v4
* UPDATE: Q Promise library updated to v1.5.1
* UPDATE: Various code simplifications and cleanup
* BUGFIX: Support details-summary tags to ensure all article subheadings are open in jQuery mode
* BUGFIX: Broken display when search results have special characters
* BUGFIX: Display of random article fragments when using back/forward buttons quickly
* BUGFIX: Several UI bugs (search results disappearing, redundant scroll bar)

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/21?closed=1

## Kiwix JS v2.6.0

Released on *2019-07-20*

* NEW: Support for imagemaps (area tags) in jQuery mode, like for maps in Wikivoyage
* NEW: Enable keyboard selection in search results
* NEW: Drag and drop support of ZIM files (on desktop)
* NEW: Support download of epub files (for Gutenberg ZIM files) and some other types of downloads
* NEW: Generic handling of MIME Types, instead of the previously hard-coded ones
* NEW: Add explanations and detect when there are CORS issues when running Kiwix JS through file://
* UPDATE: Upgrade the underlying Ubuntu Touch platform to Xenial
* UPDATE: Improve the automated UI tests with a more complete scenario
* UPDATE: Simplify the code by removing the base tag
* BUGFIX: Fix for some cache issues with Chromium extension in ServiceWorker mode, that were mixing content from different ZIM files
* BUGFIX: Some fixes for filenames with question marks, hyperlinks with hashtags, articles with no title, and articles with special characters in their URL
* BUGFIX: Fix for articles with a slash in their title in ServiceWorker mode (at least for StackOverflow ZIM files). Note that some Wikivoyage ZIM files (of 2019-06) had incorrect links on their homepage, and are not working with this fix. This has been fixed in 2019-07 ZIM files (see https://github.com/openzim/mwoffliner/issues/726).

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/20?closed=1

## Kiwix JS v2.5.0

Released on *2019-01-16*

* NEW: Support for javascript content inside the ZIM file, only in ServiceWorker mode. Handle noscript tags in jQuery mode, and display a warning when some unhandled javascript is detected
* NEW: Preliminary support of video/audio content (including subtitles): these content types are now supported. You can read them for example in TED/TEDx, dirtybiology, oer4schools, etc. BUT the main page of these ZIM files needs javascript to work properly, which is only enabled in ServiceWorker mode. In jQuery mode, the user needs to reach the pages through a search
* UPDATE: In the UI, replace the spinner by a more modern one
* BUGFIX: Some technical fixes: footnotes in Wikimedia ZIM files (and, more generally, anchors in hyperlinks), incomplete searches in some specific ZIM files (PhET and TED), compatibility with URLs that contain an apostrophe, remove debug logs in ServiceWorker mode

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/19?closed=1

## Kiwix JS v2.4.0

Released on *2018-09-22*

* UPDATE: Performance improvement on decompression of content (now twice as fast)
* BUGFIX: Stability improvement for the ServiceWorker mode

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/16?closed=1

## Kiwix JS v2.3.1

Released on *2018-09-08*

* NEW: Add favicon
* BUGFIX: Fix excessive memory consumption
* BUGFIX: Fix SVG file handling

## Kiwix JS v2.3.0

Released on *2018-06-04*

* NEW: Add a cache on CSS stylesheets to improve performance in jQuery mode
* UPDATE: Change the technical way to display articles, so that all CSS styles can be loaded, and to avoid other technical issues
* UPDATE: Make the content visible only when CSS styles are read, to avoid repaints that can be very slow
* BUGFIX: Fix redirections in ServiceWorker mode in ZIM files like StackExchange, and make the ServiceWorker handle all the articles (including the main one, and the first displayed after a search or random search)
* BUGFIX: Fix links with an anchor in the URL
* BUGFIX: In recent Wikipedia and other Wikimedia ZIM files, open all the sections when using a small screen (mobile stylesheet), so that the content remains readable (it only works in jQuery mode, this should be fixed in ServiceWorker mode in next version)
* BUGFIX: Fix CSS UTF-8 encoding

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/18?closed=1

## Kiwix JS v2.2.0

Released on *2018-01-07*

* NEW: Support for StackExchange ZIM files (and maybe for some other ZIM files with a structure different than the Mediawiki-based ZIM files).
* NEW: Make geo: and tel: links work.
* NEW: Ubuntu Touch support.
* UPDATE: Rename the project to Kiwix JS instead of Kiwix HTML5.
* UPDATE: Compatibility with split English Wikipedia ZIM files (which now have more than 26 files).
* UPDATE: Slightly improved memory handling of content decompression.
* UPDATE: Library updates (jQuery, Bootstrap, requireJS).
* UPDATE: Improved continuous integration (automated testing on several browsers).
* UPDATE: Some code refactoring/cleaning on the way we handle the jQuery mode.
* BUGFIX: Avoid unnecessary 404 errors on images.
* BUGFIX: Minor UI enhancements and fixes.

Detailed changelog : https://github.com/kiwix/kiwix-js/milestone/6?closed=1


## Kiwix-html5 v2.1.0

Released on *2017-06-05*

Add more user info on which ZIM files are compatible.

Fix for back/forward buttons in browsing history.

Drop some legacy code (Evopedia file format compatibility, uncomplete Cordova/Phonegap port).

Refactoring the code to make it more easily readable for contributors.

Fix for unit tests on Chrome.

Enhancements on nightly builds and automatic generation of packages for public releases.

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/15?closed=1

## Kiwix-html5 v2.0.0

Released on *2017-04-08*

This version targets browser extensions (Firefox and Chrome), even if still compatible with Firefox OS.

It also runs the unit tests and some UI tests on Travis.

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/14?closed=1

## Kiwix-html5 v2.0-beta

Released on *2016-06-26*

This is the first version of the HTML5 version of Kiwix, with Firefox OS as the main target.

This version adds ZIM file format support and integrates it into the Kiwix project. Evopedia is discontinued but this app is still compatible with its archive format.

This version has been submitted on the Firefox Marketplace, but was never reviewed by Mozilla and never distributed.

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/12?closed=1

## Evopedia-html5 v1.1.4

Released on *2015-01-29*

Fix for wiktionary archives, where links between articles were not working

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/2?closed=1

## Evopedia-html5 v1.1.3

Released on *2015-01-29*

Small bugfix for Android devices.

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/10?closed=1

## Evopedia-html5 v1.1.2

Released on *2015-01-28*

Documentation update about the current status of Android compatibility
+ very minor updates

Detailed changelog : https://github.com/kiwix/kiwix-js/milestone/9?closed=1

## Evopedia-html5 v1.1.1

Released on *2014-08-11*

Solve an issue with articles containing a quote, and makes it compatible with Flatfish tablets.

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/8?closed=1

## Evopedia-html5 v1.1.0

Released on *2014-04-12*

This version includes some refactoring of the code, and a new feature using the geolocation of the device (to find articles around this location).
The access to the SD-card has been put in an abstraction layer, to prepare for an Apache Cordova port (this port is not finished yet).

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/2?closed=1

## Evopedia-html5 v1.0.3

Released on *2013-12-31*

Add a warning about the size of text on the Geeksphone Peak device, when using Firefox OS <1.1

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/7?closed=1

## Evopedia-html5 v1.0.2

Released on *2013-10-06*

Fix compatibility with Firefox OS >=1.1, due to changed in DeviceStorage API

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/5?closed=1

## Evopedia-html5 v1.0.1

Released on *2013-08-25*

Minor bugfix before submitting to the Marketplace

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/4?closed=1

## Evopedia-html5 v1.0.0

Released on *2013-08-23*

First public version, targeting Firefox OS and deployed on the Firefox Marketplace

Detailed changelog: https://github.com/kiwix/kiwix-js/milestone/1?closed=1

## Initial work

The idea of porting Evopedia in javascript emerged in November 2012.

Some work has started on this in December 2012.
