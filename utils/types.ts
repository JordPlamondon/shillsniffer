export type TweetType = 'original' | 'reply' | 'quote' | 'retweet';

export interface TweetData {
  id: string;
  text: string;
  author: AuthorData;
  element: HTMLElement;
  tweetType: TweetType;
  replyingTo?: string;
}

export interface AuthorData {
  name: string;
  handle: string;
  bio?: string;
}

export type LLMProvider = 'groq' | 'ollama';

export interface Settings {
  llmProvider: LLMProvider;
  apiKey: string;
  ollamaUrl: string;
  ollamaModel: string;
  showPassiveIndicators: boolean;
  enableAiAnalysis: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  llmProvider: 'groq',
  apiKey: '',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  showPassiveIndicators: true,
  enableAiAnalysis: true,
};

export const OLLAMA_MODELS = [
  'llama3.2',
  'llama3.1',
  'mistral',
  'phi3',
  'gemma2',
  'qwen2.5',
] as const;

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface AnalysisResult {
  confidence: ConfidenceLevel;
  hasCommercialInterest: boolean;
  isDisclosed: boolean;
  explanation: string;
  businessConnection: string;
}

export interface CachedAuthor {
  handle: string;
  bio: string;
  commercialIndicators: string[];
  lastAnalyzed: number;
  analysisResult?: AnalysisResult;
}
