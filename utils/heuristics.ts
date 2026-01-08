import type { TweetType } from './types';

export interface HeuristicResult {
  hasIndicators: boolean;
  matches: string[];
  category: 'role' | 'action' | 'funding' | 'company' | null;
}

export interface ScoredHeuristicResult extends HeuristicResult {
  score: number;
  scoreBreakdown: {
    bioRole: number;
    topicMatch: number;
    selfPromo: number;
    ownLink: number;
    engagementBait: number;
    affiliateLink: number;
    promoCode: number;
    selfReplyPromo: number;
    replyPenalty: number;
    questionBonus: number;
    competitorMention: number;
  };
  canShowLocalVerdict: boolean;
  suggestedConfidence: 'low' | 'medium' | 'high' | null;
  verdictReasons: string[];
  selfReplyAnalysis?: SelfReplyAnalysis;
}

const ROLE_TRIGGERS = [
  'founder', 'co-founder', 'cofounder', 'ceo', 'cto', 'coo', 'cfo', 'chief',
  'president', 'director', 'vp ', 'vice president', 'partner', 'gp',
  'general partner', 'managing partner', 'advisor', 'investor', 'angel', 'vc', 'venture',
];

const ACTION_TRIGGERS = [
  'building', 'built', 'creator of', 'created', 'making', 'working on',
  'running', 'leading', 'scaling', 'growing', 'launching', 'launched', 'started', 'starting',
];

const FUNDING_TRIGGERS = [
  'backed by', 'yc', 'y combinator', 'a16z', 'andreessen', 'sequoia', 'raised',
  'series a', 'series b', 'series c', 'seed', 'pre-seed', 'funding', 'funded',
];

const COMPANY_PATTERNS = [
  { pattern: /@(\w{2,})/g, type: 'handle' as const },
  { pattern: /(\w+)\.(?:com|io|ai|co|xyz|dev|app)\b/gi, type: 'domain' as const },
  { pattern: /\b(\w+)\s+(?:inc|llc|ltd|corp)\b/gi, type: 'entity' as const },
];

const SELF_PROMO_PHRASES = [
  'i built', 'we built', 'i created', 'we created', 'i made', 'we made',
  'we launched', 'i launched', 'just launched', 'just shipped',
  'check out my', 'check out our', "i've been working on", "we've been working on",
  'finally ready to share', 'excited to announce', 'proud to announce', 'introducing',
  'game changer', 'this changed everything', 'changed my life',
  'i use this every day', "i've been using", 'my new', 'our new', 'try my', 'try our',
  'free trial', 'try it free', 'sign up free', 'get started free', 'start free', 'for free at',
  'link in bio', 'dm me', 'dm for', 'send me a dm',
  'the app is called', 'the tool is called', 'the product is called', "it's called", 'called and it',
];

const ENGAGEMENT_BAIT_PHRASES = [
  "here's what i learned", "here's what we learned", "most people don't know",
  'unpopular opinion', 'hot take', 'thread', '🧵', '1/', '1)', 'a thread',
  'let me explain', "here's the thing", "here's why", 'stop doing this',
  'you need to know', 'nobody talks about', 'the secret to', 'how i', 'how we',
  "comment and i'll", "reply and i'll", "dm and i'll", "and i'll send", "and i'll hook",
  'hook you up', "i'll share", "i'll send you", 'drop a comment', 'leave a comment',
  'comment below', 'reply with', 'comment "', "comment '",
];

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  ai: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'gpt', 'chatgpt', 'claude', 'gemini', 'openai', 'anthropic', 'agents', 'neural', 'deep learning'],
  crypto: ['crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'blockchain', 'web3', 'defi', 'nft', 'token', 'solana', 'sol'],
  saas: ['saas', 'software', 'app', 'platform', 'tool', 'product', 'startup', 'b2b', 'b2c'],
  dev: ['developer', 'coding', 'programming', 'devtools', 'api', 'sdk', 'framework', 'open source', 'github'],
  marketing: ['marketing', 'growth', 'seo', 'content', 'brand', 'ads', 'advertising', 'social media'],
  finance: ['fintech', 'investing', 'trading', 'stocks', 'finance', 'banking', 'payments'],
};

