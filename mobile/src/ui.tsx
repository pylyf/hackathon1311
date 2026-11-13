import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { colors, edgeOf, ff, font, radius } from './theme';

// ---------------------------------------------------------------- Mascot

export type Mood = 'hello' | 'excited' | 'dancing' | 'love' | 'laughing' | 'pebble' | 'sleepy' | 'crying' | 'angry';

const OTTER: Record<Mood, number> = {
  hello: require('../assets/otter/hello.gif'),
  excited: require('../assets/otter/excited.gif'),
  dancing: require('../assets/otter/dancing.gif'),
  love: require('../assets/otter/love.gif'),
  laughing: require('../assets/otter/laughing.gif'),
  pebble: require('../assets/otter/pebble.gif'),
  sleepy: require('../assets/otter/sleepy.gif'),
  crying: require('../assets/otter/crying.gif'),
  angry: require('../assets/otter/angry.gif'),
};

/** Animated otter. The GIFs are drawn on white, so keep it on white surfaces (or pass `round`). */
export function Mascot({ mood = 'hello', size = 140, round, style }: { mood?: Mood; size?: number; round?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        { width: size, height: size, overflow: 'hidden' },
        round && { borderRadius: size / 2, backgroundColor: '#fff' },
        style,
      ]}
    >
      <Image source={OTTER[mood]} style={{ width: size, height: size }} contentFit="contain" autoplay transition={120} />
    </View>
  );
}

// ---------------------------------------------------------------- Speech bubble

/** Rounded bubble with a little tail pointing at the mascot ("left" = mascot is on the left, "down" = mascot below). */
export function SpeechBubble({
  children,
  tail = 'left',
  style,
}: {
  children: React.ReactNode;
  tail?: 'left' | 'down' | 'none';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.bubbleWrap, style]}>
      <View style={styles.bubble}>{children}</View>
      {tail === 'left' && (
        <>
          <View style={[styles.tailLeftOuter]} />
          <View style={[styles.tailLeftInner]} />
        </>
      )}
      {tail === 'down' && (
        <>
          <View style={styles.tailDownOuter} />
          <View style={styles.tailDownInner} />
        </>
      )}
    </View>
  );
}

export function BubbleText({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.bubbleText, style]}>{children}</Text>;
}

/** Mascot on the left, speech bubble on the right — the standard "otter says" row. */
export function MascotSays({
  mood = 'hello',
  size = 110,
  children,
  style,
}: {
  mood?: Mood;
  size?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.says, style]}>
      <Mascot mood={mood} size={size} />
      <SpeechBubble style={{ flex: 1 }}>{typeof children === 'string' ? <BubbleText>{children}</BubbleText> : children}</SpeechBubble>
    </View>
  );
}

// ---------------------------------------------------------------- Buttons

/** Chunky button with a solid bottom edge that "presses down". */
export function BigButton({
  label,
  onPress,
  color = colors.primary,
  textColor,
  small,
  disabled,
  variant = 'solid',
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  small?: boolean;
  disabled?: boolean;
  variant?: 'solid' | 'outline';
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const outline = variant === 'outline';
  const bg = disabled ? colors.track : outline ? colors.card : color;
  const edge = disabled ? colors.track : outline ? colors.lineDark : edgeOf(color);
  const fg = disabled ? colors.trackText : textColor ?? (outline ? color : '#fff');
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={style}>
      {({ pressed }) => {
        const down = pressed && !disabled;
        return (
          <View
            style={[
              styles.btn,
              small && styles.btnSmall,
              {
                backgroundColor: bg,
                borderColor: outline ? colors.line : bg,
                borderBottomColor: edge,
                borderBottomWidth: down || disabled ? 2 : 5,
                marginTop: down ? 3 : disabled ? 3 : 0,
              },
            ]}
          >
            {icon ? <Text style={[styles.btnIcon, small && { fontSize: 20 }]}>{icon}</Text> : null}
            <Text style={[styles.btnText, small && styles.btnTextSmall, { color: fg }]} numberOfLines={2}>
              {label.toUpperCase()}
            </Text>
          </View>
        );
      }}
    </Pressable>
  );
}

