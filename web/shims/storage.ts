// Хранилище браузера может быть недоступно, тогда данные живут до закрытия страницы
const memory = new Map<string, string>();

const AsyncStorage = {
  async getItem(key: string) {
    try {
      return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async setItem(key: string, value: string) {
    memory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Значение уже в памяти
    }
  },
};

export default AsyncStorage;
