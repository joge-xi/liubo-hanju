#!/usr/bin/env node
/**
 * 真实浏览器冒烟测试。
 *
 * 通过 Chrome DevTools Protocol 驱动本机 Edge/Chrome：
 * - 验证首屏、双人模式、投箸、选子、合法落点、回合切换、重开；
 * - 验证人机模式会自动完成玄方回合；
 * - 验证考据手册四个章节可读、无 JS 运行时异常；
 * - 输出桌面与手机截图。
 *
 * 运行要求：在普通桌面会话中执行（无头 Chromium 无法在限制命名管道的
 * 文件沙箱内启动）。本脚本不访问外网。
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TMP_ROOT = path.join(ROOT, '.tmp');
const ARTIFACTS = path.join(ROOT, 'artifacts');
const BASE_URL = 'http://127.0.0.1:4173/';
const DEBUG_URL = `${BASE_URL}?debug=1`;
const IS_WINDOWS = process.platform === 'win32';

const browserCandidates = IS_WINDOWS
  ? [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]
  : [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];

let serverProcess = null;
let browserProcess = null;
let cdp = null;
let profileDir = null;
const report = {
  checks: [],
  screenshots: [],
  errors: [],
  notes: [],
};

function check(name, detail = '') {
  report.checks.push({ name, status: 'passed', detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(description, probe, timeoutMs = 8000, intervalMs = 100) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(intervalMs);
  }
  throw new Error(
    `等待超时：${description}${lastError ? `（${lastError.message}）` : ''}`,
  );
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}：${url}`);
  return response.json();
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => resolve(port));
    });
  });
}

async function ensureServer() {
  try {
    const response = await fetch(BASE_URL);
    if (response.ok && (await response.text()).includes('六博')) return false;
  } catch {
    // 启动本地服务。
  }

  serverProcess = spawn(
    process.execPath,
    ['scripts/serve.mjs', '--port', '4173'],
    {
      cwd: ROOT,
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  serverProcess.once('error', (error) => {
    report.errors.push(`本地服务启动失败：${error.message}`);
  });

  await waitFor(
    '本地服务启动',
    async () => {
      try {
        const response = await fetch(BASE_URL);
        return response.ok;
      } catch {
        return false;
      }
    },
    12000,
  );
  return true;
}

async function launchBrowser() {
  const executable = browserCandidates.find(Boolean);
  if (!executable) throw new Error('未找到 Edge 或 Chrome。');

  const debugPort = await getFreePort();
  profileDir = path.join(TMP_ROOT, `smoke-profile-${Date.now()}`);
  await mkdir(profileDir, { recursive: true });
  await mkdir(ARTIFACTS, { recursive: true });

  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1440,1100',
    'about:blank',
  ];

  browserProcess = spawn(executable, args, {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  browserProcess.once('error', (error) => {
    report.errors.push(`浏览器启动失败：${error.message}`);
  });

  const version = await waitFor(
    'Chromium DevTools 端口',
    async () => fetchJson(`http://127.0.0.1:${debugPort}/json/version`),
    15000,
    200,
  );
  report.notes.push(`浏览器：${version.Browser}`);

  let targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
  let page = targets.find((target) => target.type === 'page');
  if (!page) {
    page = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
      method: 'PUT',
    });
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('未能取得浏览器页面 WebSocket 地址。');

  cdp = await createCdpClient(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Inspector.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });

  cdp.on('Runtime.exceptionThrown', (params) => {
    const detail = params.exceptionDetails;
    report.errors.push(
      `页面异常：${detail.exception?.description ?? detail.text ?? 'unknown'}`,
    );
  });
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const text = params.args
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ')
        .trim();
      if (text) report.errors.push(`console.error：${text}`);
    }
  });
  cdp.on('Log.entryAdded', (params) => {
    if (params.entry?.level === 'error') {
      const text = params.entry.text ?? '';
      if (!/favicon|DevTools|Autofill|Download|crashpad/i.test(text)) {
        report.errors.push(`浏览器日志：${text}`);
      }
    }
  });
  cdp.on('Inspector.targetCrashed', () => {
    report.errors.push('页面渲染进程崩溃。');
  });
}

function createCdpClient(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    let nextId = 0;
    const pending = new Map();
    const handlers = new Map();

    const failPending = (error) => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      pending.clear();
    };

    socket.addEventListener('open', () => {
      const client = {
        send(method, params = {}, timeoutMs = 12000) {
          return new Promise((resolveCall, rejectCall) => {
            const id = ++nextId;
            const timer = setTimeout(() => {
              pending.delete(id);
              rejectCall(new Error(`CDP 超时：${method}`));
            }, timeoutMs);
            pending.set(id, { resolve: resolveCall, reject: rejectCall, timer });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        on(event, callback) {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event).add(callback);
        },
        close() {
          try {
            socket.close();
          } catch {
            // 忽略关闭错误。
          }
        },
      };
      resolve(client);
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) entry.reject(new Error(`${message.error.message} (${message.error.code})`));
        else entry.resolve(message.result);
        return;
      }
      if (message.method && handlers.has(message.method)) {
        for (const handler of handlers.get(message.method)) {
          try {
            handler(message.params);
          } catch (error) {
            report.errors.push(`CDP 事件处理异常：${error.message}`);
          }
        }
      }
    });

    socket.addEventListener('error', () => {
      failPending(new Error('DevTools WebSocket 连接失败。'));
      reject(new Error('DevTools WebSocket 连接失败。'));
    });

    socket.addEventListener('close', () => {
      failPending(new Error('DevTools WebSocket 已关闭。'));
    });
  });
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const description =
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      '浏览器执行异常';
    throw new Error(description);
  }
  return result.result.value;
}

async function waitForExpression(expression, description, timeoutMs = 8000) {
  return waitFor(
    description,
    async () => {
      try {
        return await evaluate(expression);
      } catch {
        return false;
      }
    },
    timeoutMs,
    100,
  );
}

async function navigate(url) {
  const loaded = new Promise((resolve) => {
    const timer = setTimeout(resolve, 12000);
    cdp.on('Page.loadEventFired', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await cdp.send('Page.navigate', { url });
  await loaded;
  await waitForExpression("document.body?.dataset.appReady === 'true'", '应用初始化', 15000);
  await wait(180);
}

async function click(selector) {
  const executable = `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    return true;
  })()`;
  const clicked = await evaluate(executable);
  assert.equal(clicked, true, `找不到可点击元素：${selector}`);
}

async function clickPiece(pieceId) {
  return click(`[data-piece-id="${pieceId}"]`);
}

async function clickTarget(to) {
  return click(`.move-target[data-to="${to}"]`);
}

async function getState() {
  return evaluate('window.__liubo.getState()');
}

async function waitForState(description, predicate, timeoutMs = 8000) {
  return waitFor(
    description,
    async () => {
      const state = await getState();
      return predicate(state) ? state : false;
    },
    timeoutMs,
    110,
  );
}

async function takeScreenshot(name) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const file = path.join(ARTIFACTS, name);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  report.screenshots.push(file);
  console.log(`  · 截图 ${name}`);
}

async function resolveHumanTurn() {
  const state = await getState();
  if (state.phase === 'game-over') return;
  assert.equal(state.phase, 'await-roll');
  await click('#rollBtn');
  const resolved = await waitForState(
    '投箸动画结束',
    (next) =>
      !next.busy &&
      (next.phase === 'await-move' || next.phase === 'await-pass' || next.phase === 'game-over'),
    6000,
  );
  if (resolved.phase === 'game-over') return;
  if (resolved.phase === 'await-pass') {
    await click('#passBtn');
    return;
  }

  const move = resolved.legalMoves[0];
  assert.ok(move, '应存在合法着法');
  await clickPiece(move.pieceId);
  await waitForState('选中棋子', (next) => next.selectedPieceId === move.pieceId, 4000);
  await clickTarget(move.to);
}

async function main() {
  console.log('六博·汉局 · 真实浏览器冒烟测试\n');

  await mkdir(TMP_ROOT, { recursive: true });
  const startedServer = await ensureServer();
  report.notes.push(startedServer ? '测试自启本地服务' : '复用已在运行的本地服务');

  await launchBrowser();
  await navigate(DEBUG_URL);

  check('应用在真实 Chromium 中初始化');
  assert.equal(await evaluate("document.getElementById('startDialog').open"), true);
  const initial = await getState();
  assert.equal(initial.mode, 'pvp');
  assert.equal(initial.pieces.length, 12);
  assert.equal(await evaluate("document.querySelectorAll('#board .piece').length"), 12);
  assert.equal(await evaluate("document.querySelectorAll('.mode-card').length"), 2);
  check('首屏、开场说明与 12 枚棋子渲染正常');

  await click('#startPvp');
  await waitForExpression("!document.getElementById('startDialog').open", '关闭开场页');
  const pvp = await waitForState('进入双人模式', (state) => state.mode === 'pvp' && state.phase === 'await-roll');
  assert.equal(pvp.currentPlayer, 'red');
  assert.equal(
    await evaluate("getComputedStyle(document.getElementById('passBtn')).display"),
    'none',
    '未到过手阶段时，过手按钮应隐藏',
  );
  check('双人模式启动，朱方先行，非过手阶段按钮正确隐藏');

  await click('#guideBtn');
  await waitForExpression("document.getElementById('guideDialog').open", '打开考据手册');
  assert.equal(await evaluate("document.querySelectorAll('#guideContent .rule-card').length"), 6);
  await click('[data-guide-tab="evidence"]');
  await wait(180);
  const evidenceCount = await evaluate(
    "document.querySelectorAll('#guideContent .evidence-card').length",
  );
  assert.equal(evidenceCount, 16);
  await click('[data-guide-tab="sources"]');
  await wait(160);
  assert.equal(
    await evaluate("document.querySelectorAll('#guideContent .version-card').length"),
    1,
  );
  assert.match(
    await evaluate("document.querySelector('#guideContent .version-card').textContent"),
    /v1\.0\.0/,
  );
  check('考据手册四个章节可进入，证据清单 16 条与规则版本记录完整渲染');
  await click('[data-close-dialog="guideDialog"]');
  await waitForExpression("!document.getElementById('guideDialog').open", '关闭考据手册');

  await click('#rollBtn');
  const rolled = await waitForState(
    '投箸结果',
    (state) =>
      !state.busy && (state.phase === 'await-move' || state.phase === 'await-pass'),
    6500,
  );
  assert.ok(rolled.roll, '应记录投箸结果');
  assert.ok(rolled.roll.pips >= 0 && rolled.roll.pips <= 6);
  assert.equal(await evaluate("document.querySelectorAll('#sticks .stick').length"), 6);
  const passDisplay = await evaluate(
    "getComputedStyle(document.getElementById('passBtn')).display",
  );
  if (rolled.phase === 'await-pass') {
    assert.notEqual(passDisplay, 'none', '过手阶段应显示过手按钮');
  } else {
    assert.equal(passDisplay, 'none', '可行棋阶段应隐藏过手按钮');
  }
  check('六箸投掷、结果展示与合法阶段切换正常', `点数 ${rolled.roll.pips}`);

  if (rolled.phase === 'await-move') {
    const move = rolled.legalMoves[0];
    assert.ok(move);
    await clickPiece(move.pieceId);
    const selected = await waitForState('选择棋子', (state) => state.selectedPieceId === move.pieceId);
    assert.ok(selected.legalMoves.length >= 1);
    const targetCount = await evaluate("document.querySelectorAll('#board .move-target').length");
    assert.ok(targetCount >= 1);
    await clickTarget(move.to);
  } else {
    await click('#passBtn');
  }

  const afterMove = await waitForState(
    '完成一手并切换行棋方',
    (state) => !state.busy && (state.plies === 1 || state.phase === 'game-over'),
    5000,
  );
  if (afterMove.phase !== 'game-over') {
    assert.equal(afterMove.currentPlayer, 'black');
  }
  assert.equal(afterMove.pieces.length, 12);
  check('选子、合法落点提示、行棋与回合切换正常');

  if (afterMove.phase !== 'game-over') {
    const blackPiece = afterMove.pieces.find((piece) => piece.side === 'black');
    await clickPiece(blackPiece.id);
    await waitForExpression(
      "document.querySelector('.toast.is-visible')?.textContent.includes('请先投掷')",
      '非法操作提示',
      3000,
    );
    check('未投箸时点击棋子被阻止并提示');
  }

  await wait(300);
  await click('#restartBtn');
  await waitForExpression("document.getElementById('restartDialog').open", '打开重开确认');
  await click('#confirmRestart');
  const restarted = await waitForState(
    '重开重置',
    (state) => state.plies === 0 && state.phase === 'await-roll' && state.pieces.length === 12,
    5000,
  );
  assert.equal(restarted.scores.red, 0);
  assert.equal(restarted.scores.black, 0);
  check('重新开始正确清空回合并恢复十二棋');

  await click('#newGameBtn');
  await waitForExpression("document.getElementById('startDialog').open", '打开新局');
  await click('#startPve');
  await waitForState('进入人机模式', (state) => state.mode === 'pve' && state.currentPlayer === 'red');
  check('模式切换至人机，玩家执朱方');

  await resolveHumanTurn();
  await waitForState('玩家回合结束', (state) => state.currentPlayer === 'black' || state.phase === 'game-over', 7000);
  const aiDone = await waitForState(
    'AI 自动完成玄方回合',
    (state) =>
      state.phase === 'game-over' ||
      (state.currentPlayer === 'red' && state.plies >= 2),
    12000,
  );
  if (aiDone.phase !== 'game-over') {
    assert.ok(aiDone.lastLog.some((entry) => entry.text.includes('玄方投箸')));
  }
  check('人机对手自动投箸、行棋并把回合交回玩家');

  await evaluate('window.__liubo.loadOwlCaptureScenario()');
  const endgame = await waitForState(
    '加载杀枭测试局面',
    (state) => state.phase === 'await-move' && state.roll?.pips === 4,
    4000,
  );
  const owlKill = endgame.legalMoves.find((move) => move.capturesOwl);
  assert.ok(owlKill, '测试局面应存在杀枭着法');
  await clickPiece(owlKill.pieceId);
  await waitForState('选择枭', (state) => state.selectedPieceId === owlKill.pieceId, 3000);
  await clickTarget(owlKill.to);
  const finished = await waitForState(
    '杀枭终局',
    (state) => state.phase === 'game-over' && state.winner === 'red',
    5000,
  );
  assert.equal(finished.winReason, 'capture-owl');
  await waitForExpression("document.getElementById('resultDialog').open", '终局面板', 4000);
  const resultTitle = await evaluate("document.getElementById('resultTitle').textContent");
  assert.match(resultTitle, /朱方杀枭/);
  await wait(250);
  await takeScreenshot('liubo-hanju-result.png');
  check('吃枭触发胜负判定与终局面板');
  await click('#viewBoardAfterResult');
  await waitForExpression("!document.getElementById('resultDialog').open", '关闭终局面板');

  await evaluate("window.__liubo.startGame('pvp')");
  await waitForState('准备桌面截图', (state) => state.mode === 'pvp' && state.phase === 'await-roll');
  await click('#rollBtn');
  const shotState = await waitForState(
    '桌面截图棋局',
    (state) => !state.busy && (state.phase === 'await-move' || state.phase === 'await-pass'),
    6000,
  );
  if (shotState.phase === 'await-move') {
    const move = shotState.legalMoves[0];
    await clickPiece(move.pieceId);
    await waitForState('截图选中状态', (state) => state.selectedPieceId === move.pieceId);
    await clickTarget(move.to);
    await wait(450);
  }
  const layout = await evaluate(`({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    boardWidth: Math.round(document.getElementById('board').getBoundingClientRect().width),
  })`);
  assert.ok(layout.scrollWidth <= layout.innerWidth + 2, '桌面布局不应横向溢出');
  await takeScreenshot('liubo-hanju-desktop.png');
  check('桌面布局无横向溢出', `${layout.boardWidth}px 棋盘`);

  await click('#guideBtn');
  await waitForExpression("document.getElementById('guideDialog').open", '打开手册截图');
  await click('[data-guide-tab="evidence"]');
  await wait(300);
  await takeScreenshot('liubo-hanju-guide.png');
  await click('[data-close-dialog="guideDialog"]');
  await waitForExpression("!document.getElementById('guideDialog').open", '关闭手册截图');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await navigate(DEBUG_URL);
  assert.equal(await evaluate("document.getElementById('startDialog').open"), true);
  const mobileLayout = await evaluate(`({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    dialogWidth: Math.round(document.getElementById('startDialog').getBoundingClientRect().width),
  })`);
  assert.ok(mobileLayout.scrollWidth <= mobileLayout.innerWidth + 2, '移动端不应横向溢出');
  assert.ok(mobileLayout.dialogWidth <= mobileLayout.innerWidth, '开场页应适配窄屏');
  await takeScreenshot('liubo-hanju-mobile.png');
  check('手机窄屏布局无横向溢出', `${mobileLayout.innerWidth}px 视口`);

  await click('#startPvp');
  await waitForState('手机端进入对局', (state) => state.mode === 'pvp' && state.phase === 'await-roll');
  await evaluate('window.scrollTo(0, 190)');
  await wait(2850);
  const mobileBoardLayout = await evaluate(`({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    boardWidth: Math.round(document.getElementById('board').getBoundingClientRect().width),
    throwCardWidth: Math.round(document.querySelector('.throw-card').getBoundingClientRect().width),
  })`);
  assert.ok(mobileBoardLayout.scrollWidth <= mobileBoardLayout.innerWidth + 2);
  assert.ok(mobileBoardLayout.boardWidth >= 330);
  assert.ok(
    mobileBoardLayout.throwCardWidth >= mobileBoardLayout.innerWidth - 40,
    '手机端操作面板应铺满内容宽度',
  );
  await takeScreenshot('liubo-hanju-mobile-board.png');
  check(
    '手机端博局与操作面板正常显示',
    `${mobileBoardLayout.boardWidth}px 棋盘 / ${mobileBoardLayout.throwCardWidth}px 面板`,
  );

  await wait(300);
  assert.deepEqual(report.errors, [], `浏览器产生错误：\n${report.errors.join('\n')}`);

  console.log('\n全部浏览器检查通过。');
  console.log(JSON.stringify(report, null, 2));
}

async function terminateProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (IS_WINDOWS) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      const timer = setTimeout(resolve, 3000);
      killer.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      killer.once('error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  } else {
    child.kill('SIGTERM');
    await wait(300);
  }
}

async function cleanup() {
  try {
    cdp?.close();
  } catch {
    // 忽略。
  }
  await terminateProcess(browserProcess);
  if (serverProcess) await terminateProcess(serverProcess);
  if (profileDir) {
    const resolved = path.resolve(profileDir);
    const safeRoot = path.resolve(TMP_ROOT) + path.sep;
    if (resolved.startsWith(safeRoot)) {
      await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

try {
  await main();
  process.exitCode = 0;
} catch (error) {
  console.error('\n浏览器冒烟测试失败：');
  console.error(error.stack || error.message);
  if (report.errors.length > 0) {
    console.error('\n浏览器错误：');
    for (const line of report.errors) console.error(`- ${line}`);
  }
  process.exitCode = 1;
} finally {
  await cleanup();
}
