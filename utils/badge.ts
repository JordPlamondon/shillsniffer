import type { HeuristicResult, ScoredHeuristicResult } from './heuristics';
import type { AnalysisResult, ConfidenceLevel } from './types';
import { getIndicatorSummary } from './heuristics';
import { log } from './debug';

const BADGE_CLASS = 'shillsniffer-badge';
const TOOLTIP_CLASS = 'shillsniffer-tooltip';

const ICONS = {
  scanEye: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/></svg>`,
  circleCheck: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
  alertTriangle: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  xCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  loader: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  alertCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
};

function getTwitterTheme(): 'light' | 'dim' | 'dark' {
  const bg = getComputedStyle(document.body).backgroundColor;
  if (bg === 'rgb(0, 0, 0)') return 'dark';
  if (bg.includes('21, 32, 43') || bg.includes('21,32,43')) return 'dim';
  return 'light';
}

function isDarkMode(): boolean {
  const theme = getTwitterTheme();
  return theme === 'dark' || theme === 'dim';
}

let stylesInjected = false;
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

function cleanupOrphanedTooltips(): void {
  const tooltips = document.querySelectorAll(`.${TOOLTIP_CLASS}`);
  let removed = 0;

  tooltips.forEach((tooltip) => {
    const badgeId = tooltip.getAttribute('data-badge-id');
    if (badgeId) {
      const badge = document.querySelector(`[data-tweet-id="${badgeId}"]`);
      if (!badge) {
        tooltip.remove();
        removed++;
      }
    }
  });

  if (removed > 0) {
    log(` Cleaned up ${removed} orphaned tooltip(s)`);
  }
}

export function injectStyles(): void {
  if (stylesInjected) return;

  const styles = document.createElement('style');
  styles.textContent = `
    .${BADGE_CLASS} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-right: 10px;
      padding: 6px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 9999px;
      cursor: pointer;
      user-select: none;
      vertical-align: middle;
      transition: opacity 0.15s, background 0.15s, transform 0.15s;
      position: relative;
      opacity: 0;
      animation: shillsniffer-fadein 0.3s ease-out forwards;
    }

    @keyframes shillsniffer-fadein {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }

    .${BADGE_CLASS}:hover { opacity: 0.8; }

    .${BADGE_CLASS}__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .${BADGE_CLASS}__icon svg { display: block; }

    .${BADGE_CLASS}--passive { background: rgba(107, 114, 128, 0.15); color: #6b7280; }
    .${BADGE_CLASS}--loading { background: rgba(156, 163, 175, 0.2); color: #6b7280; }
    .${BADGE_CLASS}--loading .${BADGE_CLASS}__icon { animation: shillsniffer-spin 1s linear infinite; }

    @keyframes shillsniffer-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .${BADGE_CLASS}--low { background: rgba(34, 197, 94, 0.15); color: #16a34a; }
    .${BADGE_CLASS}--medium { background: rgba(251, 191, 36, 0.15); color: #d97706; }
    .${BADGE_CLASS}--high { background: rgba(239, 68, 68, 0.15); color: #dc2626; }
    .${BADGE_CLASS}--error { background: rgba(239, 68, 68, 0.1); color: #9ca3af; }

    .${BADGE_CLASS}--dark.${BADGE_CLASS}--passive { background: rgba(156, 163, 175, 0.2); color: #9ca3af; }
    .${BADGE_CLASS}--dark.${BADGE_CLASS}--low { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
    .${BADGE_CLASS}--dark.${BADGE_CLASS}--medium { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
    .${BADGE_CLASS}--dark.${BADGE_CLASS}--high { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .${BADGE_CLASS}--dark.${BADGE_CLASS}--error { background: rgba(239, 68, 68, 0.15); color: #6b7280; }

    .${TOOLTIP_CLASS} {
      position: fixed !important;
      background: rgb(0, 0, 0) !important;
      background-color: rgb(0, 0, 0) !important;
      color: #ffffff !important;
      padding: 10px 14px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: 400 !important;
      white-space: normal !important;
      max-width: 320px !important;
      min-width: 200px !important;
      z-index: 2147483647 !important;
      opacity: 0;
      visibility: hidden;
      pointer-events: none !important;
      transition: opacity 0.15s, visibility 0.15s;
      box-shadow: 0 4px 20px rgba(0,0,0,0.8) !important;
      text-align: left !important;
      line-height: 1.5 !important;
      border: 1px solid #444 !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }

    .${TOOLTIP_CLASS}::before {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid #000000;
    }

    .${TOOLTIP_CLASS}__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 1px solid #333;
    }

    .${TOOLTIP_CLASS}__brand {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #888;
    }

    .${TOOLTIP_CLASS}__confidence { font-size: 11px; font-weight: 600; }
    .${TOOLTIP_CLASS}__confidence--low { color: #4ade80; }
    .${TOOLTIP_CLASS}__confidence--medium { color: #fbbf24; }
    .${TOOLTIP_CLASS}__confidence--high { color: #f87171; }

    .${TOOLTIP_CLASS}__title { font-weight: 500; margin-bottom: 4px; }
    .${TOOLTIP_CLASS}__detail { color: #9ca3af; font-size: 11px; margin-top: 4px; }
  `;

  document.head.appendChild(styles);
  stylesInjected = true;

  if (!cleanupIntervalId) {
    cleanupIntervalId = setInterval(cleanupOrphanedTooltips, 30000);
  }
}

function getConfidenceDisplay(level: ConfidenceLevel): { icon: string; label: string } {
  switch (level) {
    case 'low': return { icon: ICONS.circleCheck, label: 'Low Risk' };
    case 'medium': return { icon: ICONS.alertTriangle, label: 'Medium Risk' };
    case 'high': return { icon: ICONS.xCircle, label: 'High Risk' };
  }
}

export function createBadge(
  result: HeuristicResult,
  tweetId: string,
  onClick?: (badge: HTMLElement) => void
): HTMLElement {
  const badge = document.createElement('span');
  const darkClass = isDarkMode() ? `${BADGE_CLASS}--dark` : '';
  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--passive ${darkClass}`.trim();
  badge.setAttribute('data-shillsniffer', 'true');
  badge.setAttribute('data-tweet-id', tweetId);

  const icon = document.createElement('span');
  icon.className = `${BADGE_CLASS}__icon`;
  icon.innerHTML = ICONS.scanEye;
  badge.appendChild(icon);

  // Remove existing tooltip if Twitter recycled this DOM element
  const existingTooltip = document.querySelector(`[data-badge-id="${tweetId}"]`);
  if (existingTooltip) {
    existingTooltip.remove();
  }

  const tooltip = document.createElement('div');
  tooltip.className = TOOLTIP_CLASS;
  tooltip.setAttribute('data-badge-id', tweetId);

  const summary = getIndicatorSummary(result);
  tooltip.innerHTML = `
    <div class="${TOOLTIP_CLASS}__title">${summary || 'Commercial interest detected'}</div>
    <div class="${TOOLTIP_CLASS}__detail">Click to analyze with AI</div>
  `;

  document.body.appendChild(tooltip);
  badge.setAttribute('data-tooltip-id', tweetId);

  if (onClick) {
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(badge);
    });
  }

  badge.addEventListener('mouseenter', (e) => {
    e.stopPropagation();
    const rect = badge.getBoundingClientRect();
    const tooltipWidth = 280;
    const tooltipHeight = 80;
    const padding = 10;

    let left = rect.left + rect.width / 2;
    if (left - tooltipWidth / 2 < padding) {
      left = tooltipWidth / 2 + padding;
    } else if (left + tooltipWidth / 2 > window.innerWidth - padding) {
      left = window.innerWidth - tooltipWidth / 2 - padding;
    }

    let top: number;
    let transform: string;
    if (rect.top > tooltipHeight + padding) {
      top = rect.top - 8;
      transform = 'translate(-50%, -100%)';
    } else {
      top = rect.bottom + 8;
      transform = 'translate(-50%, 0)';
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.transform = transform;
    tooltip.style.opacity = '1';
    tooltip.style.visibility = 'visible';
  });

  badge.addEventListener('mouseleave', (e) => {
    e.stopPropagation();
    tooltip.style.opacity = '0';
    tooltip.style.visibility = 'hidden';
  });

  badge.addEventListener('mouseover', (e) => e.stopPropagation());
  badge.addEventListener('mouseout', (e) => e.stopPropagation());

  return badge;
}

function getTooltipForBadge(badge: HTMLElement): HTMLElement | null {
  const tooltipId = badge.getAttribute('data-tooltip-id');
  if (!tooltipId) {
    log(' No tooltip-id on badge');
    return null;
  }
  const tooltip = document.querySelector(`[data-badge-id="${tooltipId}"]`);
  if (!tooltip) {
    log(' Tooltip not found for id:', tooltipId);
  }
  return tooltip as HTMLElement | null;
}

export function setBadgeLoading(badge: HTMLElement): void {
  const darkClass = isDarkMode() ? `${BADGE_CLASS}--dark` : '';
  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--loading ${darkClass}`.trim();

  const icon = badge.querySelector(`.${BADGE_CLASS}__icon`);
  if (icon) {
    icon.innerHTML = ICONS.loader;
  }

  const tooltip = getTooltipForBadge(badge);
  if (tooltip) {
    tooltip.innerHTML = `
      <div class="${TOOLTIP_CLASS}__header">
        <span class="${TOOLTIP_CLASS}__brand">ShillSniffer</span>
      </div>
      <div class="${TOOLTIP_CLASS}__title">Analyzing with AI...</div>
    `;
  }
}

export function setBadgeResult(badge: HTMLElement, result: AnalysisResult): void {
  const { icon: iconHtml, label } = getConfidenceDisplay(result.confidence);
  const darkClass = isDarkMode() ? `${BADGE_CLASS}--dark` : '';

  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--${result.confidence} ${darkClass}`.trim();

  const icon = badge.querySelector(`.${BADGE_CLASS}__icon`);
  if (icon) {
    icon.innerHTML = iconHtml;
  }

  const tooltip = getTooltipForBadge(badge);
  if (tooltip) {
    const disclosedText = result.isDisclosed
      ? '<span style="color: #4ade80;">Disclosed</span>'
      : '<span style="color: #f87171;">Undisclosed</span>';

    tooltip.innerHTML = `
      <div class="${TOOLTIP_CLASS}__header">
        <span class="${TOOLTIP_CLASS}__brand">ShillSniffer</span>
        <span class="${TOOLTIP_CLASS}__confidence ${TOOLTIP_CLASS}__confidence--${result.confidence}">${label}</span>
      </div>
      <div class="${TOOLTIP_CLASS}__title">${result.explanation}</div>
      <div class="${TOOLTIP_CLASS}__detail">
        ${disclosedText} · ${result.businessConnection}
      </div>
    `;
  }
}

export function setBadgeError(badge: HTMLElement, error: string): void {
  const darkClass = isDarkMode() ? `${BADGE_CLASS}--dark` : '';
  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--error ${darkClass}`.trim();

  const icon = badge.querySelector(`.${BADGE_CLASS}__icon`);
  if (icon) {
    icon.innerHTML = ICONS.alertCircle;
  }

  const tooltip = getTooltipForBadge(badge);
  if (tooltip) {
    tooltip.innerHTML = `
      <div class="${TOOLTIP_CLASS}__header">
        <span class="${TOOLTIP_CLASS}__brand">ShillSniffer</span>
        <span class="${TOOLTIP_CLASS}__confidence" style="color: #9ca3af;">Error</span>
      </div>
      <div class="${TOOLTIP_CLASS}__title">Analysis failed</div>
      <div class="${TOOLTIP_CLASS}__detail">${error}</div>
    `;
  }
}

export function setBadgeLocalVerdict(
  badge: HTMLElement,
  confidence: ConfidenceLevel,
  reasons: string[]
): void {
  const { icon: iconHtml, label } = getConfidenceDisplay(confidence);
  const darkClass = isDarkMode() ? `${BADGE_CLASS}--dark` : '';

  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--${confidence} ${darkClass}`.trim();
  badge.setAttribute('data-local-verdict', 'true');

  const icon = badge.querySelector(`.${BADGE_CLASS}__icon`);
  if (icon) {
    icon.innerHTML = iconHtml;
  }

  const tooltip = getTooltipForBadge(badge);
  if (tooltip) {
    const reasonsList = reasons.slice(0, 3).map(r => `• ${r}`).join('<br>');

    tooltip.innerHTML = `
      <div class="${TOOLTIP_CLASS}__header">
        <span class="${TOOLTIP_CLASS}__brand">ShillSniffer</span>
        <span class="${TOOLTIP_CLASS}__confidence ${TOOLTIP_CLASS}__confidence--${confidence}">${label}</span>
      </div>
      <div class="${TOOLTIP_CLASS}__title" style="font-size: 11px; line-height: 1.4;">${reasonsList}</div>
      <div class="${TOOLTIP_CLASS}__detail" style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #333;">
        <span style="color: #666;">Local analysis</span> · Click to verify with AI
      </div>
    `;
  }
}

export function setBadgeCachedResult(badge: HTMLElement, result: AnalysisResult): void {
  const { icon: iconHtml, label } = getConfidenceDisplay(result.confidence);
  const darkClass = isDarkMode() ? `${BADGE_CLASS}--dark` : '';

  badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--${result.confidence} ${darkClass}`.trim();
  badge.setAttribute('data-cached', 'true');

  const icon = badge.querySelector(`.${BADGE_CLASS}__icon`);
  if (icon) {
    icon.innerHTML = iconHtml;
  }

  const tooltip = getTooltipForBadge(badge);
  if (tooltip) {
    const disclosedText = result.isDisclosed
      ? '<span style="color: #4ade80;">Disclosed</span>'
      : '<span style="color: #f87171;">Undisclosed</span>';

    tooltip.innerHTML = `
      <div class="${TOOLTIP_CLASS}__header">
        <span class="${TOOLTIP_CLASS}__brand">ShillSniffer</span>
        <span class="${TOOLTIP_CLASS}__confidence ${TOOLTIP_CLASS}__confidence--${result.confidence}">${label}</span>
      </div>
      <div class="${TOOLTIP_CLASS}__title">${result.explanation}</div>
      <div class="${TOOLTIP_CLASS}__detail">
        ${disclosedText} · ${result.businessConnection}
      </div>
      <div class="${TOOLTIP_CLASS}__detail" style="margin-top: 4px; color: #666;">
        Cached result · Click to refresh
      </div>
    `;
  }
}

export function hasLocalVerdict(badge: HTMLElement): boolean {
  return badge.getAttribute('data-local-verdict') === 'true';
}

export function hasCachedResult(badge: HTMLElement): boolean {
  return badge.getAttribute('data-cached') === 'true';
}

export function injectBadge(
  tweetElement: HTMLElement,
  result: HeuristicResult,
  tweetId: string,
  onClick?: (badge: HTMLElement) => void
): void {
  if (tweetElement.querySelector(`.${BADGE_CLASS}`)) {
    return;
  }

  const badge = createBadge(result, tweetId, onClick);

  // Try placing before Grok button first
  const grokButton = tweetElement.querySelector('button[aria-label="Grok actions"]');
  if (grokButton?.parentElement) {
    grokButton.parentElement.insertBefore(badge, grokButton);
    return;
  }

  // Try placing before the More/caret button
  const moreButton = tweetElement.querySelector('[data-testid="caret"]');
  if (moreButton?.parentElement?.parentElement) {
    const moreContainer = moreButton.parentElement.parentElement;
    moreContainer.parentElement?.insertBefore(badge, moreContainer);
    return;
  }

  // Fallback: after display name
  const userNameArea = tweetElement.querySelector('[data-testid="User-Name"]');
  if (!userNameArea) {
    return;
  }

  const firstLink = userNameArea.querySelector('a');
  if (firstLink?.parentElement) {
    firstLink.parentElement.insertBefore(badge, firstLink.nextSibling);
  }
}

export function hasBadge(tweetElement: HTMLElement): boolean {
  return tweetElement.querySelector(`.${BADGE_CLASS}`) !== null;
}

export function getBadgeByTweetId(tweetId: string): HTMLElement | null {
  return document.querySelector(`[data-tweet-id="${tweetId}"]`);
}
