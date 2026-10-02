class MMKV {
  constructor() {
    this.store = new Map();
  }
  getString(key) {
    return this.store.has(key) ? this.store.get(key) : undefined;
  }
  getBoolean(key) {
    const value = this.store.get(key);
    return typeof value === 'boolean' ? value : false;
  }
  getNumber(key) {
    const value = this.store.get(key);
    return typeof value === 'number' ? value : 0;
  }
  set(key, value) {
    this.store.set(key, value);
  }
  contains(key) {
    return this.store.has(key);
  }
  remove(key) {
    return this.store.delete(key);
  }
  clearAll() {
    this.store.clear();
  }
  getAllKeys() {
    return Array.from(this.store.keys());
  }
}

function createMMKV() {
  return new MMKV();
}

module.exports = { MMKV, createMMKV };
