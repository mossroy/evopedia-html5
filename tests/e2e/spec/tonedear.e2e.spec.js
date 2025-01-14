/* eslint-disable no-undef */
import { By, until } from 'selenium-webdriver';
import assert from 'assert';
import paths from '../paths.js';

const BROWSERSTACK = !!process.env.BROWSERSTACK_LOCAL_IDENTIFIER;
const port = BROWSERSTACK ? '8099' : '8080';
const tonedearBaseFile = BROWSERSTACK ? '/tests/zims/tonedear/tonedear.com_en_2024-09.zim' : paths.tonedearBaseFile;

/**
 * Run the tests
 * @param {WebDriver} driver Selenium WebDriver object
 * @param {Array} modes Array of modes to run the tests in
 * @param {boolean} keepDriver Whether to keep the driver open after the tests have run
 * @returns {Promise<void>} A Promise for the completion of the tests
 */
function runTests (driver, modes, keepDriver) {
    let browserName, browserVersion;
    driver.getCapabilities().then(function (caps) {
        browserName = caps.get('browserName');
        browserVersion = caps.get('browserVersion');
        console.log('\nRunning Tonedear tests on: ' + browserName + ' ' + browserVersion);
    });

    // Set the implicit wait to 3 seconds
    driver.manage().setTimeouts({ implicit: 3000 });

    // Run in both jquery and serviceworker modes by default
    if (!modes) {
        modes = ['jquery', 'serviceworker'];
    }

    modes.forEach(function (mode) {
        const serviceWorkerAPI = true;
        describe('Tonedear test ' + (mode === 'jquery' ? '[JQuery mode]' : '[SW mode]'), function () {
            this.timeout(60000);
            this.slow(10000);

            it('Load Kiwix JS and check title', async function () {
                await driver.get('http://localhost:' + port + '/dist/www/index.html?noPrompts=true');
                await driver.sleep(1300);
                await driver.navigate().refresh();
                await driver.sleep(800);
                const title = await driver.getTitle();
                assert.equal('Kiwix', title);
            });

            it('Switch to ' + mode + ' mode', async function () {
                const modeSelector = await driver.wait(until.elementLocated(By.id(mode + 'ModeRadio')));
                await driver.wait(async function () {
                    const elementIsVisible = await driver.executeScript(
                        'var el=arguments[0]; el.scrollIntoView(true); setTimeout(function () {el.click();}, 50); return el.offsetParent;',
                        modeSelector
                    );
                    return elementIsVisible;
                }, 5000);
                await driver.sleep(1300);

                if (mode === 'serviceworker' && !serviceWorkerAPI) {
                    console.log('\x1b[33m%s\x1b[0m', '      Skipping SW mode tests because browser does not support API');
                    if (!keepDriver) await driver.quit();
                    return;
                }

                // Disable source verification in SW mode
                if (mode === 'serviceworker') {
                    const sourceVerificationCheckbox = await driver.findElement(By.id('enableSourceVerification'));
                    if (await sourceVerificationCheckbox.isSelected()) {
                        await sourceVerificationCheckbox.click();
                    }
                }
            });

            it('Load Tonedear archive', async function () {
                if (!serviceWorkerAPI && mode === 'serviceworker') {
                    console.log('\x1b[33m%s\x1b[0m', '    - Following test skipped:');
                    return;
                }

                if (!BROWSERSTACK) {
                    const archiveFiles = await driver.findElement(By.id('archiveFiles'));
                    await archiveFiles.sendKeys(tonedearBaseFile);
                    await driver.executeScript('window.setLocalArchiveFromFileSelect();');
                    const filesLength = await driver.executeScript('return document.getElementById("archiveFiles").files.length');
                    assert.equal(1, filesLength);
                } else {
                    await driver.executeScript('var files = arguments[0]; window.setRemoteArchives.apply(this, files);', [tonedearBaseFile]);
                    await driver.sleep(1300);
                }
            });

            it('Navigate to Android & iOS section', async function () {
                if (!serviceWorkerAPI && mode === 'serviceworker') {
                    console.log('\x1b[33m%s\x1b[0m', '    - Following test skipped:');
                    return;
                }

                await driver.sleep(2000); // Give time for content to load
                await driver.switchTo().frame('articleContent');
                const androidIosLink = await driver.wait(until.elementLocated(By.css('a[href="android-ios-ear-training-app"]')), 5000);
                await androidIosLink.click();
                // Switch back to default content before handling dialogs or verifying content
                await driver.switchTo().defaultContent();
                // Wait time
                await driver.sleep(1000);
            });

            it('Verify Android and iOS store images in ' + (mode === 'jquery' ? 'Restricted' : 'ServiceWorker') + ' mode', async function () {
                if (!serviceWorkerAPI && mode === 'jquery') {
                    // Restricted mode test for data URIs
                    const androidImage = await driver.findElement(By.css('img[alt="Get it on Google Play"]'));
                    const iosImage = await driver.findElement(By.css('img[alt="Get the iOS app"]'));

                    // Verify src attribute has changed to a data URI
                    const androidSrc = await androidImage.getAttribute('src');
                    const iosSrc = await iosImage.getAttribute('src');

                    assert.ok(androidSrc.startsWith('data:image/png;base64,'), 'Android image src is a data URI');
                    assert.ok(iosSrc.startsWith('data:image/png;base64,'), 'iOS image src is a data URI');

                    // Compare the first 30 characters of data URIs
                    const androidDataSnippet = androidSrc.substring(22, 52);
                    const iosDataSnippet = iosSrc.substring(22, 52);

                    // Expected snippet for comparison
                    const expectedAndroidSnippet = 'iVBORw0KGgoAAAANSUhEUg';
                    const expectedIosSnippet = 'iVBORw0KGgoAAAANSUhEUg';

                    assert.strictEqual(androidDataSnippet, expectedAndroidSnippet, 'Android image data matches expected');
                    assert.strictEqual(iosDataSnippet, expectedIosSnippet, 'iOS image data matches expected');
                } else if (serviceWorkerAPI && mode === 'serviceworker') {
                    try {
                        // ServiceWorker mode test for image loading
                        await driver.sleep(3000);

                        const swRegistration = await driver.executeScript('return navigator.serviceWorker.ready');
                        assert.ok(swRegistration, 'Service Worker is registered');

                        // console.log('Current URL:', await driver.getCurrentUrl());

                        // Switch to the iframe that contains the Android and iOS images
                        const iframe = await driver.findElement(By.id('articleContent'));
                        await driver.switchTo().frame(iframe);

                        // Wait for images to be visible on the page inside the iframe
                        await driver.wait(async function () {
                            const images = await driver.findElements(By.css('img[alt="Get it on Google Play"], img[alt="Get the iOS app"]'));
                            if (images.length === 0) return false;

                            // Check if all images are visible
                            const visibility = await Promise.all(images.map(async (img) => {
                                return await img.isDisplayed();
                            }));
                            return visibility.every((isVisible) => isVisible);
                        }, 10000, 'No visible store images found after 30 seconds');

                        const androidImage = await driver.findElement(By.css('img[alt="Get it on Google Play"]'));
                        const iosImage = await driver.findElement(By.css('img[alt="Get the iOS app"]'));

                        // Wait for images to load and verify dimensions
                        await driver.wait(async function () {
                            const androidLoaded = await driver.executeScript('return arguments[0].complete && arguments[0].naturalWidth > 0 && arguments[0].naturalHeight > 0;', androidImage);
                            const iosLoaded = await driver.executeScript('return arguments[0].complete && arguments[0].naturalWidth > 0 && arguments[0].naturalHeight > 0;', iosImage);
                            return androidLoaded && iosLoaded;
                        }, 5000, 'Images did not load successfully');

                        const androidWidth = await driver.executeScript('return arguments[0].naturalWidth;', androidImage);
                        const androidHeight = await driver.executeScript('return arguments[0].naturalHeight;', androidImage);

                        const iosWidth = await driver.executeScript('return arguments[0].naturalWidth;', iosImage);
                        const iosHeight = await driver.executeScript('return arguments[0].naturalHeight;', iosImage);

                        assert.ok(androidWidth > 0 && androidHeight > 0, 'Android image has valid dimensions');
                        assert.ok(iosWidth > 0 && iosHeight > 0, 'iOS image has valid dimensions');

                        // Switch back to the main content after finishing the checks
                        await driver.switchTo().defaultContent();
                    } catch (err) {
                        // If we still can't find the images, log the page source to help debug
                        console.error('Failed to find store images:', err.message);
                        throw err;
                    }
                }

                // exit if every test and mode is completed
                if (mode === modes[modes.length - 1] && !keepDriver) {
                    await driver.quit();
                }
            });
        });
    });
}

export default {
    runTests: runTests
};
