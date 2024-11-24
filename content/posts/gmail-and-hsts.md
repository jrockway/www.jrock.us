---
title: "Trying out HSTS; what broke?"
date: 2020-07-05
author: "June Rockway"
tags: ["tls", "envoy", "hsts"]
showFullContent: false
---

After many years of `jrock.us` being served over HTTPS, I finally remembered to
enable HTTP Strict Transport Security. There was never any reason not to -- all
traffic to any website or app at jrock.us goes through my reverse proxy, and
it's served with a wildcard `*.jrock.us` certficiate. If it doesn't go through
my reverse proxy, that's a bug, and should be fixed.

Several days after making this change, I closed my GMail tab, and typed
`mail.jrock.us` to get it back. Chrome responded with "Connection closed".
Google must be down! But that seems pretty unlikely, so I tried it in curl:

```
$ curl -v https://mail.jrock.us/
*   Trying 2607:f8b0:4006:808::2013:443...
* TCP_NODELAY set
* Connected to mail.jrock.us (2607:f8b0:4006:808::2013) port 443 (#0)
* ALPN, offering h2
* ALPN, offering http/1.1
* successfully set certificate verify locations:
*   CAfile: none
  CApath: /etc/ssl/certs
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
* OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to mail.jrock.us:443
* Closing connection 0
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to mail.jrock.us:443
```

OK, so that doesn't work. What about `http://mail.jrock.us`?

```
$ curl -v http://mail.jrock.us/
*   Trying 2607:f8b0:4006:808::2013:80...
* TCP_NODELAY set
* Connected to mail.jrock.us (2607:f8b0:4006:808::2013) port 80 (#0)
> GET / HTTP/1.1
> Host: mail.jrock.us
> User-Agent: curl/7.65.3
> Accept: */*
>
* Mark bundle as not supporting multiuse
< HTTP/1.1 301 Moved Permanently
< Location: https://mail.google.com/a/jrock.us
< Date: Sun, 05 Jul 2020 15:58:13 GMT
< Content-Type: text/html; charset=UTF-8
< Server: ghs
< Content-Length: 231
< X-XSS-Protection: 0
< X-Frame-Options: SAMEORIGIN
<
<HTML><HEAD><meta http-equiv="content-type" content="text/html;charset=utf-8">
<TITLE>301 Moved</TITLE></HEAD><BODY>
<H1>301 Moved</H1>
The document has moved
<A HREF="https://mail.google.com/a/jrock.us">here</A>.
</BODY></HTML>
* Connection #0 to host mail.jrock.us left intact
```

That works, so Google must not be down. Why doesn't it work with HTTPS, though?

The answer is: it was never HTTPS. I have DNS set up so that mail.jrock.us is a
CNAME for ghs.google.com, so my server isn't handling the request. To be HTTPS,
Google would have to issue a certificate for me. If they didn't, the browser
would complain about a hostname mismatch (mail.jrock.us isn't ghs.google.com).
But I know they're not doing that, because I have a CAA DNS record that says
only Let's Encrypt can issue certificates for jrock.us, and I review the CT logs
from time to time to see who is issuing certificates for me. Nobody is issuing
mail.jrock.us certificates, so of course visiting mail.jrock.us in the browser
and having it work has to mean that it's non-TLS. The thought did not occur to
me when I was enabling HSTS, but it's obvious in retrospect.

I am actually super glad that I caught this, because there's a 99.999% chance
that if I typed "mail.jrock.us" into a web browser and it asked me for my Google
password, I would have typed it. It would have been super-easy to phish me.
(Hopefully my 2FA key would have noticed that I wasn't at Google, but I could
probably have been convinced to type a OTP. 2FA is only as strong as its weakest
link, and while tokens are phishing-resistant, the backup systems for a lost
token aren't.)

I adjusted `mail.jrock.us` to hit my own reverse proxy, which can be configured
to issue the redirect itself:

```
- name: mail.jrock.us
  domains: ["mail.jrock.us"]
  routes:
      - match: { prefix: "/" }
        response_headers_to_add:
            - header:
                  key: location
                  value: "https://mail.google.com/a/jrock.us"
              append: false
            - header:
                  key: content-type
                  value: "text/html; charset=UTF-8"
              append: false
        direct_response:
            status: 301
            body:
                inline_string: |
                    <HTML><HEAD><meta http-equiv="content-type" content="text/html;charset=utf-8">
                    <TITLE>301 Moved</TITLE></HEAD><BODY>
                    <H1>301 Moved</H1>
                    The document has moved
                    <A HREF="https://mail.google.com/a/jrock.us">here</A>.
                    </BODY></HTML>
```

You could get away with just issuing the redirect with an empty body, but since
we have the opportunity to exactly duplicate the functionality that Google
provides over HTTP, we do so. Maybe it will come in handy someday.

Now it works again, and HTTP Strict Transport Security saved me from being
phished by a shady network in the future.

(I wrote this post because there is a 100% chance that this will happen to you
too. Of course, you probably enabled HSTS decades ago because you are
responsible, so this information comes too late. Oh well!)
