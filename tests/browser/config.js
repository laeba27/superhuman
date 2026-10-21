const os = require('os'), path = require('path'), fs = require('fs');

const BASE = (process.env.BASE_URL || 'http://localhost:8000/').replace(/\/?$/, '/');
const OUT = process.env.TEST_OUTPUT || path.join(os.tmpdir(), 'dashboard-builder-tests');
fs.mkdirSync(OUT, { recursive: true });

module.exports = { BASE, OUT };
