// Draws what Claude generated. Claude chooses the content AND the design choices (theme colour, header art,
// highlighted words, side-by-side layout, which block to focus); this file turns them into one consistent look.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { BlockSpec, SceneSpec, SceneTheme, UIEvent, UISpec } from '../contract';
import { colors, ff, font, radius } from '../theme';
import BarModel from './BarModel';
import FractionBars from './FractionBars';
import NumberLine from './NumberLine';
import UnitLadder from './UnitLadder';
import { ArrayGrid, BarChart, Callout, Choice, Clock, Compare, Counters, Equation, FractionPie, PlaceValue, Ruler, Slider } from './blocks';
import { Balance, Money, Picture, Shape, Steps, Tally } from './blocks2';

type Props = { spec: UISpec; onEvent?: (e: UIEvent) => void; onSay?: (text: string) => void; maxWidth?: number; readOnly?: boolean };

export const THEMES: Record<SceneTheme, { fill: string; edge: string; soft: string }> = {
  orange: { fill: colors.primary, edge: colors.primaryDark, soft: '#FFF1EA' },
  blue: { fill: colors.blue, edge: colors.blueDark, soft: colors.blueLight },
  green: { fill: colors.green, edge: colors.greenDark, soft: colors.greenLight },
  purple: { fill: colors.purple, edge: colors.purpleDark, soft: '#F3ECFE' },
  yellow: { fill: colors.yellowDark, edge: '#B98A00', soft: colors.yellowLight },
  pink: { fill: '#FF6FA8', edge: '#D94E88', soft: '#FFE9F2' },
};
type Theme = (typeof THEMES)[SceneTheme];

/** "**word**" markers are for highlighting only; strip them for speech. */
export const plainSay = (t: string) => t.replace(/\*\*/g, '');

/** Renders one block at the given width. */
export function Block({ spec, width, onEvent }: { spec: BlockSpec; width: number; onEvent?: (e: UIEvent) => void }) {
  const p = { width, onEvent } as const;
  switch (spec.type) {
    case 'FractionBars':
      return <FractionBars spec={spec} {...p} />;
    case 'NumberLine':
      return <NumberLine spec={spec} {...p} />;
    case 'BarModel':
      return <BarModel spec={spec} {...p} />;
    case 'UnitLadder':
      return <UnitLadder spec={spec} {...p} />;
    case 'FractionPie':
      return <FractionPie spec={spec} {...p} />;
    case 'Counters':
      return <Counters spec={spec} {...p} />;
    case 'ArrayGrid':
      return <ArrayGrid spec={spec} {...p} />;
    case 'BarChart':
      return <BarChart spec={spec} {...p} />;
    case 'PlaceValue':
      return <PlaceValue spec={spec} {...p} />;
    case 'Ruler':
      return <Ruler spec={spec} {...p} />;
    case 'Clock':
      return <Clock spec={spec} {...p} />;
    case 'Equation':
      return <Equation spec={spec} {...p} />;
    case 'Compare':
      return <Compare spec={spec} {...p} />;
    case 'Choice':
      return <Choice spec={spec} {...p} />;
    case 'Slider':
      return <Slider spec={spec} {...p} />;
    case 'Callout':
      return <Callout spec={spec} {...p} />;
    case 'Picture':
      return <Picture spec={spec} {...p} />;
    case 'Steps':
      return <Steps spec={spec} {...p} />;
    case 'Balance':
      return <Balance spec={spec} {...p} />;
    case 'Money':
      return <Money spec={spec} {...p} />;
    case 'Shape':
      return <Shape spec={spec} {...p} />;
    case 'Tally':
      return <Tally spec={spec} {...p} />;
    default:
      return <Text style={styles.caption}>(I can't draw that one yet.)</Text>;
  }
}

/** A gentle breathing ring around the block Claude marked with "focus". */
function FocusRing({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={[styles.focus, { borderColor: theme.fill, backgroundColor: theme.soft }]}>
      <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }] }}>{children}</Animated.View>
      <View style={[styles.focusTag, { backgroundColor: theme.fill }]}>
        <Text style={styles.focusTagText}>👀 LOOK</Text>
      </View>
    </View>
  );
}

function BlockWithCaption({ spec, width, theme, onEvent }: { spec: BlockSpec; width: number; theme: Theme; onEvent?: (e: UIEvent) => void }) {
  const caption = 'caption' in spec ? spec.caption : undefined;
  const inner = spec.focus ? width - 24 : width;
  const body = (
    <View style={{ gap: 8, alignItems: 'center' }}>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <Block spec={spec} width={inner} onEvent={onEvent} />
    </View>
  );
  return spec.focus ? <FocusRing theme={theme}>{body}</FocusRing> : body;
}

/** Text with **highlighted** words in the theme colour. */
function Highlighted({ text, theme, style }: { text: string; theme: Theme; style: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <Text key={i} style={{ color: theme.edge, backgroundColor: theme.soft }}>
            {' '}
            {p.slice(2, -2)}{' '}
          </Text>
        ) : (
          <Text key={i}>{p}</Text>
        ),
      )}
    </Text>
  );
}

