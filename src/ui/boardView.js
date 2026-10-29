/**
 * SVG 博局渲染。
 *
 * 盘面纹样为装饰性重绘；棋子位置来自规则引擎。渲染层不判断规则，
 * 只把 state、合法着法和选中状态画出来。
 */

import { BOARD, getPosition } from '../game/board.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const STATIC_BOARD = `
  <defs>
    <radialGradient id="board-surface" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#3b2418"/>
      <stop offset="58%" stop-color="#2a1811"/>
      <stop offset="100%" stop-color="#140b08"/>
    </radialGradient>
    <radialGradient id="board-glow" cx="50%" cy="50%" r="52%">
      <stop offset="0%" stop-color="#b3854b" stop-opacity=".14"/>
      <stop offset="100%" stop-color="#b3854b" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="red-piece" x1="30%" y1="15%" x2="70%" y2="90%">
      <stop offset="0%" stop-color="#c8503c"/>
      <stop offset="46%" stop-color="#8f211b"/>
      <stop offset="100%" stop-color="#430b0a"/>
    </linearGradient>
    <linearGradient id="black-piece" x1="30%" y1="15%" x2="70%" y2="90%">
      <stop offset="0%" stop-color="#425550"/>
      <stop offset="44%" stop-color="#1b2926"/>
      <stop offset="100%" stop-color="#070c0b"/>
    </linearGradient>
    <linearGradient id="gold-rim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f0d49b"/>
      <stop offset="45%" stop-color="#b58a4d"/>
      <stop offset="100%" stop-color="#71512a"/>
    </linearGradient>
    <filter id="piece-shadow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".65"/>
    </filter>
    <filter id="target-glow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="gold-soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect x="22" y="22" width="956" height="956" rx="16" class="board-outer"/>
  <rect x="44" y="44" width="912" height="912" rx="8" fill="url(#board-surface)" class="board-surface"/>
  <rect x="44" y="44" width="912" height="912" rx="8" fill="none" class="board-edge"/>
  <rect x="66" y="66" width="868" height="868" rx="3" fill="url(#board-glow)" class="board-wash"/>
  <rect x="88" y="88" width="824" height="824" class="board-frame board-frame--outer"/>
  <rect x="112" y="112" width="776" height="776" class="board-frame board-frame--inner"/>

  <g class="corner-ornaments" aria-hidden="true">
    <path d="M 88 148 V 88 H 148 M 88 118 H 118 V 148"/>
    <path d="M 912 148 V 88 H 852 M 912 118 H 882 V 148"/>
    <path d="M 88 852 V 912 H 148 M 88 882 H 118 V 852"/>
    <path d="M 912 852 V 912 H 852 M 912 882 H 882 V 852"/>
  </g>

  <g class="tlv-pattern" aria-hidden="true">
    <rect x="350" y="350" width="300" height="300" class="tlv-square tlv-square--outer"/>
    <rect x="378" y="378" width="244" height="244" class="tlv-square tlv-square--inner"/>

    <path d="M 500 350 V 286 M 438 286 H 562" class="tlv-t"/>
    <path d="M 500 650 V 714 M 438 714 H 562" class="tlv-t"/>
    <path d="M 350 500 H 286 M 286 438 V 562" class="tlv-t"/>
    <path d="M 650 500 H 714 M 714 438 V 562" class="tlv-t"/>

    <path d="M 334 282 H 274 V 342" class="tlv-l"/>
    <path d="M 666 282 H 726 V 342" class="tlv-l"/>
    <path d="M 334 718 H 274 V 658" class="tlv-l"/>
    <path d="M 666 718 H 726 V 658" class="tlv-l"/>

    <path d="M 328 328 L 360 360 L 328 392" class="tlv-v"/>
    <path d="M 672 328 L 640 360 L 672 392" class="tlv-v"/>
    <path d="M 328 672 L 360 640 L 328 608" class="tlv-v"/>
    <path d="M 672 672 L 640 640 L 672 608" class="tlv-v"/>

    <circle cx="500" cy="500" r="86" class="center-ring"/>
    <circle cx="500" cy="500" r="74" class="center-ring center-ring--fine"/>
    <text x="500" y="524" class="center-seal">博</text>
    <text x="500" y="556" class="center-caption">汉 · 局</text>
  </g>

  <g class="route-layer">
    <rect x="150" y="150" width="700" height="700" class="route-path"/>
    <g class="route-dots"></g>
  </g>

  <g class="home-layer"></g>

  <g class="ornament-notes" aria-hidden="true">
    <text x="500" y="76" class="compass-note">玄方 · 北 · 顺时针</text>
    <text x="500" y="950" class="compass-note">朱方 · 南 · 逆时针</text>
    <text x="78" y="500" transform="rotate(-90 78 500)" class="compass-note compass-note--side">西</text>
    <text x="924" y="500" transform="rotate(90 924 500)" class="compass-note compass-note--side">东</text>
    <text x="500" y="909" class="home-caption home-caption--red">朱方起位</text>
    <text x="500" y="103" class="home-caption home-caption--black">玄方起位</text>
  </g>

  <g class="hint-under-layer"></g>
  <g class="piece-layer"></g>
  <g class="target-layer"></g>
  <g class="lastmove-layer"></g>
