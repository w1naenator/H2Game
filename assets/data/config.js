// JS config usable over http(s) and file://
window.APP_CONFIG = {
  gameName: "H2 Game",
  card: {
    radius: "0.3rem",
    durationMs: 600,
    dwellAtRibMs: 0,
    postFlipPauseMs: 0,
    mirrorBack: true,
    faceBg: "#000000",
    backBg: "#000000",
    backImage: "assets/img/cards/r0.png"
  },
  debug: {
    // Set to true to log card rounding application in console
    cardRadius: true,
    // Log image loads and swaps for debugging
    imageLoad: false
  }
};
