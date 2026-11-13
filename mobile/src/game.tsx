// Gamification building blocks: topic look, progress ring, medals, stat tiles, week dots, confetti.
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Badge, Topic } from './contract';
import { colors, ff, font } from './theme';

export { MaterialCommunityIcons as Icon };

// ---------------------------------------------------------------- topics

export const TOPIC: Record<Topic, { label: string; emoji: string; icon: string; color: string; dark: string; light: string; tagline: string }> = {
  'word-problems': {
    label: 'Word problems',
    emoji: '📖',
    icon: 'book-open-page-variant',
    color: colors.purple,
    dark: colors.purpleDark,
    light: '#F3ECFE',
    tagline: 'Stories with numbers',
  },
  fractions: {
    label: 'Fractions',
    emoji: '🍕',
    icon: 'chart-pie',
    color: colors.yellow,
    dark: colors.yellowDark,
    light: colors.yellowLight,
    tagline: 'Pizzas, cakes & parts',
  },
  units: {
    label: 'Units',
    emoji: '📏',
    icon: 'ruler',
    color: colors.green,
    dark: colors.greenDark,
    light: colors.greenLight,
    tagline: 'Metres, grams & more',
  },
};

// ---------------------------------------------------------------- progress ring

export function ProgressRing({
  value,
  size = 84,
  stroke = 10,
  color = colors.primary,
  track = colors.track,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- medal (badge)

/** Shield-shaped medal with a ribbon; grey and locked when not earned. */
export function Medal({ badge, size = 76, showLabel = true }: { badge: Badge; size?: number; showLabel?: boolean }) {
  const on = badge.earned;
  const main = on ? badge.color : '#D9D9D9';
  const id = `g-${badge.id}-${on ? 1 : 0}`;
  return (
    <View style={{ width: size + 14, alignItems: 'center', gap: 4 }}>
      <View style={{ width: size, height: size * 1.12 }}>
        <Svg width={size} height={size * 1.12} viewBox="0 0 100 112">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity={on ? 0.45 : 0.25} />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {/* ribbon tails */}
          <Path d="M30 78 L22 110 L36 102 L44 112 L50 82 Z" fill={on ? '#F0506E' : '#C4C4C4'} />
          <Path d="M70 78 L78 110 L64 102 L56 112 L50 82 Z" fill={on ? '#2FA5F0' : '#BDBDBD'} />
          {/* shield */}
          <Path d="M50 4 L90 18 L88 56 C86 78 68 92 50 98 C32 92 14 78 12 56 L10 18 Z" fill={main} />
          <Path d="M50 4 L90 18 L88 56 C86 78 68 92 50 98 C32 92 14 78 12 56 L10 18 Z" fill={`url(#${id})`} />
          <Path d="M50 14 L80 25 L78 56 C76 72 63 83 50 88 C37 83 24 72 22 56 L20 25 Z" fill="#fff" opacity={on ? 0.28 : 0.4} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', paddingTop: size * 0.2 }]}>
          <Text style={{ fontSize: size * 0.4, opacity: on ? 1 : 0.35 }}>{badge.icon}</Text>
        </View>
        {!on && (
          <View style={[styles.lock, { top: size * 0.62 }]}>
            <MaterialCommunityIcons name="lock" size={14} color="#fff" />
          </View>
        )}
      </View>
      {showLabel && (
        <Text style={[styles.medalLabel, !on && { color: colors.trackText }]} numberOfLines={2}>
          {badge.title}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- stat tile (result screen)

/** Coloured header strip + white body with an icon and a value. */
export function StatTile({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <View style={[styles.tile, { borderColor: color, backgroundColor: color }]}>
      <Text style={styles.tileLabel}>{label.toUpperCase()}</Text>
      <View style={styles.tileBody}>
        <MaterialCommunityIcons name={icon as never} size={22} color={color} />
        <Text style={[styles.tileValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- week dots

export function WeekDots({ week, color = colors.primary }: { week: { day: string; done: boolean; today: boolean }[]; color?: string }) {
  return (
    <View style={styles.week}>
      {week.map((d, i) => (
        <View key={i} style={styles.weekDay}>
          <Text style={[styles.weekLabel, d.today && { color: colors.ink }]}>{d.day}</Text>
          <View
            style={[
              styles.weekDot,
              d.done && { backgroundColor: color, borderColor: color },
              d.today && !d.done && { borderColor: color, borderStyle: 'dashed' },
            ]}
          >
            {d.done ? <MaterialCommunityIcons name="check-bold" size={14} color="#fff" /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- top stats chip

export function StatChip({ emoji, value, color }: { emoji: string; value: string | number; color: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- bounce (for "START" tooltips etc.)

export function Bounce({ children, style, distance = 6 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; distance?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[style, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) }] }]}>{children}</Animated.View>;
}

/** Scale-in "pop" on mount, with an optional delay. */
export function Pop({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>{children}</Animated.View>;
}

// ---------------------------------------------------------------- confetti

const CONFETTI_COLORS = [colors.primary, colors.yellow, colors.green, colors.blue, colors.purple, colors.red];

export function Confetti({ count = 40 }: { count?: number }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        delay: Math.random() * 600,
        duration: 1800 + Math.random() * 1400,
        size: 7 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        drift: (Math.random() - 0.5) * 120,
        spin: Math.random() > 0.5 ? 1 : -1,
        round: Math.random() > 0.6,
      })),
    [count, width],
  );
  const anims = useRef(pieces.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.parallel(
      anims.map((a, i) =>
        Animated.timing(a, { toValue: 1, duration: pieces[i].duration, delay: pieces[i].delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
    ).start();
  }, [anims, pieces]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -20,
            width: p.size,
            height: p.round ? p.size : p.size * 0.5,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: p.color,
            opacity: anims[i].interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
              { translateX: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 540}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lock: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#9E9E9E',
    borderRadius: 10,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  medalLabel: { fontFamily: ff.black, fontSize: 12, color: colors.ink, textAlign: 'center' },
  tile: { flex: 1, borderWidth: 2, borderRadius: 16, overflow: 'hidden' },
  tileLabel: { fontFamily: ff.black, fontSize: 11, color: '#fff', letterSpacing: 0.8, textAlign: 'center', paddingVertical: 5 },
  tileBody: {
    backgroundColor: '#fff',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  tileValue: { fontFamily: ff.black, fontSize: font.big },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: 4 },
  weekLabel: { fontFamily: ff.black, fontSize: 12, color: colors.trackText },
  weekDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipEmoji: { fontSize: 22 },
  chipValue: { fontFamily: ff.black, fontSize: font.body },
});
