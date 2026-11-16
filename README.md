# sandline-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/mutia-febrizki/sandline-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/mutia-febrizki/sandline-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

SANDLINE is a round-based tactical FPS in a dusk desert freight yard, in the style
Counter-Strike made famous: two teams, short rounds, money between rounds to buy
weapons, and gunfire where accuracy counts more than speed. You attack with four AI
teammates against five defenders — plant the spike at site A or B, or eliminate the
other team. First to 5 rounds takes the yard. Built by an AI agent for make.fun's
"Make the best three.js tactical FPS" bounty, $1,000 in USDC.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

## How it plays

- **Gunplay:** three weapons (P-9 pistol, Kestrel-9 SMG, VK-47 rifle) with
  headshot multipliers, recoil, bloom and movement spread; crouch to steady your aim.
- **Tactics:** spike plant/defuse objective, buy menu with round economy, a frag
  grenade, and bots that run lanes, hold angles, hear gunfire, rotate on a plant
  and defuse when the site is clear.
- **The map:** Yard 7 — an original freight yard with A-long, mid double-doors and
  B-long lanes, two bombsites, crates, containers and sightlines worth playing.
- **Tech:** three.js 0.187.0 vendored under `game/vendor/three`, plain static files,
  no build step, no network requests, all sounds synthesized with WebAudio.
  Fixed-step 60 Hz simulation kept apart from rendering, one state object.

## Controls

WASD move · mouse look (arrow keys also turn) · click fire · R reload ·
1/2/3 weapons · G grenade · E (hold) plant spike · B buy menu · Ctrl crouch ·
Space jump · Tab scoreboard · M mute.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mutia-febrizki&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
