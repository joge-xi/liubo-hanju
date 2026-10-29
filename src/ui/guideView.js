/**
 * 数字博物馆 / 考据面板渲染。
 * 内容与来源集中在 src/data/museum.js，避免界面代码另造历史说法。
 */

import {
  ARTIFACTS,
  EVIDENCE,
  GLOSSARY,
  LIMITATIONS,
  MUSEUM_SECTIONS,
  NETWORK_STATUS,
  PLAY_RULES,
  REFERENCES,
  SCHEME,
  getSourceById,
} from '../data/museum.js';
import { RULESET } from '../game/ruleset.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function badgeClass(status) {
  if (status.includes('现代')) return 'tag--modern';
  if (status === '学术假说') return 'tag--hypothesis';
  if (status === '待考证') return 'tag--unknown';
  if (status === '考古旁证') return 'tag--archaeology';
  if (status === '文献明确') return 'tag--documented';
  if (status === '文献可推') return 'tag--inferred';
  if (status.includes('混合')) return 'tag--mixed';
  return 'tag--neutral';
}

function sourceName(sourceId) {
  return getSourceById(sourceId)?.citation ?? sourceId;
}

function renderSourceList(sourceIds) {
  if (!sourceIds || sourceIds.length === 0) {
    return '<span class="source-empty">无直接文献依据 · 本作设定</span>';
  }
  return sourceIds
    .map((id) => `<span class="source-chip">${escapeHtml(sourceName(id))}</span>`)
    .join('');
}

function renderRulesPanel() {
  return `
    <div class="guide-hero">
      <div class="guide-seal" aria-hidden="true">局</div>
      <div>
        <p class="eyebrow">可玩方案 · ${escapeHtml(SCHEME.version)}</p>
        <h2>${escapeHtml(SCHEME.fullName)}</h2>
        <p>${escapeHtml(SCHEME.summary)}</p>
        <div class="hero-tags">
          <span class="tag tag--modern">非汉代原制</span>
          <span class="tag tag--documented">文献骨架</span>
          <span class="tag tag--hypothesis">复原假说</span>
          <span class="tag tag--modern">现代收束</span>
        </div>
      </div>
    </div>

    <div class="warning-card">
      <strong>先读再弈</strong>
      <p>${escapeHtml(SCHEME.designNote)} 游戏内所有“现代简化”都可以在“证据清单”里找到对应说明。</p>
    </div>

    <div class="guide-section-heading">
      <span>一</span>
      <div><p class="eyebrow">本局规则</p><h3>六步理解对局</h3></div>
    </div>
    <div class="rule-grid">
      ${PLAY_RULES.map(
        (rule) => `
        <article class="rule-card">
          <div class="rule-card-top">
            <span class="rule-index">${escapeHtml(rule.id.slice(1))}</span>
            <span class="tag ${badgeClass(rule.tag)}">${escapeHtml(rule.tag)}</span>
          </div>
          <h4>${escapeHtml(rule.title)}</h4>
          <p>${escapeHtml(rule.text)}</p>
          <small>${escapeHtml(rule.note)}</small>
        </article>`,
      ).join('')}
    </div>

    <div class="guide-section-heading">
      <span>二</span>
      <div><p class="eyebrow">盘中提示</p><h3>怎样看懂界面</h3></div>
    </div>
    <div class="two-col-copy">
      <div>
        <h4>棋子</h4>
        <p>圆形棋子中的“枭”有较大金边与四枚金点；“散”为较小的棋。朱方居南，玄方居北。被吃的棋子会从盘中移除，并在对局记录中留下记录。</p>
        <h4>合法落点</h4>
        <p>投箸后先点选一枚有光晕的己方棋子，盘面会出现落点。空位为金色小点；可吃子时出现朱色环。非法位置不会执行行动。</p>
      </div>
      <div>
        <h4>投箸与过手</h4>
        <p>六根箸翻转后显示白/黑面，白面数即步数。0 白无子可走，需要点“过”。五白或六白会有“呼五白”提示，并获得 1 筹现代奖励。</p>
        <h4>终局</h4>
        <p>任一方的枭被吃，立即结束。若 60 回合仍未杀枭，则比筹；同筹为和局。人机模式中你执朱方先手，电脑执玄方。</p>
      </div>
    </div>

    <div class="boundary-card">
      <p class="eyebrow">复原边界</p>
      <h3>哪些不是历史定论？</h3>
      <ul>
        ${LIMITATIONS.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
      <p class="boundary-note">完整证据与参考见“证据清单”“参考与局限”。</p>
    </div>
  `;
}

