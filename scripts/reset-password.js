// npm run reset-password — forgot your sign-on password? This clears it; buddies, chats and everything else stay.
// Quit Netpals first. The next npm start opens setup so you can pick a new one.
const db = require("../lib/db");
db.setSettings({ passHash: "", savePassword: false, autoLogin: false });
console.log(`Password cleared for ${db.settings().screenName || "your screen name"}. Run npm start to pick a new one.`);
