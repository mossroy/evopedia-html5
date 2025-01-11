import { Builder } from 'selenium-webdriver';
import legacyRayCharles from '../../spec/legacy-ray_charles.e2e.spec.js';
import gutenbergRo from '../../spec/gutenberg_ro.e2e.spec.js';
import tonedearTests from '../../spec/tonedear.e2e.spec.js';

/* eslint-disable camelcase */

// Input capabilities
const capabilities = {
    'bstack:options': {
        os: 'OS X',
        osVersion: 'Big Sur',
        browserVersion: '14.1',
        projectName: 'BStack Project Name: Kiwix JS e2e tests',
        buildName: 'BStack Build Name: Safari 14 on Big Sur',
        local: true,
        localIdentifier: process.env.BROWSERSTACK_LOCAL_IDENTIFIER,
        userName: process.env.BROWSERSTACK_USERNAME,
        accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
        seleniumVersion: '4.10.0'
    },
    browserName: 'Safari'
};

async function loadSafariDriver () {
    const driver = await new Builder()
        // .forBrowser('edge')
        .usingServer('https://hub-cloud.browserstack.com/wd/hub')
        .withCapabilities(capabilities)
        .build();
    // Maximize the window so that full browser state is visible in the screenshots
    await driver.manage().window().maximize();
    return driver;
};

// Browserstack Safari does not support Service Workers
console.log(' ');
console.log('\x1b[33m%s\x1b[0m', 'Running tests in JQuery mode only for this browser version')
console.log(' ');

const driver_legacy_safari = await loadSafariDriver();
await legacyRayCharles.runTests(driver_legacy_safari, ['jquery']);

const driver_gutenberg_safari = await loadSafariDriver();
await gutenbergRo.runTests(driver_gutenberg_safari, ['jquery']);

const driver_tonedear_safari = await loadSafariDriver();
await tonedearTests.runTests(driver_tonedear_safari, ['jquery']);
