const { createReadStream, existsSync, statSync } = require('node:fs');
const { createServer } = require('node:http');
const { extname, join, normalize, resolve } = require('node:path');

const root = resolve(__dirname, '..', 'mobile');
const port = Number(process.env.PORT || process.argv[2] || 5174);

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function resolveRequestPath(url = '/') {
  const pathname = decodeURIComponent(url.split('?')[0] || '/');
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const fullPath = normalize(join(root, relative));
  if (!fullPath.startsWith(root)) {
    return null;
  }
  if (!existsSync(fullPath)) {
    return null;
  }
  const stat = statSync(fullPath);
  if (stat.isDirectory()) {
    return join(fullPath, 'index.html');
  }
  return fullPath;
}

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url);
  if (!filePath) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': types[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Mobile app: http://127.0.0.1:${port}/`);
});
