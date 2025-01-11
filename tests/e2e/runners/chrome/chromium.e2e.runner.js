import { Builder } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome.js';
import legacyRayCharles from '../../spec/legacy-ray_charles.e2e.spec.js';
import gutenbergRo from '../../spec/gutenberg_ro.e2e.spec.js';
import tonedearTests from '../../spec/tonedear.e2e.spec.js';
import paths from '../../paths.js';

/* eslint-disable camelcase */

async function loadChromiumDriver () {
    const options = new Options();
    // Run it headless if the environment variable GITHUB_ACTIONS is set
    if (process.env.GITHUB_ACTIONS) {
        options.addArguments('--headless=new');
    }
    options.setUserPreferences({ 'download.default_directory': paths.downloadDir });
    const driver = await new Builder(options)
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();
    return driver;
};

// Preserve the order of loading, because when a user runs these on local machine, the third driver will be on top of and cover the first one
// so we need to use the third one first
const driver_for_tonedear = await loadChromiumDriver();
const driver_for_gutenberg = await loadChromiumDriver();
const driver_for_ray_charles = await loadChromiumDriver();

await legacyRayCharles.runTests(driver_for_ray_charles);
await gutenbergRo.runTests(driver_for_gutenberg);
await tonedearTests.runTests(driver_for_tonedear);
