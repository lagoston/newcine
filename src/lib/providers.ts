// Os 12 serviços de streaming mais populares — não é uma lista arbitrária,
// foi extraída diretamente dos dados reais já presentes no movie_cache do
// projeto (contagem de frequência de cada provedor entre os filmes já em
// cache), garantindo que os IDs batem 100% com o que o TMDB realmente usa
// pra esse catálogo, sem risco de erro manual de digitação de ID.
export interface StreamingProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export const POPULAR_STREAMING_PROVIDERS: StreamingProvider[] = [
  { provider_id: 8, provider_name: 'Netflix', logo_path: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' },
  { provider_id: 1899, provider_name: 'HBO Max', logo_path: '/jbe4gVSfRlbPTdESXhEKpornsfu.jpg' },
  { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/pvske1MyAoymrs5bguRfVqYiM9a.jpg' },
  { provider_id: 337, provider_name: 'Disney Plus', logo_path: '/97yvRBw1GzX7fXprcF80er19ot.jpg' },
  { provider_id: 307, provider_name: 'Globoplay', logo_path: '/7Cg8esVVXOijXAm1f1vrS7jVjcN.jpg' },
  { provider_id: 531, provider_name: 'Paramount Plus', logo_path: '/h5DcR0J2EESLitnhR8xLG1QymTE.jpg' },
  { provider_id: 484, provider_name: 'Claro tv+', logo_path: '/7EpFKOCMrlo3bjsyBMrec64c7Wb.jpg' },
  { provider_id: 283, provider_name: 'Crunchyroll', logo_path: '/fzN5Jok5Ig1eJ7gyNGoMhnLSCfh.jpg' },
  { provider_id: 15, provider_name: 'Hulu', logo_path: '/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg' },
  { provider_id: 386, provider_name: 'Peacock Premium', logo_path: '/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg' },
  { provider_id: 47, provider_name: 'Looke', logo_path: '/9HhIlyFlilVtx0sMTcPbhs5qR31.jpg' },
  { provider_id: 350, provider_name: 'Apple TV', logo_path: '/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg' },
];