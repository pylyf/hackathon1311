// Built-in example problems: try Nudge without a photo.
import type { Topic } from './contract';

export interface Example {
  id: string;
  topic: Topic;
  emoji: string; // big illustration
  bg: string; // illustration background
  title: string;
  text: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'bus',
    topic: 'word-problems',
    emoji: '🚌',
    bg: '#EFE6FF',
    title: 'The School Bus',
    text: "A bus has 40 seats. 23 kids get on, then 8 more. How many seats are empty?",
  },
  {
    id: 'stickers',
    topic: 'word-problems',
    emoji: '⚽',
    bg: '#E3F4FF',
    title: 'Football Stickers',
    text: "Leo has 36 stickers. He gives away 12, then buys 9. How many does he have now?",
  },
  {
    id: 'cookies',
    topic: 'word-problems',
    emoji: '🍪',
    bg: '#FFF1E2',
    title: 'Cookie Boxes',
    text: "Grandma puts 24 cookies into 4 boxes equally. How many are in each box?",
  },
  {
    id: 'pizza',
    topic: 'fractions',
    emoji: '🍕',
    bg: '#FFF6DA',
    title: 'Pizza Party',
    text: "A pizza has 8 slices. Tom eats 3 and Mia eats 2. What fraction did they eat?",
  },
  {
    id: 'cake',
    topic: 'fractions',
    emoji: '🎂',
    bg: '#FFE9EE',
    title: 'Birthday Cake',
    text: "A cake has 8 pieces. 3 go to friends and Mia eats 1. What fraction is left?",
  },
  {
    id: 'chocolate',
    topic: 'fractions',
    emoji: '🍫',
    bg: '#F5E8DF',
    title: 'Chocolate Bar',
    text: "A chocolate bar has 12 pieces. Sara eats one quarter. How many pieces is that?",
  },
  {
    id: 'giraffe',
    topic: 'units',
    emoji: '🦒',
    bg: '#FFF6DA',
    title: 'Tall Giraffe',
    text: "A giraffe is 5 metres tall. How many centimetres is that?",
  },
  {
    id: 'snail',
    topic: 'units',
    emoji: '🐌',
    bg: '#E6F8EE',
    title: 'Snail Race',
    text: "A snail crawls 2 m and 35 cm. How many centimetres is that?",
  },
  {
    id: 'bag',
    topic: 'units',
    emoji: '🎒',
    bg: '#E3F4FF',
    title: 'Heavy Backpack',
    text: "A bag weighs 3 kg and a lunch box 500 g. How many grams together?",
  },
];