function renderEvidencePanel() {
  return `
    <div class="panel-intro">
      <p class="eyebrow">规则考据</p>
      <h2>证据、强度与不确定性</h2>
      <p>把“文献怎么说”“考古能证明什么”“本作补了什么”分开记录。标签不是装饰，而是规则修改时首先要检查的边界。</p>
      <div class="legend-row">
        <span class="tag tag--documented">文献明确</span>
        <span class="tag tag--inferred">文献可推</span>
        <span class="tag tag--archaeology">考古旁证</span>
        <span class="tag tag--hypothesis">学术假说</span>
        <span class="tag tag--unknown">待考证</span>
        <span class="tag tag--modern">现代简化</span>
      </div>
    </div>

    <div class="evidence-list">
      ${EVIDENCE.map(
        (item) => `
        <article class="evidence-card">
          <div class="evidence-rail">
            <span class="evidence-id">${escapeHtml(item.id)}</span>
            <span class="tag ${badgeClass(item.status)}">${escapeHtml(item.status)}</span>
            <span class="confidence">证据强度：${escapeHtml(item.confidence)}</span>
          </div>
          <div class="evidence-main">
            <div class="evidence-kicker">${escapeHtml(item.category)}</div>
            <h3>${escapeHtml(item.claim)}</h3>
            <p>${escapeHtml(item.evidence)}</p>
            <div class="evidence-note"><strong>不确定处</strong>${escapeHtml(item.uncertainty)}</div>
            <div class="evidence-rule"><strong>本作处理</strong>${escapeHtml(item.ruleUse)}</div>
            <div class="source-row">${renderSourceList(item.sources)}</div>
          </div>
        </article>`,
      ).join('')}
    </div>
  `;
}

function renderMuseumPanel() {
  return `
    <div class="panel-intro">
      <p class="eyebrow">器物与图像</p>
      <h2>数字展廊</h2>
      <p>从盘面纹样、棋子与投具，看六博如何进入汉代人的宴席、墓葬与数术世界。</p>
    </div>

    <div class="museum-sections">
      ${MUSEUM_SECTIONS.map(
        (section) => `
        <article class="museum-article">
          <div class="museum-copy">
            <p class="eyebrow">${escapeHtml(section.kicker)}</p>
            <h3>${escapeHtml(section.title)}</h3>
            ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
            <blockquote>${escapeHtml(section.pullQuote)}</blockquote>
          </div>
          <div class="museum-mark" aria-hidden="true">${escapeHtml(section.id === 'board' ? '局' : section.id === 'pieces' ? '棋' : section.id === 'life' ? '弈' : section.id === 'lost' ? '佚' : '博')}</div>
        </article>`,
      ).join('')}
    </div>

    <div class="guide-section-heading">
      <span>器</span>
      <div><p class="eyebrow">代表性材料</p><h3>出土与图像</h3></div>
    </div>
    <div class="artifact-grid">
      ${ARTIFACTS.map(
        (artifact) => `
        <article class="artifact-card">
          <span class="tag tag--archaeology">${escapeHtml(artifact.tag)}</span>
          <h3>${escapeHtml(artifact.title)}</h3>
          <p class="artifact-meta">${escapeHtml(artifact.meta)}</p>
          <p>${escapeHtml(artifact.text)}</p>
        </article>`,
      ).join('')}
    </div>
  `;
}

