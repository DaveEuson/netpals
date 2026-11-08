// signon.js — the Sign On window on every launch after setup. Pick any of your screen names on this computer, or
// New screen name… for the setup wizard. A saved password leaves the box empty but still works.
let s;
function fill() {
  s = api.settingsSync();
  $("save").checked = s.savePassword; $("auto").checked = s.autoLogin;
  $("pw").value = "";
  $("pw").placeholder = s.savePassword ? "••••••••" : "";
  say("");
}
async function names() {
  const r = await api.invoke("account:list");
  const list = r.names.some((n) => n.dir === r.current) ? r.names : [{ dir: r.current, screenName: s.screenName }, ...r.names];
  $("sn").replaceChildren(...list.map((n) => new Option(n.screenName, n.dir)), new Option("New screen name…", "+new"));
  $("sn").value = r.current;
}
$("sn").onchange = async () => {
  if ($("sn").value === "+new") return api.invoke("account:new");
  const r = await api.invoke("account:switch", $("sn").value);
  if (!r.ok) return say(r.error, "err");
  fill();
  $("pw").focus();
};

$("auto").onchange = () => { if ($("auto").checked) $("save").checked = true; }; // auto-login needs a saved password
$("save").onchange = () => { if (!$("save").checked) $("auto").checked = false; };
$("forgot").onclick = () => { $("forgot-hint").hidden = false; };
$("forgot-hint").textContent = (/Mac/.test(navigator.userAgent)
  ? "Quit Netpals, then in Terminal run: open -a Netpals --args --reset-password. It resets the screen name that signed on last;"
  : "Open Reset Netpals password from the Start menu. It resets the screen name picked here;") + " you pick a new password, and your buddies and chats stay.";
$("pw").onkeydown = (e) => { if (e.key === "Enter") $("signon").click(); };

$("signon").onclick = async () => {
  $("signon").disabled = true;
  say("Verifying password…");
  const r = await api.invoke("account:signon", { password: $("pw").value, savePassword: $("save").checked, autoLogin: $("auto").checked });
  if (r.ok) return api.invoke("win:close");
  $("signon").disabled = false;
  $("pw").select();
  say(r.error, "err");
};
fill();
names();
$("pw").focus();
