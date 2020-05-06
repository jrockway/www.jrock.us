FROM node:13.8.0 AS node
WORKDIR /site
COPY package.json package-lock.json ./
RUN npm ci
COPY webpack.config.js postcss.config.js ./
COPY src/ ./src/
RUN npm run build

FROM klakegg/hugo:0.66.0-ext-alpine AS hugo
WORKDIR /src
COPY . .
ENV HUGO_DESTINATION=/public
ENV HUGO_ENV=production
COPY --from=node /site/static/assets/ /src/static/assets/
RUN hugo --cleanDestinationDir

FROM nginx:1.17.3
RUN apt-get update && apt-get install --no-install-recommends --no-install-suggests -y curl

WORKDIR /etc/nginx/modules
ADD https://github.com/opentracing-contrib/nginx-opentracing/releases/download/v0.9.0/linux-amd64-nginx-1.17.3-ngx_http_module.so.tgz  /etc/nginx/modules/opentracing.tgz
RUN tar xzvf opentracing.tgz
RUN rm opentracing.tgz
RUN chmod a+rx *.so

WORKDIR /usr/local/lib
ADD https://github.com/rnburn/zipkin-cpp-opentracing/releases/download/v0.5.2/linux-amd64-libzipkin_opentracing_plugin.so.gz libzipkin_opentracing_plugin.so.gz
RUN gunzip libzipkin_opentracing_plugin.so.gz

RUN chmod a+rx *.so

WORKDIR /
RUN rm /etc/nginx/nginx.conf
RUN mkdir -p /srv

WORKDIR /srv
COPY --from=hugo /public .

STOPSIGNAL SIGQUIT
