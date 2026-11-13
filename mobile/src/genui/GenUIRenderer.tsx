import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { BlockSpec, SceneSpec, UIEvent, UISpec } from '../contract';
import { colors, ff, font, radius } from '../theme';
import BarModel from './BarModel';
import FractionBars from './FractionBars';
import NumberLine from './NumberLine';
import UnitLadder from './UnitLadder';
import { ArrayGrid, BarChart, Callout, Choice, Clock, Compare, Counters, Equation, FractionPie, PlaceValue, Ruler, Slider } from './blocks';

type Props = { spec: UISpec; onEvent?: (e: UIEvent) => void; onSay?: (text: string) => void; maxWidth?: number; readOnly?: boolean };

const INTERACTIVE = new Set(['FractionPie', 'FractionBars', 'NumberLine', 'Counters', 'ArrayGrid', 'Ruler', 'UnitLadder', 'Slider', 'Choice', 'BarModel']);

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
    default:
      return <Text style={styles.caption}>(I can't draw that one yet.)</Text>;
  }
}

function BlockWithCaption({ spec, width, onEvent }: { spec: BlockSpec; width: number; onEvent?: (e: UIEvent) => void }) {
  const caption = 'caption' in spec ? spec.caption : undefined;
  return (
    <View style={{ gap: 8, alignItems: 'center' }}>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <Block spec={spec} width={width} onEvent={onEvent} />
    </View>
  );
}

export function GenUIRenderer({ spec, onEvent: onEventProp, onSay, maxWidth = 560, readOnly }: Props) {
  const onEvent = readOnly ? undefined : onEventProp;
  const { width: winW } = useWindowDimensions();
  const width = Math.min(winW - 64, maxWidth);
  const key = JSON.stringify(spec); // remount when the spec changes so local state resets

  // entrance: slide up + fade for the whole card
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [key, enter]);
  const anim = { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] };

  if (spec.type === 'Scene') {
    return (
      <Animated.View style={[styles.wrap, anim]}>
        <ScenePlayer key={key} scene={spec} width={width} onEvent={onEvent} onSay={onSay} />
      </Animated.View>
    );
  }
  const interactive = !readOnly && INTERACTIVE.has(spec.type) && (!('interactive' in spec) || spec.interactive);
  return (
    <Animated.View style={[styles.wrap, anim]}>
      <Text style={styles.kicker}>{interactive ? '👆 TRY IT!' : "✏️ LET'S DRAW IT"}</Text>
      <BlockWithCaption key={key} spec={spec} width={width} onEvent={onEvent} />
    </Animated.View>
  );
}

function ScenePlayer({ scene, width, onEvent, onSay }: { scene: SceneSpec; width: number; onEvent?: (e: UIEvent) => void; onSay?: (t: string) => void }) {
  const [i, setI] = useState(0);
  const step = scene.steps[i];
  const last = i === scene.steps.length - 1;

  // each step slides in from the right
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
    if (step?.say) onSay?.(step.say);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  if (!step) return null;
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.sceneHead}>
        <Text style={styles.sceneTitle} numberOfLines={1}>
          🎬 {scene.title ?? "Let's see!"}
        </Text>
        <View style={styles.dots}>
          {scene.steps.map((_, k) => (
            <View key={k} style={[styles.dot, k === i && styles.dotOn, k < i && styles.dotDone]} />
          ))}
        </View>
      </View>

      <Animated.View
        style={{
          gap: 14,
          opacity: v,
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        }}
      >
        {step.say ? (
          <View style={styles.say}>
            <Text style={styles.sayText}>{step.say}</Text>
            {onSay && (
              <Pressable onPress={() => onSay(step.say!)} hitSlop={8}>
                <Text style={styles.sayIcon}>🔊</Text>
              </Pressable>
            )}
          </View>
        ) : null}
        {step.blocks.map((b, k) => (
          <BlockWithCaption key={`${i}-${k}`} spec={b} width={width} onEvent={onEvent} />
        ))}
      </Animated.View>

      {scene.steps.length > 1 && (
        <View style={styles.nav}>
          <Pressable onPress={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} style={[styles.navBack, i === 0 && { opacity: 0.3 }]} hitSlop={8}>
            <Text style={styles.navBackText}>◀</Text>
          </Pressable>
          <Pressable onPress={() => setI((x) => (last ? 0 : x + 1))} style={{ flex: 1 }}>
            {({ pressed }) => (
              <View style={[styles.next, last && styles.nextLast, { borderBottomWidth: pressed ? 2 : 5, marginTop: pressed ? 3 : 0 }]}>
                <Text style={styles.nextText}>{last ? '↺ WATCH AGAIN' : `NEXT  ▶   ${i + 1}/${scene.steps.length}`}</Text>
              </View>
            )}
          </Pressable>
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
  kicker: { fontFamily: ff.black, fontSize: 12, letterSpacing: 1.2, color: colors.primary, textAlign: 'center' },
  caption: { fontSize: font.body - 1, fontFamily: ff.bold, color: colors.ink, textAlign: 'center' },
  sceneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sceneTitle: { flex: 1, fontFamily: ff.black, fontSize: 15, color: colors.primary, letterSpacing: 0.4 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.track },
  dotOn: { width: 24, backgroundColor: colors.primary },
  dotDone: { backgroundColor: '#FFC2A8' },
  say: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF4EE', borderRadius: 14, padding: 12 },
  sayText: { flex: 1, fontFamily: ff.bold, fontSize: 17, color: colors.ink, lineHeight: 23 },
  sayIcon: { fontSize: 20 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBack: { width: 48, height: 48, borderRadius: 14, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  navBackText: { fontSize: 18, color: colors.inkSoft },
  next: { backgroundColor: colors.primary, borderBottomColor: colors.primaryDark, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  nextLast: { backgroundColor: colors.purple, borderBottomColor: colors.purpleDark },
  nextText: { fontFamily: ff.black, color: '#fff', fontSize: 15, letterSpacing: 0.8 },
});

export default GenUIRenderer;
