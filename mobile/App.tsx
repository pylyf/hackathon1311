import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { api, errMsg } from './src/api';
import type { Curriculum, Lesson, MemoryNote, ProblemResponse, SessionEndResponse } from './src/contract';
import { colors } from './src/theme';
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
  | { name: 'home' }
  | { name: 'pick' }
  | { name: 'talk'; problem: ProblemResponse }
  | { name: 'learned'; newNotes?: MemoryNote[]; plan?: SessionEndResponse['plan'] }
  | { name: 'demo' }
  | { name: 'upload' }
  | { name: 'curriculum' }
  | { name: 'lesson'; lesson: Lesson };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
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
    const { notes, plan } = await api.endSession(id); // errors are shown by TalkScreen
    setSessionId(null);
    startSession().catch(() => {});
    loadCurriculum();
    go({ name: 'learned', newNotes: notes, plan });
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
    case 'home':
      screen = (
        <HomeScreen
          sessionError={sessionError}
          onRetrySession={() => startSession().catch(() => {})}
          curriculum={curriculum}
          onSnap={() => go({ name: 'pick' })}
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
          ensureSession={ensureSession}
          onBack={() => go({ name: 'home' })}
          onProblem={(problem) => go({ name: 'talk', problem })}
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
          onNext={() => go({ name: 'pick' })}
          onNextProblem={(problem) => go({ name: 'talk', problem })}
          onFinish={finish}
        />
      );
      break;
    case 'learned':
      screen = <LearnedScreen newNotes={route.newNotes} plan={route.plan} curriculum={curriculum} onBack={() => go({ name: 'home' })} />;
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'web' ? 8 : Platform.OS === 'android' ? 36 : 50,
  },
  inner: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
