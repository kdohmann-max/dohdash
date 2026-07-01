import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "recording";

interface UseVoiceInput {
  voiceState: VoiceState;
  volumeBands: number[]; // 5 values, 0–1 each, mapped to speech frequency bands
  toggle: () => void;
  isSupported: boolean;
}

// Browser SpeechRecognition + AudioContext frequency analysis for live waveform.
// onUpdate(text) fires with accumulated finals + current interim so the caller
// can set their input state directly.
export function useVoiceInput(onUpdate: (text: string) => void): UseVoiceInput {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [volumeBands, setVolumeBands] = useState<number[]>([0, 0, 0, 0, 0]);

  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const finalTranscriptRef = useRef("");
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR: any =
    typeof window !== "undefined"
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null;
  const isSupported = SR != null;

  function stopAudio() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setVolumeBands([0, 0, 0, 0, 0]);
  }

  function pollVolume() {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    // Sample 5 bands across the speech frequency spectrum (fftSize=64 → 32 bins)
    const bins = [1, 3, 5, 8, 12];
    setVolumeBands(bins.map((i) => (data[i] ?? 0) / 255));
    rafRef.current = requestAnimationFrame(pollVolume);
  }

  async function startRecording() {
    if (!SR) return;
    finalTranscriptRef.current = "";

    // Audio visualization — non-blocking; recognition still works if mic is denied
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);
      pollVolume();
    } catch {
      // mic permission denied — waveform disabled, transcript still works
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscriptRef.current += e.results[i][0].transcript + " ";
        }
      }
      const interim = (Array.from(e.results) as any[])
        .filter((r) => !r.isFinal)
        .map((r) => r[0].transcript)
        .join("");
      onUpdateRef.current(finalTranscriptRef.current + interim);
    };

    rec.onend = () => {
      setVoiceState("idle");
      stopAudio();
    };

    rec.onerror = () => {
      setVoiceState("idle");
      stopAudio();
    };

    recognitionRef.current = rec;
    rec.start();
    setVoiceState("recording");
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceState("idle");
    stopAudio();
  }

  const toggle = useCallback(() => {
    if (voiceState === "idle") {
      void startRecording();
    } else {
      stopRecording();
    }
  }, [voiceState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopAudio();
    };
  }, []);

  return { voiceState, volumeBands, toggle, isSupported };
}
