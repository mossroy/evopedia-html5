import { Builder } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/edge.js';
// import legacyRayCharles from '../../spec/legacy-ray_charles.e2e.spec.js';
// import gutenbergRo from '../../spec/gutenberg_ro.e2e.spec.js';
import tonedearTests from '../../spec/tonedear.e2e.spec.js';
/* eslint-disable camelcase */

async function loadMSEdgeDriver () {
    const options = new Options();
    // Run it headless if the environment variable GITHUB_ACTIONS is set
    if (process.env.GITHUB_ACTIONS) {
        options.addArguments('--headless=new');
    }
    const driver = await new Builder(options)
        .forBrowser('MicrosoftEdge')
        .setEdgeOptions(options)
        .build();
    return driver;
};

// Preserve the order of loading, because when a user runs these on local machine, the third driver will be on top of and cover the first one
// so we need to use the third one first
const driver_for_tonedear = await loadMSEdgeDriver();
// const driver_for_gutenberg = await loadMSEdgeDriver();
// const driver_for_ray_charles = await loadMSEdgeDriver();

// await legacyRayCharles.runTests(driver_for_ray_charles);
// await gutenbergRo.runTests(driver_for_gutenberg);
await tonedearTests.runTests(driver_for_tonedear);
