# Stock+ read-only setup

The Stock+ comparison leg requires an authenticated Bitget API key. Use a dedicated key whose only enabled permission is **Stock+ market data (read-only)**. Do not enable trading, transfer, withdrawal, wallet, or account-management permissions.

## Production configuration

Add these values directly in Vercel Project Settings → Environment Variables for the **Production** environment:

- `BITGET_ACCESS_KEY`
- `BITGET_SECRET_KEY`
- `BITGET_PASSPHRASE`

Keep them server-only. Never prefix them with `VITE_`, commit them, include them in screenshots, or paste them into chat. Redeploy after saving the variables.

## Verification

From a trusted shell that already contains the three variables, run:

```powershell
npm.cmd run stockplus:verify
```

The verifier requests Stock+ market data only and never prints credential values. Then query the deployed allowlisted capture route and confirm `stockSource.status` is `available`:

```text
https://bitget-market-integrity-desk.vercel.app/api/benchmark-source?symbol=rAAPLUSDT
```

Finally, regenerate the benchmark:

```powershell
npm.cmd run benchmark:collect
npm.cmd run benchmark:evaluate
npm.cmd run benchmark:report
```

Do not describe the Stock+ path as verified until the entitlement check succeeds and at least one frozen case contains a matched `underlyingCandle`.
