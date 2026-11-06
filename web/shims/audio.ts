// В веб-версии записи нет: страница внутри просмотрщика не получает доступ к микрофону.
// Заглушка нужна, чтобы собрать общий код; голосовое задание здесь не появляется.
export const RecordingPresets = { HIGH_QUALITY: {} };
export const AudioModule = { requestRecordingPermissionsAsync: async () => ({ granted: true }) };
export async function setAudioModeAsync() {}
export function useAudioRecorder() {
  return { uri: 'test.m4a', prepareToRecordAsync: async () => {}, record() {}, stop: async () => {} };
}
