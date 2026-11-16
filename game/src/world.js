// Foundry Yard: an original three-lane map. Attackers spawn south, defenders
// hold north. Site A (Furnace) sits north-west, Site B (Crane) north-east,
// joined by a west lane, an east lane and a mid corridor with two connectors.
// Every box is both cover and a bullet stop; every wall is a collider.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WAYPOINTS = [
  // id: x, z, links
  { x: 0, z: 14, links: [1, 10, 11, 18, 19] },   // 0 attacker spawn
  { x: 0, z: 8, links: [0, 2, 10, 11] },         // 1 mid entry
  { x: 0, z: 0, links: [1, 3, 14, 15] },         // 2 mid
  { x: 0, z: -7, links: [2, 4, 7, 16, 17] },     // 3 mid top
  { x: -11, z: -6, links: [3, 5, 10, 16] },      // 4 A approach
  { x: -15, z: -11, links: [4, 6, 16, 20] },     // 5 site A
  { x: -18, z: -13, links: [5, 20] },            // 6 A hold
  { x: 11, z: -6, links: [3, 8, 11, 17] },       // 7 B approach
  { x: 15, z: -11, links: [7, 9, 17, 21] },      // 8 site B
  { x: 18, z: -13, links: [8, 21] },             // 9 B hold
  { x: -11, z: 4, links: [0, 1, 4, 18] },        // 10 west lane
  { x: 11, z: 4, links: [0, 1, 7, 19] },         // 11 east lane
  { x: 0, z: -15, links: [3, 6, 9, 20, 21] },    // 12 defender spawn
  { x: -6, z: -2, links: [2, 4] },               // 13 mid-west connector
  { x: 6, z: -2, links: [2, 7] },                // 14 mid-east connector
  { x: -8, z: -10, links: [3, 4, 5] },           // 15 A mid
  { x: 8, z: -10, links: [3, 7, 8] },            // 16 B mid
  { x: -6, z: 12, links: [0, 10] },              // 17 attacker west
  { x: 6, z: 12, links: [0, 11] },               // 18 attacker east
  { x: -15, z: -15, links: [5, 6, 12] },         // 19 A back
  { x: 15, z: -15, links: [8, 9, 12] },          // 20 B back
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' ? 0.5 : 0.92,
      metalness: name === 'hairline' ? 0.25 : 0.03,
      emissive: new THREE.Color(PALETTE[name]),
      emissiveIntensity: name === 'accent' || name === 'plant' ? 0.25 : 0,
    });
  }
  const colliders = [];
  const shootables = [];
  const tmpBox = new THREE.Box3();

  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    tmpBox.setFromObject(mesh);
    colliders.push(tmpBox.clone());
    shootables.push(mesh);
    return mesh;
  }
  function cylinder(rTop, rBottom, h, x, y, z, mat, segments = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    tmpBox.setFromObject(mesh);
    colliders.push(tmpBox.clone());
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter (44 x 36 m, 5 m walls).
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'ground');
  box(0.4, 5, 36.4, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 36.4, 22.2, 2.5, 0, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, -18.2, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, 18.2, 'surface');

  // Lane dividers: long walls that force the three lanes apart, with gaps.
  box(0.6, 3.2, 12, -6, 1.6, 2, 'surface');      // west/mid divider, south
  box(0.6, 3.2, 8, -6, 1.6, -8, 'surface');      // west/mid divider, north
  box(0.6, 3.2, 12, 6, 1.6, 2, 'surface');       // east/mid divider, south
  box(0.6, 3.2, 8, 6, 1.6, -8, 'surface');       // east/mid divider, north
  box(12, 3.2, 0.6, -12, 1.6, -4, 'surface');    // A pocket wall
  box(12, 3.2, 0.6, 12, 1.6, -4, 'surface');     // B pocket wall

  // Site A — the Furnace: big furnace block, chimney, crates, glowing pad.
  box(5, 3.4, 2.4, -19, 1.7, -15.5, 'hairline');
  cylinder(0.9, 1.2, 7, -19, 3.5, -15.5, 'surface');
  box(2.2, 1.1, 2.2, -13.5, 0.55, -14.5, 'hairline');
  box(1.4, 0.8, 1.4, -16.5, 0.4, -8, 'hairline');
  box(4.4, 0.12, 4.4, -15, 0.06, -11, 'accent'); // plant pad A
  // Site B — the Crane: gantry posts, overhead beam, containers, glowing pad.
  box(0.9, 5.4, 0.9, 13, 2.7, -14.5, 'hairline');
  box(0.9, 5.4, 0.9, 17.5, 2.7, -14.5, 'hairline');
  box(6.4, 0.9, 1.1, 15.2, 5.2, -14.5, 'hairline');
  box(4.6, 2.6, 2.2, 19, 1.3, -9, 'hairline');
  box(2.2, 1.1, 2.2, 12.5, 0.55, -8.5, 'hairline');
  box(4.4, 0.12, 4.4, 15, 0.06, -11, 'accent');  // plant pad B

  // Mid: stacked crates, a low platform and pipes to fight around.
  box(2.4, 1.1, 2.4, -2.5, 0.55, 3, 'hairline');
  box(1.4, 1.1, 1.4, 2.2, 0.55, 4.5, 'hairline');
  box(3.4, 0.5, 3.4, 0, 0.25, -3, 'surface');
  box(1.2, 2.2, 1.2, -1.5, 1.1, -6.5, 'hairline');
  cylinder(0.35, 0.35, 9, -3, 2.6, -11, 'hairline', 8);
  cylinder(0.35, 0.35, 9, 3, 2.6, -11, 'hairline', 8);
  // Lane cover: crates and barrels down each side lane.
  box(1.6, 1.1, 1.6, -11, 0.55, 8, 'hairline');
  box(1.6, 0.7, 1.6, -11, 0.35, 0, 'hairline');
  box(1.6, 1.1, 1.6, 11, 0.55, 8, 'hairline');
  box(1.6, 0.7, 1.6, 11, 0.35, 0, 'hairline');
  box(2.2, 1.1, 1.2, -8, 0.55, 12, 'hairline');
  box(2.2, 1.1, 1.2, 8, 0.55, 12, 'hairline');
  // Spawn cover, set back from the spawn points so nobody spawns stuck.
  box(1.8, 1.2, 1.8, -8, 0.6, 16.5, 'hairline');
  box(1.8, 1.2, 1.8, 8, 0.6, 16.5, 'hairline');

  // Light: low dusk sun, cool sky fill, warm pools over both sites.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#9a8a72'), new THREE.Color('#2e241a'), 1.6));
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.8);
  key.position.set(14, 20, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26; key.shadow.camera.right = 26;
  key.shadow.camera.top = 26; key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60; key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a8aa5'), 0.75);
  fill.position.set(-12, 10, 14);
  scene.add(fill);
  for (const [x, z] of [[-15, -11], [15, -11]]) {
    const pool = new THREE.PointLight(new THREE.Color(PALETTE.accent), 30, 18, 1.6);
    pool.position.set(x, 4.2, z);
    scene.add(pool);
  }

  const sites = {
    A: { name: 'Furnace', center: new THREE.Vector3(-15, 0, -11),
         box: new THREE.Box3(new THREE.Vector3(-17.2, 0, -13.2), new THREE.Vector3(-12.8, 2.5, -8.8)) },
    B: { name: 'Crane', center: new THREE.Vector3(15, 0, -11),
         box: new THREE.Box3(new THREE.Vector3(12.8, 0, -13.2), new THREE.Vector3(17.2, 2.5, -8.8)) },
  };
  const spawns = {
    ember: [{ x: -3, z: 15 }, { x: 0, z: 16 }, { x: 3, z: 15 }],
    ash: [{ x: -8, z: -15 }, { x: 0, z: -16 }, { x: 8, z: -15 }, { x: 15, z: -15 }],
  };

  // Line of sight between two points, blocked only by world geometry.
  const raycaster = new THREE.Raycaster();
  const losDir = new THREE.Vector3();
  const losFrom = new THREE.Vector3();
  function hasLineOfSight(ax, ay, az, bx, by, bz) {
    losFrom.set(ax, ay, az);
    losDir.set(bx - ax, by - ay, bz - az);
    const dist = losDir.length();
    if (dist < 0.01) return true;
    losDir.multiplyScalar(1 / dist);
    raycaster.set(losFrom, losDir);
    raycaster.far = dist;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  return { colliders, shootables, sites, spawns, waypoints: WAYPOINTS, group, hasLineOfSight };
}

// Breadth-first path over the waypoint graph. Returns an array of waypoint
// ids from `from` to `to` (excluding `from`), or [] when unreachable.
export function findPath(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Array(waypoints.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const next of waypoints[cur].links) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = to;
        while (prev[node] !== node) { node = prev[node]; path.unshift(node); }
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return [];
}

export function nearestWaypoint(waypoints, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < waypoints.length; i += 1) {
    const d = (waypoints[i].x - x) ** 2 + (waypoints[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
