import { Builder } from 'selenium-webdriver';
import legacyRayCharles from '../../spec/legacy-ray_charles.e2e.spec.js';
import gutenbergRo from '../../spec/gutenberg_ro.e2e.spec.js';
import tonedear from '../../spec/tonedear.e2e.spec.js';

/* eslint-disable camelcase */

// Input capabilities
const capabilities = {
    'browserstack.idleTimeout': 300,
    'bstack:options': {
        os: 'Windows',
        osVersion: '10',
        browserVersion: '18.0',
        projectName: 'BStack Project Name: Kiwix JS e2e tests',
        buildName: 'BStack Build Name: Edge Legacy',
        local: true,
        localIdentifier: process.env.BROWSERSTACK_LOCAL_IDENTIFIER,
        userName: process.env.BROWSERSTACK_USERNAME,
        accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
        seleniumVersion: '4.10.0',
        edge: {
            enablePopups: true
        }
    },
    browserName: 'Edge'
};

async function loadEdgeLegacyDriver () {
    const driver = await new Builder()
        // .forBrowser('edge')
        .usingServer('https://hub-cloud.browserstack.com/wd/hub')
        .withCapabilities(capabilities)
        .build();
    // Maximize the window so that full browser state is visible in the screenshots
    await driver.manage().window().maximize();
    return driver;
};

// For this runner, we must use a single driver for all tests to avoid the other drivers
// timing out while earlier tests complete
const singleDriver = await loadEdgeLegacyDriver();

await legacyRayCharles.runTests(singleDriver, null, true);
await gutenbergRo.runTests(singleDriver, null, true);
await tonedear.runTests(singleDriver);
