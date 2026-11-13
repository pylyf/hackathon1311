import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Nunito_600SemiBold, Nunito_800ExtraBold, Nunito_900Black } from '@expo-google-fonts/nunito';
import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { api, errMsg } from './src/api';
import type { Example } from './src/examples';
import type { BrainChange, ChildProfile, Curriculum, Lesson, MemoryNote, ProblemResponse, ProgressResponse, SessionEndResponse, Topic } from './src/contract';
import ResultScreen from './src/screens/ResultScreen';
import { colors, ff } from './src/theme';
import { Mascot } from './src/ui';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import PickScreen from './src/screens/PickScreen';
import TalkScreen from './src/screens/TalkScreen';
import LearnedScreen from './src/screens/LearnedScreen';
import DemoScreen from './src/screens/DemoScreen';
import UploadScreen from './src/screens/UploadScreen';
import CurriculumScreen from './src/screens/CurriculumScreen';
import LessonScreen from './src/screens/LessonScreen';
import { stopSpeaking } from './src/audio';

type Route =
  | { name: 'splash' }
  | { name: 'onboarding' }
  | { name: 'home' }
  | { name: 'pick'; topic?: Topic; example?: Example }
  | { name: 'talk'; problem: ProblemResponse }
  | { name: 'result'; before: ProgressResponse | null; after: ProgressResponse }
  | { name: 'learned'; newNotes?: MemoryNote[]; changes?: BrainChange[]; plan?: SessionEndResponse['plan'] }
  | { name: 'demo' }
  | { name: 'upload' }
  | { name: 'curriculum' }
  | { name: 'lesson'; lesson: Lesson };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'splash' });
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [fontsLoaded, fontError] = useFonts({
    Nunito_600SemiBold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });
  const fontsReady = fontsLoaded || !!fontError;
  const progressBefore = useRef<ProgressResponse | null>(null);

  // snapshot progress when a problem starts, so the result screen can show what changed
  const startProblem = (problem: ProblemResponse) => {
    progressBefore.current = null;
    api.progress().then((p) => (progressBefore.current = p)).catch(() => {});
    go({ name: 'talk', problem });
  };

  const solved = async () => {
    try {
      const after = await api.progress();
      go({ name: 'result', before: progressBefore.current, after });
    } catch {
      go({ name: 'pick' });
    }
  };
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);

  // No curriculum (or an older server without /curriculum) simply means the photo-only flow.
  const loadCurriculum = useCallback(async () => {
    try {
      const { curriculum: c } = await api.curriculum();
      setCurriculum(c ?? null);
    } catch {
      /* keep what we have */
    }
  }, []);

  const startSession = useCallback(async (): Promise<string> => {
    setSessionError(null);
    try {
      const { sessionId: id } = await api.startSession();
      setSessionId(id);
      return id;
    } catch (e) {
      setSessionError(errMsg(e));
      throw e;
    }
  }, []);

  useEffect(() => {
    startSession().catch(() => {});
  }, [startSession]);

  // Splash: show the otter for a moment while we check whether onboarding is done.
  useEffect(() => {
    if (!fontsReady) return;
    let alive = true;
    const minDelay = new Promise((r) => setTimeout(r, 1400));
    const load = api.profile().then((r) => r.profile).catch(() => undefined); // undefined = server unreachable
    Promise.all([load, minDelay]).then(([p]) => {
      if (!alive) return;
      if (p) setProfile(p);
      setRoute(p === null ? { name: 'onboarding' } : { name: 'home' });
    });
    return () => {
      alive = false;
    };
  }, [fontsReady]);

  useEffect(() => {
    if (route.name === 'home') loadCurriculum();
  }, [route.name, loadCurriculum]);

  const ensureSession = useCallback(async () => sessionId ?? (await startSession()), [sessionId, startSession]);

  const go = (r: Route) => {
    stopSpeaking();
    setRoute(r);
  };

  const finish = async () => {
    const id = sessionId;
    if (!id) return go({ name: 'learned' });
    const { notes, changes, plan } = await api.endSession(id); // errors are shown by TalkScreen
    setSessionId(null);
    startSession().catch(() => {});
    loadCurriculum();
    go({ name: 'learned', newNotes: notes, changes, plan });
  };

  const startWarmup = async () => {
    const w = curriculum?.warmup;
    if (!w) return;
    const id = await ensureSession();
    const problem = await api.lessonProblem({ sessionId: id, lessonId: w.lessonId, problemId: w.problem.id, warmup: true });
    go({ name: 'talk', problem });
  };

  let screen: React.ReactNode;
  switch (route.name) {
    case 'splash':
      return <Splash />;
    case 'onboarding':
      screen = (
        <OnboardingScreen
          onDone={(p) => {
            setProfile(p);
            go({ name: 'pick' });
          }}
        />
      );
      break;
    case 'home':
      screen = (
        <HomeScreen
          profile={profile}
          onRedoIntro={() => go({ name: 'onboarding' })}
          sessionError={sessionError}
          onRetrySession={() => startSession().catch(() => {})}
          curriculum={curriculum}
          onSnap={() => go({ name: 'pick' })}
          onExample={(example) => go({ name: 'pick', example })}
          onLearned={() => go({ name: 'learned' })}
          onDemo={() => go({ name: 'demo' })}
          onUpload={() => go({ name: 'upload' })}
          onLesson={(lesson) => go({ name: 'lesson', lesson })}
          onCurriculum={() => go({ name: 'curriculum' })}
          onWarmup={startWarmup}
        />
      );
      break;
    case 'pick':
      screen = (
        <PickScreen
          key={route.example?.id ?? route.topic ?? 'all'}
          autoExample={route.example}
          ensureSession={ensureSession}
          topic={route.topic}
          onBack={() => go({ name: 'home' })}
          onProblem={startProblem}
        />
      );
      break;
    case 'talk':
      screen = (
        <TalkScreen
          key={route.problem.problemId}
          sessionId={sessionId ?? ''}
          problem={route.problem}
          onBack={() => go({ name: 'home' })}
          onSolved={solved}
          onNext={() => go({ name: 'pick' })}
          onNextProblem={(problem) => go({ name: 'talk', problem })}
          onFinish={finish}
        />
      );
      break;
    case 'result':
      screen = <ResultScreen before={route.before} after={route.after} onNext={() => go({ name: 'pick' })} onFinish={finish} />;
      break;
    case 'learned':
      screen = <LearnedScreen newNotes={route.newNotes} changes={route.changes} plan={route.plan} curriculum={curriculum} onBack={() => go({ name: 'home' })} />;
      break;
    case 'upload':
      screen = (
        <UploadScreen
          onBack={() => go({ name: 'home' })}
          onDone={(c) => {
            setCurriculum(c);
            go({ name: 'curriculum' });
          }}
        />
      );
      break;
    case 'curriculum':
      screen = (
        <CurriculumScreen
          initial={curriculum}
          onLoaded={setCurriculum}
          onBack={() => go({ name: 'home' })}
          onLesson={(lesson) => go({ name: 'lesson', lesson })}
          onUpload={() => go({ name: 'upload' })}
        />
      );
      break;
    case 'lesson':
      screen = (
        <LessonScreen
          key={route.lesson.id}
          lesson={route.lesson}
          ensureSession={ensureSession}
          onBack={() => go(curriculum ? { name: 'curriculum' } : { name: 'home' })}
          onProblem={(problem) => go({ name: 'talk', problem })}
        />
      );
      break;
    case 'demo':
      screen = <DemoScreen onBack={() => go({ name: 'home' })} />;
      break;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.inner}>{screen}</View>
    </View>
  );
}

function Splash() {
  return (
    <View style={styles.splash}>
      <StatusBar style="light" />
      <View style={styles.splashOtter}>
        <Mascot mood="hello" size={190} />
      </View>
      <Text style={styles.wordmark}>nudge</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', gap: 28 },
  splashOtter: { width: 230, height: 230, borderRadius: 115, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  wordmark: { fontFamily: ff.display, fontSize: 56, color: '#fff', letterSpacing: 1 },
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'web' ? 4 : Platform.OS === 'android' ? 32 : 50,
  },
  inner: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
