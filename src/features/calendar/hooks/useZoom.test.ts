import { renderHook, act } from '@testing-library/react-native';
import { useZoom } from '@/features/calendar/hooks/useZoom';
import { useCalendarStore } from '@/stores/calendarStore';

const DEFAULT = 60;

beforeEach(() => {
  act(() => { useCalendarStore.getState().setHourRowHeight(DEFAULT); });
});

describe('useZoom', () => {
  it('seeds the live height from the committed store value', () => {
    const { result } = renderHook(() => useZoom());
    expect(result.current.cellHeight.value).toBe(DEFAULT);
    expect(result.current.hourRowHeight).toBe(DEFAULT);
  });

  it('rounds the height a gesture landed on before persisting it', () => {
    const { result } = renderHook(() => useZoom());

    act(() => { result.current.commitZoom(74.04); });

    expect(useCalendarStore.getState().hourRowHeight).toBe(74);
  });

  it('commits whatever the gesture reached, without clamping it again', () => {
    const { result } = renderHook(() => useZoom());

    act(() => { result.current.commitZoom(155.5); });

    expect(useCalendarStore.getState().hourRowHeight).toBe(156);
  });

  it('follows a store change made elsewhere, which is how the settings buttons work', () => {
    const { result } = renderHook(() => useZoom());

    act(() => { useCalendarStore.getState().setHourRowHeight(120); });

    expect(result.current.cellHeight.value).toBe(120);
    expect(result.current.hourRowHeight).toBe(120);
  });
});