const QUESTION_PATTERNS = [
  'what do you', 'what are you', 'how do you', 'how did you', 'anyone know',
  'does anyone', 'has anyone', 'can someone', "what's your", 'what is your',
  'who else', 'any recommendations', 'any suggestions', 'thoughts on',
  'what do you think', 'curious about', 'wondering if', 'anyone else', '?',
];

const RECOMMENDING_OTHERS_PATTERNS = [
  'you should try', 'check out @', 'highly recommend @', 'shoutout to @',
  'thanks to @', 'credit to @', 'love what @', 'impressed by @', 'congrats to @', 'props to @',
];

const AFFILIATE_URL_PARAMS = [
  'ref=', 'ref_code=', 'referral=', 'referrer=', 'via=', 'aff=', 'affiliate=',
  'affiliate_id=', 'partner=', 'partner_id=', 'promo=', 'coupon=', 'discount=',
  'tag=', 'ascsubtag=', 'linkcode=', 'linkid=',
  'afftrack=', 'sscid=', 'irclickid=', 'rfsn=',
  'ranmid=', 'raneaid=', 'ransiteid=', 'cjevent=', 'cjdata=',
  'awc=', 'awinaffid=', 'ps_partner_key=', 'ps_xid=',
  'tap_a=', 'tap_s=', 'fpr=',
  'utm_source=influencer', 'utm_source=twitter', 'utm_source=creator', 'utm_source=partner',
  'utm_medium=affiliate', 'utm_medium=influencer', 'utm_medium=partner',
  'utm_campaign=influencer', 'utm_campaign=affiliate',
];

const LINK_IN_BIO_DOMAINS = [
  'linktr.ee', 'linktree.com', 'beacons.ai', 'bio.link', 'linkbio.co',
  'tap.bio', 'lnk.bio', 'hoo.be', 'stan.store', 'koji.to', 'snipfeed.co', 'campsite.bio',
];

