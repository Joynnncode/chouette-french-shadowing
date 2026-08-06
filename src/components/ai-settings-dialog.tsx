"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import {
  DEFAULT_MODELS,
  loadAiSettings,
  saveAiSettings,
  type AiProvider,
} from "@/lib/ai-settings";

export function AiSettingsDialog() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODELS.gemini);

  function handleOpenChange(next: boolean) {
    if (next) {
      const existing = loadAiSettings();
      if (existing) {
        setProvider(existing.provider);
        setApiKey(existing.apiKey);
        setModel(existing.model);
      }
    }
    setOpen(next);
  }

  function handleProviderChange(value: AiProvider) {
    setProvider(value);
    setModel(DEFAULT_MODELS[value]);
  }

  function handleSave() {
    saveAiSettings({ provider, apiKey, model });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          AI settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your AI API key</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Bring your own API key — it&apos;s stored only in your browser and sent directly to
            power this chat. It never touches our database. Don&apos;t want to pay for one?{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Get a free Gemini key
            </a>
            .
          </p>
          <div className="flex flex-col gap-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => handleProviderChange(v as AiProvider)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Google (Gemini) — free tier</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider === "anthropic" ? "sk-ant-..." : provider === "gemini" ? "AIza..." : "sk-..."
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="model">Model</Label>
            <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!apiKey}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
