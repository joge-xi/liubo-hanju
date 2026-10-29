/**
 * 六博·汉局 — 浏览器入口。
 * 规则判定全部委托给 src/game/engine.js；本文件只处理交互、动效与展示。
 */

import {
  RuleError,
  applyMove,
  createGame,
  getLegalMoves,
  getMatchResult,
  getPhaseLabel,
  passTurn,
  rollForCurrentPlayer,
} from './game/engine.js';
import { chooseMove } from './game/ai.js';
import { createSeededRandom } from './game/dice.js';
import { mountBoard, renderBoard } from './ui/boardView.js';
import { renderGuidePanel } from './ui/guideView.js';
import { SCHEME } from './data/museum.js';

const $ = (id) => document.getElementById(id);

const dom = {
  board: $('board'),
  roundNo: $('roundNo'),
  plyLabel: $('plyLabel'),
  turnTitle: $('turnTitle'),
  turnSeal: $('turnSeal'),
  turnText: $('turnText'),
  turnHint: $('turnHint'),
  modeChip: $('modeChip'),
  turnBadge: $('turnBadge'),
  rollBadge: $('rollBadge'),
  sticks: $('sticks'),
  rollNumber: $('rollNumber'),
  rollLabel: $('rollLabel'),
  rollHint: $('rollHint'),
  rollBtn: $('rollBtn'),
  passBtn: $('passBtn'),
  redScore: $('redScore'),
  blackScore: $('blackScore'),
  redCaptures: $('redCaptures'),
  blackCaptures: $('blackCaptures'),
  redSpecials: $('redSpecials'),
  blackSpecials: $('blackSpecials'),
  redYouTag: $('redYouTag'),
  blackYouTag: $('blackYouTag'),
  gameLog: $('gameLog'),
  logCount: $('logCount'),
  routeToggle: $('routeToggle'),
  liveStatus: $('liveStatus'),
  toast: $('toast'),
  startDialog: $('startDialog'),
  guideDialog: $('guideDialog'),
  restartDialog: $('restartDialog'),
  resultDialog: $('resultDialog'),
  guideContent: $('guideContent'),
  guideTabs: Array.from(document.querySelectorAll('[data-guide-tab]')),
  boardEvidenceLink: $('boardEvidenceLink'),
  quickGuide: $('quickGuide'),
  resultSeal: $('resultSeal'),
  resultTitle: $('resultTitle'),
  resultSubtitle: $('resultSubtitle'),
  resultScore: $('resultScore'),
};

const NUMERALS = ['零', '一', '二', '三', '四', '五', '六'];
const query = new URLSearchParams(window.location.search);
const seedParam = query.get('seed');
const DEBUG_ENABLED = query.get('debug') === '1';
const seededRandom = seedParam ? createSeededRandom(Number(seedParam) || 1) : null;

let game = createGame({ mode: 'pvp' });
let selectedPieceId = null;
let showRoute = true;
let busy = false;
let diceAnimating = false;
let gameToken = 0;
let aiTimer = null;
let rollTimer = null;
let resultTimer = null;
let toastTimer = null;
let resultShown = false;
let guideTab = 'rules';

function nextRandom() {
  return seededRandom ? seededRandom() : Math.random();
}

function sideName(side) {
  return side === 'red' ? '朱方' : '玄方';
}

function sideSeal(side) {
  return side === 'red' ? '朱' : '玄';
}

function isAiTurn() {
  return game.mode === 'pve' && game.currentPlayer === 'black' && game.phase !== 'game-over';
}

function anyDialogOpen() {
  return Boolean(document.querySelector('dialog[open]'));
}

function emit(message) {
  dom.liveStatus.textContent = '';
  window.setTimeout(() => {
    dom.liveStatus.textContent = message;
  }, 20);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  toastTimer = null;
  dom.toast.className = 'toast';
  dom.toast.textContent = '';
}

function showToast(message, tone = 'info', duration = 2600) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.className = `toast is-visible${tone === 'error' ? ' is-error' : tone === 'success' ? ' is-success' : ''}`;
  toastTimer = window.setTimeout(() => {
    dom.toast.className = 'toast';
  }, duration);
}

function errorMessage(error) {
  if (error instanceof RuleError) return error.message;
  return error instanceof Error ? error.message : '发生了未预期的错误。';
}

