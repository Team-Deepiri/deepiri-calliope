# Architecture

Calliope splits concerns between a FastAPI control plane, PostgreSQL for durable jobs, Ollama for open-weight reasoning, and the Aamati tree for groove-oriented ML utilities. The browser UI is a Vite SPA that can be published through Netlify while the API runs on your own infrastructure.