const PROMO_CODE_PATTERNS = [
  /\b(?:use|with|code|coupon|promo|discount)[:\s]+["']?([A-Z0-9]{3,20})["']?\b/i,
  /\b(?:code|coupon)[:\s]*["']?([A-Z0-9]{3,20})["']?\s*(?:for|to get|saves?|off)\b/i,
  /\b(\d{1,3})%?\s*off\s*(?:with|using|code)\b/i,
  /\bsave\s*(?:\$?\d+|[\d]+%)\s*(?:with|using|code)\b/i,
  /\b([A-Z]{2,}[\d]{1,4})\b.*?(?:\d{1,3}%|off|\$\d+)/i,
];

export interface AffiliateLinkResult {
  found: boolean;
  patterns: string[];
  matchesAuthorBusiness: boolean;
  domains: string[];
}

export function detectAffiliateLinks(
  tweetText: string,
  authorBio?: string,
  authorHandle?: string
): AffiliateLinkResult {
  const result: AffiliateLinkResult = {
    found: false,
    patterns: [],
    matchesAuthorBusiness: false,
    domains: [],
  };

  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const urls = tweetText.match(urlPattern) || [];

  const domainPattern = /\b([a-z0-9][-a-z0-9]*\.(?:com|io|ai|co|app|link|store|shop|xyz|dev|to|me|bio))\b/gi;
  const domains = tweetText.match(domainPattern) || [];

  const authorCompanies = authorBio ? extractCompaniesFromBio(authorBio, authorHandle || '') : [];

  for (const url of urls) {
    const lowerUrl = url.toLowerCase();

    for (const param of AFFILIATE_URL_PARAMS) {
      if (lowerUrl.includes(param)) {
        result.found = true;
        result.patterns.push(param.replace('=', ''));

        for (const company of authorCompanies) {
          if (lowerUrl.includes(company.toLowerCase())) {
            result.matchesAuthorBusiness = true;
          }
        }
      }
    }

    const domainMatch = url.match(/https?:\/\/(?:www\.)?([^\/\?]+)/i);
    if (domainMatch) {
      result.domains.push(domainMatch[1].toLowerCase());
    }
  }

  for (const domain of [...urls, ...domains]) {
    const lowerDomain = domain.toLowerCase();
    for (const libDomain of LINK_IN_BIO_DOMAINS) {
      if (lowerDomain.includes(libDomain)) {
        result.found = true;
        result.patterns.push('link-in-bio platform');
        result.domains.push(libDomain);
      }
    }
  }

  for (const domain of result.domains) {
    for (const company of authorCompanies) {
      if (domain.includes(company.toLowerCase()) || company.toLowerCase().includes(domain.split('.')[0])) {
        result.matchesAuthorBusiness = true;
      }
    }
  }

  result.patterns = [...new Set(result.patterns)];
  result.domains = [...new Set(result.domains)];

  return result;
}

export interface PromoCodeResult {
  found: boolean;
  codes: string[];
  phrases: string[];
}

export function detectPromoCode(tweetText: string): PromoCodeResult {
  const result: PromoCodeResult = {
    found: false,
    codes: [],
    phrases: [],
  };

  for (const pattern of PROMO_CODE_PATTERNS) {
    const matches = tweetText.match(pattern);
    if (matches) {
      result.found = true;
      result.phrases.push(matches[0]);
      if (matches[1]) {
        result.codes.push(matches[1]);
      }
    }
  }

  const explicitCode = tweetText.match(/\b(?:my|our|the|use)\s+code\b/i);
  if (explicitCode) {
    result.found = true;
    result.phrases.push(explicitCode[0]);
  }

  result.codes = [...new Set(result.codes)];
  result.phrases = [...new Set(result.phrases)];

  return result;
}

function extractCompaniesFromBio(bioText: string, authorHandle: string): string[] {
  const companies: string[] = [];

  if (authorHandle) {
    companies.push(authorHandle.replace('@', ''));
  }

  const mentions = bioText.match(/@(\w+)/g) || [];
  for (const mention of mentions) {
    companies.push(mention.slice(1));
  }

  const domainMatches = bioText.match(/(\w+)\.(?:com|io|ai|co|xyz|dev|app)\b/gi) || [];
  for (const domain of domainMatches) {
    const name = domain.split('.')[0];
    if (name.length > 2) companies.push(name);
  }

  const buildingPattern = /(?:building|founder of|created|ceo of|cto of|working on)\s+@?(\w+)/gi;
  let match;
  while ((match = buildingPattern.exec(bioText)) !== null) {
    if (match[1] && match[1].length > 2) {
      companies.push(match[1]);
    }
  }

  return [...new Set(companies)];
}

export function analyzeText(text: string): HeuristicResult {
  if (!text) {
    return { hasIndicators: false, matches: [], category: null };
  }

  const lowerText = text.toLowerCase();
  const matches: string[] = [];
  let category: HeuristicResult['category'] = null;

  for (const trigger of ROLE_TRIGGERS) {
    if (lowerText.includes(trigger)) {
      matches.push(trigger);
      if (!category) category = 'role';
    }
  }

  for (const trigger of ACTION_TRIGGERS) {
    if (lowerText.includes(trigger)) {
      matches.push(trigger);
      if (!category) category = 'action';
    }
  }

  for (const trigger of FUNDING_TRIGGERS) {
    if (lowerText.includes(trigger)) {
      matches.push(trigger);
      if (!category) category = 'funding';
    }
  }

  for (const { pattern, type } of COMPANY_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (name && name.length > 1 && !['the', 'and', 'for', 'with', 'from'].includes(name.toLowerCase())) {
        if (type === 'handle') {
          matches.push(`@${name}`);
        } else if (type === 'domain') {
          matches.push(`${name}.com`);
        } else {
          matches.push(name);
        }
        if (!category) category = 'company';
      }
    }
  }

  return {
    hasIndicators: matches.length > 0,
    matches: [...new Set(matches)],
    category,
  };
}

export function detectSelfPromotion(tweetText: string, bioText: string): boolean {
  if (!tweetText || !bioText) return false;

  const tweetLower = tweetText.toLowerCase();
  const bioLower = bioText.toLowerCase();

  const bioProducts: string[] = [];
  const productPatterns = [
    /(?:building|founder of|created|ceo of|working on)\s+@?(\w+)/gi,
    /@(\w+)/g,
  ];

  for (const pattern of productPatterns) {
    let match;
    while ((match = pattern.exec(bioLower)) !== null) {
      if (match[1] && match[1].length > 2) {
        bioProducts.push(match[1]);
      }
    }
  }

  for (const product of bioProducts) {
    if (tweetLower.includes(product)) {
      return true;
    }
  }

  return false;
}

function formatRole(role: string): string {
  const roleMap: Record<string, string> = {
    'founder': 'a Founder', 'co-founder': 'a Co-Founder', 'cofounder': 'a Co-Founder',
    'ceo': 'a CEO', 'cto': 'a CTO', 'coo': 'a COO', 'cfo': 'a CFO',
    'chief': 'a Chief Officer', 'president': 'a President', 'director': 'a Director',
    'vp ': 'a VP', 'vice president': 'a Vice President', 'partner': 'a Partner',
    'gp': 'a General Partner', 'general partner': 'a General Partner',
    'managing partner': 'a Managing Partner', 'advisor': 'an Advisor',
    'investor': 'an Investor', 'angel': 'an Angel Investor',
    'vc': 'a VC', 'venture': 'in Venture Capital',
  };
  return roleMap[role.toLowerCase()] || role;
}

export function getIndicatorSummary(result: HeuristicResult): string {
  if (!result.hasIndicators || result.matches.length === 0) {
    return '';
  }

  const firstMatch = result.matches[0];

  if (!firstMatch || firstMatch.trim() === '' || firstMatch === '@') {
    return 'Commercial interest detected';
  }

  switch (result.category) {
    case 'role': {
      const formatted = formatRole(firstMatch);
      if (formatted === firstMatch) {
        const capitalized = firstMatch.charAt(0).toUpperCase() + firstMatch.slice(1);
        return `Author is a ${capitalized}`;
      }
      return `Author is ${formatted}`;
    }

    case 'action': {
      const pastTense = ['built', 'created', 'launched', 'started', 'made'];
      const presentContinuous = ['building', 'making', 'working on', 'running', 'leading', 'scaling', 'growing', 'launching', 'starting'];

      if (pastTense.includes(firstMatch)) {
        return `Author has ${firstMatch} something`;
      } else if (presentContinuous.includes(firstMatch)) {
        return `Author is ${firstMatch} something`;
      } else if (firstMatch === 'creator of') {
        return 'Author is a creator';
      }
      return 'Author is actively building';
    }

    case 'funding':
      if (firstMatch === 'yc' || firstMatch === 'y combinator') return 'Y Combinator affiliated';
      if (firstMatch === 'a16z' || firstMatch === 'andreessen') return 'a16z affiliated';
      if (firstMatch === 'sequoia') return 'Sequoia affiliated';
      if (firstMatch.includes('series')) return `Has raised ${firstMatch.toUpperCase()} funding`;
      if (firstMatch === 'raised' || firstMatch === 'funded' || firstMatch === 'funding') return 'Has raised funding';
      if (firstMatch === 'seed' || firstMatch === 'pre-seed') return `${firstMatch.charAt(0).toUpperCase() + firstMatch.slice(1)}-funded`;
      if (firstMatch === 'backed by') return 'VC-backed';
      return 'Has funding ties';

    case 'company':
      if (firstMatch.startsWith('@') && firstMatch.length > 1) return `Linked to ${firstMatch}`;
      if (firstMatch.includes('.')) return `Linked to ${firstMatch}`;
      if (firstMatch.length > 1) return `Linked to ${firstMatch}`;
      return 'Has company ties';

    default:
      return 'Commercial interest detected';
  }
}

export function detectSelfPromoPhrase(tweetText: string): { found: boolean; phrases: string[] } {
  const lowerText = tweetText.toLowerCase();
  const found: string[] = [];

  for (const phrase of SELF_PROMO_PHRASES) {
    if (lowerText.includes(phrase)) {
      found.push(phrase);
    }
  }

  return { found: found.length > 0, phrases: found };
}

export function detectEngagementBait(tweetText: string): { found: boolean; patterns: string[] } {
  const lowerText = tweetText.toLowerCase();
  const found: string[] = [];

  for (const phrase of ENGAGEMENT_BAIT_PHRASES) {
    if (lowerText.includes(phrase)) {
      found.push(phrase);
    }
  }

  return { found: found.length > 0, patterns: found };
}

export function detectTopicMatch(tweetText: string, bioText: string): { matches: boolean; industry: string | null } {
  const tweetLower = tweetText.toLowerCase();
  const bioLower = bioText.toLowerCase();

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    const bioHasIndustry = keywords.some(kw => bioLower.includes(kw));
    if (!bioHasIndustry) continue;

    const tweetHasIndustry = keywords.some(kw => tweetLower.includes(kw));
    if (tweetHasIndustry) {
      return { matches: true, industry };
    }
  }

  return { matches: false, industry: null };
}