function pauseTimersForDialog() {
  window.clearTimeout(aiTimer);
  window.clearTimeout(rollTimer);
  aiTimer = null;
  rollTimer = null;
  busy = false;
  diceAnimating = false;
}

function clearAllTimers() {
  window.clearTimeout(aiTimer);
  window.clearTimeout(rollTimer);
  window.clearTimeout(resultTimer);
  aiTimer = null;
  rollTimer = null;
  resultTimer = null;
  busy = false;
  diceAnimating = false;
}

function queueAI(delay = 760) {
  window.clearTimeout(aiTimer);
  aiTimer = null;
  if (!isAiTurn() || anyDialogOpen() || game.phase === 'game-over') return;

  const token = gameToken;
  aiTimer = window.setTimeout(() => {
    aiTimer = null;
    if (token !== gameToken || anyDialogOpen() || !isAiTurn()) return;
    runAIStep();
  }, delay);
}

function runAIStep() {
  if (!isAiTurn() || anyDialogOpen()) return;

  if (game.phase === 'await-roll') {
    let rolled;
    try {
      rolled = rollForCurrentPlayer(game, nextRandom);
    } catch (error) {
      showToast(`玄方投箸失败：${errorMessage(error)}`, 'error');
      return;
    }
    commitRoll(rolled, { byAI: true });
    return;
  }

  if (game.phase === 'await-move') {
    const move = chooseMove(game);
    if (!move) {
      showToast('规则状态异常：电脑没有合法着法。', 'error');
      return;
    }
    selectedPieceId = move.pieceId;
    busy = true;
    renderAll();
    emit('玄方正在选择合法落点。');

    const token = gameToken;
    aiTimer = window.setTimeout(() => {
      aiTimer = null;
      if (token !== gameToken || anyDialogOpen()) return;
      busy = false;
      commitMove(move, { byAI: true });
    }, 760);
    return;
  }

  if (game.phase === 'await-pass') {
    const token = gameToken;
    aiTimer = window.setTimeout(() => {
      aiTimer = null;
      if (token !== gameToken || anyDialogOpen()) return;
      commitPass({ byAI: true });
    }, 620);
  }
}

function commitRoll(rolled, { byAI = false } = {}) {
  hideToast();
  game = rolled;
  selectedPieceId = null;
  busy = true;
  diceAnimating = true;
  const token = gameToken;
  renderAll();

  if (game.roll?.special === 'five-white' || game.roll?.special === 'six-white') {
    showToast(
      `${game.roll.shout} ${sideName(game.currentPlayer)}得彩，博筹 +1（现代奖励）。`,
      'success',
      3200,
    );
    emit(`${game.roll.label}，${sideName(game.currentPlayer)}得彩。`);
  }

  window.clearTimeout(rollTimer);
  rollTimer = window.setTimeout(() => {
    if (token !== gameToken) return;
    rollTimer = null;
    busy = false;
    diceAnimating = false;
    renderAll();
    if (game.phase === 'await-pass') {
      if (isAiTurn()) {
        queueAI(600);
      } else {
        showToast('无合法落点，请点“无棋可走 · 过手”。', 'info', 3000);
      }
    } else {
      queueAI(byAI ? 560 : 720);
    }
  }, 640);
}

function commitMove(move, { byAI = false } = {}) {
  if (game.phase !== 'await-move') return;

  let next;
  try {
    next = applyMove(game, move.pieceId, move.to);
  } catch (error) {
    busy = false;
    showToast(`行棋被阻止：${errorMessage(error)}`, 'error');
    renderAll();
    return;
  }

  const mover = game.currentPlayer;
  const captureType = next.lastMove?.captureType ?? null;
  hideToast();
  game = next;
  selectedPieceId = null;
  busy = false;
  diceAnimating = false;
  renderAll();

  if (game.phase === 'game-over') {
    const result = getMatchResult(game);
    showToast(result?.title ?? '对局结束', 'success', 2600);
    emit(`${result?.title ?? '对局结束'}。${result?.subtitle ?? ''}`);
  } else if (captureType === 'scatter') {
    showToast(
      byAI ? '玄方吃去一散，得 1 筹。' : '吃子成功，得 1 筹。',
      'success',
      2200,
    );
    emit(`${sideName(mover)}吃子得筹。`);
  } else {
    emit(`${sideName(mover)}完成行棋，轮到${sideName(game.currentPlayer)}。`);
  }

  if (game.phase !== 'game-over') queueAI(850);
}

