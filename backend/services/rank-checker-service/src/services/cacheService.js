const TTL_MS = 120 * 1000;

class InMemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  set(key, value, ttl = TTL_MS) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }
}

module.exports = {
  InMemoryCache,
  TTL_MS,
};
