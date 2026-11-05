// signon.js — the Sign On window on every launch after setup. A saved password leaves the box empty but still works.
const s = api.settingsSync();
$("sn").value = s.screenName;
$("save").checked = s.savePassword; $("auto").checked = s.autoLogin;
if (s.savePassword) $("pw").placeholder = "••••••••";
$("auto").onchange = () => { if ($("auto").checked) $("save").checked = true; }; // auto-login needs a saved password
$("save").onchange = () => { if (!$("save").checked) $("auto").checked = false; };
$("forgot").onclick = () => { $("forgot-hint").hidden = false; };
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
$("pw").focus();
