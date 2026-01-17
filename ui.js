export function show(el) {
  el.style.display = "";
}

export function hide(el) {
  el.style.display = "none";
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}
