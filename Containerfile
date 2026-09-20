FROM docker.io/oven/bun:1.4-alpine


WORKDIR /app

COPY package.json .
COPY bun.lock .
RUN ["bun", "install", "--frozen-lockfile"]
COPY . .
CMD ["bun", "run","start"]