export function detectQuestion(tweetText: string): { isQuestion: boolean; patterns: string[] } {
  const lowerText = tweetText.toLowerCase();
  const found: string[] = [];

  for (const pattern of QUESTION_PATTERNS) {
    if (pattern === '?') {
      if (tweetText.includes('?')) {
        found.push('question mark');
      }
    } else if (lowerText.includes(pattern)) {
      found.push(pattern);
    }
  }

  return { isQuestion: found.length > 0, patterns: found };
}

export function detectRecommendingOthers(tweetText: string, bioText: string, authorHandle: string): { found: boolean; mentions: string[] } {
  const lowerText = tweetText.toLowerCase();
  const found: string[] = [];

  const bioCompanies = extractBioCompaniesLower(bioText, authorHandle);

  for (const pattern of RECOMMENDING_OTHERS_PATTERNS) {
    if (lowerText.includes(pattern)) {
      const patternIndex = lowerText.indexOf(pattern);
      const afterPattern = tweetText.slice(patternIndex + pattern.length);
      const mentionMatch = afterPattern.match(/@(\w+)/);
      if (mentionMatch) {
        const mentioned = mentionMatch[1].toLowerCase();
        if (!bioCompanies.includes(mentioned) && mentioned !== authorHandle.toLowerCase()) {
          found.push(`@${mentioned}`);
        }
      }
    }
  }

  const allMentions = tweetText.match(/@(\w+)/g) || [];
  for (const mention of allMentions) {
    const handle = mention.slice(1).toLowerCase();
    if (!bioCompanies.includes(handle) && handle !== authorHandle.toLowerCase()) {
      if (!found.includes(mention)) {
        found.push(mention);
      }
    }
  }

  return { found: found.length > 0, mentions: [...new Set(found)] };
}

