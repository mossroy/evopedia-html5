import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import legacyRayCharles from '../../spec/legacy-ray_charles.e2e.spec.js';
import gutenbergRo from '../../spec/gutenberg_ro.e2e.spec.js';
import tonedearTests from '../../spec/tonedear.e2e.spec.js';
import paths from '../../paths.js';

/* eslint-disable camelcase */

async function loadFirefoxDriver () {
    const options = new firefox.Options();
    // Run it headless if the environment variable GITHUB_ACTIONS is set
    if (process.env.GITHUB_ACTIONS) {
        options.headless();
    }
    options.setPreference('browser.download.folderList', 2);
    options.setPreference('browser.download.dir', paths.downloadDir);
    options.setPreference('browser.download.manager.showWhenStarting', false);
    options.setPreference('browser.helperApps.neverAsk.saveToDisk', 'octet-stream');
    const driver = await new Builder(options)
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .build();
    return driver;
};

// Preserve the order of loading, because when a user runs these on local machine, the third driver will be on top of and cover the first one
// so we need to use the third one first
const driver_for_tonedear = await loadFirefoxDriver();
const driver_for_gutenberg = await loadFirefoxDriver();
const driver_for_ray_charles = await loadFirefoxDriver();

await legacyRayCharles.runTests(driver_for_ray_charles);
await gutenbergRo.runTests(driver_for_gutenberg);
await tonedearTests.runTests(driver_for_tonedear);
