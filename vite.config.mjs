import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Clean URLs in local dev, matching vercel.json: /login serves login.html, and /login.html or /index.html redirect to the clean path.
export default {
  appType: 'mpa', // unknown paths 404 instead of quietly showing the home page
  plugins: [{
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [path, query] = req.url.split('?');
        const page = req.method === 'GET' && !query && req.headers.accept?.includes('text/html');
        if (page && path.endsWith('.html')) {
          res.writeHead(301, { Location: path.replace(/(index)?\.html$/, '') || '/' });
          return res.end();
        }
        if (path !== '/' && !path.includes('.') && existsSync(join(server.config.root, path + '.html'))) {
          req.url = path + '.html' + (query ? '?' + query : '');
        }
        next();
      });
    }
  }]
};
