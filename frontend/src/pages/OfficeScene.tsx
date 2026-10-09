// R7b — the lazy-loaded 3D bundle. Contains the r3f Canvas, Characters with walk/pose
// animation, LabelProjector (screen-space DOM buttons), and a Controls wrapper around
// OrbitControls with damping + reset.
//
// Imports THREE / @react-three/fiber lazily, so a chunk-download failure is caught by
// the SceneBoundary in Office3D.tsx and the 2D fallback renders instead of a blank page.
//
// Every person position comes from viroom/lib/office3d-layout.ts stateToPosition(layout, person),
// identical to what server/office-server.ts produces.

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cn } from "@/lib/utils";
import {
  stateToPosition,
  type Layout,
  type Vec3,
} from "../../../lib/office3d-layout";
import { agentColor, type OfficePerson } from "./Office3D";

type Registry<T> = MutableRefObject<Map<string, T>>;

/** A walking boxy avatar (hips pivot at the legs, shoulders at the arms). */
function Character({
  person,
  target,
  onSelect,
  anchor,
}: {
  person: OfficePerson;
  target: Vec3;
  onSelect: (id: string, trigger: HTMLElement | null) => void;
  anchor: (object: THREE.Object3D | null) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  const color = agentColor(person.id);

  // The avatar starts at its target; the path is empty until the target moves,
  // so the walk only kicks in on real presence updates.
  const [start] = useState<Vec3>(() => target);
  const path = useRef<THREE.Vector3[]>([]);

  useEffect(() => {
    const group = root.current;
    if (!group) return;
    path.current = [new THREE.Vector3(target.x, 0, target.z)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.x, target.y, target.z]);

  useFrame((state, delta) => {
    const group = root.current;
    if (!group) return;
    const time = state.clock.elapsedTime;
    const next = path.current[0];
    let walking = false;
    if (next) {
      const toNext = next.clone().sub(group.position);
      const distance = toNext.length();
      if (distance < 0.04) {
        path.current.shift();
      } else {
        walking = true;
        group.position.add(toNext.clone().normalize().multiplyScalar(Math.min(distance, delta * 2.6)));
        if (Math.hypot(toNext.x, toNext.z) > 0.01) {
          const heading = Math.atan2(toNext.x, toNext.z);
          group.rotation.y += Math.atan2(Math.sin(heading - group.rotation.y), Math.cos(heading - group.rotation.y)) * 0.25;
        }
      }
    }
    group.visible = true; // single-zone office, nothing off-screen
    const swing = walking ? Math.sin(time * 10) * 0.6 : 0;
    const seated = !walking && ["desk", "meeting", "lounge"].includes(person.state);
    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = seated ? -Math.PI / 2.2 : swing;
      rightLeg.current.rotation.x = seated ? -Math.PI / 2.2 : -swing;
    }
    if (leftArm.current && rightArm.current) {
      const typing = !walking && person.state === "desk";
      leftArm.current.rotation.x = typing ? -1.1 + Math.sin(time * 14) * 0.12 : swing;
      rightArm.current.rotation.x = typing ? -1.1 + Math.cos(time * 14) * 0.12 : -swing;
    }
    if (body.current) {
      const breathe = !walking && person.state === "desk" ? Math.sin(time * 2) * 0.015 : 0;
      body.current.position.y = seated ? -0.14 + breathe : 0 + breathe;
    }
    // expose anchor for the label projector
    anchor(group);
  });

  const tint = (c: string) => c;

  return (
    <group ref={root} position={[start.x, 0, start.z]}>
      <group
        ref={body}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(person.id, null);
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <mesh
          ref={leftLeg}
          position={[-0.11, 0.66, 0]}
          castShadow
          geometry={legGeometry}
        >
          <meshStandardMaterial color={tint(palettePants(color))} roughness={0.8} />
        </mesh>
        <mesh
          ref={rightLeg}
          position={[0.11, 0.66, 0]}
          castShadow
          geometry={legGeometry}
        >
          <meshStandardMaterial color={tint(palettePants(color))} roughness={0.8} />
        </mesh>
        <RBox position={[0, 0.98, 0]} size={[0.48, 0.58, 0.3]} radius={0.07} color={tint(paletteShirt(color))} />
        <mesh
          ref={leftArm}
          position={[-0.31, 1.2, 0]}
          castShadow
          geometry={armGeometry}
        >
          <meshStandardMaterial color={tint(paletteShirt(color))} roughness={0.85} />
        </mesh>
        <mesh
          ref={rightArm}
          position={[0.31, 1.2, 0]}
          castShadow
          geometry={armGeometry}
        >
          <meshStandardMaterial color={tint(paletteShirt(color))} roughness={0.85} />
        </mesh>
        <RBox position={[0, 1.5, 0]} size={[0.4, 0.4, 0.37]} radius={0.08} color={tint(paletteSkin(color))} />
        <RBox position={[0, 1.72, -0.02]} size={[0.43, 0.13, 0.41]} radius={0.05} color={tint(paletteHair(color))} />
        <RBox position={[-0.09, 1.52, 0.186]} size={[0.06, 0.07, 0.01]} radius={0.004} color="#17201e" shadow={false} />
        <RBox position={[0.09, 1.52, 0.186]} size={[0.06, 0.07, 0.01]} radius={0.004} color="#17201e" shadow={false} />
        <RBox position={[0, 1.4, 0.186]} size={[0.12, 0.025, 0.01]} radius={0.004} color="#9a5a44" shadow={false} />
        <object3D ref={(el) => anchor(el)} position={[0, 2.05, 0]} />
      </group>
    </group>
  );
}

/** Legs and arms pivot at the hip / shoulder: translate the geometry so its top sits at the origin. */
const legGeometry = new THREE.BoxGeometry(0.17, 0.62, 0.2).translate(0, -0.31, 0);
const armGeometry = new THREE.BoxGeometry(0.12, 0.52, 0.14).translate(0, -0.26, 0);

/** Deterministic skin/hair/shirt/pants from a base accent colour. */
function paletteSkin(base: string): string {
  const map: Record<string, string> = {
    "#f59e0b": "#fca5a5",
    "#10b981": "#fde047",
    "#3b82f6": "#fca5a5",
    "#ef4444": "#fed7aa",
    "#8b5cf6": "#fca5a5",
    "#06b6d4": "#fde047",
    "#f43f5e": "#fed7aa",
    "#84cc16": "#fed7aa",
  };
  return map[base] ?? "#fde047";
}
function paletteHair(base: string): string {
  const map: Record<string, string> = {
    "#f59e0b": "#78350f",
    "#10b981": "#3f6212",
    "#3b82f6": "#1e293b",
    "#ef4444": "#7f1d1d",
    "#8b5cf6": "#312e81",
    "#06b6d4": "#134e4a",
    "#f43f5e": "#881337",
    "#84cc16": "#365314",
  };
  return map[base] ?? "#1e293b";
}
function paletteShirt(base: string): string {
  return base;
}
function palettePants(base: string): string {
  return "#1f2937";
}

/** Simple capsule-ish box with rounded corners. */
function RBox({
  position,
  size,
  radius,
  color,
  shadow,
}: {
  position: [number, number, number];
  size: [number, number, number];
  radius: number;
  color: string;
  shadow?: boolean;
}) {
  void radius; // ponytail: real rounded-rect geometry skipped, add when visual polish demands it
  return (
    <mesh position={position} castShadow={shadow} receiveShadow={shadow}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

/** Screen-space labels: each frame, project every anchor into the canvas and move its
 * DOM label there directly (no React re-render). Labels live outside the Canvas, so
 * they unmount cleanly and use the page's own styles and focus handling. */
function LabelProjector({
  anchors,
  labels,
}: {
  anchors: Registry<THREE.Object3D>;
  labels: Registry<HTMLElement>;
}) {
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const projected: { element: HTMLElement; x: number; y: number; depth: number }[] = [];
    for (const [key, object] of anchors.current) {
      const element = labels.current.get(key);
      if (!element) continue;
      let shown = true;
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (!node.visible) {
          shown = false;
          break;
        }
      }
      object.getWorldPosition(point).project(camera);
      const visible = shown && point.z < 1 && Math.abs(point.x) <= 1.1 && Math.abs(point.y) <= 1.1;
      element.style.visibility = visible ? "visible" : "hidden";
      if (visible) {
        projected.push({ element, x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height, depth: point.z });
      }
    }
    projected.sort((a, b) => a.depth - b.depth);
    const placed: { left: number; right: number; top: number; bottom: number }[] = [];
    for (const label of projected) {
      const width = label.element.offsetWidth;
      const height = label.element.offsetHeight;
      const x = Math.min(Math.max(label.x, width / 2 + 4), size.width - width / 2 - 4);
      let bottom = label.y;
      const left = x - width / 2;
      const right = x + width / 2;
      for (let guard = 0; guard < 6; guard += 1) {
        const hit = placed.find(
          (box) => left < box.right && right > box.left && bottom - height < box.bottom && bottom > box.top,
        );
        if (!hit) break;
        bottom = hit.top - 4;
      }
      placed.push({ left, right, top: bottom - height, bottom });
      label.element.style.transform = `translate(${x}px, ${Math.max(bottom, height + 4)}px) translate(-50%, -100%)`;
      label.element.style.zIndex = String(Math.round((1 - label.depth) * 10_000));
    }
  });
  return null;
}

