import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { LessonStatus, TraceStep } from './contract';
import { colors, ff, font } from './theme';
import { ProgressBar as UIProgressBar, Tag } from './ui';

export const TRACE_ICON: Record<TraceStep['kind'], string> = {
  read: '📖',
  plan: '🗺️',
  recall: '🔎',
  strategy: '🎯',
  override: '🔀',
  draw: '🖼️',
  check: '✅',
  memory: '💾',
  generate: '✍️',
  verify: '🧪',
  speak: '🗣️',
};

/** True when the step text already starts with its own emoji (then we don't add the kind icon). */
function startsWithEmoji(text: string): boolean {
  const cp = text.trim().codePointAt(0) ?? 0;
  return cp >= 0x2190 && !(cp >= 0x3000 && cp <= 0x9fff);
}

export function stepIcon(step: TraceStep): string | null {
  return startsWithEmoji(step.text) ? null : (TRACE_ICON[step.kind] ?? '•');
}

/** One row that fades + slides in after `delay` ms. */
function AnimatedRow({ delay, children }: { delay: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 320, delay, useNativeDriver: false }).start();
  }, [anim, delay]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Collapsible "🧠 Nudge is thinking" panel for TutorReply.trace. Re-animates when `steps` changes. */
export function TracePanel({
  steps,
  title = '🧠 Nudge is thinking',
  runId = '',
}: {
  steps: TraceStep[] | undefined;
  title?: string;
  runId?: string | number; // change it to replay the stagger animation (e.g. per tutor reply)
}) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(width >= 600);
  if (!steps || steps.length === 0) return null;
  return (
    <View style={styles.panel}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.panelHead} hitSlop={8} accessibilityRole="button">
        <Text style={styles.panelTitle}>{title}</Text>
        <Text style={styles.panelToggle}>
          {steps.length} step{steps.length === 1 ? '' : 's'} {open ? '▲' : '▼'}
        </Text>
      </Pressable>
      {open &&
        steps.map((s, i) => {
          const icon = stepIcon(s);
          return (
            <AnimatedRow key={`${runId}-${i}-${s.text}`} delay={i * 220}>
              <View style={styles.traceRow}>
                <Text style={styles.traceIcon}>{icon ?? ''}</Text>
                <Text style={styles.traceText}>{s.text}</Text>
              </View>
            </AnimatedRow>
          );
        })}
    </View>
  );
}

/** Live agent checklist (textbook builder). Last step spins while `running`. */
export function StepChecklist({ steps, running }: { steps: TraceStep[]; running: boolean }) {
  return (
    <View style={styles.checklist}>
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const active = running && isLast;
        const icon = stepIcon(s);
        return (
          <AnimatedRow key={`${i}-${s.text}`} delay={0}>
            <View style={[styles.checkRow, active && styles.checkRowActive]}>
              <View style={[styles.checkDot, active ? styles.dotActive : styles.dotDone]}>
                {active ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.tick}>✓</Text>}
              </View>
              <Text style={[styles.checkText, !active && styles.checkTextDone]}>
                {icon ? `${icon}  ` : ''}
                {s.text}
              </Text>
            </View>
          </AnimatedRow>
        );
      })}
    </View>
  );
}

export const STATUS_STYLE: Record<LessonStatus, { label: string; bg: string; fg: string; bar: string }> = {
  ready: { label: 'ready', bg: colors.blueLight, fg: colors.blueDark, bar: colors.blue },
  'in-progress': { label: 'in progress', bg: '#FFE9DF', fg: colors.primaryDark, bar: colors.primary },
  review: { label: 'review', bg: colors.yellowLight, fg: colors.yellowDark, bar: colors.yellow },
  mastered: { label: 'mastered ⭐', bg: colors.greenLight, fg: colors.greenDark, bar: colors.green },
  locked: { label: 'locked', bg: colors.track, fg: colors.trackText, bar: colors.trackText },
};

export function StatusChip({ status }: { status: LessonStatus }) {
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.ready;
  return <Tag label={st.label} bg={st.bg} fg={st.fg} />;
}

export function ProgressBar({ value, color = colors.green }: { value: number; color?: string }) {
  return <UIProgressBar value={Math.max(0, Math.min(1, value || 0))} color={color} style={{ flex: 1 }} />;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#F6F0FF', borderRadius: 18, padding: 12, gap: 6, borderWidth: 2, borderColor: '#E2D3FC', borderBottomWidth: 4 },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { fontFamily: ff.black, fontSize: font.small, color: colors.purpleDark, letterSpacing: 0.3 },
  panelToggle: { fontFamily: ff.bold, fontSize: 13, color: colors.purple },
  traceRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 2 },
  traceIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  traceText: { flex: 1, fontFamily: ff.regular, fontSize: font.small, color: colors.ink, lineHeight: 21 },
  checklist: { gap: 10 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.line,
    borderBottomWidth: 4,
  },
  checkRowActive: { backgroundColor: '#FFF3EC', borderColor: '#FFC3A8', borderBottomColor: colors.primary },
  checkDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.green },
  dotActive: { backgroundColor: '#fff' },
  tick: { fontFamily: ff.black, color: '#fff', fontSize: 16 },
  checkText: { flex: 1, fontFamily: ff.bold, fontSize: font.small + 1, color: colors.ink, lineHeight: 22 },
  checkTextDone: { fontFamily: ff.regular, color: colors.inkSoft },
});
