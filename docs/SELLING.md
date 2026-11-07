# Selling Netpals Plus

A Plus key is the buyer's name, email and date, signed with your private key. The app holds only the public half,
in `lib/license.js`, and checks keys on the buyer's computer. Nothing is sent anywhere.

Your private key is at `~/.netpals/license-private.pem`, outside the project. Back it up and never commit it
(`*.pem` is in `.gitignore`). If you lose it, you can't make keys that copies already out there will accept.

## Making a key

```bash
npm run license -- "Buyer Name" buyer@example.com
```

Send the buyer the line it prints. Keys survive line breaks from email; buyers paste them in **Setup** under
**Netpals Plus**. To unlock your own copy, run the same command with your name.

## The store

Sell through a store such as Gumroad or Lemon Squeezy and send keys by hand for now. Once there's a store page, put
its address in `BUY_URL` at the top of `lib/license.js`; the free version's Setup then shows a **Get Netpals Plus**
link. Sending keys automatically would take a small webhook that runs the command above.

## The key pair

`npm run license -- init` made the key pair. It refuses to run again, so it can't replace the key your sold licenses
depend on.

Anyone who can edit the source can remove the check. That's the normal trade for a one-time license: it keeps honest
people honest.
