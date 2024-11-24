---
title: "We need to have a chat about interfaces in Go"
date: 2021-11-23
author: "June Rockway"
tags: ["go"]
showFullContent: false
---

I saw an article on HN today called
[Back to basics: Writing an application using Go and PostgreSQL](https://henvic.dev/posts/go-postgres/).
It is generally great, but makes a common mistake -- creating an unnecessary
mega-interface that serves no purpose but to make the code harder to read and
maintain. I see people doing this all the time, and it's wrong, so I wrote a
very long rant on HN about it. HN said "that comment is too long", so here's the
comment!

HN, we need to have a chat about interfaces in Go. Interfaces should be defined
in terms of the minimum-consumable subset of functionality needed to implement a
consumer. Interfaces like that are easy to implement, which means you can
implement them whenever you need them. Think about io.Reader; you've probably
consumed these and used utility functions that consume them. The abstraction is
clearly worth the implementation cost; you need to read a stream, this is how
you read any stream.

Interfaces should NOT be a list of useful methods that some subsystem you wrote
exports. (I bring this up because the article suggests such an architecture.)
Such an interface is very difficult to implement, which leads to there only
being one implementation or to dramatically increasing the maintenance burden of
the codebase. If there's only one implementation, the codebase would be easier
to understand with concrete types. If there are multiple implementations, you
should ask yourself why.

Testing is not a good enough reason to make the code hard to understand.
Supporting multiple backends for a service may be a good enough reason, but
tread very carefully; the maintenance cost is deceivingly high. In a world where
Postgres is readily available in hundreds of excellent flavors, I wouldn't
double my maintenance and testing cost just to get a few users that already have
MySQL working for them.

For your tests, maybe you don't want to connect to Postgres, migrate your
schema, add a bunch of test data, and then validate the results of functions.
This is actually not a bad idea and should be the first thing you consider. (The
features you'll grow are: documentation telling people how to setup pg_hba.conf,
generating a unique database for every test case so tests can run in parallel,
and something to speed up your migrations after you have 100 of them and you're
sick of waiting for hundreds of database roundtrips before your test can start
running. These are all straightforward so don't fear them too much!)

Eventually, the burden of writing these tests will be a little too high. The
core of your app is pretty solidified, and you generally trust the storage and
retrieval mechanics, and now you just want to add some functionality in the
easiest possible way. Doing all that setup and teardown is tedious, and if you
don't actually care about the database mechanics at this level of the app, doing
tedious things is a waste of time. That's when you might want to fake out the
storage and retrieval mechanics so that your tests can strictly focus on small
units. There are at least three ways to do this, so let's take a look. We'll use
the author's mega-interface, an interface targeted to exactly what we want to
consume, and some extra data in the structs.

For our hypothetical new high-level feature, we'll write a batch job that
deletes fraudulent reviews. A fraudulent review is any review that contains the
text "this review is fake". The first pass might look something like this:

    func DeleteFraudulentReviews(ctx context.Context, db myapp.DB) error {
        reviews := db.GetProductReviews(ctx)
        for _, id := range reviews.IDs {
            review, err := db.GetProductReview(ctx, id)
            if err != nil {
                return fmt.Errorf("get product review %v: %w", id, err)
            }
            if strings.Contains(review.Text, "this review is fake") {
                if err := db.DeleteProductReview(ctx, id); err != nil {
                    return fmt.Errorf("delete fraudulent review %v: %w", id, err)
                }
            }
        }
    }

(If this were a real system, maybe you'd want something else to drive the review
listing; accept a cursor pointing at reviews to consider as an argument or
something. And you might want to accumulate each error and return them all at
the end, so you don't have to one-at-a-time whack-a-mole to discover data
parsing problems.)

Now we need some tests!

    type fakeDB struct {
        reviews map[string]*Review
    }

    func TestDeleteFraudulentReviews(t *testing.T) {
        ctx := context.Background()
        db := &fakeDB{reviews: map[string]*Review{"1": &Review{Text: "This is legit!"}, "2": &Review{Text: "this review is fake"}}
        if err := DeleteFraudulentReviews(ctx, db); err != nil {
            t.Fatalf("delete fraudulent reviews: %v", err)
        }

        got, want := db.reviews, map[string]*Review{"1": &Review{Text: "This is legit!"}}
        if diff := cmp.Diff(got, want); diff != "" {
            t.Errorf("reviews (+got -want)\n%s", diff)
        }
    }

Welp, that was easy. Except it doesn't compile. We have to actually implement
the DB interface on top of fakeDB. Let's do that:

    func (db *fakeDB) GetProductReviews(ctx context.Context) (*ProductReviewsResponse, error) { ... }
    func (db *fakeDB) GetProductReview(ctx context.Context, id string) (*Review, error) { ... }
    func (db *fakeDB) DeleteProductReview(ctx context.Context, id string) error { ... }

These functions are pretty trivial so I'm not going to type them in here; return
the map keys wrapped in (undefined in the parent article!)
ProductReviewResponse; return the value for the map key (or an error if not
found); delete the named key from the map.

But we still have a problem. This code doesn't compile. You have to implement
every method inside interface DB, just to run this very simple test. You wrote
that test in seconds. You wrote the business logic in seconds. But now the real
work begins -- pasting every single function signature into this test file, and
making it panic("not implemented") or something. There's a fork in the road on
how to deal with this. If you keep the test targeted, now every time someone
adds a new database method -- the literal core of your app -- they'll have to
update this test file. Or you can just factor it out into a well-maintained
in-memory implementation of your storage layer. Every time someone adds a new
getter method, they'll have to update this second implementation. Your simple
app is now spiralling out of control into a maintenance disaster; a small tax on
every innovation you'll have for the rest of the app's lifetime.

There must be a better way. What if we defined the interface at the consumer?

    type ReviewLister interface { func GetProductReviews(context.Context) (*ProductReviewsResponse, error) }
    type ReviewGetter interface { func GetProductReview(context.Context, string) (*Review, error) }
    type ReviewDeleter interface { func DeleteProductReview(context.Context, string) error }
    type ReviewListGetDeleter interface { ReviewLister; ReviewGetter; ReviewDeleter }

    var _ ReviewListGetDeleter = &DBImpl{} // Assert that the Real Thing meets this interface.

    func DeleteFraudulentReviews(ctx context.Context, db ReviewListGetDeleter) error {
        // Exact same implementation as before.
    }

Now all of those tests you wrote will pass! Your fraud system defines what
methods it's going to use and you can implement them however you want, as the
situation dictates. In this case, it's pretty ugly, and mere tests do not
justify this much complexity. If there are 10 different reviews systems you run
against in addition to the tests, consider it. (Don't half-ass this and make a
mega-interface, though. Your "read reviews" page won't want to have to implement
ReviewDeleter just to see that reviews show up on the reviews page!)

Finally, how do we implement this cleanly 99.9% of the time? Don't use
interfaces at all, and just add test hooks to your real-life structs:

    type DBImpl struct { // Can just be called DB now that the interface goes away.
        Pool *pgxpool.Pool
        testReviews map[string]*Review
    }

    func (db *DBImpl) GetProductReviews(ctx context.Context) (*ProductReviewsResponse, error) {
        if db.testReviews != nil {
            return db.testReviews // after some massaging
        }
        rows, err := db.Pool.Query(ctx, `select * from product reviews where deleted_at is null`, ...)
        ...
    }

This is simplest, and does exactly what you want. There's no indirection; when
you are reading the DeleteFraudulentReviews function, you can click through to
see the implementation of GetProductReviews and friends. The tests have to do no
work, they `&DBImpl{testReviews: map[string]*Review{}}` and do their thing. You
can look at your code coverage report and freak out if you see the "real" paths
uncovered.

Basically, this implementation actually defines what your program REALLY does;
there is a DB object and it mostly connects to a database and runs queries, but
it also supports having the data supplied in-memory. That's an honest assessment
of what you made, and good Go code shouldn't try to hide the realities here.
Java programmers will scoff at if statements based on state inside an object,
but this isn't Java. Micro-optimizers will be unhappy about the empty null
pointer that sits in memory unused in all production use cases (but you probably
only have one of these DB objects, and interface indirection isn't free at
runtime either). And, the paranoid will wonder what happens if someone sets
testReviews in production. They _could_! But it probably won't happen; it's
package private, so where would the rest of the app even get a value with this
set?

Don't worry to much, and always do the simplest thing. Simple is easy to
understand. Simple is maintainable. Don't make extra work for yourself from day
one. If you need a complicated system, entropy will ensure that your system
becomes complicated. But you can fight the entropy, and should.

[CodeReviewComments](https://github.com/golang/go/wiki/CodeReviewComments#interfaces)
gives some more examples. I'll explicitly underscore this point: "Do not define
interfaces before they are used: without a realistic example of usage, it is too
difficult to see whether an interface is even necessary, let alone what methods
it ought to contain." Abstraction is cognitively expensive. M-. won't jump to
the implementation of a function anymore, it will just direct you to the
interface. This will make it difficult to maintain situational awareness while
working on the code; what are the edge caes, what errors does this function
return, etc. The loss of situational awareness is where accidents happen, and
time spent fixing accidents interferes with the enjoyable work of adding new
functionality. Be very careful. Have a very good reason for making an interface;
every single time.
