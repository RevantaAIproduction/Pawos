import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { useCompanionProfiles } from '../../../companion/manager/useCompanionProfiles';
import { PERSONALITY_PRESETS } from '../../../companion/manager/CompanionProfileTypes';
import type { CompanionProfile, GreetingStyle, IdleBehaviorPreset, PersonalityPreset } from '../../../companion/manager/CompanionProfileTypes';
import { TTS_PROVIDER_CATALOG } from '../../../conversation/SpeechProviderRegistry';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';

type EditorTab = 'appearance' | 'voice' | 'behavior' | 'personality' | 'memory';

const PERSONALITY_PRESET_IDS: Exclude<PersonalityPreset, 'custom'>[] = ['friendly', 'professional', 'creative', 'teacher', 'assistant'];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Companion Editor — the five customization surfaces from the Runtime 10
 * spec, unified in one panel per the "reuse the existing Dashboard section
 * architecture" instruction (same tab-row pattern as CompanionLabSection).
 * Every control here is wired to a real, already-built mechanism — nothing
 * cosmetic-only. Appearance is the one honest exception: the 3D companion
 * has no hair/face/eyes/clothing slot system yet (see CompanionProfileTypes
 * and the skin system's own docs), so that tab says so directly instead of
 * offering controls that would do nothing.
 */
export function CompanionEditorPanel({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const { profiles, updatePersonality, updateVoice, updateBehavior, setMemoryEnabled, resetLocalMemory } = useCompanionProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  const [tab, setTab] = useState<EditorTab>('personality');

  if (!profile) return null;

  return (
    <div className={`${styles.card} ${styles.fadeInUp}`} style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className={styles.cardTitle}>Edit {profile.name}</h3>
        <button type="button" className={styles.chip} onClick={onClose}>
          Close
        </button>
      </div>

      <div className={styles.tabRow} style={{ marginTop: 12 }}>
        {(['personality', 'voice', 'behavior', 'memory', 'appearance'] as EditorTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tabButton} ${tab === t ? styles.tabButtonActive : ''}`}
            onClick={() => setTab(t)}
          >
            {capitalize(t)}
          </button>
        ))}
      </div>

      <div key={tab} className={styles.fadeInUp} style={{ marginTop: 16 }}>
        {tab === 'personality' && (
          <PersonalityTab profile={profile} onUpdate={(patch) => updatePersonality(profile.id, patch)} />
        )}
        {tab === 'voice' && <VoiceTab profile={profile} onUpdate={(patch) => updateVoice(profile.id, patch)} />}
        {tab === 'behavior' && <BehaviorTab profile={profile} onUpdate={(patch) => updateBehavior(profile.id, patch)} />}
        {tab === 'memory' && (
          <MemoryTab
            profile={profile}
            onSetEnabled={(enabled) => setMemoryEnabled(profile.id, enabled)}
            onReset={() => resetLocalMemory(profile.id)}
          />
        )}
        {tab === 'appearance' && <AppearanceTab profile={profile} />}
      </div>
    </div>
  );
}

function PersonalityTab({
  profile,
  onUpdate,
}: {
  profile: CompanionProfile;
  onUpdate: (patch: Partial<CompanionProfile['personality']>) => void;
}) {
  return (
    <div>
      <p className={styles.cardBody}>Choose a starting point, or write your own custom instructions below.</p>
      <div className={styles.quickActions}>
        {PERSONALITY_PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.chip}
            style={{ borderColor: profile.personality.preset === id ? 'var(--accent, #8b7bff)' : undefined }}
            onClick={() => onUpdate({ preset: id })}
          >
            {PERSONALITY_PRESETS[id].label}
          </button>
        ))}
        <button
          type="button"
          className={styles.chip}
          style={{ borderColor: profile.personality.preset === 'custom' ? 'var(--accent, #8b7bff)' : undefined }}
          onClick={() => onUpdate({ preset: 'custom' })}
        >
          Custom
        </button>
      </div>
      <p className={styles.cardBody} style={{ marginTop: 12 }}>
        Traits: {profile.personality.traits.join(', ') || 'none'}
      </p>
      <label className={styles.cardBody} style={{ display: 'block', marginTop: 8 }}>
        Additional instructions (always applied on top of the preset above)
      </label>
      <textarea
        defaultValue={profile.personality.systemPromptOverride ?? ''}
        onBlur={(e) => onUpdate({ systemPromptOverride: e.target.value })}
        rows={3}
        style={{ width: '100%', marginTop: 4, fontFamily: 'inherit' }}
      />
    </div>
  );
}

function VoiceTab({
  profile,
  onUpdate,
}: {
  profile: CompanionProfile;
  onUpdate: (patch: Partial<CompanionProfile['voice']>) => void;
}) {
  return (
    <div>
      <label className={styles.cardBody} style={{ display: 'block' }}>
        Voice provider
      </label>
      <select
        value={profile.voice.ttsProvider}
        onChange={(e) => onUpdate({ ttsProvider: e.target.value as CompanionProfile['voice']['ttsProvider'] })}
        style={{ marginTop: 4 }}
      >
        {TTS_PROVIDER_CATALOG.map((p) => (
          <option key={p.id} value={p.id} disabled={p.status === 'planned'}>
            {p.label}
            {p.status === 'planned' ? ' (not wired up yet)' : ''}
          </option>
        ))}
      </select>

      <label className={styles.cardBody} style={{ display: 'block', marginTop: 12 }}>
        Voice id (provider-specific, optional)
      </label>
      <input
        type="text"
        defaultValue={profile.voice.voiceId ?? ''}
        onBlur={(e) => onUpdate({ voiceId: e.target.value || undefined })}
        style={{ marginTop: 4 }}
      />

      <label className={styles.cardBody} style={{ display: 'block', marginTop: 12 }}>
        Speed: {(profile.voice.speed ?? 1).toFixed(2)}x
        {profile.voice.ttsProvider === 'elevenlabs' && ' (not applied — ElevenLabs has no speed parameter)'}
      </label>
      <input
        type="range"
        min={0.5}
        max={2}
        step={0.05}
        value={profile.voice.speed ?? 1}
        onChange={(e) => onUpdate({ speed: Number(e.target.value) })}
        style={{ width: '100%' }}
      />

      <label className={styles.cardBody} style={{ display: 'block', marginTop: 12 }}>
        Emotion (stored only — no current provider applies this yet)
      </label>
      <input
        type="text"
        defaultValue={profile.voice.emotion ?? ''}
        onBlur={(e) => onUpdate({ emotion: e.target.value || undefined })}
        style={{ marginTop: 4 }}
      />
    </div>
  );
}

function BehaviorTab({
  profile,
  onUpdate,
}: {
  profile: CompanionProfile;
  onUpdate: (patch: Partial<CompanionProfile['behavior']>) => void;
}) {
  return (
    <div>
      <label className={styles.cardBody} style={{ display: 'block' }}>
        Greeting style
      </label>
      <div className={styles.quickActions}>
        {(['enthusiastic', 'calm', 'silent'] as GreetingStyle[]).map((g) => (
          <button
            key={g}
            type="button"
            className={styles.chip}
            style={{ borderColor: profile.behavior.greetingStyle === g ? 'var(--accent, #8b7bff)' : undefined }}
            onClick={() => onUpdate({ greetingStyle: g })}
          >
            {capitalize(g)}
          </button>
        ))}
      </div>
      <p className={styles.cardBody} style={{ marginTop: 4, fontSize: 12 }}>
        Only one real greeting gesture exists today, so "enthusiastic" and "calm" look the same — "silent" genuinely skips it.
      </p>

      <label className={styles.cardBody} style={{ display: 'block', marginTop: 16 }}>
        Idle behavior
      </label>
      <div className={styles.quickActions}>
        {(['active', 'calm', 'minimal'] as IdleBehaviorPreset[]).map((b) => (
          <button
            key={b}
            type="button"
            className={styles.chip}
            style={{ borderColor: profile.behavior.idleBehavior === b ? 'var(--accent, #8b7bff)' : undefined }}
            onClick={() => onUpdate({ idleBehavior: b })}
          >
            {capitalize(b)}
          </button>
        ))}
      </div>
      <p className={styles.cardBody} style={{ marginTop: 4, fontSize: 12 }}>
        Controls real wander frequency and how quickly the companion falls asleep when untouched. Takes effect next time the companion appears (e.g. switching companions).
      </p>

      <label className={styles.cardBody} style={{ display: 'block', marginTop: 16 }}>
        Interaction style (free-form instructions layered onto every conversation)
      </label>
      <textarea
        defaultValue={profile.behavior.interactionStyle}
        onBlur={(e) => onUpdate({ interactionStyle: e.target.value })}
        rows={2}
        style={{ width: '100%', marginTop: 4, fontFamily: 'inherit' }}
      />
    </div>
  );
}

type MemorySummary = { goals: { id: string; text: string; completed: boolean }[]; routines: { id: string; description: string; cadence?: string }[]; linkedEntityCount: number };

function MemoryTab({
  profile,
  onSetEnabled,
  onReset,
}: {
  profile: CompanionProfile;
  onSetEnabled: (enabled: boolean) => void;
  onReset: () => void;
}) {
  const [summary, setSummary] = useState<MemorySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setSummaryError(null);
    ipc
      .actionExecute({ type: 'getCompanionMemorySummary', companionId: profile.id })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setSummary(result.data as MemorySummary);
        else setSummaryError(result.message || 'Could not load memory for this companion.');
      })
      .catch((error) => {
        if (!cancelled) setSummaryError(error instanceof Error ? error.message : 'Could not load memory for this companion.');
      });
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          id="memory-enabled"
          type="checkbox"
          checked={profile.memory.enabled}
          onChange={(e) => onSetEnabled(e.target.checked)}
        />
        <label htmlFor="memory-enabled" className={styles.cardBody}>
          Remember goals and routines for this companion
        </label>
      </div>
      <p className={styles.cardBody} style={{ marginTop: 4, fontSize: 12 }}>
        When off, Paw simply never records a new goal or routine for this companion — what's already remembered stays until you reset it.
      </p>

      <div style={{ marginTop: 16 }}>
        <p className={styles.cardBody}>
          {summary ? (
            <>
              {summary.goals.length} goal(s), {summary.routines.length} routine(s), {summary.linkedEntityCount} linked item(s)
            </>
          ) : summaryError ? (
            <span style={{ color: 'var(--danger, #e05a5a)' }}>{summaryError}</span>
          ) : (
            <>
              <span className={styles.spinner} />
              Loading…
            </>
          )}
        </p>
        {summary && summary.goals.length > 0 && (
          <ul>
            {summary.goals.map((g) => (
              <li key={g.id} className={styles.cardBody}>
                {g.completed ? '✓ ' : ''}
                {g.text}
              </li>
            ))}
          </ul>
        )}
        {summary && summary.routines.length > 0 && (
          <ul>
            {summary.routines.map((r) => (
              <li key={r.id} className={styles.cardBody}>
                {r.description}
                {r.cadence ? ` (${r.cadence})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        className={styles.dangerButton}
        style={{ marginTop: 16 }}
        disabled={resetting}
        onClick={async () => {
          if (!window.confirm('Permanently erase everything remembered for this companion? This cannot be undone.')) return;
          setResetError(null);
          setResetting(true);
          try {
            const result = await ipc.actionExecute({ type: 'resetCompanionMemory', companionId: profile.id, confirmed: true });
            if (result.ok) {
              onReset();
              setSummary({ goals: [], routines: [], linkedEntityCount: 0 });
            } else {
              setResetError(result.message || 'Failed to reset memory.');
            }
          } catch (error) {
            setResetError(error instanceof Error ? error.message : 'Failed to reset memory.');
          } finally {
            setResetting(false);
          }
        }}
      >
        {resetting ? (
          <>
            <span className={styles.spinner} />
            Resetting…
          </>
        ) : (
          'Reset memory'
        )}
      </button>
      {resetError && (
        <p className={`${styles.cardBody} ${styles.fadeInUp}`} style={{ marginTop: 8, color: 'var(--danger, #e05a5a)' }}>
          {resetError}
        </p>
      )}
    </div>
  );
}

function AppearanceTab({ profile }: { profile: CompanionProfile }) {
  return (
    <div>
      {profile.avatarImage && (
        <img src={profile.avatarImage} alt={profile.name} style={{ width: 96, height: 96, borderRadius: 12, objectFit: 'cover' }} />
      )}
      <p className={styles.cardBody} style={{ marginTop: 12 }}>
        Per-slot hair, face, eyes, clothing, and accessory customization for the 3D companion isn't built yet — the 3D character has no
        textured skin or clothing-slot system today.
      </p>
      <p className={styles.cardBody}>
        Today's real appearance control: Upload Companion (GLB/GLTF/VRM/FBX/OBJ) in the Upload Companion tab lets you bring your own
        model.
      </p>
    </div>
  );
}