function extractBioCompaniesLower(bioText: string, authorHandle: string): string[] {
  const companies: string[] = [authorHandle.toLowerCase()];

  if (!bioText) return companies;

  const mentions = bioText.match(/@(\w+)/g) || [];
  for (const mention of mentions) {
    companies.push(mention.slice(1).toLowerCase());
  }

  const domains = bioText.match(/(\w+)\.(?:com|io|ai|co|xyz|dev|app)\b/gi) || [];
  for (const domain of domains) {
    const name = domain.split('.')[0].toLowerCase();
    if (name.length > 2) companies.push(name);
  }

  return [...new Set(companies)];
}

export function replyHasPromotionalSignals(tweetText: string, bioText: string, authorHandle: string): boolean {
  const lowerText = tweetText.toLowerCase();

  const selfPromo = detectSelfPromoPhrase(tweetText);
  if (selfPromo.found) return true;

  if (bioText) {
    const ownLinks = detectOwnLinks(tweetText, bioText, authorHandle);
    if (ownLinks.found) return true;
  }

  if (lowerText.includes('http://') || lowerText.includes('https://') || lowerText.includes('.com') || lowerText.includes('.io')) {
    return true;
  }

  if (lowerText.includes('check out') || lowerText.includes('try my') || lowerText.includes('try our')) {
    return true;
  }

  if (tweetText.length < 50) {
    const conversational = ['congrats', 'thanks', 'thank you', 'agree', 'yes', 'no', 'nice', 'great', 'awesome', 'amazing', 'love this', 'so true', 'exactly', 'same', 'lol', 'haha'];
    for (const phrase of conversational) {
      if (lowerText.includes(phrase)) return false;
    }
  }

  if (bioText) {
    const bioCompanies = extractBioCompaniesLower(bioText, authorHandle);
    for (const company of bioCompanies) {
      if (company !== authorHandle.toLowerCase() && lowerText.includes(company)) {
        return true;
      }
    }
  }

  return false;
}

