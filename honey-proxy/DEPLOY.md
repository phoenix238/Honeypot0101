# Deploy honey-proxy to Cloudflare Workers

Run these commands from inside the `honey-proxy/` folder.

## 1. Install Wrangler
```
npm install
```

## 2. Log in to Cloudflare
```
npx wrangler login
```
This opens a browser tab. Approve it.

## 3. Set your Anthropic API key as a secret
```
npx wrangler secret put ANTHROPIC_KEY
```
Paste your `sk-ant-...` key when prompted. It is stored encrypted in Cloudflare — never written to disk or visible in logs.

## 4. Deploy
```
npx wrangler deploy
```
You will get a URL like: `https://honey-proxy.YOUR-ACCOUNT.workers.dev`

## 5. Update honey.html
Open `honey.html` and find this line near the top of the script:
```
const PROXY_URL='https://honey-proxy.YOUR-ACCOUNT.workers.dev';
```
Replace `YOUR-ACCOUNT` with the actual subdomain from step 4.

## 6. Lock down CORS (before going live)
In `wrangler.toml`, change:
```
ALLOWED_ORIGIN = "*"
```
to your actual site URL, e.g.:
```
ALLOWED_ORIGIN = "https://honey.yourdomain.com"
```
Then redeploy:
```
npx wrangler deploy
```

## Done
- The API key is now stored in Cloudflare, not in the browser
- Users no longer need to enter a key
- All AI scan features work automatically
- Free tier: 100,000 requests/day
