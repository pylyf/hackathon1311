// "Under the hood": how Nudge works, shown with live data from the backend (GET /system).
// Pipeline diagram with an animated signal, Thompson-sampling belief curves, real agent traces,
// a raw skill file and the event log.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, errMsg } from './api';
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { BrainResponse, HintStyle, SystemResponse, Topic, TraceStep, VectorSearchResponse } from './contract';
import { colors, ff } from './theme';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });
const INK = '#E8EAF0';
const DIM = '#8C93A6';
const PANEL = '#161A23';

// validated 4-slot palette (CVD-safe on light surfaces)
const STYLE_COLOR: Record<HintStyle, string> = { verbal: '#1C83C6', visual: '#E25E2A', story: '#7D4BCC', 'smaller-numbers': '#2A9A5E' };
const STYLE_NAME: Record<HintStyle, string> = { verbal: 'talking', visual: 'pictures', story: 'stories', 'smaller-numbers': 'smaller numbers' };
const TOPIC_NAME: Record<Topic, string> = { 'word-problems': 'Word problems', fractions: 'Fractions', units: 'Units' };

const STEP_COLOR: Record<TraceStep['kind'], string> = {
  read: '#7FB7FF',
  plan: '#C9A7FF',
  recall: '#FFC46B',
  strategy: '#7FD6A8',
  override: '#FF9A7A',
  draw: '#FF8FB8',
  check: '#7FD6A8',
  memory: '#FFC46B',
  generate: '#C9A7FF',
  verify: '#7FD6A8',
  speak: '#7FB7FF',
};
const LOG_COLOR: Record<string, string> = {
  problem: '#7FB7FF',
  hint: '#C9A7FF',
  attempt: '#FFC46B',
  solved: '#7FD6A8',
  bandit: '#7FD6A8',
  leak_blocked: '#FF8A8A',
  session_start: DIM,
  session_end: '#FF8FB8',
  plan: '#FF8FB8',
};

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

export function TechView({ sys, brain, width }: { sys: SystemResponse; brain: BrainResponse; width: number }) {
  return (
    <View style={{ gap: 14 }}>
      <StatusStrip sys={sys} />
      <Section title="The pipeline" sub="What happens between the photo and the otter's voice. Live counts from this child's data.">
        <Pipeline sys={sys} />
      </Section>
      <Section
        title="Long-term memory (Qdrant)"
        sub="Every note and every past struggle is embedded and stored in a local vector database. Before each hint the tutor looks up the moments closest in meaning. Try it: type what a child might say."
      >
        <MemorySearch sys={sys} />
      </Section>
      <Section
        title="Thompson sampling: which hint style to try"
        sub="Each curve is the agent's belief about how often a hint style helps (Beta(α, β)). Before every hint it samples from these and picks the winner; every outcome updates α or β."
      >
        <BanditCurves sys={sys} width={width} />
      </Section>
      <Section title="Agent traces" sub="The tool calls behind the latest hints, as the agent ran them." dark>
        <Traces sys={sys} />
      </Section>
      <Section title="A skill file the agent wrote for itself" sub="Loaded into the tutor's system prompt before every session." dark>
        <SkillFile brain={brain} />
      </Section>
      <Section title="Event log" sub="Everything the agent learns from. Newest first." dark>
        <EventLog sys={sys} />
      </Section>
    </View>
  );
}

// ------------------------------------------------------------------ pieces

function Section({ title, sub, dark, children }: { title: string; sub?: string; dark?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.section, dark && styles.sectionDark]}>
      <Text style={[styles.sectionTitle, dark && { color: INK }]}>{title}</Text>
      {sub ? <Text style={[styles.sectionSub, dark && { color: DIM }]}>{sub}</Text> : null}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

function Blink() {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[styles.liveDot, { opacity: v }]} />;
}

