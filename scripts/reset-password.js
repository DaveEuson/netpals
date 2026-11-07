// npm run reset-password — forgot your sign-on password while running from source? This clears it; buddies, chats and
// everything else stay. Quit Netpals first; the next npm start opens setup. (An installed copy: Netpals --reset-password.)
const db = require("../lib/db");
db.setSettings({ passHash: "", savePassword: false, autoLogin: false });
console.log(`Password cleared for ${db.settings().screenName || "your screen name"}. Run npm start to pick a new one.`);
