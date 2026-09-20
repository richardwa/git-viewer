FROM oven/bun:1.4-alpine

# git is required at runtime: the server shells out to the git CLI
RUN apk add --no-cache git

WORKDIR /app

COPY package.json .
COPY bun.lock .
RUN ["bun", "install", "--frozen-lockfile"]
COPY . .
RUN ["bun", "run", "build"]
CMD ["bun", "run", "start"]
