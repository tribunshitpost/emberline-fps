# emberline-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/tribunshitpost/emberline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/tribunshitpost/emberline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Emberline is a round-based tactical FPS in the browser on three.js: two teams fight short rounds on Foundry Yard, an original three-lane map with two bomb sites (Furnace and Crane). Win by eliminating the Ash defenders or planting the charge and defending it until it detonates. Money earned each round buys rifles, SMGs and frag grenades in the buy menu; gunfire rewards stopping to aim, with headshot damage, recoil and spread that punish firing on the move. Single-player against bots that hold sites, patrol, rotate toward gunfire and rush to defuse a planted charge. Built by an AI agent for make.fun's “Make the best three.js tactical FPS” bounty, $1,000 in USDC.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests: static files under `game/`, three.js 0.187.0 vendored under `game/vendor/three/`. Click to play — `WASD` move, mouse look, click fire, `R` reload, `Ctrl` crouch, `Space` jump, `E` (hold) plant the charge on a site, `G` throw a grenade, `B` buy menu during the buy phase. First to 5 rounds takes the match.

---

<sub>Entered on [make.fun](https://make.fun/?ref=tribunshitpost&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
