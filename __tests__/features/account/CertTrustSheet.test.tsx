import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'expo-router';
import { lightTheme } from '../../../src/theme';
import { CertTrustSheet } from '@/features/account/components/CertTrustSheet';
import { UntrustedCertError } from '@/services/shared/trustedFetch';
import i18n from '../../../src/utils/i18n';

const err = new UntrustedCertError({
  type: 'untrusted_cert',
  host: '192.168.178.30:443',
  sha256: 'AB:CD:EF',
  subject: 'CN=nc.local',
  issuer: 'CN=nc.local',
  notBefore: '2026-01-01T00:00:00Z',
  notAfter: '2027-01-01T00:00:00Z',
});

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(ThemeProvider, { value: lightTheme, children });
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('CertTrustSheet', () => {
  it('shows the fingerprint and host, and buttons call handlers', () => {
    const onTrust = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(
      <CertTrustSheet error={err} onTrust={onTrust} onCancel={onCancel} />,
      { wrapper },
    );

    expect(getByText('AB:CD:EF')).toBeTruthy();
    expect(getByText(/192\.168\.178\.30:443/)).toBeTruthy();

    fireEvent.press(getByText('Trust & connect'));
    expect(onTrust).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders nothing visible when error is null', () => {
    const { queryByText } = render(
      <CertTrustSheet error={null} onTrust={jest.fn()} onCancel={jest.fn()} />,
      { wrapper },
    );
    expect(queryByText('Trust & connect')).toBeNull();
  });
});
