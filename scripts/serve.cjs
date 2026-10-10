const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.md': 'text/plain' };
function createServer(root = path.resolve(__dirname, '..')) {
  return http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (requested.split('/').some(p => p.startsWith('.'))) { res.writeHead(403); res.end(); return; }
      let target = path.resolve(root, '.' + requested);
      if (requested.endsWith('/')) target = path.join(target, 'index.html');
      const ext = path.extname(target), real = await fs.realpath(target);
      if (!types[ext] || !real.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const data = await fs.readFile(real);
      res.writeHead(200, { 'Content-Type': types[ext] + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 400); res.end('Unable to serve this path.'); }
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 8000);
  createServer().listen(port, '127.0.0.1', () => console.log(`MoonFormer: http://127.0.0.1:${port}`));
}
module.exports = { createServer };
