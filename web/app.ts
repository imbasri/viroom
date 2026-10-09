// ViRoom — live office. 2D pixel-art is the default; 3D is a lazy chunk.
// Shared spatial logic comes from the SAME lib the server uses.
import {
  createLayout,
  stateToPosition,
  routeBetween,
  walkPath3,
  type Layout,
  type Person,
  type Vec3,
} from "../lib/office3d-layout";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const W = canvas.width;
const H = canvas.height;

const dot = document.getElementById("ws-dot") as HTMLElement;
const wsState = document.getElementById("ws-state") as HTMLElement;
const btn2d = document.getElementById("btn-2d") as HTMLButtonElement;
const btn3d = document.getElementById("btn-3d") as HTMLButtonElement;
const nInput = document.getElementById("n-input") as HTMLInputElement;
const btnApply = document.getElementById("btn-apply") as HTMLButtonElement;
const note = document.getElementById("fallback-note") as HTMLElement;

// ---- camera: world units -> pixel coordinates ----
let mode: "2d" | "d3" = "2d";
let layout: Layout = createLayout(Number(nInput.value));
// people keyed by id; each carries a live interpolated position so movement
// glides between discrete zone changes instead of teleporting.
const people = new Map<string, Person & { pos: Vec3; target: Vec3 }>();
let three: any; // lazy chunk

async function tick3d() {
  // Lazy chunk: load three.js only when 3D is requested.
  if (three) return three;
  try {
    three = await import("three");
  } catch {
    mode = "2d";
    btn3d.setAttribute("aria-pressed", "false");
    btn2d.setAttribute("aria-pressed", "true");
    note.style.display = "block";
    note.textContent =
      "3D chunk unavailable (three.js failed to load). Staying on 2D pixel-art view.";
    return null;
  }
  return three;
}

// ---- 2D pixel-art renderer ----
function worldToScreen(v: Vec3) {
  // isometric-ish 2:1 projection, room fills the canvas
  const sx = W * 0.5 + v.x * 18 + v.z * -10;
  const sy = H * 0.22 + v.y * 10 + v.z * 7;
  return { x: sx, y: sy };
}

const AVATAR = {
  desk: "#7aa2ff",
  meeting: "#ffd166",
  lounge: "#39c46d",
  away: "#9a9aa6",
};

