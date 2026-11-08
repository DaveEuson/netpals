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

That makes a free key. For a sale, add `--paid` and the store's order number, so you can match the two later:

```bash
npm run license -- "Buyer Name" buyer@example.com --paid 1042
```

## Who has a key

The app never reports back, so nothing tells you who's using Netpals. Two records do: the store's orders (who paid)
and `keys.csv`, which every key above is added to, next to your private key in `~/.netpals`. It opens in any
spreadsheet: date, free or paid, name, email, order number and the key itself.

```bash
npm run license -- list          # everyone, with a count of free and paid
npm run license -- list pat      # anyone with "pat" in their name or email, with their key, to send it again
```

Back it up with the private key. A paid order with no line in `keys.csv` is someone still waiting for their key.

## The store

Sell through a store such as Gumroad or Lemon Squeezy and send keys by hand for now. Once there's a store page, put
its address in `BUY_URL` at the top of `lib/license.js`; the free version's Setup then shows a **Get Netpals Plus**
link. Sending keys automatically would take a small webhook that runs the command above.

## The key pair

`npm run license -- init` made the key pair. It refuses to run again, so it can't replace the key your sold licenses
depend on.

Anyone who can edit the source can remove the check. That's the normal trade for a one-time license: it keeps honest
people honest.
