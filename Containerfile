FROM oven/bun:1.4-alpine

WORKDIR /app

COPY package.json .
COPY bun.lock .
RUN ["bun", "install", "--frozen-lockfile"]
COPY . .
RUN ["bun", "run", "build"]
CMD ["bun", "run", "start"]
