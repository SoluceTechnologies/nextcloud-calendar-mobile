import { createRef } from 'react';
import { FlatList } from 'react-native';
import { render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';
import { AgendaView, type AgendaViewHandle } from '@/features/calendar/components/AgendaView';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

function renderAgenda() {
  const ref = createRef<AgendaViewHandle>();
  render(
    <AgendaView
      ref={ref}
      events={[]}
      date={new Date()}
      onPressEvent={jest.fn()}
      onPressCell={jest.fn()}
    />,
  );
  return ref;
}

describe('AgendaView scrollToToday', () => {
  let scrollSpy: jest.SpyInstance;

  beforeEach(() => {
    scrollSpy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  });

  afterEach(() => {
    scrollSpy.mockRestore();
  });

  it('collapses a double-press into a single scroll (#348)', () => {
    const ref = renderAgenda();

    ref.current!.scrollToToday();
    ref.current!.scrollToToday();

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ offset: expect.any(Number), animated: false });
  });

  it('scrolls again once the guard window has passed', () => {
    const ref = renderAgenda();
    const nowSpy = jest.spyOn(Date, 'now');
    let now = 1_000_000;
    nowSpy.mockImplementation(() => now);
    try {
      ref.current!.scrollToToday();
      now += 600;
      ref.current!.scrollToToday();
      expect(scrollSpy).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
