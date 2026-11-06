export const VoiceQuality = { Default: 'Default', Enhanced: 'Enhanced' } as const;

type Options = { language?: string; voice?: string; rate?: number };

const synth = () => (typeof window !== 'undefined' ? window.speechSynthesis : undefined);

export async function getAvailableVoicesAsync() {
  const s = synth();
  if (!s) return [];
  if (s.getVoices().length === 0) {
    // Браузер отдаёт голоса не сразу
    await new Promise<void>((done) => {
      const timer = setTimeout(done, 1500);
      s.addEventListener('voiceschanged', () => { clearTimeout(timer); done(); }, { once: true });
    });
  }
  return s.getVoices().map((v) => ({
    identifier: v.voiceURI,
    name: v.name,
    language: v.lang,
    quality: VoiceQuality.Default as string,
  }));
}

export function speak(text: string, options: Options = {}) {
  const s = synth();
  if (!s) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.language ?? 'ar-SA';
  utterance.rate = options.rate ?? 1;
  const voice = s.getVoices().find((v) => v.voiceURI === options.voice);
  if (voice) utterance.voice = voice;
  s.speak(utterance);
}

export function stop() {
  synth()?.cancel();
}
