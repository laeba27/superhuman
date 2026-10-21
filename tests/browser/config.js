// Shared settings for the browser tests.
const os = require('os'), path = require('path'), fs = require('fs');

const BASE = (process.env.BASE_URL || 'http://localhost:8000/').replace(/\/?$/, '/');
// Chrome profiles and screenshots go here, outside the repo.
const OUT = process.env.TEST_OUTPUT || path.join(os.tmpdir(), 'dashboard-builder-tests');
fs.mkdirSync(OUT, { recursive: true });

module.exports = { BASE, OUT };
