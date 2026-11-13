import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { ApiError, api, errMsg } from '../api';
import type { HintLevel, HintStyle, ProblemResponse, SceneSpec, TurnRequest, TutorReply, UIEvent, UISpec } from '../contract';
import { GenUIRenderer } from '../genui/GenUIRenderer';
import { recordingToBase64, speakReply, stopSpeaking } from '../audio';
import { colors, ff, font } from '../theme';
import { Bounce, Icon, Pop } from '../game';
import { Reward } from '../reward';
import { BigButton, BottomBar, BubbleText, ErrorBox, Mascot, Pill, SpeechBubble, TopBar, type Mood } from '../ui';

const UI_DEBOUNCE_MS = 1200;
const IDLE_MS = 20000;
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 };

const STYLE_COLORS: Record<HintStyle, string> = {
  verbal: colors.blue,
  visual: colors.green,
  story: colors.purple,
  'smaller-numbers': colors.primary,
};

type TurnExtra = Omit<TurnRequest, 'sessionId' | 'problemId'>;

export default function TalkScreen({
  sessionId,
  problem,
  onBack,
  onSolved,
  onNext,
  onNextProblem,
  onFinish,
}: {
  sessionId: string;
  problem: ProblemResponse;
  onBack: () => void;
  onSolved: () => void; // photo/example flow: go to the celebration screen
  onNext: () => void; // photo flow: snap another problem
  onNextProblem: (p: ProblemResponse) => void; // lesson flow: go to the next practice problem
  onFinish: () => Promise<void>;
}) {
  const [reply, setReply] = useState<TutorReply>(problem.intro);
  const [ui, setUi] = useState<UISpec | null>(problem.intro.ui);
  const [hint, setHint] = useState<{ level: HintLevel; style: HintStyle } | null>(problem.intro.hint);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [solved, setSolved] = useState(false);
  const [reward, setReward] = useState<{ kind: 'step' | 'solved'; id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [prepared, setPrepared] = useState<SceneSpec | null>(null);
  const [idle, setIdle] = useState(false);
  const lastActive = useRef(Date.now());
  const poke = useCallback(() => {
    lastActive.current = Date.now();
    setIdle(false);
  }, []);
  // Lesson flow: next problem is prefetched as soon as this one is solved.
  const lessonId = problem.lessonId;
  const [nextProblem, setNextProblem] = useState<ProblemResponse | null>(null);
  const [lessonDone, setLessonDone] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const busyRef = useRef(false);
  const lastReq = useRef<TurnExtra | null>(null);
  const pendingEvent = useRef<UIEvent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // y of the visual + tutor bubble block: after each reply we scroll there, so the picture is what the child sees first
  const answerY = useRef(0);
  const toAnswer = () => scrollRef.current?.scrollTo({ y: Math.max(0, answerY.current - 8), animated: true });

  const [replyCount, setReplyCount] = useState(0);
  const applyReply = useCallback((r: TutorReply) => {
    lastActive.current = Date.now();
    setIdle(false);
    setReply(r);
    setReplyCount((c) => c + 1);
    if (r.ui) setUi(r.ui);
    if (r.hint) setHint(r.hint);
    speakReply(r.text, r.audioBase64);
  }, []);

  // Speak the intro on arrival; stop any audio when leaving.
  useEffect(() => {
    speakReply(problem.intro.text, problem.intro.audioBase64);
    return () => {
      stopSpeaking();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [problem]);

  // The agent prepares a "Show me" explainer in the background — pick it up when it is ready.
  useEffect(() => {
    let alive = true;
    api
      .preparedScene(problem.problemId)
      .then((r) => alive && r.scene && setPrepared(r.scene))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [problem.problemId]);

  // Attention: if nothing happens for a while, the otter tries to win the child back.
  useEffect(() => {
    const id = setInterval(() => {
      if (!busyRef.current && Date.now() - lastActive.current > IDLE_MS) setIdle(true);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const sendTurn = useCallback(
    async (extra: TurnExtra) => {
      if (busyRef.current) return;
      poke();
      busyRef.current = true;
      lastReq.current = extra;
      setBusy(true);
      setError(null);
      try {
        const res = await api.turn({ sessionId, problemId: problem.problemId, ...extra });
        if (res.transcript && !extra.uiEvent) setTranscript(res.transcript);
        applyReply(res.reply);
        if (res.solved) setSolved(true);
        // celebrate: a small burst for a correct step, a big one for the answer
        if (res.solved) setReward({ kind: 'solved', id: Date.now() });
        else if (res.progress) setReward({ kind: 'step', id: Date.now() });
        setTimeout(toAnswer, 120);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [sessionId, problem.problemId, applyReply, poke],
  );

  // ---- GenUI events: debounce, then send as a turn ----
  const flushEvent = useCallback(() => {
    timer.current = null;
    const ev = pendingEvent.current;
    if (!ev) return;
    if (busyRef.current) {
      timer.current = setTimeout(flushEvent, 800);
      return;
    }
    pendingEvent.current = null;
    sendTurn({ uiEvent: ev });
  }, [sendTurn]);

  const onUIEvent = useCallback(
    (e: UIEvent) => {
      if (solved) return;
      poke();
      if (e.component === 'Choice' && typeof e.data.option === 'string') {
        setTranscript(e.data.option);
        sendTurn({ text: e.data.option });
        return;
      }
      pendingEvent.current = e;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flushEvent, UI_DEBOUNCE_MS);
    },
    [flushEvent, solved, poke, sendTurn],
  );

  // Scene steps are read aloud in the tutor's own voice (falls back to device speech).
  const sayStep = useCallback((t: string) => {
    lastActive.current = Date.now();
    api
      .tts(t)
      .then((r) => speakReply(t, r.audioBase64))
      .catch(() => speakReply(t, null));
  }, []);

  const showMe = () => {
    if (!prepared) return;
    poke();
    setUi(prepared);
    setTimeout(toAnswer, 150);
  };

  // ---- Voice: tap to start, tap to stop ----
  // Never start the mic by accident: not during the celebration, and not right after something on
  // screen changed (a reply arriving, a banner appearing), when a tap was probably aimed elsewhere.
  const quietUntil = useRef(0);
  useEffect(() => {
    quietUntil.current = Date.now() + 700;
  }, [reply, reward, idle, ui]);
  const tapMic = () => {
    if (reward || Date.now() < quietUntil.current) return;
    startRecording();
  };

  // Safety: never leave the mic open for long.
  useEffect(() => {
    if (!recording) return;
    const t = setTimeout(() => stopRecording(), 30000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRecording = async () => {
    poke();
    setError(null);
    stopSpeaking();
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('I need the microphone to hear you. You can also type below!');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (e) {
      setError(`Microphone problem: ${errMsg(e)}. You can type instead!`);
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) throw new Error('no recording');
      const { base64, mimeType } = await recordingToBase64(uri);
      // ~1.5 KB is well under half a second of audio — treat as "nothing recorded".
      if (base64.length < 2000) {
        setError("I didn't hear anything. Tap the mic, talk, then tap again to stop!");
        return;
      }
      await sendTurn({ audioBase64: base64, audioMimeType: mimeType });
    } catch (e) {
      setError(`I didn't catch that (${errMsg(e)}). Try again or type it!`);
    }
  };

  const sendText = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    setTranscript(t);
    sendTurn({ text: t });
  };

  const fetchNext = useCallback(async (): Promise<ProblemResponse | null> => {
    if (!lessonId) return null;
    setNextBusy(true);
    try {
      const p = await api.lessonProblem({ sessionId, lessonId });
      if (!p || !p.problemId || p.problemId === problem.problemId) {
        setLessonDone(true);
        return null;
      }
      setNextProblem(p);
      return p;
    } catch (e) {
      // 404/409/410 = no unsolved problems left in this lesson.
      if (e instanceof ApiError && [404, 409, 410].includes(e.status)) setLessonDone(true);
      else throw e;
      return null;
    } finally {
      setNextBusy(false);
    }
  }, [lessonId, sessionId, problem.problemId]);

  useEffect(() => {
    if (solved && lessonId) fetchNext().catch(() => {}); // errors are retried when "Next problem" is tapped
  }, [solved, lessonId, fetchNext]);

  const next = async () => {
    if (!lessonId) return onNext();
    setError(null);
    try {
      const p = nextProblem ?? (await fetchNext());
      if (p) onNextProblem(p);
    } catch (e) {
      setError(errMsg(e));
    }
  };

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

  const micLabel = recording ? 'Tap to stop' : busy ? 'Thinking…' : 'Tap to talk';
  // pebbles still on the table: fewer hints = more pebbles (matches the server's scoring)
  const hintsSoFar = Math.max(0, (hint?.level ?? 1) - 1);
  const potential = 10 + (hintsSoFar <= 0 ? 10 : hintsSoFar === 1 ? 6 : hintsSoFar === 2 ? 3 : 0);
  const mood: Mood = solved ? 'dancing' : error ? 'crying' : recording ? 'excited' : busy ? 'pebble' : 'hello';

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title=""
        onBack={onBack}
        right={
          <View style={styles.pot}>
            <Text style={styles.potText}>🪨 +{potential}</Text>
          </View>
        }
      />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.problem}>
          <Text style={styles.problemLabel}>{lessonId ? 'PRACTICE' : 'YOUR PROBLEM'}</Text>
          <Text style={styles.problemText}>{problem.text}</Text>
        </View>

        {/* Visual first, then what Nudge says: the picture must be visible without scrolling. */}
        <View style={styles.answer} onLayout={(e) => (answerY.current = e.nativeEvent.layout.y)}>
          {ui && <GenUIRenderer spec={ui} onEvent={onUIEvent} onSay={sayStep} />}

          {transcript && (
            <View style={styles.kidBubble}>
              <Text style={styles.kidLabel}>YOU SAID</Text>
              <Text style={styles.kidText}>“{transcript}”</Text>
            </View>
          )}

          <View style={styles.tutorRow}>
            <Bounce distance={busy ? 5 : 2}>
              <Mascot mood={mood} size={76} />
            </Bounce>
            <SpeechBubble style={{ flex: 1 }}>
              {busy ? <ThinkingDots /> : <WordReveal key={reply.text} text={reply.text} />}
              {!busy && (
                <Pressable onPress={() => speakReply(reply.text, reply.audioBase64)} hitSlop={8} style={styles.replayBtn}>
                  <Text style={styles.replay}>🔊 SAY IT AGAIN</Text>
                </Pressable>
              )}
            </SpeechBubble>
          </View>
        </View>

        {prepared && ui !== prepared && !solved && (
          <Pop>
            <Pressable onPress={showMe}>
              {({ pressed }) => (
                <View style={[styles.showMe, { borderBottomWidth: pressed ? 2 : 5, marginTop: pressed ? 3 : 0 }]}>
                  <Text style={{ fontSize: 22 }}>🎬</Text>
                  <Text style={styles.showMeTitle}>SHOW ME HOW</Text>
                </View>
              )}
            </Pressable>
          </Pop>
        )}

        {error && <ErrorBox message={error} onRetry={lastReq.current ? () => sendTurn(lastReq.current!) : undefined} />}
      </ScrollView>

      {solved ? (
        <BottomBar style={styles.celebrate}>
          <View style={styles.solvedRow}>
            <View style={styles.solvedCheck}>
              <Icon name={lessonDone ? 'trophy' : 'check-bold'} size={30} color={colors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.celebrateTitle}>{lessonDone ? 'Lesson done!' : 'Amazing!'}</Text>
              <Text style={styles.celebrateText}>{lessonDone ? 'You practised every problem!' : 'You found the answer yourself!'}</Text>
            </View>
          </View>
          {lessonId ? (
            <View style={styles.row}>
              {!lessonDone && (
                <BigButton
                  label={nextBusy && !nextProblem ? 'Getting…' : 'Next problem'}
                  onPress={next}
                  color={colors.green}
                  style={{ flex: 1 }}
                  disabled={finishing || (nextBusy && !nextProblem)}
                />
              )}
              <BigButton label={finishing ? 'Saving…' : 'Finish'} onPress={finish} variant="outline" color={colors.greenDark} style={{ flex: 1 }} disabled={finishing} />
            </View>
          ) : (
            <BigButton label="Continue" onPress={onSolved} color={colors.green} />
          )}
        </BottomBar>
      ) : (
        <BottomBar style={styles.bottom}>
          {idle && !busy && !recording && (
            <Pop style={styles.nudgeFloat}>
              <Pressable onPress={prepared && ui !== prepared ? showMe : poke} style={styles.nudge}>
                <Mascot mood="excited" size={44} />
                <Text style={styles.nudgeText}>
                  {prepared && ui !== prepared ? 'Psst! Want to watch a tiny movie about it? 🎬' : ui ? 'Psst! Try touching the picture 👆' : 'Psst! Tap the mic and tell me your idea 🎤'}
                </Text>
              </Pressable>
            </Pop>
          )}
          <View style={styles.micRow}>
            <Pressable
              onPress={recording ? stopRecording : tapMic}
              disabled={busy && !recording}
              focusable={false}
              accessibilityRole="button"
              accessibilityLabel={micLabel}
            >
              {({ pressed }) => {
                const bg = recording ? colors.red : busy ? colors.track : colors.primary;
                const edge = recording ? colors.redDark : busy ? colors.lineDark : colors.primaryDark;
                return (
                  <PulseIf on={idle && !busy}>
                  <View
                    style={[
                      styles.mic,
                      { backgroundColor: bg, borderBottomColor: edge, borderBottomWidth: pressed ? 2 : 6, marginTop: pressed ? 4 : 0 },
                    ]}
                  >
                    {busy && !recording ? <ActivityIndicator color={colors.inkSoft} size="large" /> : <Text style={styles.micIcon}>{recording ? '⏹' : '🎤'}</Text>}
                  </View>
                  </PulseIf>
                );
              }}
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.micLabel}>{micLabel.toUpperCase()}</Text>
              <Text style={styles.micSub}>{recording ? "I'm listening…" : 'Tell me what you think!'}</Text>
            </View>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                poke();
              }}
              onSubmitEditing={sendText}
              placeholder="…or type here"
              placeholderTextColor={colors.trackText}
              style={styles.input}
              editable={!busy}
              returnKeyType="send"
            />
            <BigButton small label="Send" onPress={sendText} disabled={busy || !text.trim()} color={colors.blue} />
          </View>
        </BottomBar>
      )}
      {reward && <Reward key={reward.id} kind={reward.kind} onDone={() => setReward((r) => (r?.id === reward.id ? null : r))} />}
    </View>
  );
}

/** Tutor text appears word by word — motion keeps eyes on it while it is spoken. */
function WordReveal({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((k) => (k >= words.length ? k : k + 1)), 85);
    return () => clearInterval(id);
  }, [text, words.length]);
  return (
    <Text style={styles.tutorText}>
      {words.map((w, i) => (
        <Text key={i} style={{ opacity: i < n ? 1 : 0.08 }}>
          {w}{' '}
        </Text>
      ))}
    </Text>
  );
}

function ThinkingDots() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 3, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 8 }}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: colors.primary,
            transform: [{ translateY: v.interpolate({ inputRange: [i, i + 0.5, i + 1, 3], outputRange: [0, -8, 0, 0], extrapolate: 'clamp' }) }],
          }}
        />
      ))}
    </View>
  );
}

