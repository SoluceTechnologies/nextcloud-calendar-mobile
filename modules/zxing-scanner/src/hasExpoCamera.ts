import { requireOptionalNativeModule } from 'expo';

export const hasExpoCamera = requireOptionalNativeModule('ExpoCamera') != null;
