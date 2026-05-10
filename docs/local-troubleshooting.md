# Local Troubleshooting (Windows / PowerShell)

## 1) Clear Next.js cache

```powershell
Remove-Item -Recurse -Force .next
```

## 2) Clean install dependencies

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

## 3) Start dev server

```powershell
npm run dev
```

## 4) If browser seems to "compile forever"

1. Stop server (`Ctrl+C`).
2. Clear `.next`.
3. Start again.
4. Open `http://localhost:3000/app?tab=daily`.
5. Hard refresh browser (`Ctrl+Shift+R`).

## 5) Full pre-release local check

```powershell
npm run verify
npm run audit:prod
```
