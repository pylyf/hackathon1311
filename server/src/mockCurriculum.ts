// Canned curriculum built from samples/textbook-fractions.pdf (Chapter 5 · Fractions).
// Used by MOCK mode curriculum building and by `npm run seed`. Answers are verified with mathjs at build time.
import type { UISpec } from './contract.js';
import type { StoredCurriculum, StoredLesson, StoredProblem } from './curriculum.js';
import { verifyAnswer } from './problem.js';

type P = { id: string; text: string; question: string; difficulty: 1 | 2 | 3; expr: string; value: number; unit?: string; visual?: UISpec };

const bars = (rows: { denominator: number; shaded: number; label?: string }[], caption?: string): UISpec =>
  ({ type: 'FractionBars', caption, rows, interactive: true });

function problems(topic: StoredLesson['topic'], skill: string, ps: P[]): StoredProblem[] {
  return ps.map((p) => {
    const { value, verified } = verifyAnswer(p.expr, p.value);
    return {
      id: p.id, text: p.text, topic, skill, difficulty: p.difficulty, question: p.question,
      answer: { value, unit: p.unit ?? null, expression: p.expr, verified },
      starterVisual: p.visual ?? null,
    };
  });
}

export function mockCurriculum(source = 'textbook-fractions.pdf'): StoredCurriculum {
  const L1 = 'Name the fraction of a whole';
  const L2 = 'Find equivalent fractions';
  const L3 = 'Add and subtract fractions with the same denominator';
  const L4 = 'Find a fraction of an amount';
  const lessons: StoredLesson[] = [
    {
      id: 'l1', title: 'Parts of a whole', topic: 'fractions', skill: L1,
      summary: 'A fraction tells us how many equal parts of a whole we have.',
      explanation: 'A fraction is a way to talk about parts of something whole, like a chocolate bar or a pizza.\n\nThe bottom number (the denominator) tells us into how many EQUAL parts the whole is cut. The top number (the numerator) tells us how many of those parts we have.\n\nAlways draw a fraction bar first: cut it into equal parts, then colour the parts you have.',
      workedExample: 'A bar is cut into 4 equal parts.\n3 parts are coloured.\nThe bottom number is 4 and the top number is 3.\nSo the bar shows 3/4.',
      methodNote: 'Always draw a fraction bar first: cut the bar into equal parts (the denominator, bottom number), then colour the parts you have (the numerator, top number).',
      sourcePages: 'p. 1, section 5.1',
      visual: bars([{ denominator: 4, shaded: 3, label: '3/4' }], 'This bar shows 3/4: 4 equal parts, 3 coloured'),
      status: 'ready', mastery: 0,
      commonMistakes: ['Counts the parts that are left instead of the parts taken.', 'Draws parts that are not equal.'],
      sourceExcerpt: 'A fraction tells us how many equal parts of a whole we have. The denominator (bottom number) says into how many equal parts the whole is cut. The numerator (top number) says how many of those parts we take. Remember: always draw a fraction bar first. Cut the bar into equal parts (the denominator), then colour the parts you have (the numerator). Example: this bar shows 3/4. It has 4 equal parts and 3 are coloured.',
      problems: problems('fractions', L1, [
        { id: 'l1p1', text: 'A chocolate bar has 6 equal pieces. Sam eats 2. What fraction of the bar did Sam eat?', question: 'What fraction of the bar did Sam eat?', difficulty: 1, expr: '2/6', value: 1 / 3, visual: bars([{ denominator: 6, shaded: 0, label: 'chocolate bar' }], 'Tap the pieces Sam eats') },
        { id: 'l1p2', text: 'A pizza is cut into 8 slices. 5 slices are left. What fraction of the pizza is left?', question: 'What fraction of the pizza is left?', difficulty: 1, expr: '5/8', value: 5 / 8, visual: bars([{ denominator: 8, shaded: 0, label: 'pizza' }], 'Tap the slices that are left') },
        { id: 'l1p3', text: 'A garden has 5 equal beds. 3 beds have flowers. What fraction of the garden has flowers?', question: 'What fraction of the garden has flowers?', difficulty: 1, expr: '3/5', value: 3 / 5 },
        { id: 'l1p4', text: 'A cake is cut into 10 equal pieces. Mia eats 1 piece and Leo eats 2 pieces. What fraction of the cake did they eat altogether?', question: 'What fraction of the cake did they eat altogether?', difficulty: 2, expr: '(1+2)/10', value: 0.3 },
      ]),
    },
    {
      id: 'l2', title: 'Equivalent fractions', topic: 'fractions', skill: L2,
      summary: 'Different fractions can show the same amount.',
      explanation: 'Sometimes two different fractions show exactly the same amount. We call them equivalent fractions.\n\nOne half and two quarters cover the same length of a fraction bar.\n\nTo make an equivalent fraction, multiply the top number AND the bottom number by the same number.',
      workedExample: 'Start with 1/2.\nMultiply the top by 2: 1 × 2 = 2.\nMultiply the bottom by 2: 2 × 2 = 4.\nSo 1/2 = 2/4. Check with a bar: they cover the same length.',
      methodNote: 'Multiply the numerator and the denominator by the same number, e.g. 1/2 = (1×2)/(2×2) = 2/4. Check with fraction bars: equivalent fractions cover the same length of the bar.',
      sourcePages: 'p. 2, section 5.2',
      visual: bars([{ denominator: 2, shaded: 1, label: '1/2' }, { denominator: 4, shaded: 2, label: '2/4' }], '1/2 and 2/4 cover the same length'),
      status: 'ready', mastery: 0,
      commonMistakes: ['Multiplies only the bottom number.', 'Adds the same number to top and bottom instead of multiplying.'],
      sourceExcerpt: 'Different fractions can show the same amount. 1/2 and 2/4 are equivalent: they cover the same length of the bar. Method: multiply the numerator and the denominator by the same number. 1/2 = (1×2)/(2×2) = 2/4.',
      problems: problems('fractions', L2, [
        { id: 'l2p1', text: 'Find the missing number: 1/3 = ?/6', question: 'What number goes on top of the 6?', difficulty: 1, expr: '1 * (6 / 3)', value: 2, visual: bars([{ denominator: 3, shaded: 1, label: '1/3' }, { denominator: 6, shaded: 0, label: '?/6' }], 'Shade the bottom bar to match the top one') },
        { id: 'l2p2', text: 'Find the missing number: 2/5 = ?/10', question: 'What number goes on top of the 10?', difficulty: 1, expr: '2 * (10 / 5)', value: 4 },
        { id: 'l2p3', text: 'Find the missing number: 3/4 = 6/?', question: 'What number goes on the bottom?', difficulty: 2, expr: '4 * (6 / 3)', value: 8 },
        { id: 'l2p4', text: 'Find the missing number: 1/2 = 5/?', question: 'What number goes on the bottom?', difficulty: 2, expr: '2 * 5', value: 10 },
      ]),
    },
    {
      id: 'l3', title: 'Adding and subtracting with the same bottom number', topic: 'fractions', skill: L3,
      summary: 'When the bottom numbers are the same, we only add or take away the top numbers.',
      explanation: 'When two fractions have the same bottom number, the parts are the same size.\n\nSo we only add or take away the top numbers. The bottom number stays the same!\n\nWatch out: one quarter plus one quarter is NOT two eighths. The parts are still quarters, so it is two quarters.',
      workedExample: '3/5 - 1/5\nColour 3 parts of a bar with 5 parts.\nCross out 1 part.\n3 - 1 = 2 parts are left, and they are still fifths.\nSo 3/5 - 1/5 = 2/5.',
      methodNote: 'The denominator stays the same because the size of the parts does not change; add or take away only the numerators. Colour the parts on a bar, then add more or cross some out. Never add the denominators (1/4 + 1/4 is 2/4, NOT 2/8).',
      sourcePages: 'p. 2, section 5.3',
      visual: bars([{ denominator: 5, shaded: 3, label: '3/5' }], 'Colour 3 fifths, then cross out 1'),
      status: 'ready', mastery: 0,
      commonMistakes: ['Adds the denominators too (1/4 + 1/4 = 2/8).'],
      sourceExcerpt: 'When the denominators are the same, the size of the parts does not change. We only add or take away the numerators. The denominator stays the same. Watch out! A common mistake is to add the denominators too: 1/4 + 1/4 is NOT 2/8. The parts are still quarters, so 1/4 + 1/4 = 2/4. Example: 3/5 - 1/5 = 2/5. Colour 3 parts of a 5-part bar, then cross out 1.',
      problems: problems('fractions', L3, [
        { id: 'l3p1', text: '2/7 + 3/7 = ?', question: 'What is 2/7 plus 3/7?', difficulty: 1, expr: '2/7 + 3/7', value: 5 / 7, visual: bars([{ denominator: 7, shaded: 2, label: '2/7' }, { denominator: 7, shaded: 3, label: '3/7' }], 'Two bars with sevenths') },
        { id: 'l3p2', text: '5/6 - 4/6 = ?', question: 'What is 5/6 take away 4/6?', difficulty: 1, expr: '5/6 - 4/6', value: 1 / 6, visual: bars([{ denominator: 6, shaded: 5, label: '5/6' }], 'Cross out 4 of the shaded parts') },
        { id: 'l3p3', text: 'Lucy read 2/8 of her book on Monday and 3/8 on Tuesday. How much of the book has she read?', question: 'How much of the book has Lucy read?', difficulty: 2, expr: '2/8 + 3/8', value: 5 / 8 },
        { id: 'l3p4', text: 'Tom has 3/4 of a pizza and eats 1/4. How much is left?', question: 'How much pizza is left?', difficulty: 2, expr: '3/4 - 1/4', value: 0.5, visual: bars([{ denominator: 4, shaded: 3, label: 'Tom has' }], "Tom's pizza: tap the slice he eats") },
      ]),
    },
    {
      id: 'l4', title: 'A fraction of an amount', topic: 'fractions', skill: L4,
      summary: 'To find a fraction of an amount, divide by the bottom number, then multiply by the top number.',
      explanation: 'Sometimes we need a fraction of a number of things, like three quarters of 20 sweets.\n\nFirst divide by the bottom number to find ONE part. Then multiply by the top number to get the parts we need.\n\nA bar model helps: draw the amount as a bar and cut it into equal parts.',
      workedExample: '3/4 of 20 sweets\nOne quarter: 20 ÷ 4 = 5.\nThree quarters: 5 × 3 = 15.\nSo 3/4 of 20 sweets is 15 sweets.',
      methodNote: 'First divide the amount by the denominator to find one part, then multiply by the numerator. Draw the amount as a bar model cut into equal parts (e.g. 20 cut into 4 parts of 5).',
      sourcePages: 'p. 3, section 5.4',
      visual: { type: 'BarModel', caption: '20 sweets cut into 4 equal parts', mode: 'part-whole', bars: [{ label: '20 sweets', parts: [{ value: 5 }, { value: 5 }, { value: 5 }, { value: 5 }] }] },
      status: 'ready', mastery: 0,
      commonMistakes: ['Multiplies by the denominator instead of dividing.', 'Stops after finding one part and forgets to multiply by the numerator.'],
      sourceExcerpt: 'To find a fraction of an amount, first divide by the denominator to find one part, then multiply by the numerator. Example: 3/4 of 20 sweets. One quarter: 20 ÷ 4 = 5. Three quarters: 5 × 3 = 15 sweets. A bar model helps: draw 20 as a bar, cut it into 4 equal parts of 5.',
      problems: problems('fractions', L4, [
        { id: 'l4p1', text: 'Find 1/3 of 12 apples.', question: 'How many apples is one third of 12?', difficulty: 1, expr: '12 / 3 * 1', value: 4, visual: { type: 'BarModel', caption: '12 apples in 3 equal parts', mode: 'part-whole', bars: [{ label: '12 apples', parts: [{ unknown: true }, { unknown: true }, { unknown: true }] }] } },
        { id: 'l4p2', text: 'A class has 24 children. 2/3 of them walk to school. How many children walk?', question: 'How many children walk to school?', difficulty: 2, expr: '24 / 3 * 2', value: 16 },
        { id: 'l4p3', text: 'Dad has 30 euros. He spends 1/5 of it on bread. How much does the bread cost?', question: 'How many euros does the bread cost?', difficulty: 2, expr: '30 / 5 * 1', value: 6 },
        { id: 'l4p4', text: 'A box has 18 crayons. 5/6 of them are blue. How many crayons are blue?', question: 'How many crayons are blue?', difficulty: 3, expr: '18 / 6 * 5', value: 15 },
      ]),
    },
  ];
  return {
    id: 'mock-fractions',
    title: 'Chapter 5 · Fractions',
    source,
    createdAt: new Date().toISOString(),
    lessons,
    nextLessonId: 'l1',
    warmup: null,
  };
}