`;

function makeSvgEl(tag, attributes = {}, text = null) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) element.setAttribute(name, String(value));
  }
  if (text !== null) element.textContent = text;
  return element;
}

export function mountBoard(svg) {
  if (!(svg instanceof SVGElement)) throw new TypeError('mountBoard 需要 SVG 元素');
  svg.innerHTML = STATIC_BOARD;
  svg.setAttribute('viewBox', `0 0 ${BOARD.size} ${BOARD.size}`);
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', '六博博局，二十八位现代环形行棋线，双方各六枚棋子');

  const dots = svg.querySelector('.route-dots');
  for (const point of BOARD.track) {
    dots.append(
      makeSvgEl('circle', {
        cx: point.x,
        cy: point.y,
        r: 5,
        class: 'route-dot',
      }),
    );
  }

  const homes = svg.querySelector('.home-layer');
  for (const side of ['red', 'black']) {
    for (const position of BOARD.homePositions[side]) {
      const point = getPosition(position);
      homes.append(
        makeSvgEl('circle', {
          cx: point.x,
          cy: point.y,
          r: 29,
          class: `home-ring home-ring--${side}`,
        }),
      );
    }
  }

  return svg;
}

function pieceAriaLabel(piece, sideLabel) {
  const position = typeof piece.pos === 'number' ? `第 ${piece.pos + 1} 位` : '已被吃';
  return `${sideLabel}${piece.type === 'owl' ? '枭' : '散'}，${position}`;
}

function createPiece(piece, selected, movable = false) {
  const point = getPosition(piece.pos);
  const isOwl = piece.type === 'owl';
  const sideLabel = piece.side === 'red' ? '朱方' : '玄方';
  const group = makeSvgEl('g', {
    class: [
      'piece',
      `piece--${piece.side}`,
      isOwl ? 'piece--owl' : 'piece--scatter',
      selected ? 'is-selected' : '',
      movable ? 'is-movable' : '',
    ]
      .filter(Boolean)
      .join(' '),
    transform: `translate(${point.x} ${point.y})`,
    'data-piece-id': piece.id,
    'data-pos': piece.pos,
    tabindex: '0',
    role: 'button',
    'aria-label': `${pieceAriaLabel(piece, sideLabel)}。点击选择。`,
  });

  group.append(
    makeSvgEl('circle', {
      r: isOwl ? 31 : 26,
      class: 'piece-halo',
    }),
  );
  group.append(
    makeSvgEl('circle', {
      r: isOwl ? 27 : 22,
      class: 'piece-body',
      filter: 'url(#piece-shadow)',
    }),
  );
  group.append(
    makeSvgEl('circle', {
      r: isOwl ? 24 : 19,
      class: 'piece-face',
    }),
  );
  group.append(
    makeSvgEl('circle', {
      r: isOwl ? 18.5 : 14,
      class: 'piece-inner-ring',
    }),
  );
  group.append(
    makeSvgEl('text', {
      x: 0,
      y: isOwl ? 7 : 6,
      class: 'piece-glyph',
      'aria-hidden': 'true',
    }, isOwl ? '枭' : '散'),
  );

  if (isOwl) {
    for (let index = 0; index < 4; index += 1) {
      const angle = (Math.PI / 2) * index + Math.PI / 4;
      group.append(
        makeSvgEl('circle', {
          cx: Math.cos(angle) * 24.5,
          cy: Math.sin(angle) * 24.5,
          r: 1.7,
          class: 'piece-stud',
        }),
      );
    }
  }

  group.append(
    makeSvgEl('circle', {
      r: isOwl ? 37 : 31,
      class: 'piece-hit',
    }),
  );
  group.append(makeSvgEl('title', {}, `${pieceAriaLabel(piece, sideLabel)}${isOwl ? ' · 被吃即败' : ''}`));
  return group;
}

function createTarget(move) {
  const point = getPosition(move.to);
  const group = makeSvgEl('g', {
    class: `move-target ${move.capture ? 'is-capture' : ''} ${move.capturesOwl ? 'is-owl-capture' : ''}`,
    transform: `translate(${point.x} ${point.y})`,
    'data-to': move.to,
    tabindex: '0',
    role: 'button',
    'aria-label': move.capture
      ? `落子并吃${move.capture.type === 'owl' ? '枭' : '散'}`
      : `行至第 ${move.to + 1} 位`,
  });
  group.append(
    makeSvgEl('circle', {
      r: move.capture ? 34 : 19,
      class: 'target-halo',
      filter: 'url(#target-glow)',
    }),
  );
  group.append(
    makeSvgEl('circle', {
      r: move.capture ? 29 : 13,
      class: 'target-core',
    }),
  );
  if (!move.capture) {
    group.append(makeSvgEl('circle', { r: 4, class: 'target-pip' }));
  }
  group.append(makeSvgEl('circle', { r: 43, class: 'target-hit' }));
  return group;
}

function createLastMove(lastMove) {
  const layer = [];
  for (const [key, position] of [
    ['from', lastMove.from],
    ['to', lastMove.to],
  ]) {
    const point = getPosition(position);
    layer.push(
      makeSvgEl('circle', {
        cx: point.x,
        cy: point.y,
        r: key === 'from' ? 33 : 30,
        class: `last-move-ring last-move-ring--${key}`,
      }),
    );
  }
  return layer;
}

/**
 * @param {SVGElement} svg
 * @param {object} state
 * @param {{legalMoves?: object[], selectedPieceId?: string|null, showRoute?: boolean}} view
 */
export function renderBoard(svg, state, view = {}) {
  const legalMoves = view.legalMoves ?? [];
  const movableMoves = view.movableMoves ?? legalMoves;
  const selectedPieceId = view.selectedPieceId ?? null;

  svg.classList.toggle('hide-route', view.showRoute === false);

  const piecesLayer = svg.querySelector('.piece-layer');
  piecesLayer.replaceChildren();
  const activePieces = state.pieces.filter((piece) => piece.alive);
  const movableIds = new Set(movableMoves.map((move) => move.pieceId));
  for (const piece of activePieces) {
    piecesLayer.append(
      createPiece(piece, piece.id === selectedPieceId, movableIds.has(piece.id)),
    );
  }

  const underLayer = svg.querySelector('.hint-under-layer');
  underLayer.replaceChildren();
  if (selectedPieceId) {
    const selected = state.pieces.find((piece) => piece.id === selectedPieceId && piece.alive);
    if (selected) {
      const point = getPosition(selected.pos);
      underLayer.append(
        makeSvgEl('circle', {
          cx: point.x,
          cy: point.y,
          r: selected.type === 'owl' ? 41 : 36,
          class: 'selected-ring',
        }),
      );
    }
  }

  const targetLayer = svg.querySelector('.target-layer');
  targetLayer.replaceChildren();
  if (legalMoves.length > 0) {
    for (const move of legalMoves) targetLayer.append(createTarget(move));
  }

  const lastLayer = svg.querySelector('.lastmove-layer');
  lastLayer.replaceChildren();
  if (state.lastMove) {
    for (const ring of createLastMove(state.lastMove)) lastLayer.append(ring);
  }

  const activeCount = activePieces.length;
  svg.setAttribute(
    'aria-label',
    `六博博局，二十八位现代环形行棋线。盘上共 ${activeCount} 枚棋子。${
      state.phase === 'game-over' ? '对局已结束。' : ''
    }`,
  );
}
