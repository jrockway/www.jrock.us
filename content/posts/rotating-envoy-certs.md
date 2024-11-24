---
title: "Getting Envoy to pick up rotated certificates"
date: 2020-04-26
author: "June Rockway"
tags: ["envoy", "kubernetes", "tls", "cert-manger"]
showFullContent: false
---

Like many people, I use [cert-manager](https://github.com/jetstack/cert-manager)
to automatically renew my website's TLS certificates with
[Let's Encrypt](https://letsencrypt.org/). Unlike many people, I don't use an
Ingress controller to get traffic into my cluster, I just have a few instances
of [Envoy](https://envoyproxy.io) that terminate TLS and route traffic to the
appropriate backend. Cert-manager handles the mechanics of certificate renewal
very efficiently; it runs a controller loop that checks all my `Certificate`
objects for expiration, and when a certificate is close to expiring, it goes out
and renews it. It then updates a Kubernetes Secret with the new key material,
and Kubernetes then makes that new data available to pods that have mounted the
Secret as a volume. From there, it's up to the application to notice that some
symlinks have moved around and reload the certificate. Up until very recently,
Envoy did not bother to check. So at some point, you had to do a rolling restart
of the Envoy deployment to pick up the new certificate. Because there is 30 days
between when cert-manager renews the certificate and when the old certificate
actually expired, this was rarely a problem in practice. If any of your machines
went down, or you edited the config file to add a new route, or you upgraded
Envoy itself, the pod containing Envoy would restart, pick up the new
certificates, and you'd never notice that it wasn't automatically reloading the
certificate.

As someone who doesn't like to leave important production operations to chance,
though, I knew I needed a better system. Fortunately, Envoy added a way to
reload certificates with the 1.14 release. Let's try that.

## The mechanics

Everyone's Envoy configuration is different, so I'm just going to provide a very
minimal `envoy.yaml` that we'll modify to make certs automatically reload. You
can then apply this to your own configuration. (You can experiment with this on
your workstation by building Envoy, or extracting the binary from a Docker image
with `docker cp`. That's what I do for all my local Envoy work. Although Envoy
does not distribute binaries, the binary from the Docker image works great on my
Ubuntu 19.10 workstation.)

Here is a basic `envoy.yaml` that serves HTTPS on port 10000 with a static
response:

    static_resources:
        listeners:
            - name: test
              address:
                  socket_address:
                      protocol: TCP
                      address: 127.0.0.1
                      port_value: 10000
              listener_filters:
                  - name: "envoy.listener.tls_inspector"
                    typed_config: {}
              filter_chains:
                  - tls_context:
                        common_tls_context:
                            alpn_protocols: ["h2", "http/1.1"]
                            tls_certificates:
                                - certificate_chain:
                                      filename: "/certs/tls.crt"
                                  private_key:
                                      filename: "/certs/tls.key"
                    filters:
                        - name: envoy.http_connection_manager
                          typed_config:
                              "@type": type.googleapis.com/envoy.config.filter.network.http_connection_manager.v2.HttpConnectionManager
                              stat_prefix: test
                              route_config:
                                  virtual_hosts:
                                      - name: test
                                        domains: ["*"]
                                        routes:
                                            - match: { prefix: "/" }
                                              direct_response:
                                                  status: 200
                                                  body:
                                                      inline_string: "Hello from Envoy"
                              http_filters:
                                  - name: envoy.router

Put your TLS key and cert in `/certs`, and `curl https://localhost:10000/` will
return "Hello from Envoy". It works. You can do whatever you want to `/certs`
and Envoy will keep using the TLS configuration that it loaded at startup.

To fix that, we need to make the TLS context for our listener use
[SDS](https://www.envoyproxy.io/docs/envoy/latest/configuration/security/secret)
instead of a static configuration.

The first step is to create another config file that contains information about
the secret discovery. I put my main `envoy.yaml` in a ConfigMap that gets
mounted into `/etc/envoy`, and just added a `sds.yaml` to that ConfigMap to
store the SDS configuration. All it is is a plaintext representation of what an
SDS API server would serve to Envoy, if it was getting configuration from an xDS
server and not the filesystem. It looks like:

    resources:
        - "@type": "type.googleapis.com/envoy.api.v2.auth.Secret"
          tls_certificate:
              certificate_chain:
                  filename: "/certs/tls.crt"
              private_key:
                  filename: "/certs/tls.key"

While this looks almost exactly what we put in the main `envoy.yaml` before,
this is what triggers the code to start watching various directories for changes
with inotify and lead to the eventual refreshing of your certificate.

We also need to make some changes to `envoy.yaml` itself. Instead of statically
configuring the listener with a certificate, we need the listener to load the
certificate from SDS. In the listener's `filter_chains` section, we'll change
the `tls_context` to a more general `transport_socket`, and then point it at our
`sds.yaml`. (It is not necessary to convert `tls_context` to `transport_socket`,
but `tls_context` will be gone by the end of the year, so you might as well
change it now.)

So now instead of:

    listeners:
        - name: test
          ...
          filter_chains:
            - tls_context: {...}
              filters: [...]

We'll have:

    listeners:
        - name: test
          ...
          filter_chains:
              - transport_socket:
                    name: "envoy.transport_sockets.tls"
                    typed_config:
                        "@type": "type.googleapis.com/envoy.api.v2.auth.DownstreamTlsContext"
                        common_tls_context:
                            alpn_protocols: ["h2", "http/1.1"]
                            tls_certificate_sds_secret_configs:
                                sds_config:
                                    path: /etc/envoy/sds.yaml
                filters: [...]

Using SDS also activates other parts of Envoy's code that wants Envoy to have
some identifying information associated with the node. You can supply that on
the command line, or in the bootstrap config with a `node` configuration at the
top level:

    node:
        id: test
        cluster: test

If you omit this, you'll get an error like:

    TlsCertificateSdsApi: node 'id' and 'cluster' are required. Set it either in 'node' config or via --service-node and --service-cluster options.

(In production, I use the pod's hostname, like `envoy-b958c94b7-2fbws`, for the
ID and `ingress:public:https` as the cluster name. That is what my
[cluster discovery service](https://github.com/jrockway/ekglue/) calls my
cluster. It doesn't matter for this, but it does matter for other things. You
probably already have this set up.)

The result is a final `envoy.yaml` that looks like:

    node:
        id: test
        cluster: test
    static_resources:
        listeners:
            - name: test
              address:
                  socket_address:
                      protocol: TCP
                      address: 127.0.0.1
                      port_value: 10000
              listener_filters:
                  - name: envoy.listener.tls_inspector
                    typed_config: {}
              filter_chains:
                  - transport_socket:
                        name: envoy.transport_sockets.tls
                        typed_config:
                            "@type": type.googleapis.com/envoy.api.v2.auth.DownstreamTlsContext
                            common_tls_context:
                                alpn_protocols: ["h2", "http/1.1"]
                                tls_certificate_sds_secret_configs:
                                    sds_config:
                                        path: /etc/envoy/sds.yaml
                    filters:
                        - name: envoy.http_connection_manager
                          typed_config:
                              "@type": type.googleapis.com/envoy.config.filter.network.http_connection_manager.v2.HttpConnectionManager
                              stat_prefix: test
                              route_config:
                                  virtual_hosts:
                                      - name: test
                                        domains: ["*"]
                                        routes:
                                            - match: { prefix: "/" }
                                              direct_response:
                                                  status: 200
                                                  body:
                                                      inline_string: "Hello from Envoy"
                              http_filters:
                                  - name: envoy.router

With that running, your certificates should be used by Envoy as soon as they are
rotated!

There is a delay between a secret being updated and the volume mount changing,
controlled by your cluster administrator (it's a parameter to the Kubelet) -- if
you are watching the Kubernetes event log or cert-manager's log, you might not
see the new certificate as soon as you think it's ready, but it should be
available on the order of 5 minutes later.

Envoy also prints some logs at the `debug` level:

    [2020-04-26 18:41:04.243][23137][debug][file] [source/common/filesystem/inotify/watcher_impl.cc:72] notification: fd: 1 mask: 80 file: ..data
    [2020-04-26 18:41:04.243][23137][debug][file] [source/common/filesystem/inotify/watcher_impl.cc:88] matched callback: directory: ..data
    [2020-04-26 18:41:04.243][23137][debug][config] [source/extensions/transport_sockets/tls/ssl_socket.cc:678] Secret is updated.
    [2020-04-26 18:41:04.245][23137][debug][file] [source/common/filesystem/inotify/watcher_impl.cc:88] matched callback: directory: ..data

Be aware that debug logging is not on by default; you'll have to turn it on if
you want to watch this happen the first time. In general, the way that I check
that it worked is by looking at the `/certs` admin API endpoint, or by the
`server.days_until_first_cert_expiring` stat (which you should be feeding into
your monitoring).

## The details

When I read the changelog for Envoy 1.14, I knew I wanted to try this feature,
but I also assumed that it wouldn't be a simple cut-n-paste job to get it
working. In retrospect, I was wrong; it was actually simple to get working since
it was designed to exactly work with Kubernetes's filesystem structure, and I
happen to deploy on Kubernetes. I wrote a
[little test program](https://github.com/jrockway/cert-rotation-test), to try
things out on my workstation before blindly forging ahead in production. This
ended up taking quite a bit of time and did not work initially.

The first version of my code assumed that the atomic updating would work like
the rest of Envoy (through its
[Runtime](https://www.envoyproxy.io/docs/envoy/latest/configuration/operations/runtime)
configuration) -- i.e., put your certificates in some directory, and symlink
another directory (call it `data`) to that. Your certs are then in
`/whatever/data/tls.key` and `/whatever/data/tls.crt`, and `/whatever/data` is
just a symlink to `/somewhere/20190401-certs`. When you want the certificates to
rotate, you symlink the new directory to `.tmp` or something, and then
atomically replace `data` with `.tmp`, `mv -Tf .tmp data`.

However, Envoy does not recognize that sequence for certificates. It requires
you to do the exact dance that Kubernetes does, which involves two levels of
symlinks. If you have a volume mount `/certs`, then the current version of your
Kubernetes secret is actually stored in `/certs/..timestamp` (where timestamp is
actually something like `2020_04_09_17_25_30.145602340`). So you'll have
`/certs/..timestamp/tls.key`, etc., as a normal file. This current timestamp is
then linked to a directory called `..data`. Finally, `/certs/tls.key` (and
friends), are linked to `..data/tls.key`. When a data update arrives, the files
are written to a new `..timestamp` directory, and the `..data` symlink is
atomically replaced. This is close to what I did in the first version of my
program, but not exactly the same. As a result, Envoy did not notice any changes
my program made. I changed my program to do exactly what Kubernetes does, and
then it started working. Now that program exists so you can test locally without
having to understand the details ;)

Here is the `ls` output of that sort of directory structure:

    # ls -laR jrock.us
    jrock.us:
    total 4
    drwxrwxrwt 3 root root  140 Apr  9 17:25 .
    drwxr-xr-x 1 root root 4096 Apr  9 17:25 ..
    drwxr-xr-x 2 root root  100 Apr  9 17:25 ..2020_04_09_17_25_30.145602340
    lrwxrwxrwx 1 root root   31 Apr  9 17:25 ..data -> ..2020_04_09_17_25_30.145602340
    lrwxrwxrwx 1 root root   13 Apr  9 17:25 ca.crt -> ..data/ca.crt
    lrwxrwxrwx 1 root root   14 Apr  9 17:25 tls.crt -> ..data/tls.crt
    lrwxrwxrwx 1 root root   14 Apr  9 17:25 tls.key -> ..data/tls.key

    jrock.us/..2020_04_09_17_25_30.145602340:
    total 8
    drwxr-xr-x 2 root root  100 Apr  9 17:25 .
    drwxrwxrwt 3 root root  140 Apr  9 17:25 ..
    -rw-r--r-- 1 root root    0 Apr  9 17:25 ca.crt
    -rw-r--r-- 1 root root 3558 Apr  9 17:25 tls.crt
    -rw-r--r-- 1 root root 1679 Apr  9 17:25 tls.key

Looking at the tests in the
[PR](https://github.com/envoyproxy/envoy/pull/10163/files) where this feature
was introduced was helpful, as is the
[related ticket](https://github.com/envoyproxy/envoy/issues/9359). (It didn't
make sense to me until I just `kubectl exec`'d into a container and ran
`ls -laR` on a mounted secret, though. If you are implementing something
similar, I recommend doing that. I would also greatly appreciate a link to the
code in Kubernetes that manages this. I spent about 20 minutes looking, but
couldn't find it, which annoys me.)

## Conclusion

In the end, this was a very simple change. Here's all I needed to do for my own
personal site:
[jrock.us#3d986...](https://github.com/jrockway/jrock.us/commit/3d986f6322b54ebce00b95079b534c5fa116bf86)

Anyway, I hope this is helpful to someone. I am glad I no longer have to care
about certificates, and hopefully you don't have to either!
