'use strict';

const path = require('path');
const express = require('express');

const pkg = require('../package.json');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      name: pkg.name,
      version: pkg.version,
      time: new Date().toISOString(),
    });
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`VTaBridge OS CEO Dashboard listening on http://localhost:${port}`);
  });
}
