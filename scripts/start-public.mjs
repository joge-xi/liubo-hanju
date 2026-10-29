#!/usr/bin/env node
/**
 * 生成静态 dist，启动本地预览，并用 serveo.net 建立临时公网隧道。
 * 只暴露 dist/，不会暴露源码、测试和项目其他文件。
 *
 * 用法：node scripts/start-public.mjs [--port 4180]
 */

import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function parsePort() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--port');
  const value = index >= 0 ? Number(args[index + 1]) : 4180;
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`无效端口：${value}`);
  }
  return value;
}

async function main() {
  const port = parsePort();

  console.log('1/3 构建静态文件 dist/');
  execFileSync(process.execPath, [path.join(__dirname, 'build-static.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  console.log(`\n2/3 启动本地预览 http://127.0.0.1:${port}`);
  const server = createStaticServer(DIST);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  console.log('\n3/3 建立临时公网隧道（serveo.net）');
  console.log('公开地址会显示在下一行；首次打开若出现警告页，点击 Continue to Site。');
  console.log('此链接仅在电脑、本窗口和 SSH 隧道保持运行时有效。\n');

  const sshArgs = [
    '-T',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=NUL',
    '-o', 'ConnectTimeout=20',
    '-o', 'ServerAliveInterval=20',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', `80:127.0.0.1:${port}`,
    'serveo.net',
  ];

  const ssh = spawn('ssh.exe', sshArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: false,
  });

  let finished = false;
  const shutdown = (exitCode = 0) => {
    if (finished) return;
    finished = true;
    try {
      ssh.kill();
    } catch {
      // 忽略。
    }
    server.close(() => process.exit(exitCode));
    setTimeout(() => process.exit(exitCode), 1200).unref();
  };

  ssh.on('error', (error) => {
    console.error(`\nSSH 隧道启动失败：${error.message}`);
    console.error('Windows 可通过“设置 → 应用 → 可选功能”安装 OpenSSH 客户端。');
    shutdown(1);
  });
  ssh.on('exit', (code) => {
    console.log(`\nSSH 隧道已结束（退出码 ${code ?? 0}）。`);
    shutdown(code ?? 0);
  });
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

main().catch((error) => {
  console.error(`\n启动失败：${error.message}`);
  process.exitCode = 1;
});
