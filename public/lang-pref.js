(function () {
  function persist() {
    document.querySelectorAll('[data-lang]').forEach(function (link) {
      link.addEventListener('click', function () {
        try { localStorage.setItem('portfolio-lang', this.getAttribute('data-lang')); } catch (e) {}
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', persist);
  } else {
    persist();
  }
})();