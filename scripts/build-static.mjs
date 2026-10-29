#!/usr/bin/env node
/**
 * 生成可直接部署到静态托管的 dist/。
 * 只复制运行所需文件，不包含测试、开发脚本和历史截图。
 */

import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const resolvedDist = path.resolve(DIST);
  if (!resolvedDist.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error(`拒绝清理项目外目录：${resolvedDist}`);
  }

  await rm(resolvedDist, { recursive: true, force: true });
  await mkdir(resolvedDist, { recursive: true });

  for (const file of ['index.html', 'favicon.svg']) {
    const source = path.join(ROOT, file);
    if (!(await exists(source))) throw new Error(`缺少入口文件：${file}`);
    await cp(source, path.join(resolvedDist, file));
  }

  await cp(path.join(ROOT, 'src'), path.join(resolvedDist, 'src'), {
    recursive: true,
    filter: (source) => !source.includes('__pycache__'),
  });

  await writeFile(
    path.join(resolvedDist, '_headers'),
    [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    path.join(resolvedDist, '404.html'),
    `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>页面未找到 · 六博·汉局</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#110e0b;color:#ead9b7;font-family:"Songti SC",serif;text-align:center}
    a{color:#ebd399}
  </style>
</head>
<body>
  <main>
    <h1>此路不通</h1>
    <p>博局中没有这个位置。</p>
    <p><a href="./">返回六博·汉局</a></p>
  </main>
</body>
</html>
`,
    'utf8',
  );

  const files = [];
  async function walk(directory) {
    const { readdir } = await import('node:fs/promises');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(path.relative(resolvedDist, full).split(path.sep).join('/'));
    }
  }
  await walk(resolvedDist);

  console.log(`六博·汉局 · 静态构建完成`);
  console.log(`输出目录：${resolvedDist}`);
  console.log(`文件数：${files.length}`);
  for (const file of files.sort()) console.log(`  ${file}`);
}

main().catch((error) => {
  console.error(`构建失败：${error.message}`);
  process.exitCode = 1;
});