/** Selectable answer card (white, turns blue when selected). */
export function OptionCard({
  label,
  sublabel,
  icon,
  right,
  selected,
  onPress,
  badge,
  vertical,
  style,
}: {
  label: string;
  vertical?: boolean;
  sublabel?: string;
  icon?: React.ReactNode;
  right?: string;
  selected?: boolean;
  onPress: () => void;
  badge?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={style}>
      {({ pressed }) => (
        <View
          style={[
            styles.option,
            selected && styles.optionSelected,
            vertical && styles.optionVertical,
            { borderBottomWidth: pressed ? 2 : 4, marginTop: pressed ? 2 : 0 },
          ]}
        >
          {icon ? (typeof icon === 'string' ? <Text style={styles.optionIcon}>{icon}</Text> : icon) : null}
          <View style={vertical ? undefined : { flex: 1 }}>
            <Text style={[styles.optionText, vertical && styles.optionTextVertical, selected && { color: colors.blueDark }]} numberOfLines={vertical ? 1 : undefined}>
              {label}
            </Text>
            {sublabel ? <Text style={[styles.optionSub, selected && { color: colors.blue }]}>{sublabel}</Text> : null}
          </View>
          {right ? <Text style={[styles.optionRight, selected && { color: colors.blue }]}>{right}</Text> : null}
          {badge ? (
            <View style={styles.optionBadge}>
              <Text style={styles.optionBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Layout bits

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Rounded progress bar with a soft highlight stripe. */
export function ProgressBar({ value, color = colors.primary, style }: { value: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const anim = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, anim]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  return (
    <View style={[styles.track, style]}>
      <Animated.View style={[styles.fill, { width, backgroundColor: color }]}>
        <View style={styles.fillShine} />
      </Animated.View>
    </View>
  );
}

/** Back arrow on the left, then a progress bar or a title, then an optional right element. */
export function TopBar({
  title,
  onBack,
  right,
  progress,
}: {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  progress?: number;
}) {
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={14} style={styles.back} accessibilityLabel="Back">
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
      ) : (
        <View style={styles.back} />
      )}
      {typeof progress === 'number' ? (
        <ProgressBar value={progress} style={{ flex: 1 }} />
      ) : (
        <Text style={styles.topTitle} numberOfLines={1}>
          {title ?? ''}
        </Text>
      )}
      <View style={styles.right}>{right}</View>
    </View>
  );
}

/** Screen-bottom area for the main action button(s). */
export function BottomBar({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.bottomBar, style]}>{children}</View>;
}

export function Loading({ label, mood = 'pebble' }: { label: string; mood?: Mood }) {
  return (
    <View style={styles.center}>
      <SpeechBubble tail="down">
        <BubbleText>{label}</BubbleText>
      </SpeechBubble>
      <Mascot mood={mood} size={170} />
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={styles.errorCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Mascot mood="crying" size={64} />
        <View style={{ flex: 1 }}>
          <Text style={styles.errorTitle}>Uh-oh!</Text>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      </View>
      {onRetry && <BigButton small label="Try again" onPress={onRetry} color={colors.red} style={{ marginTop: 12, alignSelf: 'stretch' }} />}
    </Card>
  );
}

export function Pill({ label, color = colors.blue }: { label: string; color?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // bubble
  bubbleWrap: { position: 'relative' },
  bubble: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  bubbleText: { fontFamily: ff.regular, fontSize: font.body, color: colors.ink, lineHeight: 26 },
  tailLeftOuter: {
    position: 'absolute',
    left: -11,
    top: 22,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderRightWidth: 11,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: colors.line,
  },
  tailLeftInner: {
    position: 'absolute',
    left: -7,
    top: 24,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderRightWidth: 9,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: colors.card,
  },
  tailDownOuter: {
    position: 'absolute',
    bottom: -11,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.line,
  },
  tailDownInner: {
    position: 'absolute',
    bottom: -7,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.card,
  },
  says: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  // buttons
  btn: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: radius,
    borderWidth: 2,
    paddingVertical: 15,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14 },
  btnIcon: { fontSize: 24 },
  btnText: { fontFamily: ff.black, fontSize: 17, letterSpacing: 0.8, textAlign: 'center' },
  btnTextSmall: { fontSize: 14 },

  // option card
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionVertical: { flexDirection: 'column', gap: 4, paddingVertical: 12, paddingHorizontal: 6 },
  optionTextVertical: { fontSize: font.small, textAlign: 'center' },
  optionSelected: { backgroundColor: colors.blueLight, borderColor: colors.blueBorder },
  optionIcon: { fontSize: 28 },
  optionText: { fontFamily: ff.bold, fontSize: font.body, color: colors.ink },
  optionSub: { fontFamily: ff.regular, fontSize: font.small, color: colors.inkSoft, marginTop: 2 },
  optionRight: { fontFamily: ff.regular, fontSize: font.small, color: colors.inkSoft },
  optionBadge: {
    position: 'absolute',
    top: -12,
    right: 12,
    backgroundColor: colors.blue,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  optionBadgeText: { fontFamily: ff.black, color: '#fff', fontSize: 12, letterSpacing: 0.8 },

  // layout
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 2,
    borderColor: colors.line,
    borderBottomWidth: 4,
    padding: 16,
  },
  track: { height: 16, borderRadius: 8, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8, minWidth: 16 },
  fillShine: {
    position: 'absolute',
    top: 4,
    left: 8,
    right: 8,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, minHeight: 52 },
  back: { width: 32 },
  backArrow: { fontSize: 28, color: colors.trackText, fontFamily: ff.bold },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: ff.black, fontSize: font.big - 2, color: colors.ink },
  right: { minWidth: 32, alignItems: 'flex-end' },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 10,
    borderTopWidth: 2,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  errorCard: { borderColor: '#FFC9D3', backgroundColor: '#FFF2F4' },
  errorTitle: { fontFamily: ff.black, fontSize: font.body, color: colors.red },
  errorText: { fontFamily: ff.regular, fontSize: font.small, color: colors.ink, marginTop: 2 },
  pill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: ff.black, color: '#fff', fontSize: 12, letterSpacing: 0.5 },
});
