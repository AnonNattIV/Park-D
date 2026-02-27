# Park-D
For web deployment

## Docker (Next.js)

Build and run:

```bash
docker compose up --build
```

Or with plain Docker:

```bash
docker build -t park-d-nextjs .
docker run -p 3000:3000 park-d-nextjs
```

Open: http://localhost:3000

This repo currently only contains deployment files. Add your Next.js app files (`package.json`, source code, etc.) in the project root for the Docker build to work.
