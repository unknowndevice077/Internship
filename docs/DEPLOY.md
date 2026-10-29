# Deploying Vendora

The API goes on Render, the web app on Vercel. Everything here has a free tier. Do the steps in order, since later ones need URLs from earlier ones. Budget about an hour the first time.

## 1. MongoDB Atlas

1. Sign up at https://www.mongodb.com/cloud/atlas/register and create a free **M0** cluster (pick the region closest to Render's, e.g. Singapore).
2. **Database Access** → add a user with a generated password.
3. **Network Access** → add `0.0.0.0/0` (Render's free tier has no fixed IP).
4. **Connect → Drivers** → copy the connection string and put the database name in it:
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/vendora?retryWrites=true&w=majority`

That's `MONGO_URI`.

## 2. Redis (Upstash)

1. Sign up at https://upstash.com and create a Redis database (free, same region).
2. Copy the **`rediss://...`** URL (the one starting with `rediss`, with TLS).

That's `REDIS_URL`. It's required in production: the in-memory mock is dev-only and isn't installed on Render.

## 3. Elasticsearch (optional)

Without it, search uses MongoDB with partial-word matching, which is fine for a demo. To use it:

1. Elastic Cloud has a 14-day trial (https://cloud.elastic.co), or Bonsai has a free sandbox (https://bonsai.io).
2. Use an **8.x** cluster (the client is pinned to 8.x).
3. Copy the URL with the credentials in it: `https://USER:PASS@host:443`

That's `ELASTICSEARCH_URL`.

## 4. S3 for product images

1. In the AWS console create a bucket, e.g. `vendora-images-yourname`, region `ap-southeast-1`.
2. Under **Permissions**, turn off "Block all public access" and add this bucket policy (swap in the bucket name) so product images are readable:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::vendora-images-yourname/products/*"
       }
     ]
   }
   ```
3. **IAM → Users → Create user**, attach an inline policy allowing only `s3:PutObject` on `arn:aws:s3:::vendora-images-yourname/*`, then create an access key for it.

That gives `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

## 5. Email (Resend)

1. Sign up at https://resend.com and create an API key.
2. Without your own domain you can only send to your own email address, which is enough for the demo.

`SMTP_URL=smtp://resend:YOUR_API_KEY@smtp.resend.com:587` and `MAIL_FROM=Vendora <onboarding@resend.dev>`.

## 6. API on Render

1. Sign up at https://render.com with GitHub, then **New → Blueprint** and pick the `vendora` repo. It reads `render.yaml`.
2. Fill in the variables it asks for: everything from steps 1–5, the Stripe keys, and `CLIENT_URL` (put `http://localhost:5173` for now, it's fixed in step 8). `JWT_SECRET` is generated for you.
3. Deploy. When it's live, open `https://YOUR-API.onrender.com/api/health` and check `mongo` and `redis` say `up` and `payments` says `stripe`.

The free plan sleeps after 15 minutes idle and takes about 30 seconds to wake up. Open the health URL a minute before a demo.

## 7. Seed the production database

From your machine, point the seed at production once:

```bash
cd server
MONGO_URI="mongodb+srv://..." REDIS_URL="rediss://..." ELASTICSEARCH_URL="" npm run seed
```

On Windows PowerShell set them first with `$env:MONGO_URI="..."` and so on. If you set up Elasticsearch, include its URL so the index is built too.

## 8. Web app on Vercel

1. Sign up at https://vercel.com with GitHub, **Add New → Project**, pick `vendora`.
2. **Root Directory**: `client`. Vercel detects Vite.
3. Environment variables:
   - `VITE_API_URL` = `https://YOUR-API.onrender.com`
   - `VITE_STRIPE_PUBLISHABLE_KEY` = your `pk_test_...`
4. Deploy, then copy the site URL (e.g. `https://vendora-yourname.vercel.app`).
5. Back on Render, set `CLIENT_URL` to that URL and redeploy. CORS and the Stripe onboarding return links use it.

## 9. Stripe webhook

1. Stripe dashboard (test mode) → **Developers → Webhooks → Add endpoint**.
2. URL: `https://YOUR-API.onrender.com/api/webhooks/stripe`, events `payment_intent.succeeded` and `account.updated`.
3. Copy its signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` on Render and redeploy.

## 10. Smoke test

- Open the Vercel URL, log in with a demo account, search, add to cart and pay with `4242 4242 4242 4242`.
- As `vendor@vendora.test`, go to Payouts and connect Stripe (use the test buttons on Stripe's form).
- As `admin@vendora.test`, check analytics and Payouts.
- Upload a product image as the vendor and check the image URL is on S3.
