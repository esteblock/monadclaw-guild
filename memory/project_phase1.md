---
name: MonadClaw Guild Phase 1
description: Phase 1 is a Next.js 14 app with Privy wallet auth and a local-state chatbox
type: project
---

Phase 1 scaffold is complete and builds successfully.

**Why:** Hackathon POC — no backend yet, messages are in local React state.

**How to apply:** Phase 2 will likely add real chat backend (e.g., websockets or Supabase) and Monad chain interactions.

Key decisions:
- Next.js 14.2.35 (patched), App Router, TypeScript, Tailwind CSS
- `@privy-io/react-auth` v1.x — wallet-only login, dark theme, purple accent
- `PrivyProviderWrapper` loaded with `next/dynamic { ssr: false }` to prevent build-time SSR crash (Privy validates appId format at init)
- `NEXT_PUBLIC_PRIVY_APP_ID` env var required — see `.env.local.example`
- Components: `Header.tsx` (wallet connect/disconnect + truncated address), `Chatbox.tsx` (message history + input + hardcoded "Message received" reply)
