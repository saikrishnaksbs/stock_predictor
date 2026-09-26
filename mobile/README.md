# Stock Predictor — Mobile

React Native (Expo) client for the FastAPI backend in [`app/`](../app). Talks to the
same endpoints as [`frontend/`](../frontend): auth, portfolio/wishlist, symbol search,
price history, sentiment, and predictions.

## Setup

```bash
cd mobile
npm install
cp .env.example .env   # set EXPO_PUBLIC_API_BASE to your backend URL
npx expo start
```

Then press `i` (iOS Simulator), `a` (Android Emulator), or scan the QR code with
Expo Go on a physical device.

### Pointing at the backend

Start the backend first (`uvicorn app.main:app --reload` from the repo root, or
`.claude/launch.json`'s `backend` config). Set `EXPO_PUBLIC_API_BASE` in `mobile/.env`:

- iOS Simulator: `http://127.0.0.1:8123` (default) works as-is.
- Android Emulator: use `http://10.0.2.2:8123` instead of `localhost`.
- Physical device (Expo Go): use your computer's LAN IP, e.g. `http://192.168.1.10:8123`.
- Deployed backend: your Render URL, e.g. `https://stock-predictor-api.onrender.com`.

Restart `expo start` after changing `.env`.

## Structure

- `src/api` — typed fetch client mirroring `frontend/src/lib/api.ts`, with the
  auth token persisted via `expo-secure-store` instead of browser storage.
- `src/context/AuthContext.tsx` — session state (login/signup/logout).
- `src/screens` — Login, Signup, Dashboard (portfolio + wishlist), Search
  (symbol typeahead, add to portfolio), StockDetail (price chart, sentiment,
  live news scan, article summaries), Timezone (`PUT /users/me/timezone`).
- `src/Navigation.tsx` — stack navigator, swaps between auth and app screens
  based on session state.

## Notes

- Live sentiment scanning uses `react-native-sse` (native `EventSource` isn't
  reliably available in React Native) — tap "scan latest news" on a stock's
  detail screen.
- Article rows on the stock detail screen support "summarize" and "read full
  text", both fetched on demand (can take 10-30s — real page load + model call).
- Timezone is editable from the Dashboard header (tap the current timezone).
