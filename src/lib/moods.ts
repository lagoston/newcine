import type React from 'react';
import { Compass, HeartCrack, Zap, Brain, Laugh, Rainbow, Heart, Ghost, Home } from 'lucide-react';
import { withAlpha } from './oracleTheme';

// Os 9 humores (as prateleiras da Biblioteca dos Oráculos) — fonte única
// no front. Cada filme curado mora em exatamente uma prateleira. Cada
// humor tem uma letra: as 3 prateleiras mais usadas por alguém formam o
// código de 3 letras da personalidade (ex.: MPC), sempre na ordem abaixo.
// Letras desde 28/09: Sombrio e Assustador = X, Adrenalina = Z (antes D e
// X) — a mesma tabela está em public.cine_moods.
//
// `key` é o identificador interno do banco (recommendation_pools.mood_key)
// e não aparece pra ninguém — por isso "drug-trip" continua sendo a chave
// do humor exibido como "Sensorial" (em inglês, "Sensory").
//
// 25/11/2026 (pedido do Bruno: "Vamos trocar 'Psicodélico' e 'Drug-Trip' por
// 'Sensorial' e sua letra de P para S em todos os modais em que se conecta e
// suas consequências"). O nome mudou nos textos. A LETRA tem duas faces:
//   • `letter` é a letra INTERNA, a que o banco grava nos códigos e usa como
//     chave em tudo o que manda (cine_moods.letter, personalidade_completa,
//     get_persona_world…). No Sensorial ela continua "P": o APK antigo lê os
//     mesmos dados e tem o "P" embutido; trocar no banco quebraria a tela
//     "Sua Persona" dele.
//   • `glyph` é a letra que a pessoa VÊ. No Sensorial é "S"; nas outras oito
//     é igual à interna.
// Regra: dado, chave e comparação usam `letter`; tudo o que vai para a tela
// (JSX, canvas, aria-label, nome de arquivo) passa por `glyph`, showLetter()
// ou showCode(). Um código lido da tela ou digitado volta com codeFromShown().

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
  // a letra interna (banco) e a letra que aparece na tela
  letter: string;
  glyph: string;
  labelKey: string;
  tagKey: string;
  // O que gostar desse humor diz sobre quem assiste.
  readingKey: string;
  color: string;
  icon: React.ElementType;
}

export const MOODS: Mood[] = [
  { key: 'mind-blowing', letter: 'M', glyph: 'M', labelKey: 'oracle.moods.mindBlowing', tagKey: 'oracle.moods.mindBlowingTag', readingKey: 'oracle.moodReadings.mindBlowing', color: '#F472B6', icon: Brain },
  { key: 'dark-and-scary', letter: 'X', glyph: 'X', labelKey: 'oracle.moods.darkScary', tagKey: 'oracle.moods.darkScaryTag', readingKey: 'oracle.moodReadings.darkScary', color: '#A8A3C0', icon: Ghost },
  { key: 'drug-trip', letter: 'P', glyph: 'S', labelKey: 'oracle.moods.drugTrip', tagKey: 'oracle.moods.drugTripTag', readingKey: 'oracle.moodReadings.drugTrip', color: '#2DD4BF', icon: Rainbow },
  { key: 'adventures', letter: 'A', glyph: 'A', labelKey: 'oracle.moods.adventures', tagKey: 'oracle.moods.adventuresTag', readingKey: 'oracle.moodReadings.adventures', color: '#38BDF8', icon: Compass },
  { key: 'catharsis', letter: 'C', glyph: 'C', labelKey: 'oracle.moods.catharsis', tagKey: 'oracle.moods.catharsisTag', readingKey: 'oracle.moodReadings.catharsis', color: '#818CF8', icon: HeartCrack },
  { key: 'adrenaline', letter: 'Z', glyph: 'Z', labelKey: 'oracle.moods.adrenaline', tagKey: 'oracle.moods.adrenalineTag', readingKey: 'oracle.moodReadings.adrenaline', color: '#F87171', icon: Zap },
  { key: 'romantic', letter: 'R', glyph: 'R', labelKey: 'oracle.moods.romantic', tagKey: 'oracle.moods.romanticTag', readingKey: 'oracle.moodReadings.romantic', color: '#FB923C', icon: Heart },
  { key: 'family-time', letter: 'F', glyph: 'F', labelKey: 'oracle.moods.familyTime', tagKey: 'oracle.moods.familyTimeTag', readingKey: 'oracle.moodReadings.familyTime', color: '#FACC15', icon: Home },
  { key: 'laugh-out-loud', letter: 'L', glyph: 'L', labelKey: 'oracle.moods.laughOutLoud', tagKey: 'oracle.moods.laughOutLoudTag', readingKey: 'oracle.moodReadings.laughOutLoud', color: '#4ADE80', icon: Laugh },
];

export const MOOD_BY_KEY: Record<string, Mood> = Object.fromEntries(MOODS.map((m) => [m.key, m]));
export const MOOD_BY_LETTER: Record<string, Mood> = Object.fromEntries(MOODS.map((m) => [m.letter, m]));
// pela letra que a pessoa vê (para o que ela digita: a busca de personas)
export const MOOD_BY_GLYPH: Record<string, Mood> = Object.fromEntries(MOODS.map((m) => [m.glyph, m]));

// A letra interna como aparece na tela ("P" → "S"); letra desconhecida passa igual.
export const showLetter = (letter: string | null | undefined): string => (letter ? (MOOD_BY_LETTER[letter]?.glyph ?? letter) : '');
// Um código interno (ex.: "MPC") como aparece na tela ("MSC").
export const showCode = (code: string | null | undefined): string => (code || '').split('').map(showLetter).join('');
// O caminho de volta: o que a pessoa leu ou digitou ("MSC") → o código interno ("MPC").
export const codeFromShown = (shown: string | null | undefined): string =>
  (shown || '')
    .toUpperCase()
    .split('')
    .map((glyph) => MOOD_BY_GLYPH[glyph]?.letter ?? glyph)
    .join('');

// Humores de um código de personalidade, na ordem das letras.
export const moodsOfCode = (code: string | null | undefined): Mood[] =>
  (code || '')
    .split('')
    .map((letter) => MOOD_BY_LETTER[letter])
    .filter((m): m is Mood => Boolean(m));

// Cor do humor com transparência (fundos, contornos).
export const withMoodAlpha = (mood: Mood, alpha: number): string => withAlpha(mood.color, alpha);
