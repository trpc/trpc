module.exports = (() => {
  return {
    onRouteUpdate() {
      window.twttr?.widgets?.load();
    },
  };
})();