function renderSourcesPanel() {
  return `
    <div class="panel-intro">
      <p class="eyebrow">参考与边界</p>
      <h2>资料从哪来，结论停在哪</h2>
      <p>本页把文献引文、考古材料、研究著作和数字复原项目分开列出。凡是无法坐实的内容，都要在规则中保留不确定标记。</p>
    </div>

    <div class="network-card">
      <span class="network-dot" aria-hidden="true"></span>
      <div>
        <p class="eyebrow">网络核验状态 · ${escapeHtml(NETWORK_STATUS.checkedAt)}</p>
        <h3>${escapeHtml(NETWORK_STATUS.summary)}</h3>
        <ul>${NETWORK_STATUS.details.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        <p class="network-consequence">${escapeHtml(NETWORK_STATUS.consequence)}</p>
      </div>
    </div>

    <div class="guide-section-heading">
      <span>献</span>
      <div><p class="eyebrow">参考文献</p><h3>文本、考古与研究</h3></div>
    </div>
    <div class="reference-list">
      ${REFERENCES.map(
        (reference) => `
        <article class="reference-card">
          <div class="reference-kind">${escapeHtml(reference.kind)}</div>
          <h3>${escapeHtml(reference.citation)}</h3>
          ${reference.quote ? `<blockquote>${escapeHtml(reference.quote)}</blockquote>` : ''}
          <p>${escapeHtml(reference.note)}</p>
          ${
            reference.url
              ? `<a class="reference-link" href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">访问来源 ↗</a>`
              : ''
          }
        </article>`,
      ).join('')}
    </div>

    <div class="version-card">
      <p class="eyebrow">规则版本</p>
      <div class="version-heading">
        <h3>${escapeHtml(RULESET.fullName)}</h3>
        <span>v${escapeHtml(RULESET.version)}</span>
      </div>
      <p>${escapeHtml(RULESET.status)}。发布于 ${escapeHtml(RULESET.releasedAt)}；规则配置与界面分离，可按新证据替换。</p>
      <ol class="changelog">
        ${RULESET.changelog
          .map(
            (entry) =>
              `<li><b>v${escapeHtml(entry.version)}</b><span>${escapeHtml(entry.date)}</span>${escapeHtml(entry.note)}</li>`,
          )
          .join('')}
      </ol>
      <p class="version-note">维护提示：修改 <code>src/game/ruleset.js</code>、<code>src/game/board.js</code> 的规则参数后，应同步更新证据标签、本页版本记录与 <code>tests/</code>，再递增版本号。</p>
    </div>

    <div class="boundary-card">
      <p class="eyebrow">仍待确认</p>
      <h3>发布前应继续做的事</h3>
      <ul>${LIMITATIONS.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>

    <div class="guide-section-heading">
      <span>词</span>
      <div><p class="eyebrow">术语</p><h3>快速索引</h3></div>
    </div>
    <dl class="glossary">
      ${GLOSSARY.map(
        (item) => `<div><dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.text)}</dd></div>`,
      ).join('')}
    </dl>

    <p class="colophon">版本 ${escapeHtml(SCHEME.version)} · 初版 ${escapeHtml(SCHEME.releasedAt)} · 规则与内容可在新证据出现后替换。</p>
  `;
}

const PANEL_RENDERERS = {
  rules: renderRulesPanel,
  evidence: renderEvidencePanel,
  museum: renderMuseumPanel,
  sources: renderSourcesPanel,
};

export function renderGuidePanel(tab = 'rules') {
  const renderer = PANEL_RENDERERS[tab] ?? PANEL_RENDERERS.rules;
  return renderer();
}

export const GUIDE_TABS = Object.freeze([
  { id: 'rules', label: '如何对弈' },
  { id: 'evidence', label: '证据清单' },
  { id: 'museum', label: '器物图谱' },
  { id: 'sources', label: '参考与局限' },
]);
