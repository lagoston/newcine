// Onde o CineOracle está rodando: no navegador (site/PWA) ou dentro do app
// nativo (Android/iOS, empacotado com o Capacitor).
//
// O app nativo injeta window.Capacitor antes de qualquer script da página,
// então dá para saber sem importar o @capacitor/core no pacote do site —
// a parte nativa (nativeShell.ts) só é baixada dentro do app.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

const cap = (typeof window !== 'undefined' ? (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor : undefined);

export const IS_NATIVE_APP = Boolean(cap?.isNativePlatform?.());
export const NATIVE_PLATFORM: 'ios' | 'android' | 'web' = IS_NATIVE_APP
  ? ((cap?.getPlatform?.() as 'ios' | 'android') ?? 'web')
  : 'web';

// Compras pelo site (Stripe) não podem acontecer dentro do app das lojas:
// a Apple e o Google exigem a cobrança da própria loja para assinaturas
// digitais. Até a compra pela loja existir, o app não mostra o checkout.
export const WEB_CHECKOUT_AVAILABLE = !IS_NATIVE_APP;
