import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../api';
import { colors, font } from '../theme';
import { BigButton, ErrorBox } from '../ui';

export default function HomeScreen({
  sessionError,
  onRetrySession,
  onSnap,
  onLearned,
  onDemo,
}: {
  sessionError: string | null;
  onRetrySession: () => void;
  onSnap: () => void;
  onLearned: () => void;
  onDemo: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>🦉</Text>
        <Text style={styles.title}>Nudge</Text>
        <Text style={styles.subtitle}>Your homework buddy.{'\n'}I give hints, you find the answer!</Text>
      </View>

      <BigButton label="📸  Snap my homework" onPress={onSnap} style={styles.snap} />
      <BigButton label="🧠  What Nudge learned" onPress={onLearned} color={colors.purple} />

      {sessionError && <ErrorBox message={sessionError} onRetry={onRetrySession} />}

      <Pressable onPress={onDemo} style={styles.demoLink} hitSlop={10}>
        <Text style={styles.demoText}>Components demo</Text>
      </Pressable>
      <Text style={styles.server}>{API_URL}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 20, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: 12 },
  logo: { fontSize: 88 },
  title: { fontSize: 52, fontWeight: '900', color: colors.ink },
  subtitle: { fontSize: font.body, color: colors.inkSoft, textAlign: 'center', marginTop: 6, lineHeight: 27 },
  snap: { paddingVertical: 32 },
  demoLink: { alignSelf: 'center', marginTop: 16 },
  demoText: { color: colors.blue, fontSize: font.small, textDecorationLine: 'underline' },
  server: { color: colors.inkSoft, fontSize: 12, textAlign: 'center', opacity: 0.6 },
});
