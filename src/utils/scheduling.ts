import { InteractionManager } from 'react-native';

export function yieldToUI(maxWaitMs = 250): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    setTimeout(() => {
      InteractionManager.runAfterInteractions(finish);
    }, 0);
    setTimeout(finish, maxWaitMs);
  });
}
