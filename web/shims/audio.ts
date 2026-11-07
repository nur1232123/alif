// Запись голоса в веб-версии недоступна: страница внутри просмотрщика не получает микрофон.
// Проигрывание работает через обычный элемент audio.
export const RecordingPresets = { HIGH_QUALITY: {} };
export const AudioModule = { requestRecordingPermissionsAsync: async () => ({ granted: true }) };
export async function setAudioModeAsync() {}
export function useAudioRecorder() {
  return { uri: 'test.m4a', prepareToRecordAsync: async () => {}, record() {}, stop: async () => {} };
}

type Listener = (status: { didJustFinish: boolean }) => void;

export type AudioPlayer = ReturnType<typeof createAudioPlayer>;

export function createAudioPlayer(source: string) {
  const audio = typeof Audio !== 'undefined' ? new Audio(source) : null;
  return {
    play() {
      audio?.play().catch(() => {});
    },
    pause() {
      audio?.pause();
    },
    async seekTo(seconds: number) {
      if (audio) audio.currentTime = seconds;
    },
    replace(next: string) {
      if (audio) audio.src = next;
    },
    addListener(_event: 'playbackStatusUpdate', fn: Listener) {
      const handler = () => fn({ didJustFinish: true });
      audio?.addEventListener('ended', handler);
      return { remove: () => audio?.removeEventListener('ended', handler) };
    },
    remove() {
      audio?.pause();
    },
  };
}
