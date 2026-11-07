import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

// Звуки ответа. Включаются и выключаются в профиле.
const SOURCES = {
  right: require('../../assets/sounds/right.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
};

let enabled = true;
const players: Partial<Record<keyof typeof SOURCES, AudioPlayer>> = {};

export function setSfxEnabled(value: boolean) {
  enabled = value;
}

export function playSfx(name: keyof typeof SOURCES) {
  if (!enabled) return;
  try {
    players[name] ??= createAudioPlayer(SOURCES[name]);
    const player = players[name]!;
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Звук не обязателен: урок продолжается без него
  }
}
