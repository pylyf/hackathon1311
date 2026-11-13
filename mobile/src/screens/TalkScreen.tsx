import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { api, errMsg } from '../api';
import type { HintLevel, HintStyle, ProblemResponse, TurnRequest, TutorReply, UIEvent, UISpec } from '../contract';
import { GenUIRenderer } from '../genui/GenUIRenderer';
import { recordingToBase64, speakReply, stopSpeaking } from '../audio';
import { colors, font, radius, shadow } from '../theme';
import { BigButton, Card, ErrorBox, TopBar } from '../ui';

const UI_DEBOUNCE_MS = 1200;
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
  onNext,
  onFinish,
}: {
  sessionId: string;
  problem: ProblemResponse;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => Promise<void>;
}) {
  const [reply, setReply] = useState<TutorReply>(problem.intro);
  const [ui, setUi] = useState<UISpec | null>(problem.intro.ui);
  const [hint, setHint] = useState<{ level: HintLevel; style: HintStyle } | null>(problem.intro.hint);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [solved, setSolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [finishing, setFinishing] = useState(false);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const busyRef = useRef(false);
  const lastReq = useRef<TurnExtra | null>(null);
  const pendingEvent = useRef<UIEvent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const applyReply = useCallback((r: TutorReply) => {
    setReply(r);
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

  const sendTurn = useCallback(
    async (extra: TurnExtra) => {
      if (busyRef.current) return;
      busyRef.current = true;
      lastReq.current = extra;
      setBusy(true);
      setError(null);
      try {
        const res = await api.turn({ sessionId, problemId: problem.problemId, ...extra });
        if (res.transcript && !extra.uiEvent) setTranscript(res.transcript);
        applyReply(res.reply);
        if (res.solved) setSolved(true);
        setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 50);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [sessionId, problem.problemId, applyReply],
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
      pendingEvent.current = e;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flushEvent, UI_DEBOUNCE_MS);
    },
    [flushEvent, solved],
  );

  // ---- Voice: tap to start, tap to stop ----
  const startRecording = async () => {
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

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Let's think!"
        onBack={onBack}
        right={
          hint ? (
            <View style={[styles.badge, { backgroundColor: STYLE_COLORS[hint.style] ?? colors.blue }]}>
              <Text style={styles.badgeText}>
                Hint L{hint.level} · {hint.style}
              </Text>
            </View>
          ) : null
        }
      />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card style={styles.problem}>
          <Text style={styles.problemLabel}>YOUR PROBLEM · {problem.topic}</Text>
          <Text style={styles.problemText}>{problem.text}</Text>
        </Card>

        {ui && <GenUIRenderer spec={ui} onEvent={onUIEvent} />}

        <View style={[styles.bubble, shadow]}>
          <Text style={styles.owl}>🦉</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.tutorText}>{reply.text}</Text>
            <Pressable onPress={() => speakReply(reply.text, reply.audioBase64)} hitSlop={8}>
              <Text style={styles.replay}>🔊 Say it again</Text>
            </Pressable>
          </View>
        </View>

        {transcript && (
          <View style={styles.kidBubble}>
            <Text style={styles.kidText}>You: “{transcript}”</Text>
          </View>
        )}

        {error && <ErrorBox message={error} onRetry={lastReq.current ? () => sendTurn(lastReq.current!) : undefined} />}
      </ScrollView>

      {solved ? (
        <View style={[styles.bottom, styles.celebrate]}>
          <Text style={styles.party}>🎉 🌟 🎉</Text>
          <Text style={styles.celebrateText}>You did it! Awesome thinking!</Text>
          <View style={styles.row}>
            <BigButton label="Next problem" onPress={onNext} color={colors.green} style={{ flex: 1 }} disabled={finishing} />
            <BigButton label={finishing ? 'Saving…' : 'Finish'} onPress={finish} color={colors.purple} style={{ flex: 1 }} disabled={finishing} />
          </View>
        </View>
      ) : (
        <View style={styles.bottom}>
          <Pressable
            onPress={recording ? stopRecording : startRecording}
            disabled={busy && !recording}
            accessibilityRole="button"
            accessibilityLabel={micLabel}
            style={({ pressed }) => [
              styles.mic,
              shadow,
              {
                backgroundColor: recording ? colors.red : busy ? colors.inkSoft : colors.primary,
                transform: [{ scale: pressed ? 0.94 : recording ? 1.08 : 1 }],
              },
            ]}
          >
            {busy && !recording ? <ActivityIndicator color="#fff" size="large" /> : <Text style={styles.micIcon}>{recording ? '⏹' : '🎤'}</Text>}
          </Pressable>
          <Text style={styles.micLabel}>{micLabel}</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={sendText}
              placeholder="…or type here"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
              editable={!busy}
              returnKeyType="send"
            />
            <BigButton small label="Send" onPress={sendText} disabled={busy || !text.trim()} color={colors.blue} />
          </View>
          <Pressable onPress={finish} disabled={finishing} hitSlop={8}>
            <Text style={styles.finishLink}>{finishing ? 'Saving…' : 'Finish for today'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 16, paddingBottom: 24 },
  problem: { backgroundColor: '#FFF1C9' },
  problemLabel: { fontSize: 13, fontWeight: '800', color: colors.inkSoft, letterSpacing: 1, marginBottom: 6 },
  problemText: { fontSize: font.body + 1, color: colors.ink, lineHeight: 28, fontWeight: '600' },
  bubble: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: 16,
    alignItems: 'flex-start',
  },
  owl: { fontSize: 40 },
  tutorText: { fontSize: font.big - 2, color: colors.ink, lineHeight: 31, fontWeight: '600' },
  replay: { color: colors.blue, fontSize: font.small, marginTop: 8, fontWeight: '700' },
  kidBubble: { alignSelf: 'flex-end', backgroundColor: '#DDEBFF', borderRadius: 18, padding: 12, maxWidth: '85%' },
  kidText: { fontSize: font.body, color: colors.ink },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  bottom: {
    alignItems: 'center',
    padding: 16,
    paddingBottom: 20,
    gap: 8,
    borderTopWidth: 2,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  mic: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center' },
  micIcon: { fontSize: 46, color: '#fff' },
  micLabel: { fontSize: font.body, fontWeight: '800', color: colors.ink },
  inputRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: font.body,
    color: colors.ink,
  },
  finishLink: { color: colors.inkSoft, fontSize: font.small, textDecorationLine: 'underline', marginTop: 2 },
  celebrate: { backgroundColor: '#E5FBEF', gap: 12 },
  party: { fontSize: 44 },
  celebrateText: { fontSize: font.big, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
});
