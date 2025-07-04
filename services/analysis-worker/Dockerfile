FROM oven/bun:1 as base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb* /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
RUN bun run build

FROM base
COPY --from=build /usr/src/app/dist /usr/src/app/dist
COPY --from=install /temp/dev/node_modules node_modules
COPY package.json .

EXPOSE 3000
CMD ["bun", "start"]
