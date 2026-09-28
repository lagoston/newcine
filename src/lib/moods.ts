import type React from 'react';
import { Compass, HeartCrack, Zap, Brain, Laugh, Rainbow, Heart, Ghost, Home } from 'lucide-react';
import { withAlpha } from './oracleTheme';

// Os 9 humores (as prateleiras da Biblioteca dos Oráculos) — fonte única
// no front. Cada filme curado mora em exatamente uma prateleira. Cada
// humor tem uma letra: as 3 prateleiras mais usadas por alguém formam o
// código de 3 letras da personalidade (ex.: MPC), sempre na ordem abaixo.
//
// `key` é o identificador interno do banco (recommendation_pools.mood_key)
// e não aparece pra ninguém — por isso "drug-trip" continua sendo a chave
// do humor exibido como "Psychedelic".

export type MoodKey =
  | 'mind-blowing'
  | 'dark-and-scary'
  | 'drug-trip'
  | 'adventures'
  | 'catharsis'
  | 'adrenaline'
  | 'romantic'
  | 'family-time'
  | 'laugh-out-loud';

export interface Mood {
  key: MoodKey;
  letter: string;
  labelKey: string;
  tagKey: string;
  // O que gostar desse humor diz sobre quem assiste.
  readingKey: string;
  color: string;
  icon: React.ElementType;
}

export const MOODS: Mood[] = [
  { key: 'mind-blowing', letter: 'M', labelKey: 'oracle.moods.mindBlowing', tagKey: 'oracle.moods.mindBlowingTag', readingKey: 'oracle.moodReadings.mindBlowing', color: '#F472B6', icon: Brain },
  { key: 'dark-and-scary', letter: 'D', labelKey: 'oracle.moods.darkScary', tagKey: 'oracle.moods.darkScaryTag', readingKey: 'oracle.moodReadings.darkScary', color: '#A8A3C0', icon: Ghost },
  { key: 'drug-trip', letter: 'P', labelKey: 'oracle.moods.drugTrip', tagKey: 'oracle.moods.drugTripTag', readingKey: 'oracle.moodReadings.drugTrip', color: '#2DD4BF', icon: Rainbow },
  { key: 'adventures', letter: 'A', labelKey: 'oracle.moods.adventures', tagKey: 'oracle.moods.adventuresTag', readingKey: 'oracle.moodReadings.adventures', color: '#38BDF8', icon: Compass },
  { key: 'catharsis', letter: 'C', labelKey: 'oracle.moods.catharsis', tagKey: 'oracle.moods.catharsisTag', readingKey: 'oracle.moodReadings.catharsis', color: '#818CF8', icon: HeartCrack },
  { key: 'adrenaline', letter: 'X', labelKey: 'oracle.moods.adrenaline', tagKey: 'oracle.moods.adrenalineTag', readingKey: 'oracle.moodReadings.adrenaline', color: '#F87171', icon: Zap },
  { key: 'romantic', letter: 'R', labelKey: 'oracle.moods.romantic', tagKey: 'oracle.moods.romanticTag', readingKey: 'oracle.moodReadings.romantic', color: '#FB923C', icon: Heart },
  { key: 'family-time', letter: 'F', labelKey: 'oracle.moods.familyTime', tagKey: 'oracle.moods.familyTimeTag', readingKey: 'oracle.moodReadings.familyTime', color: '#FACC15', icon: Home },
  { key: 'laugh-out-loud', letter: 'L', labelKey: 'oracle.moods.laughOutLoud', tagKey: 'oracle.moods.laughOutLoudTag', readingKey: 'oracle.moodReadings.laughOutLoud', color: '#4ADE80', icon: Laugh },
];

export const MOOD_BY_KEY: Record<string, Mood> = Object.fromEntries(MOODS.map((m) => [m.key, m]));
export const MOOD_BY_LETTER: Record<string, Mood> = Object.fromEntries(MOODS.map((m) => [m.letter, m]));

// Humores de um código de personalidade, na ordem das letras.
export const moodsOfCode = (code: string | null | undefined): Mood[] =>
  (code || '')
    .split('')
    .map((letter) => MOOD_BY_LETTER[letter])
    .filter((m): m is Mood => Boolean(m));

// Cor do humor com transparência (fundos, contornos).
export const withMoodAlpha = (mood: Mood, alpha: number): string => withAlpha(mood.color, alpha);