function extractBioCompanies(bioText: string): string[] {
  const companies: string[] = [];

  for (const { pattern, type } of COMPANY_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(bioText)) !== null) {
      const name = match[1]?.toLowerCase();
      if (name && name.length > 1 && !['the', 'and', 'for', 'with', 'from', 'http', 'https'].includes(name)) {
        companies.push(type === 'handle' ? `@${name}` : name);
      }
    }
  }

  return [...new Set(companies)];
}

export function detectOwnLinks(tweetText: string, bioText: string, authorHandle: string): { found: boolean; links: string[] } {
  const tweetLower = tweetText.toLowerCase();
  const bioCompanies = extractBioCompanies(bioText);
  const found: string[] = [];

  for (const company of bioCompanies) {
    const companyName = company.replace('@', '').toLowerCase();
    if (tweetLower.includes(companyName) || tweetLower.includes(company.toLowerCase())) {
      found.push(company);
    }
    if (tweetLower.includes(`${companyName} .com`) || tweetLower.includes(`${companyName}.com`)) {
      found.push(company);
    }
  }

  if (tweetLower.includes(`@${authorHandle.toLowerCase()}`)) {
    found.push(`@${authorHandle}`);
  }

  const urlPattern = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+)\s*\.?\s*(?:com|io|ai|co|xyz|dev|app|link|sh)/gi;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(tweetText)) !== null) {
    const domain = urlMatch[1].toLowerCase();
    if (bioCompanies.some(c => c.toLowerCase().replace('@', '').includes(domain) || domain.includes(c.toLowerCase().replace('@', '')))) {
      found.push(domain);
    }
  }

  const namedPattern = /(?:called|named|is)\s+([a-z0-9]+)/gi;
  let namedMatch;
  while ((namedMatch = namedPattern.exec(tweetText)) !== null) {
    const name = namedMatch[1].toLowerCase();
    if (bioCompanies.some(c => c.toLowerCase().replace('@', '') === name)) {
      found.push(name);
    }
  }

  return { found: found.length > 0, links: [...new Set(found)] };
}

