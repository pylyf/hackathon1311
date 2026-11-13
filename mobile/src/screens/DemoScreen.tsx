import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { UIEvent, UISpec } from '../contract';
import { GenUIRenderer } from '../genui/GenUIRenderer';
import { colors, font } from '../theme';
import { Card, TopBar } from '../ui';

const SAMPLES: UISpec[] = [
  {
    type: 'FractionBars',
    caption: 'Is 1/2 the same as 2/4? Shade the bottom bar to check!',
    interactive: true,
    rows: [
      { denominator: 2, shaded: 1, label: '1/2' },
      { denominator: 4, shaded: 0, label: '?/4' },
    ],
  },
  {
    type: 'NumberLine',
    caption: 'Start at 3 and jump 4 more. Where do you land?',
    min: 0,
    max: 10,
    step: 1,
    marks: [{ value: 3, label: 'start' }],
    jumps: [{ from: 3, to: 5, label: '+2' }],
    interactive: true,
  },
  {
    type: 'BarModel',
    caption: 'Tom has 12 marbles. Ana has 5 more than Tom.',
    mode: 'compare',
    bars: [
      { label: 'Tom', parts: [{ value: 12 }] },
      { label: 'Ana', parts: [{ value: 12 }, { label: '5', value: 5 }] },
      { label: 'Together', parts: [{ unknown: true, value: 29 }] },
    ],
  },
  {
    type: 'UnitLadder',
    caption: 'How many centimetres is 2 metres?',
    units: ['km', 'm', 'cm', 'mm'],
    factors: [1000, 100, 10],
    value: 2,
    fromUnit: 'm',
    interactive: true,
  },
];

export default function DemoScreen({ onBack }: { onBack: () => void }) {
  const [log, setLog] = useState<string[]>([]);
  const onEvent = (e: UIEvent) => setLog((l) => [`${e.component}.${e.action} ${JSON.stringify(e.data)}`, ...l].slice(0, 8));

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <TopBar title="Components demo" onBack={onBack} />
      <Card>
        <Text style={styles.h}>Events</Text>
        {log.length === 0 ? <Text style={styles.log}>(tap a component)</Text> : log.map((l, i) => <Text key={i} style={styles.log}>{l}</Text>)}
      </Card>
      {SAMPLES.map((s, i) => (
        <GenUIRenderer key={i} spec={s} onEvent={onEvent} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  h: { fontSize: font.body, fontWeight: '800', color: colors.ink },
  log: { fontSize: 13, color: colors.inkSoft, fontFamily: 'monospace' },
});
