// Small shared pieces used by several visuals, so they all look the same.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, ff } from '../theme';

/** A stacked fraction (numerator over denominator) in a rounded pill. */
export function FracBadge({ n, d, color = colors.ink }: { n: number | string; d: number | string; color?: string }) {
  return (
    <View style={[styles.frac, { backgroundColor: color }]}>
      <Text style={styles.fracNum}>{n}</Text>
      <View style={styles.fracLine} />
      <Text style={styles.fracNum}>{d}</Text>
    </View>
  );
}

/** A small rounded label. */
export function Tag({ text, color = colors.inkSoft, bg = '#F4F4F4' }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frac: { alignItems: 'center', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, minWidth: 34 },
  fracNum: { fontFamily: ff.black, color: '#fff', fontSize: 15, lineHeight: 18 },
  fracLine: { width: 16, height: 2, backgroundColor: '#fff', borderRadius: 1, marginVertical: 1 },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  tagText: { fontFamily: ff.black, fontSize: 12 },
});