/** Orbit (drag), pan (right-drag) and zoom, kept in bounds. */
const Controls = forwardRef<
  { reset: () => void },
  { panMode: boolean; keyTarget: HTMLElement | null; elevation: number }
>(function Controls({ panMode, keyTarget, elevation }, handle) {
  const { camera, gl, size } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const target = useMemo(() => new THREE.Vector3(0, elevation, 0), [elevation]);
  const doFrame = useCallback(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const offset = new THREE.Vector3(-3, 13, 16);
    offset.setLength(offset.length() * Math.max(1, 1.2 / aspect));
    const focus = target.clone().set(aspect < 1 ? -1.4 : 0, elevation, aspect < 1 ? 0.8 : 0);
    if (controls.current) {
      controls.current.enableDamping = false;
      controls.current.update();
    }
    camera.position.copy(focus).add(offset);
    camera.lookAt(focus);
    if (!controls.current) return;
    controls.current.target.copy(focus);
    controls.current.update();
    controls.current.enableDamping = true;
  }, [camera, size.width, size.height, target, elevation]);

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enableDamping = true;
    orbit.screenSpacePanning = false;
    orbit.minDistance = 5;
    orbit.maxDistance = 48;
    orbit.minPolarAngle = 0.2;
    orbit.maxPolarAngle = 1.32;
    orbit.keyPanSpeed = 25;
    controls.current = orbit;
    doFrame();
    return () => {
      orbit.dispose();
      controls.current = null;
    };
    // doFrame() only sets the initial view; re-run on resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  useEffect(() => {
    doFrame();
  }, [doFrame]);

  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    orbit.mouseButtons.LEFT = panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    orbit.mouseButtons.RIGHT = panMode ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    orbit.touches.ONE = panMode ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  }, [panMode]);

  useEffect(() => {
    const orbit = controls.current;
    if (!orbit || !keyTarget) return;
    orbit.listenToKeyEvents(keyTarget);
    return () => orbit.stopListenToKeyEvents();
  }, [keyTarget]);

  useImperativeHandle(handle, () => ({ reset: doFrame }), [doFrame]);

  useFrame(() => {
    const orbit = controls.current;
    if (!orbit) return;
    orbit.update();
    const [x, y, z] = orbit.target;
    if (x !== target.x || z !== target.z) {
      const shift = new THREE.Vector3(x - target.x, 0, z - target.z);
      orbit.target.add(shift);
      camera.position.add(shift);
    }
  });
  return null;
});

