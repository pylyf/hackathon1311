import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, font, radius, shadow } from './theme';

export function BigButton({
  label,
  onPress,
  color = colors.primary,
  textColor = '#fff',
  small,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  textColor?: string;
  small?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        shadow,
        small && styles.btnSmall,
        {
          backgroundColor: color,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      <Text style={[styles.btnText, small && styles.btnTextSmall, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, shadow, style]}>{children}</View>;
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={styles.errorCard}>
      <Text style={styles.errorTitle}>Uh-oh! 🙈</Text>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry && <BigButton small label="Try again" onPress={onRetry} color={colors.blue} style={{ marginTop: 12 }} />}
    </Card>
  );
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={styles.side}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}
      <Text style={styles.topTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius,
    paddingVertical: 20,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 16 },
  btnText: { fontSize: font.big, fontWeight: '800', textAlign: 'center' },
  btnTextSmall: { fontSize: font.body },
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 16 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  loadingText: { fontSize: font.big, color: colors.ink, fontWeight: '700', textAlign: 'center' },
  errorCard: { borderWidth: 3, borderColor: colors.red, alignItems: 'center' },
  errorTitle: { fontSize: font.big, fontWeight: '800', color: colors.red },
  errorText: { fontSize: font.body, color: colors.ink, textAlign: 'center', marginTop: 6 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  side: { width: 90 },
  backText: { fontSize: font.body, color: colors.blue, fontWeight: '700' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: font.big, fontWeight: '800', color: colors.ink },
});
