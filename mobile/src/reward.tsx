// Reward burst shown when the child gets something right: a spinning sunburst, the otter popping in,
// sparkles flying out and a short cheer. "solved" is the bigger version with confetti.
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Confetti } from './game';
import { colors, ff } from './theme';
import { Mascot } from './ui';

const STEP_CHEERS = ['Yes! 🎉', 'Nice step!', 'That’s it!', 'Super!', 'You got it!'];
const SOLVED_CHEERS = ['You solved it!', 'Amazing work!', 'Math star!'];
const SPARKS = ['⭐', '✨', '🌟', '💫', '⭐', '✨', '🌟', '💫'];

function Sunburst({ size, color }: { size: number; color: string }) {
  const rays = 12;
  const c = size / 2;
  const d = Array.from({ length: rays }, (_, i) => {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = a0 + Math.PI / rays;
    return `M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`;
  }).join(' ');
  return (
    <Svg width={size} height={size}>
      <Path d={d} fill={color} opacity={0.35} />
    </Svg>
  );
}

export function Reward({ kind, onDone }: { kind: 'step' | 'solved'; onDone: () => void }) {
  const big = kind === 'solved';
  const life = big ? 2600 : 1700;
  const cheer = useMemo(() => {
    const list = big ? SOLVED_CHEERS : STEP_CHEERS;
    return list[Math.floor(Math.random() * list.length)];
  }, [big]);

  const pop = useRef(new Animated.Value(0)).current; // otter + text scale in
  const spin = useRef(new Animated.Value(0)).current; // sunburst rotation
  const fly = useRef(new Animated.Value(0)).current; // sparkles outward
  const fade = useRef(new Animated.Value(1)).current; // whole overlay out

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
      Animated.timing(spin, { toValue: 1, duration: life, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(fly, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([Animated.delay(life - 350), Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true })]),
    ]).start(() => onDone());
  }, [pop, spin, fly, fade, life, onDone]);

  const size = big ? 340 : 260;
  const otter = big ? 170 : 130;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap, { opacity: fade }]}>
      {big && <Confetti count={70} />}
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', big ? '120deg' : '80deg'] }) }, { scale: pop }] },
          ]}
        >
          <Sunburst size={size} color={big ? colors.yellow : colors.green} />
        </Animated.View>

        {SPARKS.map((s, i) => {
          const a = (i / SPARKS.length) * Math.PI * 2;
          const r = size * 0.46;
          return (
            <Animated.Text
              key={i}
              style={[
                styles.spark,
                {
                  opacity: fly.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * r] }) },
                    { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * r] }) },
                    { scale: fly.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1.3, 0.8] }) },
                  ],
                },
              ]}
            >
              {s}
            </Animated.Text>
          );
        })}

        <Animated.View style={[styles.otter, { width: otter, height: otter, borderRadius: otter / 2, transform: [{ scale: pop }] }]}>
          <Mascot mood={big ? 'dancing' : 'excited'} size={otter - 10} />
        </Animated.View>
      </View>
      <Animated.View style={[styles.cheer, big && styles.cheerBig, { transform: [{ scale: pop }] }]}>
        <Text style={[styles.cheerText, big && { fontSize: 32 }]}>{cheer}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)', zIndex: 50 },
  otter: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  spark: { position: 'absolute', fontSize: 28 },
  cheer: {
    marginTop: -6,
    backgroundColor: colors.green,
    borderBottomWidth: 5,
    borderBottomColor: colors.greenDark,
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  cheerBig: { backgroundColor: colors.yellow, borderBottomColor: colors.yellowDark },
  cheerText: { fontFamily: ff.display, fontSize: 26, color: '#fff' },
});
