#!/usr/bin/env node
/**
 * 零依赖静态服务器。
 * 用法：node scripts/serve.mjs [--port 4173] [--host 0.0.0.0] [--dir dist]
 */

import http from 'node:http';
import os from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function parseArgs(argv) {
  const options = {
    port: Number(process.env.PORT) || 4173,
    // 默认监听所有网卡，手机才能通过电脑的局域网 IP 访问。
    // 只在本机玩时可用 --host 127.0.0.1 收回局域网暴露。
    host: process.env.HOST || '0.0.0.0',
    root: ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--port' && argv[index + 1]) {
      options.port = Number(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--port=')) {
      options.port = Number(arg.slice('--port='.length));
    } else if (arg === '--host' && argv[index + 1]) {
      options.host = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--host=')) {
      options.host = arg.slice('--host='.length);
    } else if (arg === '--dir' && argv[index + 1]) {
      options.root = path.resolve(ROOT, argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--dir=')) {
      options.root = path.resolve(ROOT, arg.slice('--dir='.length));
    }
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error(`无效端口：${options.port}`);
  }
  return options;
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(body);
}

function safeResolve(root, requestPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestPath, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  return target;
}

function getLanAddresses() {
  const addresses = [];
  for (const [interfaceName, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push({ interfaceName, address: entry.address });
      }
    }
  }
  return addresses;
}

export function createStaticServer(root = ROOT) {
  return http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }

    const target = safeResolve(root, request.url ?? '/');
    if (!target) {
      send(response, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }

    let filePath = target;
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
      send(response, 404, '未找到该页面', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }

    try {
      const body = await readFile(filePath);
      const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      response.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') response.end();
      else response.end(body);
    } catch {
      send(response, 404, '未找到该页面', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  const server = createStaticServer(options.root);
  server.on('error', (error) => {
    console.error(`[六博·汉局] 服务器启动失败：${error.message}`);
    process.exitCode = 1;
  });
  server.listen(options.port, options.host, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : options.port;
    const wildcard = options.host === '0.0.0.0' || options.host === '::';
    const localUrl = `http://127.0.0.1:${port}`;

    console.log('');
    console.log('六博·汉局 · 本地服务已启动');
    console.log(`文件目录：${options.root}`);
    console.log(`电脑访问：${localUrl}`);

    if (wildcard) {
      const lanAddresses = getLanAddresses();
      if (lanAddresses.length > 0) {
        console.log('');
        console.log('手机访问（手机与电脑需连同一个 Wi-Fi）：');
        for (const { interfaceName, address: ip } of lanAddresses) {
          console.log(`  http://${ip}:${port}   [${interfaceName}]`);
        }
        console.log('');
        console.log('若手机仍打不开：检查 Windows 防火墙是否允许 Node.js 入站，');
        console.log('并确认路由器没有开启“AP 隔离/访客网络隔离”。');
      } else {
        console.log('未发现局域网 IPv4 地址；请检查 Wi-Fi 连接。');
      }
    } else {
      console.log(`当前只监听 ${options.host}，手机无法访问。`);
      console.log('需要手机访问时去掉 --host，或设置 --host 0.0.0.0。');
    }

    console.log('');
    console.log('按 Ctrl+C 停止。');
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1200).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
