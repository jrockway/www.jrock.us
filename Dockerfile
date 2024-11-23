FROM node:23.3.0 AS node
WORKDIR /site
COPY package.json package-lock.json ./
RUN npm ci
COPY webpack.config.js postcss.config.js ./
COPY src/ ./src/
RUN npm run build

FROM hugomods/hugo:exts-0.139.2 AS hugo
WORKDIR /src
COPY . .
ENV HUGO_DESTINATION=/public
ENV HUGO_ENV=production
COPY --from=node /site/static/assets/ /src/static/assets/
RUN hugo --cleanDestinationDir

FROM nginx:1.27.2
RUN apt-get update && apt-get install --no-install-recommends --no-install-suggests -y curl

WORKDIR /
RUN rm /etc/nginx/nginx.conf
RUN mkdir -p /srv

WORKDIR /srv
COPY --from=hugo /src/public .

STOPSIGNAL SIGQUIT