export function analyzeWithScore(
  tweetText: string,
  authorName: string,
  authorHandle: string,
  authorBio?: string,
  tweetType: TweetType = 'original'
): ScoredHeuristicResult {
  const nameResult = analyzeText(authorName);
  const bioResult = authorBio ? analyzeText(authorBio) : { hasIndicators: false, matches: [], category: null };
  const tweetResult = analyzeText(tweetText);

  const selfPromoCheck = detectSelfPromoPhrase(tweetText);
  const engagementBaitCheck = detectEngagementBait(tweetText);

  let baseResult: HeuristicResult;
  if (nameResult.hasIndicators) {
    baseResult = nameResult;
  } else if (bioResult.hasIndicators) {
    baseResult = bioResult;
  } else if (tweetResult.hasIndicators) {
    baseResult = tweetResult;
  } else if (selfPromoCheck.found || engagementBaitCheck.found) {
    const matches = [...selfPromoCheck.phrases, ...engagementBaitCheck.patterns];
    baseResult = { hasIndicators: true, matches, category: 'action' };
  } else {
    baseResult = { hasIndicators: false, matches: [], category: null };
  }

  const scoreBreakdown = {
    bioRole: 0,
    topicMatch: 0,
    selfPromo: 0,
    ownLink: 0,
    engagementBait: 0,
    affiliateLink: 0,
    promoCode: 0,
    selfReplyPromo: 0,
    replyPenalty: 0,
    questionBonus: 0,
    competitorMention: 0,
  };
  const verdictReasons: string[] = [];

  if (baseResult.hasIndicators) {
    scoreBreakdown.bioRole = 30;
    verdictReasons.push(`Author has commercial indicators: ${baseResult.matches.slice(0, 2).join(', ')}`);
  }

  if (authorBio) {
    const topicMatch = detectTopicMatch(tweetText, authorBio);
    if (topicMatch.matches) {
      scoreBreakdown.topicMatch = 40;
      verdictReasons.push(`Tweet topic (${topicMatch.industry}) matches their business`);
    }
  }

  const selfPromo = detectSelfPromoPhrase(tweetText);
  if (selfPromo.found) {
    scoreBreakdown.selfPromo = 20;
    verdictReasons.push(`Self-promotional language: "${selfPromo.phrases[0]}"`);
  }

  if (authorBio) {
    const ownLinks = detectOwnLinks(tweetText, authorBio, authorHandle);
    if (ownLinks.found) {
      scoreBreakdown.ownLink = 30;
      verdictReasons.push(`Mentions their own product: ${ownLinks.links.slice(0, 2).join(', ')}`);
    }
  }

  const engagementBait = detectEngagementBait(tweetText);
  if (engagementBait.found) {
    scoreBreakdown.engagementBait = 10;
    verdictReasons.push(`Engagement pattern: "${engagementBait.patterns[0]}"`);
  }

  const promoCodeCheck = detectPromoCode(tweetText);
  if (promoCodeCheck.found) {
    scoreBreakdown.promoCode = 35;
    verdictReasons.push(`Promo code detected: ${promoCodeCheck.codes[0] || promoCodeCheck.phrases[0]}`);
    if (!baseResult.hasIndicators) {
      baseResult.hasIndicators = true;
      baseResult.matches.push('promo code');
      baseResult.category = 'action';
    }
  }

  const affiliateCheck = detectAffiliateLinks(tweetText, authorBio, authorHandle);
  if (affiliateCheck.found) {
    if (affiliateCheck.matchesAuthorBusiness) {
      scoreBreakdown.affiliateLink = 25;
      verdictReasons.push(`Affiliate link to own product: ${affiliateCheck.domains[0]}`);
    } else if (baseResult.hasIndicators || promoCodeCheck.found || selfPromo.found) {
      scoreBreakdown.affiliateLink = 15;
      verdictReasons.push(`Tracking link detected: ${affiliateCheck.patterns[0]}`);
    }
  }

  if (tweetType === 'reply') {
    scoreBreakdown.replyPenalty = -20;
    verdictReasons.push('Reply (lower suspicion)');
  }

  const question = detectQuestion(tweetText);
  if (question.isQuestion && !selfPromo.found) {
    scoreBreakdown.questionBonus = -15;
    verdictReasons.push('Asking a question (lower suspicion)');
  }

  if (authorBio) {
    const recommendingOthers = detectRecommendingOthers(tweetText, authorBio, authorHandle);
    if (recommendingOthers.found && recommendingOthers.mentions.length > 0) {
      if (!selfPromo.found && scoreBreakdown.ownLink === 0) {
        scoreBreakdown.competitorMention = -20;
        verdictReasons.push(`Mentioning others: ${recommendingOthers.mentions.slice(0, 2).join(', ')}`);
      }
    }
  }

  const rawScore = Object.values(scoreBreakdown).reduce((a, b) => a + b, 0);
  const score = Math.max(0, rawScore);

  let canShowLocalVerdict = false;
  let suggestedConfidence: ScoredHeuristicResult['suggestedConfidence'] = null;

  if (score >= 80) {
    canShowLocalVerdict = true;
    suggestedConfidence = 'high';
  } else if (score >= 50) {
    canShowLocalVerdict = true;
    suggestedConfidence = 'medium';
  }

  return {
    ...baseResult,
    score,
    scoreBreakdown,
    canShowLocalVerdict,
    suggestedConfidence,
    verdictReasons,
  };
}