function render2d() {
  ctx.clearRect(0, 0, W, H);

  // floor
  ctx.fillStyle = "#0e0f12";
  ctx.fillRect(0, 0, W, H);

  // room outline
  const room = [
    { x: layout.room.minX, z: layout.room.minZ },
    { x: layout.room.maxX, z: layout.room.minZ },
    { x: layout.room.maxX, z: layout.room.maxZ },
    { x: layout.room.minX, z: layout.room.maxZ },
  ];
  ctx.strokeStyle = "#26272f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const p of room) {
    const s = worldToScreen({ x: p.x, y: 0, z: p.z });
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.stroke();

  // desks as pixel blocks
  for (const d of layout.desks) {
    const s = worldToScreen(d.pos);
    ctx.fillStyle = "#26272f";
    ctx.fillRect(s.x - 6, s.y - 6, 12, 12);
  }

  // meeting zone
  const mpos = worldToScreen(layout.meeting[0].pos);
  ctx.fillStyle = "#393552";
  ctx.fillRect(mpos.x - 10, mpos.y - 18, 20, 40);

  // lounge zone
  const lpos = worldToScreen(layout.lounge[0].pos);
  ctx.fillStyle = "#1f3b35";
  ctx.fillRect(lpos.x - 10, lpos.y - 18, 20, 40);

  // avatars
  for (const [, p] of people) {
    const s = worldToScreen(p.pos);
    ctx.fillStyle = AVATAR[p.state as keyof typeof AVATAR];
    ctx.beginPath();
    ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0e0f12";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // walking route for the first person (demo only)
  const first = people.values().next().value;
  if (first) {
    const path = walkPath3(routeBetween(layout, first.pos, first.target));
    ctx.strokeStyle = "#5e50a0";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (const wp of path) {
      const s = worldToScreen(wp);
      ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ---- 3D renderer (lazy) ----
let scene3: any,
  cam: any,
  ren: any;

function init3d(container: HTMLElement) {
  const THREE = three;
  if (!THREE) return;
  const canvas3 = document.createElement("canvas");
  canvas3.width = W;
  canvas3.height = H;
  canvas3.style.width = "100%";
  canvas3.style.height = "100%";
  container.querySelector(".stage")!.replaceChildren(canvas3);

  scene3 = new THREE.Scene();
  scene3.background = new THREE.Color(0x0e0f12);
  cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
  cam.position.set(0, 12, 18);
  cam.lookAt(0, 0, 0);
  ren = new THREE.WebGLRenderer({ canvas: canvas3, antialias: true });
  ren.setSize(W, H);

  scene3.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(5, 10, 7);
  scene3.add(dl);

  // floor
  const floorGeo = new THREE.PlaneGeometry(layout.room.maxX * 2, layout.room.maxZ * 2);
  scene3.add(new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x0e0f12 })));

  // desks
  for (const d of layout.desks) {
    const g = new THREE.BoxGeometry(1.4, 0.6, 0.8);
    const m = new THREE.MeshStandardMaterial({ color: 0x1f2028 });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(d.pos.x, d.pos.y + 0.3, d.pos.z);
    scene3.add(mesh);
  }

  render3d();
}

function render3d() {
  if (!ren || !three) return;
  const THREE = three;
  for (const [, p] of people) {
    let m = scene3.getObjectByName(p.id);
    const col = {
      desk: 0x7aa2ff,
      meeting: 0xffd166,
      lounge: 0x39c46d,
      away: 0x9a9aa6,
    };
    if (!m) {
      const g = new THREE.SphereGeometry(0.5, 12, 12);
      const mat = new THREE.MeshStandardMaterial({ color: col[p.state as keyof typeof col] });
      m = new THREE.Mesh(g, mat);
      m.name = p.id;
      scene3.add(m);
    } else {
      (m as any).material.color.set(col[p.state as keyof typeof col]);
    }
    m.position.lerpVectors(
      m.position,
      new THREE.Vector3(p.pos.x, p.pos.y + 0.5, p.pos.z),
      0.18,
    );
  }
  ren.render(scene3, cam);
  requestAnimationFrame(render3d);
}

// ---- wiring ----
function applyN() {
  const n = Number(nInput.value);
  fetch(`/api/office?n=${encodeURIComponent(n)}`)
    .then((r) => r.json())
    .then((data: any) => {
      layout = data.layout;
      people.clear();
      for (const p of data.people) {
        people.set(p.id, { ...p, pos: { ...p.pos }, target: { ...p.pos } });
      }
      if (mode === "d3" && three) init3d(document.body);
      render2d();
    });
}

let ws: WebSocket | null = null;
function connectWS() {
  ws?.close();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/office-ws`);
  ws.onopen = () => {
    dot.classList.add("live");
    wsState.textContent = "live";
  };
  ws.onclose = () => {
    dot.classList.remove("live");
    wsState.textContent = "reconnecting…";
    setTimeout(connectWS, 1500);
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.type === "snapshot" || m.type === "update") {
      if (m.type === "snapshot") {
        layout = m.layout;
        people.clear();
      }
      const incoming = m.people ?? [{ id: m.id, state: m.state, pos: m.pos, seat: m.seat }];
      for (const p of incoming) {
        const existing = people.get(p.id);
        if (existing) {
          existing.state = p.state;
          existing.seat = p.seat ?? existing.seat;
          existing.target = { ...p.pos };
        } else {
          people.set(p.id, { ...p, pos: { ...p.pos }, target: { ...p.pos } });
        }
      }
      if (mode === "2d") render2d();
    }
  };
}

// smooth position interpolation each frame (2D too)
function animate() {
  if (mode === "2d") {
    for (const p of people.values()) {
      const dx = p.target.x - p.pos.x;
      const dz = p.target.z - p.pos.z;
      if (Math.abs(dx) > 0.02 || Math.abs(dz) > 0.02) {
        p.pos.x += dx * 0.12;
        p.pos.z += dz * 0.12;
      } else {
        p.pos.x = p.target.x;
        p.pos.z = p.target.z;
      }
    }
    render2d();
  }
  requestAnimationFrame(animate);
}

btn2d.addEventListener("click", () => {
  mode = "2d";
  btn2d.setAttribute("aria-pressed", "true");
  btn3d.setAttribute("aria-pressed", "false");
  render2d();
});
btn3d.addEventListener("click", async () => {
  note.style.display = "none";
  await tick3d();
  mode = three ? "d3" : "2d";
  btn3d.setAttribute("aria-pressed", three ? "true" : "false");
  btn2d.setAttribute("aria-pressed", three ? "false" : "true");
  if (three) init3d(document.body);
  else render2d();
});
btnApply.addEventListener("click", applyN);
nInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyN();
});

applyN();
connectWS();
animate();
