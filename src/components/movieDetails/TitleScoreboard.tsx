import React from 'react';
import { motion } from 'framer-motion';
import { Star, Wand2, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PredictionGauge from '../PredictionGauge';
import { VELVET, PAPER, MIST, PIXEL, ratingTone } from '../../lib/oracleTheme';
import { useTitlePrediction } from './useTitlePrediction';

// Placar logo abaixo do título: números grandes com o nome embaixo, sem
// cápsulas, separados por fios finos. A sua nota (ou a previsão do
// oráculo) vem primeiro e é o destaque; depois a nota do público.
//
// 14/11/2026 (pedido do Bruno): a nota prevista e a chance de virar 10
// deixaram de ser dois números e viraram um aparelho, no lugar das duas
// colunas: o Espectrômetro (PredictionGauge) — onze lâmpadas, uma por nota,
// nas cores de nota do site, e o Patrono da pessoa (a mariposa dela, feita
// de luz) pousando onde a nota deve cair. A sua nota e a do público
// continuam em número.
//
// Lugares fixos: assim que se sabe se você já avaliou (consulta rápida),
// o placar entra com as colunas definidas — 3 (o aparelho ocupa duas, e o
// público) ou 2 (sua nota, público). A previsão demora mais: enquanto ela
// não chega, o aparelho fica apagado com uma fagulha em cima do cursor;
// quando chega, a fagulha vira a mariposa e ela voa até a nota. Sem
// previsão (quem ainda não avaliou o suficiente), a 1ª coluna ocupa o
// lugar das duas — o público nunca sai do lugar. Com o aparelho o placar
// fica mais alto (80 px de desenho), e os nomes de baixo se alinham pelo pé
// das colunas.
//
// 15/11/2026: filmes fora das prateleiras também reservam o aparelho (a
// fórmula paralela), desde que tenham nota do público. A dica do aparelho
// diz que a previsão é de fora (e o espectro sai mais aberto). Até a noite
// do mesmo dia era preciso ter 20+ votos no TMDB, e os lançamentos de
// Popular Agora ficavam sem (pedido do Bruno: "The Beast" e "Sem
// Desistir"); agora a nota de poucos votos é puxada para a média do
// catálogo no banco (20261115234500_prediction_outside_few_votes.sql).
//
// 18/11/2026 (otimização): o placar é uma seção própria. A previsão (a
// resposta mais lenta do topo) mora aqui (useTitlePrediction): quando chega,
// só o placar re-renderiza.
type ScoreCell = {
  key: string;
  value?: React.ReactNode;
  label: string;
  color: string;
  icon?: React.ReactNode;
  glow?: string;
  span?: 2;
  pending?: boolean;
  // no lugar do número (o medidor da nota prevista)
  node?: React.ReactNode;
  labelIcon?: React.ReactNode;
  // depois do nome da coluna (o número da nota prevista)
  labelExtra?: React.ReactNode;
};

interface TitleScoreboardProps {
  movieId: number;
  mediaType: 'movie' | 'tv';
  voteAverage: number;
  userId: string | null;
  loggedIn: boolean;
  // a biblioteca e a nota de quem olha (useTitleRelation, na casca)
  userRating: number | null;
  userRatingLoaded: boolean;
  isInLibrary: boolean;
  // a prateleira do título (useTitleMood, na casca)
  moodKey: string | null;
  moodLoaded: boolean;
}

const TitleScoreboard: React.FC<TitleScoreboardProps> = ({
  movieId,
  mediaType,
  voteAverage,
  userId,
  loggedIn,
  userRating,
  userRatingLoaded,
  isInLibrary,
  moodKey,
  moodLoaded,
}) => {
  const { t, i18n } = useTranslation();
  const prediction = useTitlePrediction(movieId, mediaType, userId);
  const predictedRating = prediction.predictedRating;
  // Nota 0 ("Crime Cinematográfico") também é nota — por isso a checagem
  // é por null, não por "falsy" como antes.
  const hasRated = userRating !== null && userRating !== undefined;

  const formatScore = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Série fora das prateleiras dos oráculos (ou filme ainda sem nota do
  // público): não existe previsão para ela, então o placar
  // já abre só com a nota do público (ou sua nota + público), sem reservar o
  // lugar da previsão. Por isso o placar espera também a consulta da
  // prateleira (rápida) antes de entrar.
  const inOraclePools = moodLoaded && moodKey !== null;
  const outsidePredictable =
    moodLoaded &&
    moodKey === null &&
    mediaType !== 'tv' &&
    voteAverage > 0;
  const predictable = inOraclePools || outsidePredictable;
  const scoreReady = !loggedIn || (userRatingLoaded && moodLoaded);
  const scoreCols = !loggedIn ? 1 : hasRated ? 2 : predictable ? 3 : 1;
  const scoreCells: ScoreCell[] = [];
  if (loggedIn && scoreReady && (hasRated || predictable)) {
    // O aparelho fica sempre no mesmo lugar da árvore (mesma chave, mesmo
    // componente) enquanto carrega e depois: a fagulha que estava esperando
    // é a mesma que vira mariposa quando a previsão chega.
    const gaugeCell = (pending: boolean): ScoreCell => ({
      key: 'slot1',
      label: t('movieModal.score.predicted'),
      labelIcon: <Wand2 className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5 text-violet-300" aria-hidden />,
      color: '#C4B5FD',
      span: 2,
      node: <PredictionGauge predicted={predictedRating} mu={prediction.mu} sigma={prediction.sigma} tenChance={prediction.tenChance} pending={pending} userId={userId} scope={prediction.scope} />,
      // 18/11/2026 (pedido do Bruno, a partir de um retorno de usuário: "eu
      // achava melhor quando já mostrava direto o número, agora tem um outro
      // esquema que achei meio confuso"): o aparelho continua, e o número da
      // nota prevista volta a aparecer escrito, ao lado do nome da coluna, na
      // cor da nota. Ele entra depois do voo do Patrono (para não entregar o
      // pouso antes); com "reduzir movimento" aparece direto.
      labelExtra:
        !pending && predictedRating !== null ? (
          <span key={predictedRating} className="co-pred-num font-bold tabular-nums" style={{ color: ratingTone(predictedRating).color }}>
            {predictedRating}
          </span>
        ) : null,
    });
    if (hasRated) {
      scoreCells.push({ key: 'slot1', value: userRating, label: t('movieModal.score.yours'), color: PAPER, icon: <Star className="w-4 h-4 fill-current" aria-hidden /> });
    } else if (prediction.loading) {
      scoreCells.push(gaugeCell(true));
    } else if (predictedRating !== null) {
      scoreCells.push(gaugeCell(false));
    } else if (isInLibrary) {
      scoreCells.push({ key: 'slot1', value: <Eye className="w-7 h-7" aria-hidden />, label: t('home.desk.inWatchlist'), color: '#BAE6FD', span: 2 });
    } else {
      scoreCells.push({ key: 'slot1', value: '—', label: t('movieModal.score.noPrediction'), color: MIST, span: 2 });
    }
  }
  scoreCells.push({
    key: 'public',
    value: voteAverage > 0 ? formatScore(voteAverage) : '—',
    label: t('movieModal.score.public'),
    color: voteAverage > 0 ? PAPER : MIST,
    icon: voteAverage > 0 ? <Star className="w-4 h-4 fill-amber-300 text-amber-300" aria-hidden /> : undefined,
  });
  // flex-col-reverse + justify-end: o número fica sempre no alto da coluna,
  // na mesma altura nas três, mesmo com nome de uma ou duas linhas. Com o
  // aparelho (mais alto que um número) é o contrário: justify-start, tudo
  // assentado no pé, para o nome do público ficar na linha do nome dele.
  const hasGauge = scoreCells.some((cell) => cell.node);
  const scoreCellClass = `flex flex-col-reverse ${hasGauge ? 'justify-start' : 'justify-end'} items-center md:items-start px-3 sm:px-5 md:first:pl-0 border-l border-white/10 first:border-l-0`;

  return (
    <div className={`mt-5 transition-[min-height] duration-300 ${hasGauge || (loggedIn && !scoreReady) ? 'min-h-[6.5rem]' : 'min-h-[4.6rem]'}`}>
      {scoreReady && (
        <motion.dl
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="grid w-full mx-auto md:mx-0"
          style={{ gridTemplateColumns: `repeat(${scoreCols}, minmax(0, 1fr))`, maxWidth: `${scoreCols * 9.75}rem` }}
        >
          {scoreCells.map((cell) => (
            <div key={cell.key} className={`${scoreCellClass} ${cell.span === 2 ? 'col-span-2' : ''}`}>
              <dt className="mt-1.5 text-xs leading-snug text-center md:text-left" style={{ color: MIST }}>
                {cell.labelIcon}
                {cell.label}
                {cell.labelExtra}
              </dt>
              <dd className={cell.node ? 'w-full flex justify-center md:justify-start' : 'h-[1.9rem] flex items-center'} style={{ color: cell.color }}>
                {cell.node ? (
                  cell.node
                ) : cell.pending ? (
                  <span className="block h-7 w-12 rounded-md animate-pulse" style={{ background: VELVET }} aria-hidden />
                ) : (
                  <motion.span
                    initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center gap-1.5"
                  >
                    {cell.icon}
                    <span style={{ ...PIXEL, textShadow: cell.glow ? `0 0 18px ${cell.glow}` : undefined }} className="text-[1.9rem] leading-none">
                      {cell.value}
                    </span>
                  </motion.span>
                )}
              </dd>
            </div>
          ))}
        </motion.dl>
      )}
    </div>
  );
};

export default React.memo(TitleScoreboard);
