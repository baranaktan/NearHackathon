import { useMemo } from 'react';
import { useAppState } from '../../state/context';
import { demoProgress, demoSteps } from './steps';

export function useDemoSteps() {
  const { state, identity } = useAppState();
  const steps = useMemo(() => demoSteps(state, identity?.metaAddress ?? null), [state, identity]);
  return { steps, ...demoProgress(steps), dismissed: state.demo.dismissed };
}
