// Effects: a pooled tracer + impact-spark system and the muzzle flash.
// Nothing is allocated per shot: tracers and sparks are reused from pools,
// so the hot loop stays allocation-free.
import * as THREE from 'three';

const TRACER_POOL = 24;
const SPARK_POOL = 40;

export function createEffects(scene) {
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const sparks = [];
  const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc860 });
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  // Explosion flash: one reusable point light + expanding shell.
  const boomLight = new THREE.PointLight(0xff9a3c, 0, 14, 1.6);
  scene.add(boomLight);
  const boomShell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0 }),
  );
  boomShell.visible = false;
  scene.add(boomShell);
  let boomLife = 0;
  let tracerI = 0;
  let sparkI = 0;

  const fx = {
    tracer(from, to, color) {
      const slot = tracers[tracerI];
      tracerI = (tracerI + 1) % TRACER_POOL;
      const pos = slot.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      slot.line.material.color.setHex(color);
      slot.line.visible = true;
      slot.life = 0.07;
    },
    impact(point, isHead) {
      for (let i = 0; i < 5; i += 1) {
        const slot = sparks[sparkI];
        sparkI = (sparkI + 1) % SPARK_POOL;
        slot.mesh.position.copy(point);
        slot.mesh.visible = true;
        slot.mesh.material.color.setHex(isHead ? 0xff5a3c : 0xffc860);
        slot.vx = (Math.random() * 2 - 1) * 3;
        slot.vy = Math.random() * 3;
        slot.vz = (Math.random() * 2 - 1) * 3;
        slot.life = 0.3;
      }
    },
    explosion(x, y, z) {
      boomLight.position.set(x, y + 0.5, z);
      boomLight.intensity = 60;
      boomShell.position.set(x, y, z);
      boomShell.scale.setScalar(0.2);
      boomShell.visible = true;
      boomShell.material.opacity = 0.85;
      boomLife = 0.45;
      for (let i = 0; i < 12; i += 1) {
        const slot = sparks[sparkI];
        sparkI = (sparkI + 1) % SPARK_POOL;
        slot.mesh.position.set(x, y, z);
        slot.mesh.visible = true;
        slot.mesh.material.color.setHex(0xff7a2a);
        slot.vx = (Math.random() * 2 - 1) * 7;
        slot.vy = Math.random() * 6;
        slot.vz = (Math.random() * 2 - 1) * 7;
        slot.life = 0.5;
      }
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.line.visible = false;
      }
      for (const slot of sparks) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.mesh.position.x += slot.vx * dt;
        slot.mesh.position.y += slot.vy * dt;
        slot.mesh.position.z += slot.vz * dt;
        slot.vy -= 9 * dt;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const t = Math.max(0, boomLife / 0.45);
        boomLight.intensity = 60 * t;
        boomShell.scale.setScalar(0.2 + (1 - t) * 4);
        boomShell.material.opacity = 0.85 * t;
        if (boomLife <= 0) boomShell.visible = false;
      }
    },
  };
  return fx;
}

// The player's viewmodel: a low-poly rifle that bobs with movement, kicks
// on fire and dips on reload. Built from boxes, parented to the camera.
export function createViewmodel(camera, scene) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x241d16, roughness: 0.6, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.5, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.62), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), dark);
  barrel.position.set(0, 0.03, -0.45);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.12, 0.12);
  grip.rotation.x = 0.4;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), accent);
  mag.position.set(0, -0.14, -0.08);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.12), accent);
  sight.position.set(0, 0.1, -0.1);
  for (const mesh of [body, barrel, grip, mag, sight]) group.add(mesh);
  // Muzzle flash: a small emissive plane shown for one frame on fire.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  flash.position.set(0, 0.03, -0.66);
  group.add(flash);
  group.scale.setScalar(0.62);
  group.position.set(0.3, -0.27, -0.48);
  camera.add(group);
  scene.add(camera);
  let flashLife = 0;
  let kick = 0;
  return {
    group,
    fire() { flashLife = 0.05; kick = 1; },
    step(dt, moving, reloading) {
      if (flashLife > 0) {
        flashLife -= dt;
        flash.material.opacity = flashLife > 0 ? 0.95 : 0;
        flash.rotation.z = Math.random() * Math.PI;
      }
      kick = Math.max(0, kick - dt * 7);
      const t = performance.now() / 1000;
      const bob = moving ? Math.sin(t * 9) * 0.012 : 0;
      const bobY = moving ? Math.abs(Math.cos(t * 9)) * 0.012 : 0;
      const dip = reloading > 0 ? -0.16 : 0;
      group.position.set(0.3 + bob * 0.4, -0.27 + bobY + dip, -0.48 + kick * 0.09);
      group.rotation.x = kick * 0.12 + (reloading > 0 ? 0.35 : 0);
      group.rotation.y = -0.12;
    },
  };
}
