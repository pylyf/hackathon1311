import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { api, errMsg } from './src/api';
import type { MemoryNote, ProblemResponse } from './src/contract';
import { colors } from './src/theme';
import HomeScreen from './src/screens/HomeScreen';
import PickScreen from './src/screens/PickScreen';
import TalkScreen from './src/screens/TalkScreen';
import LearnedScreen from './src/screens/LearnedScreen';
import DemoScreen from './src/screens/DemoScreen';
import { stopSpeaking } from './src/audio';

type Route =
  | { name: 'home' }
  | { name: 'pick' }
  | { name: 'talk'; problem: ProblemResponse }
  | { name: 'learned'; newNotes?: MemoryNote[] }
  | { name: 'demo' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

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

  const ensureSession = useCallback(async () => sessionId ?? (await startSession()), [sessionId, startSession]);

  const go = (r: Route) => {
    stopSpeaking();
    setRoute(r);
  };

  const finish = async () => {
    const id = sessionId;
    if (!id) return go({ name: 'learned' });
    const { notes } = await api.endSession(id); // errors are shown by TalkScreen
    setSessionId(null);
    startSession().catch(() => {});
    go({ name: 'learned', newNotes: notes });
  };

  let screen: React.ReactNode;
  switch (route.name) {
    case 'home':
      screen = (
        <HomeScreen
          sessionError={sessionError}
          onRetrySession={() => startSession().catch(() => {})}
          onSnap={() => go({ name: 'pick' })}
          onLearned={() => go({ name: 'learned' })}
          onDemo={() => go({ name: 'demo' })}
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
          onFinish={finish}
        />
      );
      break;
    case 'learned':
      screen = <LearnedScreen newNotes={route.newNotes} onBack={() => go({ name: 'home' })} />;
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