function PulseIf({ on, children }: { on: boolean; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, v]);
  return <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  showMe: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: colors.purple,
    borderBottomColor: colors.purpleDark,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  showMeTitle: { fontFamily: ff.black, color: '#fff', fontSize: 15, letterSpacing: 1 },
  showMeSub: { fontFamily: ff.bold, color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  nudgeFloat: { position: 'absolute', left: 16, right: 16, bottom: '100%', marginBottom: 8, zIndex: 5 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.yellowLight, borderRadius: 14, padding: 6, borderWidth: 2, borderColor: '#FFE08A' },
  nudgeText: { flex: 1, fontFamily: ff.black, fontSize: 14, color: colors.ink },
  scroll: { padding: 16, gap: 16, paddingBottom: 24 },
  answer: { gap: 14 },
  problem: {
    backgroundColor: colors.yellowLight,
    borderWidth: 2,
    borderColor: '#FFE08A',
    borderBottomWidth: 4,
    borderRadius: 16,
    padding: 16,
  },
  problemLabel: { fontFamily: ff.black, fontSize: 12, color: colors.yellowDark, letterSpacing: 1, marginBottom: 6 },
  problemText: { fontFamily: ff.bold, fontSize: font.body, color: colors.ink, lineHeight: 25 },
  tutorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginLeft: -6 },
  tutorText: { fontFamily: ff.regular, fontSize: font.body + 1, lineHeight: 27, color: colors.ink },
  replayBtn: { marginTop: 8, alignSelf: 'flex-start' },
  replay: { color: colors.blue, fontSize: 13, fontFamily: ff.black, letterSpacing: 0.6 },
  kidBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.blueLight,
    borderWidth: 2,
    borderColor: colors.blueBorder,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: '85%',
  },
  kidLabel: { fontFamily: ff.black, fontSize: 11, color: colors.blue, letterSpacing: 1 },
  kidText: { fontFamily: ff.bold, fontSize: font.body, color: colors.blueDark, marginTop: 2 },
  bottom: { gap: 12 },
  micRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  mic: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  micIcon: { fontSize: 30, color: '#fff' },
  micLabel: { fontFamily: ff.black, fontSize: font.body, color: colors.ink, letterSpacing: 0.6 },
  micSub: { fontFamily: ff.regular, fontSize: font.small, color: colors.inkSoft },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: font.body,
    fontFamily: ff.regular,
    color: colors.ink,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pot: { borderWidth: 2, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  potText: { fontFamily: ff.black, fontSize: 13, color: colors.otter },
  solvedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  solvedCheck: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  celebrate: { backgroundColor: colors.greenLight, borderTopColor: '#BDEBD1' },
  celebrateTitle: { fontFamily: ff.display, fontSize: 26, color: colors.greenDark },
  celebrateText: { fontFamily: ff.bold, fontSize: font.small, color: colors.greenDark },
});
