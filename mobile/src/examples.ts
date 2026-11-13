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
    text: 'A school bus has 40 seats. 23 children get on at the first stop and 8 more get on at the second stop. How many seats are still empty?',
  },
  {
    id: 'stickers',
    topic: 'word-problems',
    emoji: '⚽',
    bg: '#E3F4FF',
    title: 'Football Stickers',
    text: 'Leo has 36 football stickers. He gives 12 to his sister and then buys 9 more. How many stickers does Leo have now?',
  },
  {
    id: 'cookies',
    topic: 'word-problems',
    emoji: '🍪',
    bg: '#FFF1E2',
    title: 'Cookie Boxes',
    text: 'Grandma baked 24 cookies. She puts them into 4 boxes with the same number in each box. How many cookies are in each box?',
  },
  {
    id: 'pizza',
    topic: 'fractions',
    emoji: '🍕',
    bg: '#FFF6DA',
    title: 'Pizza Party',
    text: 'A pizza is cut into 8 equal slices. Tom eats 3 slices and Mia eats 2 slices. What fraction of the pizza did they eat together?',
  },
  {
    id: 'cake',
    topic: 'fractions',
    emoji: '🎂',
    bg: '#FFE9EE',
    title: 'Birthday Cake',
    text: 'Mia baked a cake and cut it into 8 equal pieces. She gave 3 pieces to her friends and ate 1 piece herself. What fraction of the cake is left?',
  },
  {
    id: 'chocolate',
    topic: 'fractions',
    emoji: '🍫',
    bg: '#F5E8DF',
    title: 'Chocolate Bar',
    text: 'A chocolate bar has 12 equal pieces. Sara eats one quarter of the bar. How many pieces does she eat?',
  },
  {
    id: 'giraffe',
    topic: 'units',
    emoji: '🦒',
    bg: '#FFF6DA',
    title: 'Tall Giraffe',
    text: 'A giraffe is 5 metres tall. How many centimetres tall is the giraffe?',
  },
  {
    id: 'snail',
    topic: 'units',
    emoji: '🐌',
    bg: '#E6F8EE',
    title: 'Snail Race',
    text: 'A snail crawls 2 metres and 35 centimetres. How many centimetres did the snail crawl in total?',
  },
  {
    id: 'bag',
    topic: 'units',
    emoji: '🎒',
    bg: '#E3F4FF',
    title: 'Heavy Backpack',
    text: "Max's school bag weighs 3 kilograms. His lunch box weighs 500 grams. How many grams do they weigh together?",
  },
];