/** An on/off preference kept per browser. */
function useStoredFlag(key: string): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  return [
    value,
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* storage may be blocked */
      }
    },
  ];
}

/** Day/evening lighting. */
function Lighting({ night }: { night: boolean }) {
  return (
    <>
      <color attach="background" args={[night ? "#1a2335" : "#bfe0ef"]} />
      <fog attach="fog" args={[night ? "#1a2335" : "#bfe0ef", 38, 75]} />
      <hemisphereLight
        args={[
          night ? "#7f95bd" : "#fff4e0",
          night ? "#1e2620" : "#5d7a4c",
          night ? 0.32 : 1.1,
        ]}
      />
      <directionalLight
        position={[10, 16, 9]}
        intensity={night ? 0.75 : 2.4}
        color={night ? "#ff9a5a" : "#fff1d6"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-far={60}
      />
      <ambientLight intensity={night ? 0.14 : 0.35} color={night ? "#8fa4d8" : "#ffffff"} />
      <fog attach="fog" args={[night ? "#1a2335" : "#bfe0ef", 38, 75]} />
    </>
  );
}

const FLOOR_KEY = "mc.officeFloor";

function useFloor(): [number, (floor: number) => void] {
  const [floor, setFloor] = useState<number>(() => {
    try {
      return window.localStorage.getItem(FLOOR_KEY) === "2" ? 2 : 1;
    } catch {
      return 1;
    }
  });
  return [
    floor,
    (next: number) => {
      setFloor(next);
      try {
        window.localStorage.setItem(FLOOR_KEY, String(next));
      } catch {
        /* per-browser convenience only */
      }
    },
  ];
}

/** 2D zone labels in the world floor (desks / meeting table / lounge). */
function ZoneLabels({
  layout,
  deskOccupied,
}: {
  layout: Layout;
  deskOccupied: Set<number>;
}) {
  return (
    <>
      {layout.desks.map((d) => (
        <mesh
          key={`desk-label-${d.index}`}
          position={[d.pos.x, 0.26, d.pos.z + 1.3]}
          receiveShadow
        >
          <planeGeometry args={[1.8, 0.28]} />
          <meshBasicMaterial
            color={deskOccupied.has(d.index) ? "#10b98188" : "#6b728066"}
            transparent
          />
        </mesh>
      ))}
      {layout.meeting.map((m) => (
        <mesh key={`meet-label-${m.index}`} position={[m.pos.x, 0.26, m.pos.z]} receiveShadow>
          <planeGeometry args={[3.2, 0.28]} />
          <meshBasicMaterial color="#3b82f666" transparent />
        </mesh>
      ))}
      {layout.lounge.map((l) => (
        <mesh key={`lounge-label-${l.index}`} position={[l.pos.x, 0.26, l.pos.z]} receiveShadow>
          <planeGeometry args={[3.2, 0.28]} />
          <meshBasicMaterial color="#f59e0b66" transparent />
        </mesh>
      ))}
    </>
  );
}

/** The whole office scene, lazy-loaded on demand. */
export default function OfficeScene({
  people,
  layout,
  onSelect,
  selected,
  fetchedAt,
}: {
  people: OfficePerson[];
  layout: Layout;
  onSelect: (id: string, trigger: HTMLElement | null) => void;
  selected: string | undefined;
  fetchedAt?: string;
}) {
  const anchors = useRef(new Map<string, THREE.Object3D>());
  const labels = useRef(new Map<string, HTMLElement>());
  const view = useRef<{ reset: () => void }>(null);
  const [panMode, setPanMode] = useState(false);
  const [keyTarget, setKeyTarget] = useState<HTMLElement | null>(null);
  const [floor, setFloor] = useFloor();
  const [night, setNight] = useStoredFlag("mc.officeNight");
  const [showLabels, setShowLabels] = useState(true);

  useEffect(() => {
    if (!selected) return;
    const p = people.find((p) => p.id === selected);
    if (!p) return;
    const group = anchors.current.get(`agent-${selected}`);
    if (!group) return;
    group.getWorldPosition(new THREE.Vector3());
    // reset view toward the selected agent
    setTimeout(() => view.current?.reset(), 50);
  }, [selected, people]);

  const deskOccupied = new Set(
    people
      .filter((p) => p.state === "desk" && p.seat != null)
      .map((p) => p.seat!),
  );

  return (
    <div
      ref={setKeyTarget}
      tabIndex={0}
      role="region"
      aria-label="Office 3D. Drag to rotate, right-drag or two fingers to pan, scroll to zoom, arrow keys pan when focused. Page Up/Down change floors."
      onKeyDown={(event) => {
        if (event.key === "PageUp" || event.key === "PageDown") {
          event.preventDefault();
          setFloor(event.key === "PageUp" ? 2 : 1);
        }
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [-3, 13, 16], fov: 40, near: 0.5, far: 150 }}
        gl={{ antialias: true }}
      >
        <Lighting night={night} />
        <ZoneLabels layout={layout} deskOccupied={deskOccupied} />
        {layout.zones.slice(0, layout.n).map((z, idx) => {
          if (idx >= people.length) return null;
          const p = people[idx];
          return (
            <Character
              key={p.id}
              person={p}
              target={stateToPosition(layout, p)}
              onSelect={onSelect}
              anchor={(obj) => {
                if (obj) anchors.current.set(`agent-${p.id}`, obj);
                else anchors.current.delete(`agent-${p.id}`);
              }}
            />
          );
        })}
        <LabelProjector anchors={anchors} labels={labels} />
        <Controls ref={view} panMode={panMode} keyTarget={keyTarget} elevation={floor === 2 ? 4 : 0} />
      </Canvas>
      <div className="office-3d-labels">
        {people.map((person) => {
          const label = person.state === "desk" ? "Di meja" : person.state === "meeting" ? "Meeting" : person.state === "lounge" ? "Lounge" : "Away";
          return (
            <button
              key={person.id}
              ref={(el) => {
                if (el) labels.current.set(`agent-${person.id}`, el);
                else labels.current.delete(`agent-${person.id}`);
              }}
              type="button"
              className={cn(
                "agent-tag-3d state-unknown",
                showLabels ? "visible" : "invisible",
              )}
              onClick={(event) => onSelect(person.id, event.currentTarget)}
              aria-label={`${person.id}. ${label}. Buka detail agen.`}
            >
              <span className="agent-tag-row">
                <span className="pixel-station-name">{person.id}</span>
                <span className={`badge ${person.state === "desk" ? "good" : person.state === "lounge" ? "unknown" : "unknown"}`}>
                  {label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="office-3d-floors" role="group" aria-label="Lantai">
        {[
          { floor: 1, label: "Lantai 1" },
          { floor: 2, label: "Lantai 2" },
        ].map((item) => (
          <button
            key={item.floor}
            type="button"
            className={cn(floor === item.floor ? "active" : "", "office-floor-btn")}
            aria-pressed={floor === item.floor}
            onClick={() => setFloor(item.floor)}
            title={`Lantai ${item.floor} (Page Up / Page Down)`}
          >
            <b>{item.floor}</b><span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="office-3d-tools">
        <button
          type="button"
          className={cn(night ? "active sleep" : "")}
          aria-pressed={night}
          onClick={() => setNight(!night)}
          title="Tombol siang/malam"
        >
          {night ? "🌙 Malam" : "☀️ Siang"}
        </button>
        <button
          type="button"
          className={cn(panMode ? "active" : "")}
          aria-pressed={panMode}
          onClick={() => setPanMode((value) => !value)}
          title="Drag menggeser pandangan alih-alih memutar"
        >
          ✥ Geser
        </button>
        <button
          type="button"
          onClick={() => view.current?.reset()}
          title="Kembali ke pandangan awal"
        >
          ↺ Reset view
        </button>
        <button
          type="button"
          onClick={() => setShowLabels((v) => !v)}
          title={showLabels ? "Sembunyikan label" : "Tampilkan label"}
        >
          {showLabels ? "👁️ Label" : "👁️‍🗨️"}
        </button>
      </div>
    </div>
  );
}
