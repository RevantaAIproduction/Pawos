import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { OnboardingState } from '../../shared/onboarding/OnboardingTypes';

const FILE_NAME = 'onboarding.json';

function defaultState(): OnboardingState {
  return { completed: false, step: 0, defaultWorkspacePath: null };
}

/** Persists first-run onboarding progress so an interrupted wizard resumes from where it left off, rather than restarting. */
class OnboardingStore {
  private file = '';
  private state: OnboardingState = defaultState();

  init(): void {
    this.file = path.join(app.getPath('userData'), FILE_NAME);
    try {
      this.state = { ...defaultState(), ...JSON.parse(fs.readFileSync(this.file, 'utf-8')) };
    } catch {
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  get(): OnboardingState {
    return this.state;
  }

  setStep(step: number): OnboardingState {
    this.state = { ...this.state, step };
    this.save();
    return this.state;
  }

  setDefaultWorkspacePath(defaultWorkspacePath: string | null): OnboardingState {
    this.state = { ...this.state, defaultWorkspacePath };
    this.save();
    return this.state;
  }

  complete(): OnboardingState {
    this.state = { ...this.state, completed: true };
    this.save();
    return this.state;
  }
}

export const onboardingStore = new OnboardingStore();