function commitPass({ byAI = false } = {}) {
  if (game.phase !== 'await-pass') return;
  const mover = game.currentPlayer;
  let next;
  try {
    next = passTurn(game);
  } catch (error) {
    showToast(`无法过手：${errorMessage(error)}`, 'error');
    renderAll();
    return;
  }

  hideToast();
  game = next;
  selectedPieceId = null;
  busy = false;
  diceAnimating = false;
  renderAll();
  if (!byAI) {
    const message = `${sideName(mover)}无子可行，过手。`;
    showToast(message, 'info', 1900);
    emit(message);
  }
  queueAI(800);
}

function humanRoll() {
  if (busy) {
    showToast('六箸尚未落定，请稍候。', 'info', 1600);
    return;
  }
  if (game.phase !== 'await-roll') {
    showToast('现在不是投箸阶段。', 'error', 1800);
    return;
  }
  if (isAiTurn()) {
    showToast('轮到玄方（电脑）投箸。', 'info', 1800);
    return;
  }

  let rolled;
  try {
    rolled = rollForCurrentPlayer(game, nextRandom);
  } catch (error) {
    showToast(`投箸失败：${errorMessage(error)}`, 'error');
    return;
  }
  commitRoll(rolled);
}

function humanPass() {
  if (busy) return;
  if (game.phase !== 'await-pass') {
    showToast('当前仍有合法着法，不能过手。', 'error');
    return;
  }
  if (isAiTurn()) return;
  commitPass();
}

function resetSelection() {
  selectedPieceId = null;
  renderAll();
}

function selectPiece(piece) {
  const moves = getLegalMoves(game).filter((move) => move.pieceId === piece.id);
  if (moves.length === 0) {
    showToast('此子按本次点数没有合法落点（可能被己方棋子挡住）。', 'error', 2800);
    emit('此子本次无法行棋。');
    return;
  }
  selectedPieceId = piece.id;
  renderAll();
  const pieceName = piece.type === 'owl' ? '枭' : '散';
  showToast(`已选${sideName(piece.side)}${pieceName}，${moves.length} 个合法落点。`, 'info', 1700);
  emit(`已选${sideName(piece.side)}${pieceName}，请选择金色落点。`);
}

function handleTarget(target) {
  if (!selectedPieceId) {
    showToast('请先点选一枚可行动的棋子。', 'info', 1800);
    return;
  }
  const move = getLegalMoves(game).find(
    (candidate) => candidate.pieceId === selectedPieceId && candidate.to === target,
  );
  if (!move) {
    showToast('此处不是当前棋子的合法落点。', 'error', 2200);
    return;
  }
  commitMove(move);
}

function onBoardClick(event) {
  if (anyDialogOpen() || game.phase === 'game-over') return;
  if (busy) {
    showToast('六箸尚未落定，请稍候。', 'info', 1500);
    return;
  }
  if (isAiTurn()) {
    showToast('轮到玄方（电脑）行棋。', 'info', 1500);
    return;
  }

  const targetEl = event.target.closest?.('.move-target');
  if (targetEl) {
    handleTarget(Number(targetEl.dataset.to));
    return;
  }

  const pieceEl = event.target.closest?.('.piece');
  if (pieceEl) {
    const piece = game.pieces.find((candidate) => candidate.id === pieceEl.dataset.pieceId);
    if (!piece || !piece.alive) return;

    if (game.phase !== 'await-move') {
      showToast(
        game.phase === 'await-roll' ? '请先投掷六箸。' : '当前不能行棋，请先过手。',
        'info',
        1800,
      );
      return;
    }

    if (piece.side !== game.currentPlayer) {
      if (selectedPieceId) {
        const capture = getLegalMoves(game).find(
          (move) => move.pieceId === selectedPieceId && move.to === piece.pos,
        );
        if (capture) {
          commitMove(capture);
          return;
        }
      }
      showToast('不能选择对方棋子。若可吃子，请点选朱色落点。', 'error', 2200);
      return;
    }

    if (selectedPieceId === piece.id) {
      resetSelection();
      return;
    }
    selectPiece(piece);
    return;
  }

  if (selectedPieceId) {
    showToast('请点选金色落点或朱色吃子环。', 'info', 1800);
  }
}

function onBoardKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const interactive = event.target.closest?.('.piece, .move-target');
  if (!interactive) return;
  event.preventDefault();
  interactive.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function renderTurnPanel() {
  const side = game.currentPlayer;
  const result = game.phase === 'game-over' ? getMatchResult(game) : null;
  const displaySide = game.winner && game.winner !== 'draw' ? game.winner : side;

  dom.roundNo.textContent = String(game.round);
  dom.plyLabel.textContent =
    game.phase === 'game-over' ? `共 ${game.plies} 手` : `第 ${game.plies + 1} 手`;
  dom.turnSeal.textContent =
    game.phase === 'game-over'
      ? game.winner === 'draw'
        ? '和'
        : sideSeal(game.winner)
      : sideSeal(displaySide);
  dom.turnSeal.classList.toggle('is-black', displaySide === 'black');
  dom.turnText.textContent = result ? result.title : getPhaseLabel(game);

  let hint = '';
  if (game.phase === 'game-over') {
    hint = game.endDetail;
  } else if (diceAnimating) {
    hint = '六箸正在翻转、落定……';
  } else if (busy && game.phase === 'await-move') {
    hint = isAiTurn() ? '玄方正在选择合法落点。' : '正在准备行棋。';
  } else if (isAiTurn()) {
    hint =
      game.phase === 'await-roll'
        ? '玄方正在权衡投箸。'
        : game.phase === 'await-pass'
          ? '玄方无子可行，即将过手。'
          : '玄方正在选择合法着法。';
  } else if (game.phase === 'await-roll') {
    hint =
      game.mode === 'pve'
        ? '你先投六箸，白面数就是步数。'
        : `${sideName(side)}先投六箸，白面数就是步数。`;
  } else if (game.phase === 'await-move') {
    hint = selectedPieceId
      ? '已选棋子。请点选金色落点；朱色环表示可吃子。'
      : '点选有光晕的己方棋子，再选一个落点。';
  } else if (game.phase === 'await-pass') {
    hint = '本次无合法落点，请点“无棋可走 · 过手”。';
  }

  dom.turnHint.textContent = hint;
  dom.modeChip.textContent =
    game.mode === 'pve' ? '人机 · 你执朱方' : '双人 · 本地';
  dom.turnBadge.textContent =
    game.phase === 'game-over' ? '对局终了' : `${sideName(side)}行棋`;
}

function renderSticks() {
  dom.sticks.replaceChildren();
  const fragment = document.createDocumentFragment();

  if (diceAnimating || !game.roll) {
    for (let index = 0; index < 6; index += 1) {
      const stick = document.createElement('span');
      stick.className = `stick is-empty${diceAnimating ? ' is-rolling' : ''}`;
      stick.setAttribute('aria-hidden', 'true');
      fragment.append(stick);
    }
    dom.sticks.setAttribute(
      'aria-label',
      diceAnimating ? '六根箸正在翻转' : '六根尚未投掷的箸',
    );
  } else {
    game.roll.sticks.forEach((face) => {
      const stick = document.createElement('span');
      stick.className = `stick ${face === 'white' ? 'is-white' : 'is-dark'}`;
      stick.setAttribute('aria-hidden', 'true');
      fragment.append(stick);
    });
    dom.sticks.setAttribute(
      'aria-label',
      `本次投掷：${game.roll.label}，${faceSummary(game.roll.sticks)}`,
    );
  }

  dom.sticks.append(fragment);
}

function faceSummary(sticks) {
  const whites = sticks.filter((face) => face === 'white').length;
  return `${whites} 根白面，${6 - whites} 根黑面`;
}

