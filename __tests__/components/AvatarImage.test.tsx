import React from 'react';
import { render as rtlRender, screen } from '@testing-library/react-native';
import { AvatarImage } from '@/components/AvatarImage';
import { ThemeWrapper } from '../helpers/theme';
import type { Account } from '../../src/types';

const render = (ui: React.ReactElement, opts?: Parameters<typeof rtlRender>[1]) =>
  rtlRender(ui, { wrapper: ThemeWrapper, ...opts });

jest.mock('@/features/account/hooks/useAvatar');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { useAvatar } from '@/features/account/hooks/useAvatar';
const mockUseAvatar = useAvatar as jest.MockedFunction<typeof useAvatar>;

const account: Account = {
  id: 'acc-1',
  displayName: 'John Doe',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'secret',
  davUserId: 'john',
};

describe('AvatarImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders an Image when avatarUri is available', () => {
    const dataUri = 'data:image/png;base64,abc123';
    mockUseAvatar.mockReturnValue({ data: dataUri } as ReturnType<typeof useAvatar>);

    render(<AvatarImage account={account} size={40} />);

    const allImages = screen.UNSAFE_getAllByType(require('react-native').Image);
    expect(allImages).toHaveLength(1);
    expect(allImages[0].props.source).toEqual({ uri: dataUri });
  });

  it('renders initials fallback when avatarUri is null', () => {
    mockUseAvatar.mockReturnValue({ data: null } as ReturnType<typeof useAvatar>);

    render(<AvatarImage account={account} size={40} />);

    expect(screen.getByText('JD')).toBeTruthy();
  });

  it('computes initials correctly for "John Doe" → "JD"', () => {
    mockUseAvatar.mockReturnValue({ data: null } as ReturnType<typeof useAvatar>);
    const acc = { ...account, displayName: 'John Doe' };

    render(<AvatarImage account={acc} size={40} />);
    expect(screen.getByText('JD')).toBeTruthy();
  });

  it('computes initials correctly for single name "Alice" → "A"', () => {
    mockUseAvatar.mockReturnValue({ data: null } as ReturnType<typeof useAvatar>);
    const acc = { ...account, displayName: 'Alice' };

    render(<AvatarImage account={acc} size={40} />);
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('computes initials correctly for "Mary Jane Watson" → "MJ" (max 2 chars)', () => {
    mockUseAvatar.mockReturnValue({ data: null } as ReturnType<typeof useAvatar>);
    const acc = { ...account, displayName: 'Mary Jane Watson' };

    render(<AvatarImage account={acc} size={40} />);
    expect(screen.getByText('MJ')).toBeTruthy();
  });
});
