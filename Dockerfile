# Air Competition Analysis — container for Hugging Face Spaces (Docker SDK).
# The Playwright base image ships Chromium's OS dependencies preinstalled.
FROM mcr.microsoft.com/playwright:v1.48.0-noble

# HF Spaces routes all external traffic to port 7860; server.js reads process.env.PORT.
ENV PORT=7860 \
    NODE_ENV=production \
    NPM_CONFIG_CACHE=/tmp/.npm

WORKDIR /app

# Install Node dependencies first (better Docker layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Make sure the Chromium build matches the installed Playwright version
RUN npx playwright install chromium

# App source
COPY . .

# Writable dir for CSV exports (ephemeral on HF, which is fine — exports are downloaded)
RUN mkdir -p /app/results && chmod -R 777 /app/results

EXPOSE 7860
CMD ["node", "server.js"]
