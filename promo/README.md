# Comercial do Instagram (15/10/2026)

Ramo separado do `main`: nada aqui vai para o site.

- `promo/main.tsx`: a gaveta Conexão de verdade (componentes de `src/`) com perfis de demonstração (`promo/data.ts`). `lib/supabase` e `lib/auth` são trocados por `promo/mockSupabase.ts` e `promo/mockAuth.tsx` no build.
- `promo/vite.config.ts`: `vite build --config promo/vite.config.ts` gera `promo-dist/`.
- `promo/capture.mjs`: captura quadro a quadro (Playwright com relógio controlado), 1080×1920.
- `public/promo/`: a narradora (imagem gerada por IA) e o avatar dela.
