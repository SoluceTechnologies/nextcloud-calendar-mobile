import { TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeWrapper } from '../../helpers/theme';
import { SearchField } from '@/features/search/components/SearchField';
import { EMPTY_MODEL, reduceSearch } from '@/features/search/searchModel';
import type { SearchModel } from '@/features/search/searchModel';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const typed = (text: string): SearchModel => reduceSearch(EMPTY_MODEL, { type: 'input', text }, () => null);

function setup(model: SearchModel) {
  const handlers = {
    onChangeInput: jest.fn(),
    onBackspaceEmpty: jest.fn(),
    onSubmit: jest.fn(),
    onBlur: jest.fn(),
    onSelectToken: jest.fn(),
    onRemoveToken: jest.fn(),
    onClear: jest.fn(),
  };
  const view = render(<SearchField model={model} {...handlers} />, { wrapper: ThemeWrapper });
  return { ...handlers, rerender: view.rerender, props: handlers };
}

const backspace = () =>
  fireEvent(screen.getByTestId('search-input'), 'keyPress', { nativeEvent: { key: 'Backspace' } });

it('shows tokens as pills and the pending key', () => {
  setup(reduceSearch(typed('calendar:perso '), { type: 'startFilter', key: 'attendee' }, () => null));
  expect(screen.getByTestId('token-calendar-perso')).toBeTruthy();
  expect(screen.getByTestId('pending-token')).toBeTruthy();
  expect(screen.getByText('attendee:')).toBeTruthy();
});

it('reports a backspace when the input is empty', () => {
  const handlers = setup(typed('calendar:perso '));
  backspace();
  expect(handlers.onBackspaceEmpty).toHaveBeenCalledTimes(1);
});

it('lets a backspace inside typed text through', () => {
  const handlers = setup(typed('dentist'));
  backspace();
  expect(handlers.onBackspaceEmpty).not.toHaveBeenCalled();
});

it('selects a pill on tap and removes it from its cross once selected', () => {
  const model = typed('calendar:perso ');
  const id = model.segments[0].kind === 'token' ? model.segments[0].token.id : '';
  const handlers = setup({ ...model, selectedId: id });
  fireEvent.press(screen.getByTestId('token-calendar-perso'));
  expect(handlers.onSelectToken).toHaveBeenCalledWith(id);
  fireEvent.press(screen.getByTestId('token-remove-calendar-perso'));
  expect(handlers.onRemoveToken).toHaveBeenCalledWith(id);
});

it('offers removal as an accessibility action on a selected pill', () => {
  const model = typed('calendar:perso ');
  const id = model.segments[0].kind === 'token' ? model.segments[0].token.id : '';
  const handlers = setup({ ...model, selectedId: id });
  const pill = screen.getByTestId('token-calendar-perso');
  expect(pill).toHaveProp('accessibilityActions', [{ name: 'delete', label: 'search.removeFilter' }]);
  fireEvent(pill, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
  expect(handlers.onRemoveToken).toHaveBeenCalledWith(id);
});

it('shows no cross on a pill that is not selected', () => {
  setup(typed('calendar:perso '));
  expect(screen.queryByTestId('token-remove-calendar-perso')).toBeNull();
});

it('forwards typing, submit, blur and clear', () => {
  const handlers = setup(typed('dentist'));
  fireEvent.changeText(screen.getByTestId('search-input'), 'dentists');
  expect(handlers.onChangeInput).toHaveBeenCalledWith('dentists');
  fireEvent(screen.getByTestId('search-input'), 'submitEditing');
  expect(handlers.onSubmit).toHaveBeenCalled();
  fireEvent(screen.getByTestId('search-input'), 'blur');
  expect(handlers.onBlur).toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('common.clear'));
  expect(handlers.onClear).toHaveBeenCalled();
});

it('shows the placeholder and no clear button when empty', () => {
  setup(EMPTY_MODEL);
  expect(screen.getByTestId('search-input')).toHaveProp('placeholder', 'search.placeholder');
  expect(screen.getByTestId('search-input')).toHaveProp('accessibilityLabel', 'search.placeholder');
  expect(screen.queryByLabelText('common.clear')).toBeNull();
});

it('focuses the input when a key becomes pending, not while it stays pending', () => {
  const focus = jest.spyOn(TextInput.prototype, 'focus');
  focus.mockClear();
  const { rerender, props } = setup(EMPTY_MODEL);
  expect(focus).not.toHaveBeenCalled();
  const pending = reduceSearch(EMPTY_MODEL, { type: 'startFilter', key: 'calendar' }, () => null);
  rerender(<SearchField model={pending} {...props} />);
  expect(focus).toHaveBeenCalledTimes(1);
  rerender(<SearchField model={{ ...pending, input: 'de' }} {...props} />);
  expect(focus).toHaveBeenCalledTimes(1);
});
