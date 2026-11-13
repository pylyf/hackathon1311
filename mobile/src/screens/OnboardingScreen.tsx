import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, errMsg } from '../api';
import type { ChildProfile } from '../contract';
import { colors, ff, font } from '../theme';
import { BigButton, BottomBar, BubbleText, ErrorBox, Mascot, MascotSays, OptionCard, SpeechBubble, TopBar } from '../ui';

const INTERESTS: { key: string; icon: string }[] = [
  { key: 'Football', icon: '⚽' },
  { key: 'Animals', icon: '🐶' },
  { key: 'Dinosaurs', icon: '🦖' },
  { key: 'Space', icon: '🚀' },
  { key: 'Drawing', icon: '🎨' },
  { key: 'Video games', icon: '🎮' },
  { key: 'Music', icon: '🎵' },
  { key: 'Baking', icon: '🍪' },
  { key: 'Cars', icon: '🚗' },
  { key: 'LEGO', icon: '🧱' },
  { key: 'Swimming', icon: '🏊' },
  { key: 'Magic', icon: '🪄' },
];

const GRADES: { grade: number | null; label: string; age: string }[] = [
  { grade: 1, label: 'Grade 1', age: 'age 6–7' },
  { grade: 2, label: 'Grade 2', age: 'age 7–8' },
  { grade: 3, label: 'Grade 3', age: 'age 8–9' },
  { grade: 4, label: 'Grade 4', age: 'age 9–10' },
  { grade: 5, label: 'Grade 5', age: 'age 10–11' },
  { grade: null, label: "I'm not sure", age: '' },
];

const FEELINGS: { key: NonNullable<ChildProfile['mathFeeling']>; icon: string; label: string }[] = [
  { key: 'love', icon: '😍', label: 'I love it!' },
  { key: 'ok', icon: '🙂', label: "It's okay" },
  { key: 'tricky', icon: '😬', label: "It's a bit tricky" },
];

const GOALS: { n: number; label: string; tag: string }[] = [
  { n: 1, label: '1 problem / day', tag: 'Easy' },
  { n: 3, label: '3 problems / day', tag: 'Regular' },
  { n: 5, label: '5 problems / day', tag: 'Serious' },
  { n: 10, label: '10 problems / day', tag: 'Super brain' },
];

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: '📸', title: 'Snap your homework', text: 'Take a photo of one problem' },
  { icon: '🎤', title: 'Talk it through', text: 'I listen and ask you questions' },
  { icon: '💡', title: 'Hints, never answers', text: 'You find the answer yourself!' },
  { icon: '🧠', title: 'I learn what helps you', text: 'Every time we play, I get better' },
];

// step indexes
const WELCOME = 0;
const INTRO = 1;
const NAME = 2;
const GRADE = 3;
const LIKES = 4;
const FEEL = 5;
const GOAL = 6;
const FEATURES_STEP = 7;
const DONE = 8;
const QUESTION_STEPS = FEATURES_STEP - INTRO; // steps that show the progress bar

