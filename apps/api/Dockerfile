FROM node:24-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
WORKDIR /app/apps/api
RUN pnpm exec prisma generate

EXPOSE 3000
CMD ["pnpm", "run", "start:dev"]
