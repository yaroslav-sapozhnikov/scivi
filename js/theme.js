/* Переключение тёмной/светлой темы, выбор хранится в localStorage. */
(function () {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  function render() {
    const light = root.dataset.theme === "light";
    btn.textContent = light ? "☾" : "☀";
    const label = light ? "Включить тёмную тему" : "Включить светлую тему";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  btn.addEventListener("click", () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("sci-visual-theme", next);
    } catch (e) {
      /* приватный режим — просто не запоминаем */
    }
    render();
  });

  render();
})();
