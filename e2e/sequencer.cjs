const Sequencer = require('@jest/test-sequencer').default;

// The account suite logs in and out on purpose. Running it last lets every other suite share the
// single session opened by the first flow instead of logging in again after it.
module.exports = class extends Sequencer {
  sort(tests) {
    const last = (t) => (t.path.endsWith('account.e2e.ts') ? 1 : 0);
    return super.sort(tests).sort((a, b) => last(a) - last(b));
  }
};
