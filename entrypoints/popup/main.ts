import { storage } from 'wxt/storage';
import type { Settings, LLMProvider } from '../../utils/types';
import { DEFAULT_SETTINGS } from '../../utils/types';
import { getCacheStats, clearCache as clearAnalysisCache } from '../../utils/cache';

const settingsStorage = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

const llmProviderSelect = document.getElementById('llm-provider') as HTMLSelectElement;
const groqSettingsSection = document.getElementById('groq-settings') as HTMLElement;
const ollamaSettingsSection = document.getElementById('ollama-settings') as HTMLElement;
const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
const ollamaUrlInput = document.getElementById('ollama-url') as HTMLInputElement;
const ollamaModelSelect = document.getElementById('ollama-model') as HTMLSelectElement;
const passiveIndicatorsCheckbox = document.getElementById('passive-indicators') as HTMLInputElement;
const aiAnalysisCheckbox = document.getElementById('ai-analysis') as HTMLInputElement;
const cacheCountSpan = document.getElementById('cache-count') as HTMLSpanElement;
const clearCacheButton = document.getElementById('clear-cache') as HTMLButtonElement;

function updateProviderUI(provider: LLMProvider): void {
  if (provider === 'ollama') {
    groqSettingsSection.style.display = 'none';
    ollamaSettingsSection.style.display = 'block';
  } else {
    groqSettingsSection.style.display = 'block';
    ollamaSettingsSection.style.display = 'none';
  }
}

async function loadSettings(): Promise<void> {
  const settings = await settingsStorage.getValue();

  llmProviderSelect.value = settings.llmProvider;
  apiKeyInput.value = settings.apiKey;
  ollamaUrlInput.value = settings.ollamaUrl;
  ollamaModelSelect.value = settings.ollamaModel;
  passiveIndicatorsCheckbox.checked = settings.showPassiveIndicators;
  aiAnalysisCheckbox.checked = settings.enableAiAnalysis;

  updateProviderUI(settings.llmProvider);
  await updateCacheCount();
}

async function saveSettings(): Promise<void> {
  const settings: Settings = {
    llmProvider: llmProviderSelect.value as LLMProvider,
    apiKey: apiKeyInput.value.trim(),
    ollamaUrl: ollamaUrlInput.value.trim() || DEFAULT_SETTINGS.ollamaUrl,
    ollamaModel: ollamaModelSelect.value,
    showPassiveIndicators: passiveIndicatorsCheckbox.checked,
    enableAiAnalysis: aiAnalysisCheckbox.checked,
  };

  await settingsStorage.setValue(settings);
}

async function updateCacheCount(): Promise<void> {
  const stats = await getCacheStats();
  cacheCountSpan.textContent = stats.count.toString();
}

async function clearCache(): Promise<void> {
  await clearAnalysisCache();
  await updateCacheCount();
}

llmProviderSelect.addEventListener('change', () => {
  updateProviderUI(llmProviderSelect.value as LLMProvider);
  saveSettings();
});
apiKeyInput.addEventListener('input', saveSettings);
ollamaUrlInput.addEventListener('input', saveSettings);
ollamaModelSelect.addEventListener('change', saveSettings);
passiveIndicatorsCheckbox.addEventListener('change', saveSettings);
aiAnalysisCheckbox.addEventListener('change', saveSettings);
clearCacheButton.addEventListener('click', clearCache);

document.addEventListener('DOMContentLoaded', loadSettings);