export default function OnboardingScreen({ onDone }: { onDone: (p: ChildProfile) => void }) {
  const [step, setStep] = useState(WELCOME);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<number | null | undefined>(undefined);
  const [likes, setLikes] = useState<string[]>([]);
  const [feeling, setFeeling] = useState<ChildProfile['mathFeeling'] | undefined>(undefined);
  const [goal, setGoal] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // slide/fade each step in
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [step, anim]);
  const enter = {
    opacity: anim,
    transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  };

  const first = name.trim().split(' ')[0] || 'friend';
  const next = () => setStep((s) => Math.min(DONE, s + 1));
  const back = step > WELCOME ? () => setStep((s) => s - 1) : undefined;

  const finish = async () => {
    setSaving(true);
    setError(null);
    const profile: ChildProfile = {
      name: name.trim(),
      grade: grade ?? null,
      interests: likes,
      mathFeeling: feeling ?? null,
      dailyGoal: goal ?? null,
    };
    try {
      const res = await api.saveProfile(profile);
      onDone(res.profile ?? profile);
    } catch (e) {
      setError(errMsg(e));
      setSaving(false);
    }
  };

  const canContinue =
    step === NAME ? name.trim().length > 0
    : step === GRADE ? grade !== undefined
    : step === LIKES ? likes.length > 0
    : step === FEEL ? feeling !== undefined
    : step === GOAL ? goal !== undefined
    : true;

  const buttonLabel = step === GOAL ? "I'm committed" : step === DONE ? (saving ? 'Saving…' : "Let's go!") : 'Continue';
  const showProgress = step > INTRO && step < DONE;

  let body: React.ReactNode;
  switch (step) {
    case WELCOME:
      body = (
        <View style={styles.centerStage}>
          <SpeechBubble tail="down">
            <BubbleText style={styles.big}>Hi there! I'm Nudge!</BubbleText>
          </SpeechBubble>
          <Mascot mood="hello" size={220} />
        </View>
      );
      break;
    case INTRO:
      body = (
        <View style={styles.centerStage}>
          <SpeechBubble tail="down">
            <BubbleText style={styles.big}>
              Just <Text style={styles.strong}>5 quick questions</Text> before we start your first problem!
            </BubbleText>
          </SpeechBubble>
          <Mascot mood="excited" size={220} />
        </View>
      );
      break;
    case NAME:
      body = (
        <>
          <MascotSays mood="pebble">What's your name?</MascotSays>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.trackText}
            style={styles.input}
            autoFocus
            autoCapitalize="words"
            returnKeyType="next"
            maxLength={30}
            onSubmitEditing={() => canContinue && next()}
          />
        </>
      );
      break;
    case GRADE:
      body = (
        <>
          <MascotSays mood="pebble">{`Nice to meet you, ${first}! Which grade are you in?`}</MascotSays>
          <View style={styles.list}>
            {GRADES.map((g) => (
              <OptionCard
                key={g.label}
                icon={<GradeIcon n={g.grade} />}
                label={g.label}
                right={g.age}
                selected={grade === g.grade}
                onPress={() => setGrade(g.grade)}
              />
            ))}
          </View>
        </>
      );
      break;
    case LIKES:
      body = (
        <>
          <MascotSays mood="love">What do you love? Pick as many as you like!</MascotSays>
          <View style={styles.grid}>
            {INTERESTS.map((it) => {
              const on = likes.includes(it.key);
              return (
                <OptionCard
                  key={it.key}
                  icon={it.icon}
                  label={it.key}
                  selected={on}
                  vertical
                  onPress={() => setLikes((l) => (on ? l.filter((x) => x !== it.key) : [...l, it.key]))}
                  style={styles.gridItem}
                />
              );
            })}
          </View>
        </>
      );
      break;
    case FEEL:
      body = (
        <>
          <MascotSays mood="pebble">How do you feel about maths?</MascotSays>
          <View style={styles.list}>
            {FEELINGS.map((f) => (
              <OptionCard key={f.key} icon={f.icon} label={f.label} selected={feeling === f.key} onPress={() => setFeeling(f.key)} />
            ))}
          </View>
        </>
      );
      break;
    case GOAL:
      body = (
        <>
          <MascotSays mood="excited">What's your daily goal?</MascotSays>
          <View style={styles.list}>
            {GOALS.map((g) => (
              <OptionCard key={g.n} label={g.label} right={g.tag} selected={goal === g.n} onPress={() => setGoal(g.n)} />
            ))}
          </View>
        </>
      );
      break;
    case FEATURES_STEP:
      body = (
        <>
          <MascotSays mood="laughing">Here's how we'll do it together!</MascotSays>
          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.feature}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      );
      break;
    default:
      body = (
        <View style={styles.centerStage}>
          <SpeechBubble tail="down">
            <BubbleText style={styles.big}>
              Awesome, <Text style={styles.strong}>{first}</Text>! Let's solve your first problem together!
            </BubbleText>
          </SpeechBubble>
          <Mascot mood="dancing" size={220} />
          {error && <ErrorBox message={error} />}
        </View>
      );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar onBack={saving ? undefined : back} progress={showProgress ? (step - INTRO) / QUESTION_STEPS : undefined} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.body, enter]}>{body}</Animated.View>
      </ScrollView>
      <BottomBar style={styles.bottom}>
        <BigButton
          label={buttonLabel}
          onPress={step === DONE ? finish : next}
          disabled={!canContinue || saving}
          color={colors.primary}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

/** Little signal-bars icon: more bars for higher grades. */
function GradeIcon({ n }: { n: number | null }) {
  const filled = n ?? 0;
  return (
    <View style={styles.bars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.barStick, { height: 6 + i * 4, backgroundColor: i <= filled ? colors.blue : '#CFE9FB' }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  body: { flex: 1, gap: 22 },
  centerStage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, minHeight: 440 },
  big: { fontSize: font.big - 1, lineHeight: 30, textAlign: 'center' },
  strong: { fontFamily: ff.black },
  list: { gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '31%', flexGrow: 1 },
  input: {
    borderWidth: 2,
    borderColor: colors.line,
    borderBottomWidth: 4,
    borderRadius: 16,
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: font.big,
    fontFamily: ff.bold,
    color: colors.ink,
  },
  features: { gap: 22, paddingHorizontal: 4, marginTop: 6 },
  feature: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  featureIcon: { fontSize: 36 },
  featureTitle: { fontFamily: ff.black, fontSize: font.body + 1, color: colors.ink },
  featureText: { fontFamily: ff.regular, fontSize: font.small, color: colors.inkSoft, marginTop: 2 },
  bottom: { borderTopWidth: 0 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, width: 40, height: 28 },
  barStick: { width: 5, borderRadius: 2 },
});
