/* Каталог на главной: фильтрация по категориям и живой поиск. */
(function () {
  const buttons = document.querySelectorAll("#categories .cat");
  const cards = document.querySelectorAll("#cards .card");
  const empty = document.getElementById("empty");
  const search = document.getElementById("search");

  let activeCat = "all";
  let query = "";

  function apply() {
    let visible = 0;
    cards.forEach((card) => {
      const catOk = activeCat === "all" || card.dataset.cat === activeCat;
      const textOk =
        !query || card.textContent.toLowerCase().includes(query);
      const show = catOk && textOk;
      card.style.display = show ? "" : "none";
      if (show) visible++;
    });
    empty.hidden = visible > 0;
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      activeCat = btn.dataset.cat;
      apply();
    });
  });

  if (search) {
    search.addEventListener("input", () => {
      query = search.value.trim().toLowerCase();
      apply();
    });
  }

  apply();
})();
