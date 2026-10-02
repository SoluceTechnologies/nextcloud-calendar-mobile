import { storage } from '../../src/storage';
import { legacyBackedStorage } from '../../src/stores/legacyStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('legacyBackedStorage', () => {
  beforeEach(() => {
    storage.remove('app-store');
    storage.remove('account-store');
  });

  it('returns the own key when present, ignoring legacy', () => {
    storage.set('account-store', JSON.stringify({ state: { activeAccountId: 'own' }, version: 0 }));
    storage.set('app-store', JSON.stringify({ state: { activeAccountId: 'legacy' }, version: 0 }));
    const s = legacyBackedStorage(['activeAccountId']);
    expect(JSON.parse(s.getItem('account-store')!).state.activeAccountId).toBe('own');
  });

  it('picks owned fields from the legacy app-store blob when own key is absent', () => {
    storage.set(
      'app-store',
      JSON.stringify({
        state: {
          activeAccountId: 'acc-9',
          viewMode: 'month',
          themePreference: 'dark',
          language: 'fr',
        },
        version: 0,
      })
    );
    const migrated = JSON.parse(legacyBackedStorage(['activeAccountId']).getItem('account-store')!);
    expect(migrated.state).toEqual({ activeAccountId: 'acc-9' });

    const calendar = JSON.parse(
      legacyBackedStorage(['viewMode', 'hiddenCalendarIds', 'hourRowHeight']).getItem('calendar-store')!
    );
    expect(calendar.state).toEqual({ viewMode: 'month' });
  });

  it('returns null when neither own key nor legacy has any owned field', () => {
    storage.set('app-store', JSON.stringify({ state: { viewMode: 'week' }, version: 0 }));
    expect(legacyBackedStorage(['activeAccountId']).getItem('account-store')).toBeNull();
  });

  it('returns null when nothing is stored at all', () => {
    expect(legacyBackedStorage(['activeAccountId']).getItem('account-store')).toBeNull();
  });
});
