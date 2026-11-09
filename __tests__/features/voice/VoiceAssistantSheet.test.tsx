import type { ReactElement } from 'react';
import { render as rtlRender, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeWrapper } from '../../helpers/theme';
import { VoiceAssistantSheet, type VoiceSheetProps } from '@/features/voice/VoiceAssistantSheet';
import i18n from '@/utils/i18n';

const initialMetrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 0, height: 0 },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeWrapper>
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    </ThemeWrapper>
  );
}

const render = (ui: ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: Wrapper, ...opts });

const handlers = () => ({
  onSubmitText: jest.fn(),
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
  onPickCandidate: jest.fn(),
  onClose: jest.fn(),
  onRelisten: jest.fn(),
});

const baseProps = (over: Partial<VoiceSheetProps> = {}): VoiceSheetProps => ({
  visible: true,
  state: 'listening',
  transcript: '',
  ...handlers(),
  ...over,
});

describe('VoiceAssistantSheet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('always renders input, submit and close affordances', () => {
    const { getByTestId } = render(<VoiceAssistantSheet {...baseProps()} />);
    expect(getByTestId('voice-input')).toBeTruthy();
    expect(getByTestId('voice-submit')).toBeTruthy();
    expect(getByTestId('voice-close')).toBeTruthy();
  });

  it('listening shows the live transcript and no action buttons', () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <VoiceAssistantSheet {...baseProps({ transcript: 'dentist tomorrow' })} />,
    );
    expect(getByText('Listening…')).toBeTruthy();
    expect(getByText('dentist tomorrow')).toBeTruthy();
    expect(getByTestId('voice-input')).toBeTruthy();
    expect(queryByTestId('voice-confirm')).toBeNull();
    expect(queryByTestId('voice-candidate-0')).toBeNull();
  });

  it.each(['parsed', 'confirming'] as const)('%s shows intent card with confirm/cancel', (state) => {
    const h = handlers();
    const { getByTestId, getByText } = render(
      <VoiceAssistantSheet
        {...baseProps({ state, intentDescription: 'Create event tomorrow 2pm', ...h })}
      />,
    );
    expect(getByText('Create event tomorrow 2pm')).toBeTruthy();
    fireEvent.press(getByTestId('voice-confirm'));
    expect(h.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('voice-cancel'));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disambiguating lists candidates and reports the picked index', () => {
    const h = handlers();
    const { getByTestId, getByText } = render(
      <VoiceAssistantSheet
        {...baseProps({ state: 'disambiguating', candidates: ['Dentist', 'Dinner with Bob'], ...h })}
      />,
    );
    expect(getByText('Which one?')).toBeTruthy();
    expect(getByTestId('voice-candidate-0')).toBeTruthy();
    expect(getByTestId('voice-candidate-1')).toBeTruthy();
    fireEvent.press(getByTestId('voice-candidate-1'));
    expect(h.onPickCandidate).toHaveBeenCalledWith(1);
  });

  it('thinking shows the thinking label and disables submit', () => {
    const { getByTestId, getByText } = render(
      <VoiceAssistantSheet {...baseProps({ state: 'thinking' })} />,
    );
    expect(getByText('The server is thinking…')).toBeTruthy();
    expect(getByTestId('voice-submit')).toBeDisabled();
  });

  it('executing disables the submit button', () => {
    const { getByTestId } = render(<VoiceAssistantSheet {...baseProps({ state: 'executing' })} />);
    expect(getByTestId('voice-submit')).toBeDisabled();
  });

  it('replying shows the reply text', () => {
    const { getByText } = render(
      <VoiceAssistantSheet {...baseProps({ state: 'replying', reply: 'Event created.' })} />,
    );
    expect(getByText('Event created.')).toBeTruthy();
  });

  it('error shows errorText and retries with the transcript', () => {
    const h = handlers();
    const { getByTestId, getByText } = render(
      <VoiceAssistantSheet
        {...baseProps({ state: 'error', errorText: 'Server error', transcript: 'move dentist', ...h })}
      />,
    );
    expect(getByText('Server error')).toBeTruthy();
    fireEvent.press(getByTestId('voice-retry'));
    expect(h.onSubmitText).toHaveBeenCalledWith('move dentist');
  });

  it('error retry is disabled without a transcript or relisten handler', () => {
    const h = handlers();
    const { getByTestId } = render(
      <VoiceAssistantSheet
        {...baseProps({ state: 'error', errorText: 'Mic denied', ...h, onRelisten: undefined })}
      />,
    );
    expect(getByTestId('voice-retry')).toBeDisabled();
  });

  it('error retry falls back to relisten when there is no transcript', () => {
    const h = handlers();
    const { getByTestId } = render(
      <VoiceAssistantSheet {...baseProps({ state: 'error', errorText: 'Mic denied', ...h })} />,
    );
    fireEvent.press(getByTestId('voice-retry'));
    expect(h.onRelisten).toHaveBeenCalledTimes(1);
    expect(h.onSubmitText).not.toHaveBeenCalled();
  });

  it('mic button triggers relisten', () => {
    const h = handlers();
    const { getByTestId } = render(<VoiceAssistantSheet {...baseProps({ ...h })} />);
    fireEvent.press(getByTestId('voice-mic'));
    expect(h.onRelisten).toHaveBeenCalledTimes(1);
  });

  it('mic button is disabled without a relisten handler', () => {
    const h = handlers();
    const { getByTestId } = render(
      <VoiceAssistantSheet {...baseProps({ ...h, onRelisten: undefined })} />,
    );
    expect(getByTestId('voice-mic')).toBeDisabled();
  });

  it('submits typed text via the send button and clears the input', () => {
    const h = handlers();
    const { getByTestId } = render(<VoiceAssistantSheet {...baseProps({ ...h })} />);
    fireEvent.changeText(getByTestId('voice-input'), 'create lunch tomorrow 12h');
    fireEvent.press(getByTestId('voice-submit'));
    expect(h.onSubmitText).toHaveBeenCalledWith('create lunch tomorrow 12h');
    expect(getByTestId('voice-input').props.value).toBe('');
  });

  it('submits typed text via the keyboard submit action', () => {
    const h = handlers();
    const { getByTestId } = render(<VoiceAssistantSheet {...baseProps({ ...h })} />);
    fireEvent.changeText(getByTestId('voice-input'), 'what is on friday');
    fireEvent(getByTestId('voice-input'), 'submitEditing');
    expect(h.onSubmitText).toHaveBeenCalledWith('what is on friday');
  });

  it('does not submit an empty draft', () => {
    const h = handlers();
    const { getByTestId } = render(<VoiceAssistantSheet {...baseProps({ ...h })} />);
    expect(getByTestId('voice-submit')).toBeDisabled();
    fireEvent.press(getByTestId('voice-submit'));
    expect(h.onSubmitText).not.toHaveBeenCalled();
  });

  it('calls onClose from the close button', () => {
    const h = handlers();
    const { getByTestId } = render(<VoiceAssistantSheet {...baseProps({ ...h })} />);
    fireEvent.press(getByTestId('voice-close'));
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
