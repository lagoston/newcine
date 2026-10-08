import type { CapacitorConfig } from '@capacitor/cli';

// App nativo do CineOracle (Android e iOS) — o mesmo site, empacotado com o
// Capacitor. O build do Vite (pasta dist) vai dentro do app; os dados vêm do
// mesmo Supabase do site.
//
//   npm run app:sync      gera o site e copia para android/ e ios/
//   npm run app:android   abre o projeto no Android Studio
//   npm run app:ios       abre o projeto no Xcode (precisa de um Mac)
//   npm run app:assets    refaz ícones e telas de abertura a partir de resources/
//
// ATENÇÃO: o appId é o "documento de identidade" do app nas lojas. Depois do
// primeiro envio à Play Store / App Store ele não pode mais mudar.
const config: CapacitorConfig = {
  appId: 'com.cineoracle.app',
  appName: 'CineOracle',
  webDir: 'dist',
  backgroundColor: '#120D22',
  android: {
    // A página roda em https://localhost dentro do app (cookies e
    // armazenamento seguros, como no site).
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#120D22',
  },
  plugins: {
    SplashScreen: {
      // A abertura fica na tela até o React montar (nativeShell.ts esconde).
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#120D22',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false,
    },
    // Barras do sistema (do próprio Capacitor 8): ícones claros sobre o
    // fundo noite; no Android o app vai de ponta a ponta e o site respeita
    // as margens com env(safe-area-inset-*), como já faz no iPhone.
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
    Keyboard: {
      // O conteúdo encolhe quando o teclado abre (a barra de busca de baixo
      // sobe junto, como no site).
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