function StatusStrip({ sys }: { sys: SystemResponse }) {
  const chips: { k: string; v: string }[] = [
    { k: 'solver', v: sys.models.solver },
    { k: 'tutor', v: sys.models.tutor },
    { k: 'voice', v: sys.voice ? `${sys.models.tts} · ${sys.models.stt}` : 'off' },
    { k: 'turn latency', v: sys.latency.avgMs ? `${(sys.latency.avgMs / 1000).toFixed(1)}s avg · p90 ${((sys.latency.p90Ms ?? 0) / 1000).toFixed(1)}s` : '—' },
    {
      k: 'memory',
      v: sys.memory?.backend === 'qdrant' ? `qdrant · ${sys.memory.notes ?? 0} notes · ${sys.memory.moments ?? 0} moments` : `keyword (${sys.memory?.state ?? 'off'})`,
    },
    { k: 'events', v: String(sys.counts.events) },
  ];
  return (
    <View style={styles.status}>
      <View style={styles.statusHead}>
        {sys.live ? <Blink /> : <View style={[styles.liveDot, { backgroundColor: DIM }]} />}
        <Text style={styles.statusLive}>{sys.live ? 'LIVE' : 'MOCK MODE'}</Text>
        <Text style={styles.statusDim}>backend snapshot</Text>
      </View>
      <View style={styles.kvWrap}>
        {chips.map((c) => (
          <View key={c.k} style={styles.kv}>
            <Text style={styles.kvKey}>{c.k}</Text>
            <Text style={styles.kvVal} numberOfLines={1}>
              {c.v}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type Node = { icon: string; title: string; detail: string; metric?: string; tint: string; mono?: string };

function Pipeline({ sys }: { sys: SystemResponse }) {
  const live: Node[] = [
    { icon: '📸', title: 'Input', detail: 'Photo, example or textbook chapter', tint: '#EAF4FF' },
    { icon: '🧮', title: 'Solver', detail: 'Reads the problem, solves it, checks the maths with mathjs', mono: sys.models.solver, metric: `${sys.counts.problems} problems`, tint: '#F1ECFB' },
    { icon: '🔒', title: 'Answer vault', detail: 'The answer stays on the server. The app never receives it.', metric: 'never sent', tint: '#FFF4D6' },
    {
      icon: '🗂️',
      title: 'Long-term memory',
      detail: 'Finds past struggles closest in meaning to this moment, and which hint helped then',
      mono: sys.memory ? `Qdrant · ${sys.memory.model} · ${sys.memory.dims}-d vectors` : 'keyword recall',
      metric: sys.memory?.backend === 'qdrant' ? `${(sys.memory.notes ?? 0) + (sys.memory.moments ?? 0)} vectors` : 'keyword mode',
      tint: '#E3F4FF',
    },
    { icon: '🤖', title: 'Tutor agent', detail: 'Tool-use loop, max 2 steps per turn', mono: sys.tools.join(' · '), metric: `${sys.counts.hints} hints`, tint: '#F1ECFB' },
    { icon: '🎰', title: 'Strategy', detail: 'Thompson sampling picks the hint style; the agent can override with a reason', tint: '#E8F7EF' },
    { icon: '🛡️', title: 'Leak guard', detail: 'Every reply, visual and trace is checked for the answer (digits, words, fractions, units)', metric: `${sys.counts.leaksBlocked} blocked`, tint: '#FFECEF' },
    { icon: '🎨', title: 'Generative UI', detail: `${sys.blocks.length} blocks, zod-validated; Claude picks theme, layout, focus`, metric: `${sys.counts.visuals} visuals`, tint: '#FFF1EA' },
    { icon: '🔊', title: 'Voice', detail: 'ElevenLabs speech in and out', mono: `${sys.models.stt} → ${sys.models.tts}`, tint: '#EAF4FF' },
  ];
  const after: Node[] = [
    { icon: '🪞', title: 'Reflection', detail: 'Reads the session log, writes memory notes about the child and indexes them in Qdrant', metric: `${sys.counts.memory} notes`, tint: '#FFF4D6' },
    { icon: '🧠', title: 'Self-improver', detail: 'Rewrites its own skill files, saves visuals that worked', metric: `${sys.counts.skills} skills · ${sys.counts.recipes} visuals · ${sys.counts.upgrades} upgrades`, tint: '#F1ECFB' },
    { icon: '🗓️', title: 'Planner', detail: 'Chooses the next lesson and a warm-up', tint: '#E8F7EF' },
  ];
  return (
    <View>
      <Text style={styles.lane}>EVERY TURN</Text>
      <Flow nodes={live} />
      <View style={styles.loopNote}>
        <Text style={styles.loopText}>↻ skills, recipes and memory are loaded back into the tutor before the next session</Text>
      </View>
      <Text style={[styles.lane, { marginTop: 4 }]}>AFTER EACH SESSION</Text>
      <Flow nodes={after} />
    </View>
  );
}

/** Vertical chain of nodes with a signal dot travelling down the connector. */
function Flow({ nodes }: { nodes: Node[] }) {
  const v = useRef(new Animated.Value(0)).current;
  const [h, setH] = useState(0);
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <View style={styles.rail} />
      {h > 0 && <Animated.View style={[styles.signal, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, h - 24] }) }] }]} />}
      {nodes.map((n) => (
        <View key={n.title} style={styles.nodeRow}>
          <View style={[styles.nodeIcon, { backgroundColor: n.tint }]}>
            <Text style={{ fontSize: 18 }}>{n.icon}</Text>
          </View>
          <View style={styles.node}>
            <View style={styles.nodeHead}>
              <Text style={styles.nodeTitle}>{n.title}</Text>
              {n.metric ? (
                <View style={styles.metric}>
                  <Text style={styles.metricText}>{n.metric}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.nodeDetail}>{n.detail}</Text>
            {n.mono ? <Text style={styles.nodeMono}>{n.mono}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------- long-term memory: live semantic search

const EXAMPLES = ['he added the bottom numbers', 'I don\'t know how to start', 'pictures help him'];

function MemorySearch({ sys }: { sys: SystemResponse }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<VectorSearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = sys.memory?.backend === 'qdrant';
  const run = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setQ(t);
    setBusy(true);
    setErr(null);
    try {
      setRes(await api.vectorSearch(t));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.memStatus}>
        <View style={[styles.liveDot, !ready && { backgroundColor: DIM }]} />
        <Text style={styles.memStatusText}>
          {ready ? `${sys.memory.managed ? 'local' : 'remote'} Qdrant · ${sys.memory.model} (${sys.memory.dims}-d) · ${sys.memory.notes ?? 0} notes · ${sys.memory.moments ?? 0} past moments` : `vector memory ${sys.memory?.state ?? 'off'}: using keyword recall`}
        </Text>
      </View>
      <View style={styles.searchRow}>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => run(q)}
          placeholder="what the child said…"
          placeholderTextColor="#A3A3A3"
          style={styles.searchInput}
          editable={ready}
          returnKeyType="search"
        />
        <Pressable onPress={() => run(q)} disabled={!ready || busy} style={[styles.searchBtn, (!ready || busy) && { opacity: 0.5 }]}>
          <Text style={styles.searchBtnText}>{busy ? '…' : 'RECALL'}</Text>
        </Pressable>
      </View>
      <View style={styles.chips}>
        {EXAMPLES.map((e) => (
          <Pressable key={e} onPress={() => run(e)} disabled={!ready} style={styles.chip}>
            <Text style={styles.chipText}>"{e}"</Text>
          </Pressable>
        ))}
      </View>
      {err && <Text style={[styles.sectionSub, { color: colors.red }]}>{err}</Text>}
      {res && (
        <View style={{ gap: 8 }}>
          {res.notes.length === 0 && <Text style={styles.sectionSub}>Nothing close in meaning yet.</Text>}
          {res.notes.map((n, i) => (
            <View key={i} style={styles.hit}>
              <View style={styles.hitHead}>
                <Text style={styles.hitScore}>{n.score.toFixed(2)}</Text>
                <View style={styles.hitTrack}>
                  <View style={[styles.hitFill, { width: `${Math.max(4, Math.min(100, n.score * 100))}%` }]} />
                </View>
                <Text style={styles.hitKind}>{n.kind}</Text>
              </View>
              <Text style={styles.hitText}>{n.text}</Text>
            </View>
          ))}
          {res.notes.length > 0 && <Text style={styles.axisNote}>cosine similarity · matched by meaning, not keywords</Text>}
        </View>
      )}
    </View>
  );
}

// ---------------- Beta curves

function lgamma(z: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
const betaPdf = (x: number, a: number, b: number) => Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (lgamma(a) + lgamma(b) - lgamma(a + b)));

function BanditCurves({ sys, width }: { sys: SystemResponse; width: number }) {
  const topics = Object.keys(sys.bandit) as Topic[];
  const [topic, setTopic] = useState<Topic>(topics.includes('fractions') ? 'fractions' : topics[0]);
  const arms = sys.bandit[topic] ?? {};
  const styles_ = Object.keys(STYLE_COLOR) as HintStyle[];
  const H = 170;
  const pad = { l: 8, r: 8, t: 10, b: 22 };
  const pw = width - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const curves = useMemo(() => {
    const xs = Array.from({ length: 81 }, (_, i) => 0.01 + (i / 80) * 0.98);
    return styles_.map((s) => {
      const [a, b] = arms[s] ?? [1, 1];
      return { s, a, b, ys: xs.map((x) => betaPdf(x, a, b)), xs, mean: a / (a + b) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, sys]);
  // cap the height so one very confident curve doesn't flatten the others (it just runs off the top)
  const maxY = Math.min(6, Math.max(1, ...curves.flatMap((c) => c.ys).filter(Number.isFinite)));
  const X = (x: number) => pad.l + x * pw;
  const Y = (y: number) => pad.t + ph - (Math.min(y, maxY) / maxY) * ph;
  const best = curves.slice().sort((p, q) => q.mean - p.mean)[0];
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.seg}>
        {topics.map((t) => (
          <Pressable key={t} onPress={() => setTopic(t)} style={[styles.segBtn, t === topic && styles.segOn]}>
            <Text style={[styles.segText, t === topic && { color: colors.ink }]}>{TOPIC_NAME[t] ?? t}</Text>
          </Pressable>
        ))}
      </View>
      <Svg width={width} height={H}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <G key={t}>
            <Line x1={X(t)} x2={X(t)} y1={pad.t} y2={pad.t + ph} stroke="#F0F0F0" strokeWidth={1} />
            <SvgText fontFamily="Nunito_800ExtraBold" x={X(t)} y={H - 6} fontSize={10} fill="#A3A3A3" textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}>
              {`${Math.round(t * 100)}%`}
            </SvgText>
          </G>
        ))}
        {curves.map((c) => (
          <Path
            key={c.s}
            d={c.xs.map((x, i) => `${i ? 'L' : 'M'} ${X(x)} ${Y(c.ys[i])}`).join(' ')}
            stroke={STYLE_COLOR[c.s]}
            strokeWidth={c.s === best.s ? 3 : 2}
            fill="none"
            opacity={c.s === best.s ? 1 : 0.75}
          />
        ))}
        {curves.map((c) => (
          <Line key={`m${c.s}`} x1={X(c.mean)} x2={X(c.mean)} y1={pad.t + ph - 6} y2={pad.t + ph} stroke={STYLE_COLOR[c.s]} strokeWidth={3} strokeLinecap="round" />
        ))}
      </Svg>
      <Text style={styles.axisNote}>chance this hint style helps →</Text>
      <View style={styles.armGrid}>
        {curves.map((c) => (
          <View key={c.s} style={styles.arm}>
            <View style={[styles.armSwatch, { backgroundColor: STYLE_COLOR[c.s] }]} />
            <Text style={styles.armName}>{STYLE_NAME[c.s]}</Text>
            <Text style={styles.armMono}>
              α{c.a} β{c.b} · {Math.round(c.mean * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------- traces, skill file, log (dark "terminal" panels)

function Traces({ sys }: { sys: SystemResponse }) {
  const [i, setI] = useState(0);
  if (!sys.traces.length) return <Text style={styles.mono}>No traces yet. Run a problem.</Text>;
  const t = sys.traces[Math.min(i, sys.traces.length - 1)];
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.traceTabs}>
        {sys.traces.map((tr, k) => (
          <Pressable key={k} onPress={() => setI(k)} style={[styles.traceTab, k === i && styles.traceTabOn]}>
            <Text style={[styles.traceTabText, k === i && { color: INK }]}>{ago(tr.ts)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.mono}>
        <Text style={{ color: DIM }}>turn </Text>
        <Text style={{ color: STYLE_COLOR[t.style] ?? INK }}>L{t.level} {t.style}</Text>
        <Text style={{ color: DIM }}> · {TOPIC_NAME[t.topic]}</Text>
        {typeof t.ms === 'number' ? <Text style={{ color: DIM }}> · {(t.ms / 1000).toFixed(1)}s</Text> : null}
        {t.ui ? <Text style={{ color: DIM }}> · ui={t.ui}</Text> : null}
      </Text>
      <View style={{ gap: 4 }}>
        {t.steps.map((s, k) => (
          <View key={k} style={styles.step}>
            <Text style={styles.stepIdx}>{String(k + 1).padStart(2, '0')}</Text>
            <Text style={[styles.stepKind, { color: STEP_COLOR[s.kind] ?? INK }]}>{s.kind.padEnd(8, ' ')}</Text>
            <Text style={styles.stepText}>{s.text}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.mono}>
        <Text style={{ color: '#7FD6A8' }}>speak </Text>
        <Text style={{ color: INK }}>"{t.text}"</Text>
      </Text>
    </View>
  );
}

function SkillFile({ brain }: { brain: BrainResponse }) {
  const [i, setI] = useState(0);
  if (!brain.skills.length) return <Text style={styles.mono}>No skills yet.</Text>;
  const s = brain.skills[i % brain.skills.length];
  const lines = s.body.split('\n').filter((l) => l.trim());
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.traceTabs}>
        {brain.skills.map((sk, k) => (
          <Pressable key={sk.id} onPress={() => setI(k)} style={[styles.traceTab, k === i && styles.traceTabOn]}>
            <Text style={[styles.traceTabText, k === i && { color: INK }]} numberOfLines={1}>
              {sk.id.slice(0, 18)}.md
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.file}>
        <Text style={styles.mono}>
          <Text style={{ color: DIM }}>---{'\n'}</Text>
          <Text style={{ color: '#C9A7FF' }}>id</Text>
          <Text style={{ color: DIM }}>: </Text>
          <Text style={{ color: INK }}>{s.id}{'\n'}</Text>
          <Text style={{ color: '#C9A7FF' }}>version</Text>
          <Text style={{ color: DIM }}>: </Text>
          <Text style={{ color: '#FFC46B' }}>{s.version}{'\n'}</Text>
          <Text style={{ color: '#C9A7FF' }}>topic</Text>
          <Text style={{ color: DIM }}>: </Text>
          <Text style={{ color: INK }}>{s.topic}{'\n'}</Text>
          <Text style={{ color: '#C9A7FF' }}>when</Text>
          <Text style={{ color: DIM }}>: </Text>
          <Text style={{ color: '#7FD6A8' }}>"{s.whenToUse}"{'\n'}</Text>
          <Text style={{ color: DIM }}>---{'\n'}</Text>
          <Text style={{ color: '#7FB7FF' }}># {s.title}{'\n'}</Text>
          {lines.map((l, k) => (
            <Text key={k} style={{ color: INK }}>
              {l.startsWith('-') ? l : `- ${l}`}
              {'\n'}
            </Text>
          ))}
        </Text>
      </View>
    </View>
  );
}

function EventLog({ sys }: { sys: SystemResponse }) {
  const [all, setAll] = useState(false);
  const rows = all ? sys.log : sys.log.slice(0, 12);
  return (
    <View style={{ gap: 3 }}>
      {rows.map((e, k) => (
        <View key={k} style={styles.logRow}>
          <Text style={styles.logTime}>{ago(e.ts).padStart(3, ' ')}</Text>
          <Text style={[styles.logType, { color: LOG_COLOR[e.type] ?? INK }]}>{e.type.padEnd(12, ' ')}</Text>
          <Text style={styles.logText}>{e.summary}</Text>
        </View>
      ))}
      {sys.log.length > 12 && (
        <Pressable onPress={() => setAll(!all)} hitSlop={8}>
          <Text style={[styles.mono, { color: '#7FB7FF', marginTop: 6 }]}>{all ? '− show less' : `+ ${sys.log.length - 12} more`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1.5, borderColor: '#ECECEC', padding: 16 },
  sectionDark: { backgroundColor: PANEL, borderColor: '#232838' },
  sectionTitle: { fontFamily: ff.black, fontSize: 16, color: colors.ink },
  sectionSub: { fontFamily: ff.regular, fontSize: 13, color: colors.inkSoft, marginTop: 2, lineHeight: 18 },

  status: { backgroundColor: PANEL, borderRadius: 18, padding: 14, gap: 10 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#3CC47C' },
  statusLive: { fontFamily: MONO, fontSize: 12, color: '#7FD6A8', fontWeight: '700', letterSpacing: 1 },
  statusDim: { fontFamily: MONO, fontSize: 11, color: DIM, marginLeft: 'auto' },
  kvWrap: { gap: 6 },
  kv: { flexDirection: 'row', gap: 10 },
  kvKey: { width: 92, fontFamily: MONO, fontSize: 12, color: DIM },
  kvVal: { flex: 1, fontFamily: MONO, fontSize: 12, color: INK },

  lane: { fontFamily: ff.black, fontSize: 11, letterSpacing: 1.2, color: '#A3A3A3', marginBottom: 8 },
  rail: { position: 'absolute', left: 19, top: 18, bottom: 18, width: 2, backgroundColor: '#ECECEC' },
  signal: { position: 'absolute', left: 15, top: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#7D4BCC', borderWidth: 2, borderColor: '#fff' },
  nodeRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  nodeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  node: { flex: 1, gap: 2, paddingTop: 2 },
  nodeHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nodeTitle: { fontFamily: ff.black, fontSize: 15, color: colors.ink },
  nodeDetail: { fontFamily: ff.regular, fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  nodeMono: { fontFamily: MONO, fontSize: 11, color: '#7D4BCC' },
  metric: { backgroundColor: '#F4F4F4', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 1 },
  metricText: { fontFamily: MONO, fontSize: 11, color: colors.ink },
  loopNote: { backgroundColor: '#F1ECFB', borderRadius: 12, padding: 10, marginVertical: 8 },
  loopText: { fontFamily: ff.bold, fontSize: 12, color: '#7D4BCC', lineHeight: 17 },

  seg: { flexDirection: 'row', backgroundColor: '#F2F2F2', borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  segOn: { backgroundColor: '#fff' },
  segText: { fontFamily: ff.black, fontSize: 12, color: '#A3A3A3' },
  axisNote: { fontFamily: ff.bold, fontSize: 11, color: '#A3A3A3', textAlign: 'right', marginTop: -6 },
  armGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  arm: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  armSwatch: { width: 12, height: 4, borderRadius: 2 },
  armName: { fontFamily: ff.black, fontSize: 12, color: colors.ink },
  armMono: { fontFamily: MONO, fontSize: 11, color: colors.inkSoft },

  memStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F8FC', borderRadius: 10, padding: 8 },
  memStatusText: { flex: 1, fontFamily: MONO, fontSize: 11, color: colors.ink },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, borderWidth: 1.5, borderColor: '#E3E3E3', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontFamily: ff.bold, fontSize: 14, color: colors.ink },
  searchBtn: { backgroundColor: '#1C83C6', borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
  searchBtnText: { fontFamily: ff.black, color: '#fff', fontSize: 12, letterSpacing: 0.8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#F2F2F2', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  chipText: { fontFamily: ff.bold, fontSize: 12, color: colors.inkSoft },
  hit: { gap: 4 },
  hitHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hitScore: { fontFamily: MONO, fontSize: 12, color: colors.ink, width: 34 },
  hitTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#EFEFEF', overflow: 'hidden' },
  hitFill: { height: '100%', borderRadius: 3, backgroundColor: '#1C83C6' },
  hitKind: { fontFamily: MONO, fontSize: 11, color: colors.inkSoft },
  hitText: { fontFamily: ff.bold, fontSize: 13, color: colors.ink, lineHeight: 18 },
  mono: { fontFamily: MONO, fontSize: 12, color: INK, lineHeight: 18 },
  traceTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  traceTab: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#20263A' },
  traceTabOn: { backgroundColor: '#3A3F5C' },
  traceTabText: { fontFamily: MONO, fontSize: 11, color: DIM },
  step: { flexDirection: 'row', gap: 8 },
  stepIdx: { fontFamily: MONO, fontSize: 12, color: '#4D5570' },
  stepKind: { fontFamily: MONO, fontSize: 12, width: 66 },
  stepText: { flex: 1, fontFamily: MONO, fontSize: 12, color: INK, lineHeight: 17 },
  file: { backgroundColor: '#0F121A', borderRadius: 10, padding: 10 },
  logRow: { flexDirection: 'row', gap: 8 },
  logTime: { fontFamily: MONO, fontSize: 11, color: '#4D5570', width: 26 },
  logType: { fontFamily: MONO, fontSize: 11, width: 92 },
  logText: { flex: 1, fontFamily: MONO, fontSize: 11, color: INK, lineHeight: 16 },
});