function renderDiceReadout() {
  dom.rollNumber.classList.remove('has-result', 'is-special');
  dom.rollBadge.textContent = '待投';

  if (diceAnimating) {
    dom.rollNumber.textContent = '…';
    dom.rollLabel.textContent = '六箸翻转中';
    dom.rollHint.textContent = '落定后显示白面数与合法落点。';
    dom.rollBadge.textContent = '翻转';
    return;
  }

  if (!game.roll) {
    dom.rollNumber.textContent = game.phase === 'game-over' ? '—' : '—';
    dom.rollLabel.textContent = game.phase === 'game-over' ? '本局已终' : '尚未投掷';
    dom.rollHint.textContent =
      game.phase === 'game-over' ? '可查看棋盘或再来一局。' : '六箸数白，得 0—6 步';
    dom.rollBadge.textContent =
      game.phase === 'game-over'
        ? '局终'
        : game.phase === 'await-move' || game.phase === 'await-pass'
          ? '待行'
          : '待投';
    return;
  }

  const { pips, label, special } = game.roll;
  dom.rollNumber.textContent = String(pips);
  dom.rollNumber.classList.add('has-result');
  if (special === 'five-white' || special === 'six-white') {
    dom.rollNumber.classList.add('is-special');
  }

  dom.rollLabel.textContent =
    special === 'five-white' || special === 'six-white'
      ? `${label} · ${game.roll.shout}`
      : `${NUMERALS[pips] ?? pips}白`;
  dom.rollHint.textContent =
    special === 'five-white' || special === 'six-white'
      ? '博筹 +1（现代奖励）· 请选子行棋。'
      : pips === 0
        ? '全黑，无步可行，须过手。'
        : `可行 ${pips} 步 · 请点选棋子。`;
  dom.rollBadge.textContent =
    game.phase === 'await-pass' ? '须过' : game.phase === 'await-move' ? '待行' : '待投';
}

function renderPlayers() {
  for (const side of ['red', 'black']) {
    const row = document.querySelector(`[data-player-row="${side}"]`);
    if (row) {
      row.classList.toggle(
        'is-current',
        game.phase !== 'game-over' ? game.currentPlayer === side : game.winner === side,
      );
    }
  }

  dom.redScore.textContent = String(game.scores.red);
  dom.blackScore.textContent = String(game.scores.black);
  dom.redCaptures.textContent = String(game.captures.red);
  dom.blackCaptures.textContent = String(game.captures.black);
  dom.redSpecials.textContent = String(game.specials.red);
  dom.blackSpecials.textContent = String(game.specials.black);

  dom.redYouTag.textContent = game.mode === 'pve' ? '你' : '玩家一';
  dom.blackYouTag.textContent = game.mode === 'pve' ? '电脑' : '玩家二';
}

function renderLog() {
  dom.gameLog.replaceChildren();
  const fragment = document.createDocumentFragment();
  const entries = [...game.log].reverse();

  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = `log-entry log-entry--${entry.kind}`;

    if (entry.seal) {
      const seal = document.createElement('span');
      seal.className = 'log-seal';
      seal.textContent = entry.seal;
      seal.setAttribute('aria-hidden', 'true');
      item.append(seal);
    }

    const text = document.createElement('span');
    text.className = 'log-entry-text';
    text.textContent = entry.text;
    item.append(text);

    if (entry.side) {
      const side = document.createElement('span');
      side.className = 'log-entry-side';
      side.textContent = sideSeal(entry.side);
      side.setAttribute('aria-hidden', 'true');
      item.append(side);
    }

    fragment.append(item);
  }

  dom.gameLog.append(fragment);
  dom.gameLog.scrollTop = 0;
  dom.logCount.textContent = `${game.log.length} 条`;
}

function renderBoardView() {
  const allMoves = game.phase === 'await-move' ? getLegalMoves(game) : [];

  if (selectedPieceId) {
    const selectedStillLegal = allMoves.some((move) => move.pieceId === selectedPieceId);
    if (!selectedStillLegal) selectedPieceId = null;
  }

  const visibleMoves = selectedPieceId
    ? allMoves.filter((move) => move.pieceId === selectedPieceId)
    : [];

  renderBoard(dom.board, game, {
    legalMoves: visibleMoves,
    movableMoves: allMoves,
    selectedPieceId,
    showRoute,
  });
}

function renderActions() {
  dom.rollBtn.classList.remove('is-hidden');

  if (game.phase === 'game-over') {
    dom.rollBtn.disabled = true;
    dom.rollBtn.textContent = '本局已终';
    dom.passBtn.hidden = true;
    return;
  }

  if (game.phase === 'await-roll') {
    if (busy) {
      dom.rollBtn.disabled = true;
      dom.rollBtn.textContent = '六箸翻转中…';
    } else if (isAiTurn()) {
      dom.rollBtn.disabled = true;
      dom.rollBtn.textContent = '玄方正在投箸…';
    } else {
      dom.rollBtn.disabled = false;
      dom.rollBtn.textContent = '投掷六箸';
    }
  } else if (game.phase === 'await-move') {
    dom.rollBtn.disabled = true;
    dom.rollBtn.textContent = '已投箸 · 待行棋';
  } else {
    dom.rollBtn.disabled = true;
    dom.rollBtn.textContent = '无子可行';
  }

  const showPass = game.phase === 'await-pass';
  dom.passBtn.hidden = !showPass;
  dom.passBtn.disabled = !showPass || busy || isAiTurn();
  dom.passBtn.textContent = isAiTurn() ? '玄方即将过手…' : '无棋可走 · 过手';
}

