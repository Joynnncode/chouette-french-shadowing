import { useSyncExternalStore } from "react";

export type AiProvider = "anthropic" | "openai";

export type AiSettings = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

const STORAGE_KEY = "chouette-ai-settings";

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.4-mini",
};

export function loadAiSettings(): AiSettings | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiSettings;
  } catch {
    return null;
  }
}

export function saveAiSettings(settings: AiSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event("chouette-ai-settings-changed"));
}

function subscribeToAiSettings(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("chouette-ai-settings-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("chouette-ai-settings-changed", callback);
  };
}

function getHasAiKeySnapshot() {
  return !!loadAiSettings()?.apiKey;
}

function getHasAiKeyServerSnapshot() {
  return false;
}

export function useHasAiKey() {
  return useSyncExternalStore(
    subscribeToAiSettings,
    getHasAiKeySnapshot,
    getHasAiKeyServerSnapshot,
  );
}