export interface PromotionalContentResult {
  isPromotional: boolean;
  signals: string[];
  promoCodes: string[];
  affiliateLinks: string[];
  strength: 'none' | 'weak' | 'moderate' | 'strong';
}

export function hasPromotionalContent(
  tweetText: string,
  authorBio?: string,
  authorHandle?: string
): PromotionalContentResult {
  const result: PromotionalContentResult = {
    isPromotional: false,
    signals: [],
    promoCodes: [],
    affiliateLinks: [],
    strength: 'none',
  };

  const promoCheck = detectPromoCode(tweetText);
  if (promoCheck.found) {
    result.isPromotional = true;
    result.promoCodes = promoCheck.codes;
    result.signals.push(`promo code: ${promoCheck.phrases[0]}`);
    result.strength = 'strong';
  }

  const affiliateCheck = detectAffiliateLinks(tweetText, authorBio, authorHandle);
  if (affiliateCheck.found) {
    result.isPromotional = true;
    result.affiliateLinks = affiliateCheck.domains;
    result.signals.push(...affiliateCheck.patterns.map(p => `affiliate: ${p}`));

    if (affiliateCheck.matchesAuthorBusiness) {
      result.signals.push('links to own product');
      result.strength = result.strength === 'strong' ? 'strong' : 'moderate';
    } else {
      result.strength = result.strength === 'strong' ? 'strong' : 'weak';
    }
  }

  const selfPromoCheck = detectSelfPromoPhrase(tweetText);
  if (selfPromoCheck.found) {
    result.isPromotional = true;
    result.signals.push(`self-promo: ${selfPromoCheck.phrases[0]}`);
    result.strength = result.strength === 'none' ? 'weak' : result.strength;
  }

  if (authorBio) {
    const ownLinks = detectOwnLinks(tweetText, authorBio, authorHandle || '');
    if (ownLinks.found) {
      result.isPromotional = true;
      result.signals.push(`mentions own product: ${ownLinks.links[0]}`);
      result.strength = result.strength === 'none' ? 'moderate' :
        result.strength === 'weak' ? 'moderate' : result.strength;
    }
  }

  return result;
}

export interface SelfReplyAnalysis {
  hasPromotionalSelfReply: boolean;
  promotionalContent: PromotionalContentResult[];
  promotionalReplyIds: string[];
  allSignals: string[];
}
