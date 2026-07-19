"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string };
};

type SpeechRecognitionResultList = {
  length: number;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export function useSpeechRecognition({
  lang = "fr-FR",
  onFinalResult,
}: {
  lang?: string;
  onFinalResult: (text: string) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalResultRef = useRef(onFinalResult);
  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  });

  const isSupported =
    typeof window !== "undefined" && !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  const start = useCallback(() => {
    if (recognitionRef.current) return;
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    // continuous=true: keep listening across pauses instead of letting the
    // browser auto-stop (which can end the session without ever emitting a
    // "final" result — losing what was said). Sending is triggered
    // explicitly by stop(), not by waiting on isFinal.
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = "";
    let latestInterim = "";
    let finished = false;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalText += (finalText ? " " : "") + text.trim();
        } else {
          interim += text;
        }
      }
      latestInterim = interim;
      setInterimText(interim);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      setIsListening(false);
      setInterimText("");
      recognitionRef.current = null;
      const text = (finalText || latestInterim).trim();
      if (text) onFinalResultRef.current(text);
    };

    recognition.onend = finish;
    recognition.onerror = finish;

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { isListening, interimText, isSupported, start, stop };
}

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

export function speak(text: string, lang = "fr-FR") {
  if (!isSpeechSynthesisSupported() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  const frenchVoice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"));
  if (frenchVoice) utterance.voice = frenchVoice;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}
