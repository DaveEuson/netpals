// away.js — pick or write an away message, and when to come back. Going away pauses pings; the text and the
// come-back pick are remembered for next time.
const s = window.api.settingsSync();
const text = $("text");

function render() {
  $("saved").replaceChildren(...s.savedAways.map((t) => {
    const b = el("button", "row", null, { "aria-pressed": t === text.value });
    b.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1h4.5L8 2.5V9H2z M3.5 4h3 M3.5 6h3" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
    b.append(el("span", "", t));
    b.onclick = () => { text.value = t; render(); text.focus(); };
    return b;
  }));
  $("count").textContent = `${text.value.length} / 200`;
  $("go").disabled = !text.value.trim();
}

text.value = s.awayMessage || s.savedAways[0] || "";
$("back").value = s.awayMinutes;
text.oninput = render;
$("go").onclick = async () => {
  const msg = text.value.trim();
  const minutes = Number($("back").value);
  await window.api.invoke("settings:set", { savedAways: [msg, ...s.savedAways.filter((t) => t !== msg)].slice(0, 8), awayMinutes: minutes });
  await window.api.invoke("away:set", msg, minutes);
  window.api.invoke("win:close");
};
render();
text.select();
