import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ProgressResponse } from '../contract';
import { Confetti, Pop, StatTile } from '../game';
import { colors, ff, font } from '../theme';
import { BigButton, BottomBar, ErrorBox, Mascot } from '../ui';
import { errMsg } from '../api';

const PRAISE = ['You figured it out yourself!', 'Super brain power!', 'Wow, what great thinking!', 'You never gave up!', 'Math champion!'];

export default function ResultScreen({
  before,
  after,
  onNext,
  onFinish,
}: {
  before: ProgressResponse | null;
  after: ProgressResponse;
  onNext: () => void;
  onFinish: () => Promise<void>;
}) {
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const praise = useMemo(() => PRAISE[Math.floor(Math.random() * PRAISE.length)], []);

  const gained = before ? after.pebbles - before.pebbles : after.lastSolve?.pebbles ?? 0;
  const hints = after.lastSolve?.hints ?? 0;

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      await onFinish();
    } catch (e) {
      setError(errMsg(e));
      setFinishing(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pop>
          <Mascot mood="dancing" size={190} style={{ alignSelf: 'center' }} />
        </Pop>
        <Text style={styles.title}>Problem solved!</Text>
        <Text style={styles.sub}>{praise}</Text>

        <View style={styles.tiles}>
          <Pop delay={250} style={{ flex: 1 }}>
            <StatTile label="Pebbles" value={`+${gained}`} icon="diamond-stone" color={colors.otter} />
          </Pop>
          <Pop delay={400} style={{ flex: 1 }}>
            <StatTile label="Hints" value={String(hints)} icon="lightbulb-on" color={colors.blue} />
          </Pop>
          <Pop delay={550} style={{ flex: 1 }}>
            <StatTile label="Streak" value={String(after.streak)} icon="fire" color={colors.primary} />
          </Pop>
        </View>

        <View style={styles.learnCard}>
          <Text style={{ fontSize: 30 }}>🧠</Text>
          <Text style={styles.learnText}>
            {hints === 0
              ? "You didn't even need a hint! I'll remember you're ready for harder ones."
              : `I'm noting which of my ${hints} hint${hints > 1 ? 's' : ''} helped you, so I can teach you better next time.`}
          </Text>
        </View>

        {error && <ErrorBox message={error} />}
      </ScrollView>

      <BottomBar style={{ borderTopWidth: 0 }}>
        <BigButton label="Next problem" icon="🚀" onPress={onNext} color={colors.green} disabled={finishing} />
        <BigButton label={finishing ? 'Saving…' : 'Finish for today'} onPress={finish} variant="outline" color={colors.inkSoft} disabled={finishing} />
      </BottomBar>
      <Confetti count={60} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 16, paddingBottom: 30 },
  title: { fontFamily: ff.display, fontSize: 34, color: colors.yellowDark, textAlign: 'center' },
  sub: { fontFamily: ff.bold, fontSize: font.body, color: colors.inkSoft, textAlign: 'center', marginTop: -10 },
  tiles: { flexDirection: 'row', gap: 10 },
  learnCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F3ECFE', borderRadius: 18, padding: 14, borderWidth: 2, borderColor: '#D5BFFA' },
  learnText: { flex: 1, fontFamily: ff.bold, fontSize: 15, color: colors.purpleDark, lineHeight: 21 },
});