function maybeScheduleResult() {
  if (game.phase !== 'game-over' || resultShown) return;
  resultShown = true;
  window.clearTimeout(resultTimer);
  const token = gameToken;
  resultTimer = window.setTimeout(() => {
    resultTimer = null;
    if (token !== gameToken || game.phase !== 'game-over') return;
    if (anyDialogOpen()) {
      resultShown = false;
      return;
    }
    showResultDialog();
  }, 620);
}

function showResultDialog() {
  const result = getMatchResult(game);
  if (!result) return;

  pauseTimersForDialog();
  dom.resultSeal.textContent =
    result.winner === 'draw' ? '和' : sideSeal(result.winner);
  dom.resultTitle.textContent = result.title;
  dom.resultSubtitle.textContent = result.subtitle;
  dom.resultScore.textContent = result.scoreText;
  if (!dom.resultDialog.open) dom.resultDialog.showModal();
}

function renderAll() {
  renderTurnPanel();
  renderSticks();
  renderDiceReadout();
  renderPlayers();
  renderLog();
  renderBoardView();
  renderActions();
  maybeScheduleResult();
}

function startGame(mode) {
  if (mode !== 'pvp' && mode !== 'pve') return;
  clearAllTimers();
  gameToken += 1;
  game = createGame({ mode });
  selectedPieceId = null;
  resultShown = false;
  busy = false;
  diceAnimating = false;

  if (dom.startDialog.open) dom.startDialog.close();
  if (dom.restartDialog.open) dom.restartDialog.close();
  if (dom.resultDialog.open) dom.resultDialog.close();

  hideToast();
  renderAll();
  const modeText = mode === 'pve' ? '人机对弈 · 你执朱方' : '双人对弈 · 朱方先手';
  showToast(`新局开始：${modeText}。`, 'success', 2300);
  emit(`新局开始，${modeText}。朱方先行。`);
  document.body.dataset.gameMode = mode;
}

function openDialog(dialog) {
  if (!dialog || dialog.open) return;
  pauseTimersForDialog();
  dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function openGuide(tab = 'rules') {
  switchGuideTab(tab);
  openDialog(dom.guideDialog);
}

function switchGuideTab(tab) {
  if (!['rules', 'evidence', 'museum', 'sources'].includes(tab)) return;
  guideTab = tab;
  for (const button of dom.guideTabs) {
    const active = button.dataset.guideTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  dom.guideContent.innerHTML = renderGuidePanel(tab);
  dom.guideContent.scrollTop = 0;
  dom.guideContent.setAttribute('aria-label', `${tab} 章节内容`);
}

function bindEvents() {
  dom.rollBtn.addEventListener('click', humanRoll);
  dom.passBtn.addEventListener('click', humanPass);
  dom.board.addEventListener('click', onBoardClick);
  dom.board.addEventListener('keydown', onBoardKeydown);

  dom.routeToggle.addEventListener('click', () => {
    showRoute = !showRoute;
    dom.routeToggle.setAttribute('aria-pressed', String(showRoute));
    dom.routeToggle.textContent = showRoute ? '隐藏行棋线' : '显示行棋线';
    renderBoardView();
  });

  $('startPvp').addEventListener('click', () => startGame('pvp'));
  $('startPve').addEventListener('click', () => startGame('pve'));
  $('browseBoard').addEventListener('click', () => closeDialog(dom.startDialog));
  $('startGuide').addEventListener('click', () => {
    closeDialog(dom.startDialog);
    openGuide('rules');
  });

  $('newGameBtn').addEventListener('click', () => openDialog(dom.startDialog));
  $('modeSwitchBtn').addEventListener('click', () => openDialog(dom.startDialog));
  $('guideBtn').addEventListener('click', () => openGuide('rules'));
  $('quickGuide').addEventListener('click', () => openGuide('rules'));
  dom.boardEvidenceLink.addEventListener('click', () => openGuide('evidence'));

  $('restartBtn').addEventListener('click', () => openDialog(dom.restartDialog));
  $('confirmRestart').addEventListener('click', () => startGame(game.mode));
  $('againBtn').addEventListener('click', () => startGame(game.mode));
  $('viewBoardAfterResult').addEventListener('click', () => closeDialog(dom.resultDialog));

  for (const button of dom.guideTabs) {
    button.addEventListener('click', () => switchGuideTab(button.dataset.guideTab));
  }

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      closeDialog(document.getElementById(button.dataset.closeDialog));
    });
  });

  for (const dialog of [dom.startDialog, dom.guideDialog, dom.restartDialog]) {
    dialog.addEventListener('close', () => {
      renderAll();
      queueAI(650);
    });
  }

  dom.resultDialog.addEventListener('close', () => {
    renderAll();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || anyDialogOpen()) return;
    if (selectedPieceId) resetSelection();
  });

  window.addEventListener('blur', () => {
    window.clearTimeout(toastTimer);
  });
}