export function GenUIRenderer({ spec, onEvent: onEventProp, onSay, maxWidth = 560, readOnly }: Props) {
  const onEvent = readOnly ? undefined : onEventProp;
  const { width: winW } = useWindowDimensions();
  const width = Math.min(winW - 64, maxWidth);
  const key = JSON.stringify(spec); // remount when the spec changes so local state resets

  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [key, enter]);
  const anim = { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] };

  if (spec.type === 'Scene') {
    const theme = THEMES[spec.theme ?? 'orange'] ?? THEMES.orange;
    return (
      <Animated.View style={[styles.wrap, { borderTopColor: theme.fill, borderTopWidth: 6 }, anim]}>
        <ScenePlayer key={key} scene={spec} width={width} theme={theme} onEvent={onEvent} onSay={onSay} />
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[styles.wrap, anim]}>
      <BlockWithCaption key={key} spec={spec} width={width} theme={THEMES.orange} onEvent={onEvent} />
    </Animated.View>
  );
}

function ScenePlayer({
  scene,
  width,
  theme,
  onEvent,
  onSay,
}: {
  scene: SceneSpec;
  width: number;
  theme: Theme;
  onEvent?: (e: UIEvent) => void;
  onSay?: (t: string) => void;
}) {
  const [i, setI] = useState(0);
  const step = scene.steps[i];
  const last = i === scene.steps.length - 1;

  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
    if (step?.say) onSay?.(plainSay(step.say));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  if (!step) return null;
  const row = step.layout === 'row' && step.blocks.length === 2;
  const half = (width - 12) / 2;
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.sceneHead}>
        {scene.art ? <Text style={styles.art}>{scene.art}</Text> : null}
        <Text style={[styles.sceneTitle, { color: theme.edge }]} numberOfLines={1}>
          {scene.title ?? "Let's see!"}
        </Text>
        <View style={styles.dots}>
          {scene.steps.map((_, k) => (
            <View key={k} style={[styles.dot, k === i && { width: 22, backgroundColor: theme.fill }, k < i && { backgroundColor: theme.soft }]} />
          ))}
        </View>
      </View>

      <Animated.View style={{ gap: 14, opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}>
        {step.say ? (
          <View style={styles.say}>
            <Highlighted text={step.say} theme={theme} style={styles.sayText} />
            {onSay && (
              <Pressable onPress={() => onSay(plainSay(step.say!))} hitSlop={8}>
                <Text style={styles.sayIcon}>🔊</Text>
              </Pressable>
            )}
          </View>
        ) : null}
        {row ? (
          <View style={styles.row}>
            {step.blocks.map((b, k) => (
              <View key={`${i}-${k}`} style={{ width: half }}>
                <BlockWithCaption spec={b} width={half} theme={theme} onEvent={onEvent} />
              </View>
            ))}
          </View>
        ) : (
          step.blocks.map((b, k) => <BlockWithCaption key={`${i}-${k}`} spec={b} width={width} theme={theme} onEvent={onEvent} />)
        )}
      </Animated.View>

      {scene.steps.length > 1 && (
        <View style={styles.nav}>
          {i > 0 ? (
            <Pressable onPress={() => setI((x) => x - 1)} hitSlop={10}>
              <Text style={styles.link}>‹ Back</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {last ? (
            <Pressable onPress={() => setI(0)} hitSlop={10}>
              <Text style={styles.link}>↺ Watch again</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setI((x) => x + 1)}>
              {({ pressed }) => (
                <View style={[styles.next, { backgroundColor: theme.fill, borderBottomColor: theme.edge, borderBottomWidth: pressed ? 2 : 4, marginTop: pressed ? 2 : 0 }]}>
                  <Text style={styles.nextText}>NEXT ›</Text>
                </View>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: colors.line,
    borderBottomWidth: 4,
  },
  caption: { fontSize: font.body - 1, fontFamily: ff.bold, color: colors.ink, textAlign: 'center' },
  sceneHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  art: { fontSize: 22 },
  sceneTitle: { flex: 1, fontFamily: ff.black, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.track },
  say: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sayText: { flex: 1, fontFamily: ff.black, fontSize: 18, color: colors.ink, lineHeight: 26 },
  sayIcon: { fontSize: 20 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  focus: { borderWidth: 3, borderRadius: 18, padding: 10, paddingTop: 14 },
  focusTag: { position: 'absolute', top: -11, left: 12, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  focusTagText: { fontFamily: ff.black, fontSize: 10, color: '#fff', letterSpacing: 0.8 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  link: { fontFamily: ff.black, fontSize: 14, color: colors.inkSoft },
  next: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 22 },
  nextText: { fontFamily: ff.black, color: '#fff', fontSize: 14, letterSpacing: 0.8 },
});

export default GenUIRenderer;
