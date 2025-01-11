import { Builder } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome.js';
import gutenbergRo from '../../spec/gutenberg_ro.e2e.spec.js';
import tonedear from '../../spec/tonedear.e2e.spec.js'
import paths from '../../paths.js';

/* eslint-disable camelcase */

// Input capabilities
const capabilities = {
    'bstack:options': {
        os: 'OS X',
        osVersion: 'Mojave',
        browserVersion: '60.0',
        projectName: 'BStack Project Name: Kiwix JS e2e tests',
        buildName: 'BStack Build Name: Chrome 60 on Mojave',
        local: true,
        localIdentifier: process.env.BROWSERSTACK_LOCAL_IDENTIFIER,
        userName: process.env.BROWSERSTACK_USERNAME,
        accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
        seleniumVersion: '3.141.59'
    },
    browserName: 'Chrome'
};

async function loadChromeDriver () {
    const options = new Options()
    options.setUserPreferences({ 'download.default_directory': paths.downloadDir });

    const driver = await new Builder()
        // .forBrowser('edge')
        .usingServer('https://hub-cloud.browserstack.com/wd/hub')
        .withCapabilities(capabilities)
        .build();
    return driver;
};

// Maximize the window so that full browser state is visible in the screenshots
// await driver_chrome.manage().window().maximize(); // Not supported in this version / Selenium

console.log('\x1b[33m%s\x1b[0m', 'Running Gutenberg and Tonedear tests only for this browser version');
console.log(' ');

// make sure to use await running tests or we are charged unnecessarily on Browserstack
await gutenbergRo.runTests(await loadChromeDriver());
await tonedear.runTests(await loadChromeDriver());
