import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { UIEvent, UISpec } from '../contract';
import { GenUIRenderer } from '../genui/GenUIRenderer';
import { colors, ff, font } from '../theme';
import { Card, TopBar } from '../ui';

const SAMPLES: UISpec[] = [
  {
    type: 'Scene',
    title: 'Pizza party',
    steps: [
      { say: 'Here is the whole pizza. It has 8 equal slices.', blocks: [{ type: 'FractionPie', pies: [{ parts: 8, shaded: 0 }], interactive: false }] },
      { say: 'Tom eats 3 slices. Each slice is one eighth.', blocks: [{ type: 'FractionPie', pies: [{ parts: 8, shaded: 3, label: 'Tom' }], interactive: false }, { type: 'Callout', emoji: '🍕', text: 'The bottom number tells how many slices the whole pizza has.', tone: 'idea' }] },
      { say: 'Mia eats 2 more. Can you shade them?', blocks: [{ type: 'FractionPie', pies: [{ parts: 8, shaded: 3 }], interactive: true }] },
      { say: 'So how many eighths did they eat together?', blocks: [{ type: 'Equation', lines: ['3/8 + 2/8 = ?'] }, { type: 'Choice', question: 'How many slices together?', options: ['4', '5', '6'] }] },
    ],
  },
  { type: 'Counters', caption: 'Leo has 12 stickers and gives away 4', groups: [{ emoji: '⚽', count: 12 }], crossOut: 4, interactive: true },
  { type: 'ArrayGrid', caption: '3 boxes with 4 cookies each', rows: 3, cols: 4, emoji: '🍪', interactive: true },
  { type: 'BarChart', caption: 'Fruit we picked', unit: '', bars: [{ label: 'Apples', value: 7, emoji: '🍎' }, { label: 'Pears', value: 4, emoji: '🍐' }, { label: 'Plums', value: 0, emoji: '🫐', unknown: true }] },
  { type: 'PlaceValue', caption: 'What makes 347?', number: 347 },
  { type: 'Ruler', caption: 'How long is the pencil?', max: 10, unit: 'cm', marks: [{ value: 0, label: 'start' }], interactive: true },
  { type: 'Clock', caption: 'What time is it?', hour: 3, minute: 30 },
  { type: 'Compare', caption: 'Which is bigger?', left: '3/4', right: '2/3', leftEmoji: '🍫', rightEmoji: '🍫' },
  { type: 'Slider', caption: 'Guess: how many cm in 2 m?', min: 0, max: 300, step: 10, unit: 'cm', emoji: '🦒' },
  {
    type: 'FractionBars',
    caption: 'Is 1/2 the same as 2/4? Shade the bottom bar to check!',
    interactive: true,
    rows: [
      { denominator: 2, shaded: 1, label: '1/2' },
      { denominator: 4, shaded: 0, label: '?/4' },
    ],
  },
  { type: 'NumberLine', caption: 'Start at 3 and jump 4 more.', min: 0, max: 10, step: 1, marks: [{ value: 3, label: 'start' }], jumps: [{ from: 3, to: 5, label: '+2' }], interactive: true },
  {
    type: 'BarModel',
    caption: 'Tom has 12 marbles. Ana has 5 more than Tom.',
    mode: 'compare',
    bars: [
      { label: 'Tom', parts: [{ value: 12 }] },
      { label: 'Ana', parts: [{ value: 12 }, { label: '5', value: 5 }] },
    ],
  },
  { type: 'UnitLadder', caption: 'How many centimetres is 2 metres?', units: ['km', 'm', 'cm', 'mm'], factors: [1000, 100, 10], value: 2, fromUnit: 'm', interactive: true },
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
  h: { fontSize: font.body, fontFamily: ff.black, color: colors.ink },
  log: { fontSize: 13, color: colors.inkSoft, fontFamily: 'monospace' },
});
