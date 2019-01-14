/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const {Signale} = require('signale');
const gulp = require('gulp');
const abe = require('amp-by-example');
const through = require('through2');
const del = require('del');
const path = require('path');

// Where to import the samples from
const EXAMPLE_SRC = '../examples/source/**/*.html';
// The pod path inside
const POD_PATH = 'content/amp-dev/documentation/examples';
// Where to store the samples inside the Grow pod in
const EXAMPLE_DEST = `../pages/${POD_PATH}`;
// What Grow template to use to render the sample's manual
const MANUAL_TEMPLATE = '/views/examples/manual.j2';
// What Grow template to use to render the preview
const PREVIEW_TEMPLATE = '/views/examples/preview.j2';
// What Grow template to use to render the actual source file
const SOURCE_TEMPLATE = '/layouts/blank.j2';
// Base to define the request path for Grow
const PATH_BASE = '/documentation/examples/';

class SamplesBuilder {
  constructor() {
    this._log = new Signale({
      'interactive': false,
      'scope': 'Samples builder',
    });
  }

  async build(watch) {
    // Only clean if it is not a watch call
    // TODO: Add something like gulp-changed to enable incremental builds
    if (!watch) {
      this._log.await('Cleaning samples build destination ...');
      del.sync([
        `${EXAMPLE_DEST}/**/*.json`,
        `${EXAMPLE_DEST}/**/*.html`,
        `${EXAMPLE_DEST}/**/*.md`,
        `!${EXAMPLE_DEST}/index.md`,
      ], {'force': true});

      this._log.start('Starting to build samples ...');
    }

    return new Promise((resolve, reject) => {
      let stream = gulp.src(EXAMPLE_SRC, {'read': true});

      stream = stream.pipe(through.obj(async (sample, encoding, callback) => {
        this._log.await(`Building sample ${sample.relative} ...`);
        await this._parseSample(sample.path).then((parsedSample) => {
          // Build various documents and sources that are needed for Grow
          // to successfully render the example
          stream.push(this._createDataSource(sample, parsedSample));

          stream.push(this._createManualDoc(sample, parsedSample));
          stream.push(this._createPreviewDoc(sample, parsedSample));
          stream.push(this._createSourceDoc(sample, parsedSample));

          callback();
        }).catch((e) => {
          this._log.error(e);
          callback();
        });
      }));

      stream.pipe(gulp.dest(EXAMPLE_DEST));

      stream.on('error', (error) => {
        this._log.fatal('There was an error building the samples', error);
        reject();
      });

      stream.on('end', () => {
        this._log.success(`Built samples to ${EXAMPLE_DEST}.`);
        resolve();
      });
    });
  }

  /**
   * Parse a sample source file into a JSON using the parser from the
   * ampbyexample.com package and while doing so updates some fields
   * @return {Promise}
   */
  async _parseSample(samplePath) {
    return await abe.parseSample(samplePath).then((parsedSample) => {
      // parsedSample.filePath is absolute but needs to be relative in order
      // to use it to build a URL to GitHub
      parsedSample.filePath = parsedSample.filePath.replace(path.join(__dirname, '../../../'), '');

      return parsedSample;
    });
  }

  /**
   * Creates a file for the data source that is then consumed by a Grow
   * template to render the examples manual
   * @param  {Vinyl} sample       The sample from the gulp stream
   * @param  {Object} parsedSample Sample as parsed by abe.com
   * @return {Vinyl}
   */
  _createDataSource(sample, parsedSample) {
    sample = sample.clone();
    sample.contents = Buffer.from([
      JSON.stringify(parsedSample),
    ].join('\n'));

    sample = sample.clone();
    sample.extname = '.json';

    return sample;
  }

  /**
   * Creates a markdown document referencing the JSON that is going to be
   * created by _createDataSource
   * @param  {Vinyl} sample The sample from the gulp stream
   * @return {Vinyl}
   */
  _createManualDoc(sample, parsedSample) {
    sample = sample.clone();
    sample.contents = Buffer.from([
      '---',
      '$title: ' + parsedSample.document.title,
      '$view: ' + MANUAL_TEMPLATE,
      '$path: ' + PATH_BASE + sample.relative,
      'example: !g.json /' + POD_PATH + '/' + sample.relative.replace('.html', '.json'),
      '---',
    ].join('\n'));
    sample.extname = '-manual.html';

    return sample;
  }

  /**
   * Creates a html document that holds the initial sample source
   * @param  {Vinyl} sample The sample from the gulp stream
   * @param  {Object} parsedSample The sample parsed by abe.com
   * @return {Vinyl}
   */
  _createPreviewDoc(sample, parsedSample) {
    sample = sample.clone();
    sample.contents = Buffer.from([
      '---',
      '$title: ' + parsedSample.document.title,
      '$view: ' + PREVIEW_TEMPLATE,
      '$path: ' + PATH_BASE + sample.relative.replace('.html', '/preview.html'),
      'example: !g.json /' + POD_PATH + '/' + sample.relative.replace('.html', '.json'),
      '$hidden: true',
      '---',
    ].join('\n'));
    sample.extname = '-preview.html';

    return sample;
  }

  /**
   * Creates a html document that holds the initial sample source
   * @param  {Vinyl} sample The sample from the gulp stream
   * @param  {Object} parsedSample The sample parsed by abe.com
   * @return {Vinyl}
   */
  _createSourceDoc(sample, parsedSample) {
    sample = sample.clone();
    sample.contents = Buffer.from([
      '---',
      '$title: ' + parsedSample.document.title,
      '$view: ' + SOURCE_TEMPLATE,
      '$path: ' + PATH_BASE + sample.relative.replace('.html', '/source.html'),
      '$hidden: true',
      '$$injectAmpDependencies: false',
      '---',
      sample.contents.toString(),
    ].join('\n'));
    sample.extname = '-source.html';

    return sample;
  }

  watch() {
    this._log.watch('Watching samples for changes ...');
    gulp.watch(EXAMPLE_SRC, this.build.bind(this, true));
  }
}

module.exports = SamplesBuilder;
