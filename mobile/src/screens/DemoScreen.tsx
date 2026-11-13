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
    theme: 'orange',
    art: '🍕🎉',
    steps: [
      { say: 'Tom and Mia share **one** pizza with 8 slices.', blocks: [{ type: 'Picture', items: [{ emoji: '👦', label: 'Tom' }, { emoji: '🍕', label: '8 slices' }, { emoji: '👧', label: 'Mia' }] }] },
      {
        say: 'Tom eats **3** slices, Mia eats **2**.',
        layout: 'row',
        blocks: [
          { type: 'FractionPie', caption: 'Tom', pies: [{ parts: 8, shaded: 3 }], interactive: false },
          { type: 'FractionPie', caption: 'Mia', pies: [{ parts: 8, shaded: 2 }], interactive: false },
        ],
      },
      { say: 'How many **eighths** together?', blocks: [{ type: 'Equation', lines: ['3/8 + 2/8 = ?'], focus: true }] },
    ],
  },
  {
    type: 'Scene',
    title: 'Garden fence',
    theme: 'green',
    art: '🌻🐝',
    steps: [
      { say: 'The **perimeter** is the way all around.', blocks: [{ type: 'Steps', steps: ['Find every side', 'Add them up', 'Say the units'], current: 1 }] },
      { say: 'Walk around the garden!', blocks: [{ type: 'Shape', shape: 'rectangle', sides: ['5 m', '3 m', '?', '?'], focus: true }] },
    ],
  },
  { type: 'Balance', caption: 'Which is heavier?', left: { label: '3 kg', emoji: '🎒' }, right: { label: '500 g', emoji: '🥪' }, tilt: 'unknown' },
  { type: 'Money', caption: 'How much money is this?', currency: '€', coins: [{ value: 500, count: 1 }, { value: 200, count: 1 }, { value: 50, count: 2 }, { value: 10, count: 3 }] },
  { type: 'Shape', caption: 'Count the squares: area', shape: 'rectangle', sides: ['4 cm', '3 cm'], grid: true, cols: 4, rows: 3 },
  { type: 'Tally', caption: 'Pets in our class', rows: [{ label: 'Cats', emoji: '🐱', count: 7 }, { label: 'Dogs', emoji: '🐶', count: 12 }, { label: 'Fish', emoji: '🐟', count: 0, unknown: true }] },
  { type: 'Choice', question: 'What does the bottom number count?', options: ['Slices we pick', 'All equal slices in the whole', 'Friends'] },
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