/**
 * 仅用于本地浏览器自动化验收的固定局面。
 * 默认页面不注册该入口，需显式访问 ?debug=1；它不参与正常开局与规则判定。
 */
function loadOwlCaptureScenario() {
  clearAllTimers();
  gameToken += 1;
  game = createGame({ mode: 'pvp' });
  const placements = {
    'red-owl': 20,
    'red-scatter-1': 21,
    'red-scatter-2': 22,
    'red-scatter-3': 23,
    'red-scatter-4': 24,
    'red-scatter-5': 25,
    'black-owl': 16,
    'black-scatter-1': 27,
    'black-scatter-2': 1,
    'black-scatter-3': 2,
    'black-scatter-4': 4,
    'black-scatter-5': 5,
  };
  for (const [pieceId, position] of Object.entries(placements)) {
    const piece = game.pieces.find((candidate) => candidate.id === pieceId);
    if (piece) piece.pos = position;
  }
  const sticks = ['white', 'white', 'white', 'white', 'dark', 'dark'];
  game.currentPlayer = 'red';
  game.phase = 'await-move';
  game.sticks = sticks;
  game.roll = {
    sticks,
    whiteCount: 4,
    pips: 4,
    special: null,
    label: '4白',
    shout: '',
    bonus: 0,
  };
  selectedPieceId = null;
  resultShown = false;
  busy = false;
  diceAnimating = false;
  for (const dialog of [dom.startDialog, dom.guideDialog, dom.restartDialog, dom.resultDialog]) {
    closeDialog(dialog);
  }
  hideToast();
  renderAll();
}

function exposeDebugApi() {
  const api = {
    version: SCHEME.version,
    startGame,
    openGuide,
    getState: () => ({
      mode: game.mode,
      phase: game.phase,
      currentPlayer: game.currentPlayer,
      round: game.round,
      plies: game.plies,
      scores: { ...game.scores },
      captures: { ...game.captures },
      specials: { ...game.specials },
      roll: game.roll ? { pips: game.roll.pips, label: game.roll.label, special: game.roll.special } : null,
      winner: game.winner,
      winReason: game.winReason,
      pieces: game.pieces
        .filter((piece) => piece.alive)
        .map((piece) => ({ id: piece.id, side: piece.side, type: piece.type, pos: piece.pos })),
      selectedPieceId,
      busy,
      legalMoves: getLegalMoves(game).map((move) => ({
        pieceId: move.pieceId,
        to: move.to,
        capture: move.capture?.type ?? null,
        capturesOwl: move.capturesOwl,
      })),
      lastLog: game.log.slice(-8).map((entry) => ({ kind: entry.kind, text: entry.text })),
    }),
    getLegalMoves: () =>
      getLegalMoves(game).map((move) => ({
        pieceId: move.pieceId,
        to: move.to,
        capture: move.capture?.type ?? null,
        capturesOwl: move.capturesOwl,
      })),
  };
  if (DEBUG_ENABLED) api.loadOwlCaptureScenario = loadOwlCaptureScenario;
  window.__liubo = Object.freeze(api);
}

function init() {
  mountBoard(dom.board);
  bindEvents();
  switchGuideTab('rules');
  renderAll();
  exposeDebugApi();
  document.body.dataset.appReady = 'true';
  document.body.dataset.gameMode = game.mode;

  window.requestAnimationFrame(() => {
    openDialog(dom.startDialog);
  });
}

init();
