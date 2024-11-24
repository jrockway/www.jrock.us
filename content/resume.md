---
title: June Rockway's Résumé
date: 2024-11-23
---

Note: I have gone by the name "Jonathan Rockway" for much of my career. I have
changed my name to be more aligned with my gender identity. This will be less
confusing as time progresses, but old Git commits are always going to be under
the old name.

I'm a software engineer who focuses on doing everything necessary to deliver an
ideal experience to the end user. I take full responsibility for the final
product and the entire engineering process; from design documentation,
implementation, code reviews and mentoring, testing, deployment, maintenance of
the production environment, monitoring, writing documentation; all while
ensuring that my team's priorities are in line with our business goals.

My preferred programming languages these days are Go and Typescript.

(Contact information available upon request, or get it out of `whois jrock.us`!)

## Interesting Personal Projects

I have quite a few projects on Github; https://github.com/jrockway. Most popular
are some Emacs libraries for managing projects and for interacting with git.

I wrote some glue to
[make Envoy and Kubernetes work together](https://github.com/jrockway/ekglue).

You can see the
[source code for my website](https://github.com/jrockway/www.jrock.us) and
[production k8s environment](https://github.com/jrockway/jrock.us). That should
give you a good idea of how I build and deploy applications (and other
interesting things like mTLS at a personal-website scale.)

I designed a [clock](https://github.com/jrockway/beaglebone-gps-clock) that is
accurate to within several microseconds.

In a past life, I wrote a lot of Perl and maintained or wrote
[several popular libraries](http://search.cpan.org/~jrockway/). I am kind of
over using programming languages that don't compile to a single binary, but, the
projects are good examples of my approach to library design, documentation, and
testing.

Back when web frameworks were the cool new thing, I wrote a
[book](https://www.packtpub.com/networking-and-servers/catalyst) about one.

I am an Extra-class amateur radio operator, `KD2DTW`.

Finally, I have a [blog](https://jrock.us/posts/) where you might read about
what I've been up to more recently.

## Work Experience

The following section is a somewhat detailed overview of projects I've worked
on. The TL;DR is that I've written everything from kernel modules for set-top
boxes and WiFi routers, monitoring systems for Google, and customer-facing and
internal web apps.

### Pachyderm -- 7/2020 ~ 11/2024 -- Principal Engineer

I was the team lead of our Hub cloud-hosted project, and then moved on to be the
team lead of our Core project, https://github.com/pachyderm/pachyderm. My focus
in this role was growing our team in size and skill while paying careful
attention to our wonderful customers.

We were acquired by Hewlett Packard Enterprise in 3/2023, and they laid everyone
off in 11/2024.

I will write more here later ;)

### Pilot Fiber -- 6/2018 ~ 8/2019 -- Senior Software Engineer

Pilot Fiber is a small ISP. We had four people on the software engineering team.
I was hired to write networking tools in Go, and did that and much more.

I implemented a system to parse the logs from our OLTs ("optical line terminal",
basically the equipment that terminates fibers that go off to customers) and
generate real-time status alerts for the network support team. This was
configurable so that people could add new alerting or monitoring rules by
editing a JSON config file. We used that to send customers "do you need help?"
emails if they had been offline for a while and to generate charts/alerts via
InfluxDB/Grafana of other vital metrics. (Using the SNMP features on the OLT
caused them to crash. So logs were all we could safely use to monitor the core
of our network.) The logs were ingested into this system via syslog; we used
rsyslog on a machine running near the OLTs to receive the UDP syslog messages
from the OLTs, and then forward them on over TCP to our production
infrastructure on AWS. My program then just parsed the raw syslog TCP stream
with a custom parser. Each full syslog message was checked against the
configuration file, to be dropped or further processed.

As Pilot grew, some practices from the early days had to go away. I wrote a Go
program to rotate the passwords on all network hardware every day. This was
designed as a database-backed continuously-running program that would wake up at
the right time (based on data in the database), check the status of every
device's password, and if a day had elapsed, randomly generate a new password,
apply it to the OLT, and check that it worked. The passwords were stored in our
database, as well as synced to 1password via a custom integration I wrote using
their command-line utility. (Sadly it's written in go, as evidenced from the
messages about TLS failures, but they only released an opaque binary and not a
go library. So I had to wrap the go program with a go library.) The entire
process was implemented as a state machine that could be interrupted at any
time; either due to the program crashing, the management interface on the
network device becoming unreachable, etc. It was designed to be as paranoid as
possible, and had unit test coverage of every error case. While I was there, it
rotated over 40,000 passwords and never caused an outage or rendered a network
device inaccessible, likely due to finding all the corner cases in tests instead
of in production.

To talk to the devices, I had to reverse-engineer the management API. They want
to sell you a Windows app to do password rotation for many tens of thosands of
dollars per year per device, apparently. But it turned out to be standard
netconf inside SOAP, so I just wrote a Go client that could log in and change
passwords pretending to be the baked-in HTTP management interface. Worked
perfectly and my salary was cheaper than buying their thing ;)

To allow users to log into the devices with the rotated password, I had to write
my own ssh client. I used the golang.org/x/crypto/ssh library to write a client
that retrieved the rotated password and then opened up a normal ssh shell to the
target device. This was necessary because the devices did not support ssh keys,
and the ssh command-line utility really goes out of its way to prevent you from
feeding it a password programatically. The client ended up being very simple;
the only complexity is that the crypto/ssh library doesn't really care about
when it blocks, so I had to wrap many operations in goroutines that could be
properly cancelled via a cancelled context. This was less important for
interactive sessions, but was important for future programs I intended to write
to manage the devices over SSH.

The next project I did was to automate customer provisioning on the OLTs. We
previously had some Expect scripts to do this, but they were very flaky, as they
could only be run once. If some intital preconditions were not met or a customer
requested a change, they could not be used. My design was to calculate the
desired state of a particular customer device from our in-house CRM, compare it
to the acutal state of the device on the network, and then apply a minimal set
of diffs to bring the actual state into alignment with the desired state. This
was again a continuously-running Go program; driven by a rate limit, it would
probe every device attached to the OLT and store information about it in a
database, updating the raw "observed state" tables directly, and adding a diff
to a "state log" table. The state log table was very helpful for debugging,
because even changes not generated by our system would be logged and exposed in
our CRM. (Sometimes people would manually log in to debug a problem, change
something, and forget about it. This let us detect that case, and with automatic
provisioning enabled, correct it without human intervention.) We also collected
numeric information about the optical signal level and all interface packet
counters, so we could be alerted when some fiber maintenance wasn't done
correctly and also see bandwidth usage for each customer.

This program worked by using my SSH library to screen-scrape the OLT's
command-line interface. This ended up working better than netconf, since the
networking team was very familiar with manually managing the devices and could
tell me "just run this command" and then I could make the program just run that
command without having to reverse-engineer which netconf knob to turn to achieve
the same effect.

It largely worked well and was a large improvement in visibility and
maintainability of our network. It eventually caused the OLTs to crash randomly
(after many months of continuous probing), though, due to a bug in their OS
software. I was able to compile this go program to a Windows binary that would
just do the scanning operations in a non-rate limited loop and send the binary
to our vendor, who were then able to reproduce the issue and send us a fixed
version of the OS! There have been no problems since.

The next project I did was called "quick signup". It's a web page that you can
visit to sign up for our Internet service. It lets the user type their address,
and if we service that address, it gives them a guaranteed install date based on
our live installation calendar and redirects them to our normal order page where
they can type in their billing information. This was our first go-backed web
app, and we used Typescript/gRPC-Web for the frontend. As most of my teammates
were more web developers than system programmers, this got them interested in
go, and so plans for converting more of our legacy PHP architecture to Go were
started.

To have some reason for people to visit quick signup, I wrote a small webpage
that you logged into with your Google account, and from there you got a link you
could send your friends that went to the quick signup app. When they signed up,
we associated your referral code with the order, and then automatically sent you
a gift card. This was another go and Typescript/Vue/gRPC-Web app.

At about this time, our production infrastructure stopped working. We were using
something called Convox; my team started using it in late 2016, and never
upgraded it. Eventually it started depending on some part of the AWS API that
went away, so we lost the ability to deploy new software. And it had no upgrade
path to the supported or paid version; so there was no option but to rebuild
production from scratch.

I had been looking into Kubernetes anyway, so decided to bite the bullet and
move everything over and see how it went. It was largely successful and took
about a week. We had about 8 separate services, but they were already using
docker containers for Convox, so it was straightforward to write deployment
manifests and run them in k8s. We also used nginx as our reverse proxy, so I
installed the nginx ingress controller and carefully ported over all our crazy
rewrite rules. There was a lot of smoothing over to make this viable, but at
least we could release code again and users could get to it in their web
browser.

Over the next few months, I solidified this new production environment in
between other project work. I set up Jenkins to build all of our docker
containers, run the tests, and push the built containers to ECR with a tag based
on the branch name with every commit. I instrumented our applications with
Jaeger for distributed tracing, Prometheus for metrics, set up ELK to store all
of our application logs in one searchable place. This made it so easy to debug
everything; when I came in in the morning I would search for all errors from the
last day and dive into any traces that looked suspicious. I found a ton of
bugs/timeouts in our legacy PHP codebase this way (it didn't have tests, and it
changed a lot, so it was the only option.) Prior to this, we had no real way to
know if our software worked. If it broke badly enough, someone would tell us, we
hoped.

I also moved our amazon load balancer -> ingress-nginx HTTP ingress stack to
Envoy. We manually wrote the Envoy config for the frontend, managed certificates
with letsencrypt and cert-manager, and terminated TLS ourself. This let us use
HTTP/2 throughout our infrastructure, and not have an outage when Amazon forgot
to auto-renew our certificates (that happened). (Since then, I have written a
small control plane called `ekglue` to automate some parts of using Envoy for a
frontned proxy in Kubernetes.)

I also cleaned up some of our processes during this time. I introduced
company-wide blameless postmortems for all customer-affecting outages. I started
writing them for software issues, and I helped people on the Fiber Operations
team write them for network issues. We discussed every week's issues once a week
at the couches in our office, and invited everyone to join in. This process
improvement reduced our mean time to resolution of network issues from about 2
days to 8 hours, in only a few months. We were making the same mistakes over and
over, and people were afraid to change the process because we didn't have that
"blameless" culture firmly solidified. (Letting everyone join in was great,
because it helped us perfect other areas of the business. Sales would listen in,
and then have a better answer for "what happens if your fiber gets cut?")

We decided as a team to start requiring code reviews on every pull request, and
I set up tools to support this like codecov.io to keep an eye on code coverage
(I found that people on my team didn't know how to run `go tool cover`) and
Jenkins/Github integration, so only code that passed tests could be checked in.
I think we really got our act together; codecov kept everyone honest about test
coverage, and gave reviewers the power to push back on untested changes.

I then began to suspect that people on my team weren't running code before
checking it in. This is becuase we kind of jumped into the world of having many
small services with self-contained APIs and data models, and sometimes, you'd
need a few of them to run at once to really cover the entire surface of the
application. So I wrote a tool called pilot-compose that reads a list of
dependencies from a YAML file (much like docker-compose), allocates a random
port for each service, and then put Envoy in front of all that. `go run X` a
couple times is significantly faster than docker-compose, which requires a
container rebuild. pilot-compose was as fast as `go run` but allowed us to
separate static serving (webpack-dev-server could run next to the API
endpoints), do grpc-web transcoding, route different in-browser URLs to
different applications, etc. This was all configured by Envoy's XDS API; after
reading the manifests and calculating the dependency graph, we generated a an
Envoy config for the entire stack, dumped the raw protobuf, and pointed a local
copy of Envoy at that. It also generated TLS certificates (and used
tls_inspector to decide whether or not to serve HTTPS or HTTP) so that you could
use https-only web features, even when visiting your desktop's web server from
your phone. Overall, you could run any application in our repository by typing
`pc` in its containing directory and it would just work.

The last major project I worked on was writing a single sign-on system for
Pilot. We used Okta for our main application, but it didn't have a good way to
scale to multiple applications. So we would add something like Prometheus or
Jaeger, but not have any way to limit requests to employees. So I wrote an Envoy
external authorizer that inspected every request for cookies and looked for a
matching session cookie in the database. If the session was valid, we told Envoy
to allow the request, and injected a signed JWT with information about the user
(username, remote IP, and x-request-id). This then propagated through our stack,
along with the Jaeger trace that Envoy started. I adjusted our zap logging to
look for this JWT and print the information in the logs; so if a certain user
said something wasn't working, we could search for their email address in
Elasticsearch and find logs and traces for that request. If the session was not
valid or did not exist, we redirected the user to a small web app that
authenticated the user with Google with OAuth and then set the pilot session
cookie on all of our domains.

We exported metrics from the SSO system on success per app and per user, and
actually found a lot of interesting bugs this way. For example, I noticed that
our customer service team was not using a Zendesk plugin we had written for
them. The reason was because it required them to authenticate, but the iframe
that Zendesk enclosed the page in was too small to show the button "click to
authenticate with Google". I made the text smaller so that it would show up even
on a Macbook Air, and then people were using it again.

### Google -- 1/2012 ~ 10/2017 -- Senior Software Engineer in Tools & Infrastructure

I've worked on a number of projects at Google. Most recently, I was the team
lead for the CPE ("customer premises equipment"; wifi routers and TV boxes)
monitoring team in Google Fiber. I designed and implemented software for
collecting plain-text log information from our Linux-based devices, and using
that information to provide real-time alerts about the health of the devices and
our infrastructure. We processed about 300MiB of data per second, to generate
network and device health alerts within 60 seconds (99.9%-ile) of an incident
starting. With this system, we were able to detect and fix everything from
network cuts, overloaded peering routers, WiFi chip firmware issues, TV encoding
issues, and many other things. We also fed per-device data into customer service
tools, so, for example, if a customer service representative was on the phone
with a customer helping them debug an issue, they would be able to see it fixed
within 30 seconds of the customer actually performing the requested action.
Finally, we were also able to use this system to preemptively identify failing
equipment and replace it before a customer called us with a problem.

I grew the project from being my side project to one with two full-time
engineers and several part-time engineers (sharing time with the team that wrote
the code that runs on the devices, and the customer service tools team). I
implemented various tools to help the team automatically release the latest
version of our code, monitoring for the monitoring system, and started an
on-call rotation so that someone on my team would be around to help the
consumers of our alerts debug problems late at night. This system eventually
replaced the other ad-hoc monitoring systems we had in place, and was the
primary way of detecting and debugging customer and network problems.

While on the CPE team, I also worked on improving bluez, Linux's Bluetooth
daemon, to crash less when interacting with our bluetooth-low-energy remote
controls. I also "brought up" Linux on our version 2.0 TV hardware, and did some
work in synthetically generating WiFi interference to validate new versions of
our WiFi chip's firmware.

Prior to Google Fiber, I worked on the team that launched the "attach money"
feature in Gmail. While on that team, I designed and implemented a full set of
integration tests for the person-to-person payments system, making our team's
software testable without relying on any external services. I also wrote a
service for using integration tests like these for load testing; automatically
running the tests a few times after each checkin, comparing the performance to
the released binary, and notifying the development team if they checked in code
that caused a performance regression. In the end, we launched our service in the
usual "tell everyone to use it at Google I/O" and it did not suffer any
performance problems.

While at Google, I participated in some activities outside my primary team. I
wrote a Testing-on-the-Toilet episode
(https://testing.googleblog.com/2013/06/testing-on-toilet-fake-your-way-to.html)
and became an editor for TotT. I maintained our internal Emacs Lisp repository,
and wrote some popular extensions for integrating with code auto-formatters
(like gofmt, as well as internal tools that do the same thing), as well as modes
for syntax-highlighting protocol buffer text representations (as I generally
used protobufs as config files for my software at Google). I was also a
maintainer of our third-party code, auditing new packages for license compliance
and suitability to the "Google3" codebase. I did about one engineering interview
a week, and sat on the promotion committee for software engineers and hardware
engineers twice per year. Finally, I was a readability reviewer for Python,
mentoring engineers new to Google's Python codebase by reviewing about 600
substantial lines of their own code and helping them make that perfect; so as to
have the ability to review other's changes.

### Bank of America / Merrill Lynch -- 9/2009 ~ 12/2011 -- Software Engineer

At the Bank I worked on a team that provided market data to downstream systems.
Most of this work was figuring out how a data vendor wanted us to retrieve the
data, doing some processing, and then putting it in our database. Most of my job
was doing design and code reviews for newer engineers. This was the kind of
place where source control was a ZIP file that people emailed around, the "build
system" was the "run" button in Eclipse, and "the server" was a Windows Terminal
Server that you would remote desktop into. I fixed some of this, introducing
source control, continuous integration, and an actual release process.

There were a couple of mildly-interesting projects. One vendor had literally
lost the client source code and documentation for their data export service, and
could only provide us with a Windows DLL to read their proprietary file format.
I wrote a Haskell wrapper for this DLL (since I was into Haskell at the time and
it had a nice REPL that was good for experimenting with completely unknown code;
Visual C++ wouldn't even let us link anything against the DLL). I eventually
made this able to run on Linux with Wine, and we could use their data files in
our usual systems. It got the job done.

We had a real-time trading system in our department that was built entirely in
Excel. One machine would run a spreadsheet as a "server" and the traders on the
network would update that spreadsheet and their peers' spreadsheets via
something called "TIBCO Rendezvous" sending multicast packets across the
network. As you might guess, this was not super reliable. I wrote a monitoring
system and web interface so people could see where latency was being introduced,
and then see if their fixes made any impact. We eventually got the "real time"
latency down from 5 minutes on average to milliseconds, thanks to the
information provided by my tool.

One major technology initiative that took place while I was there was unifying
all the software engineering teams on a single platform; written from scratch to
include a GUI system, database, and programming language for everyone to use. I
did not like the hacked-together text editor that was required, so I wrote an
Emacs library to load and save data to this system. My friends there tell me
it's still being used today.

### Infinity Interactive -- 8/2007 ~ 9/2009 -- Web Application Developer

This was a small consulting company. I mostly wrote open-source Perl libraries
that we needed for our various projects. The most memorable project I remember
was rewriting Pfizer's website from being a bunch of JSP pages with static text
to being a normal CMS. The interesting part was writing an Emacs library to go
through every page, extract the text, replace that with a library call to load
the text, and save that text to a database.

### Doubleclick Performics -- 3/2007 ~ 8/2007 -- Perl Programmer

I don't really remember what I did here. I remember a lot of meetings, very
little programming, it being announced that the company was being bought by
Google, and then everyone being too excited to do any work. I left as soon as
possible.

### University of Chicago -- 6/2006 ~ 3/2007 -- Web Application Developer

I was part of a team that designed custom websites for departments inside the
University. My main project was rewriting the college application (the "Uncommon
Application") from ColdFusion to object-oriented PHP.
