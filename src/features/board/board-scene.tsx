"use client";

import {
  ContactShadows,
  Html,
  OrbitControls,
  useCursor,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PerspectiveCamera } from "three";
import type { Group, Mesh, MeshStandardMaterial } from "three";

import { verticalFovForAspect } from "./camera-fov";
import { type BoardPoint } from "./hop";
import {
  BOARD_ISLANDS,
  HOME_ISLAND_ID,
  islandById,
  type BoardIsland,
} from "./islands";
import { Sprout3d, type HopRequest } from "./sprout-3d";

export type BoardMode = "strategy" | "free";

type BoardSceneProps = Readonly<{
  currentIslandId: string;
  hop: HopRequest | null;
  mode: BoardMode;
  onSelect: (islandId: string, focusTarget?: HTMLElement) => void;
  onHopEnd: () => void;
  reducedMotion: boolean;
  reactionToken: number;
  selectedIslandId: string | null;
  /** Sprout's resting point while not hopping (final world coordinates). */
  standingAt: BoardPoint;
}>;

const PLATFORM_TOP_Y = 0.55;

/* ------------------------------ buildings ------------------------------ */
/* Placeholder low-poly silhouettes, one composition per island. Real asset
 * pack models drop in here later without touching layout or interaction. */

/** Sunlit window glass: a warm highlight, not a night-time glow. */
function GlowWindow(props: Readonly<{ position: [number, number, number]; size?: [number, number, number]; color?: string }>) {
  const { position, size = [0.1, 0.32, 0.04], color = "#ffd27d" } = props;
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
    </mesh>
  );
}

function HomeBuildings() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.25, 1, 1.1]} />
        <meshStandardMaterial color="#8ea3d9" flatShading />
      </mesh>
      <mesh position={[0, 1.25, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.05, 0.7, 4]} />
        <meshStandardMaterial color="#e2694f" flatShading />
      </mesh>
      <GlowWindow position={[-0.3, 0.55, 0.56]} />
      <GlowWindow position={[0.3, 0.55, 0.56]} />
      <mesh position={[1, 0.35, 0.55]}>
        <cylinderGeometry args={[0.07, 0.09, 0.5, 6]} />
        <meshStandardMaterial color="#5d4037" flatShading />
      </mesh>
      <mesh position={[1, 0.78, 0.55]}>
        <icosahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#3f7d4e" flatShading />
      </mesh>
      <mesh position={[-1.05, 0.3, -0.4]}>
        <cylinderGeometry args={[0.06, 0.08, 0.4, 6]} />
        <meshStandardMaterial color="#5d4037" flatShading />
      </mesh>
      <mesh position={[-1.05, 0.63, -0.4]}>
        <icosahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color="#3f7d4e" flatShading />
      </mesh>
    </group>
  );
}

function FinancialBuildings() {
  const towers: ReadonlyArray<[number, number, number]> = [
    [-0.75, 2.2, -0.2],
    [0.15, 3, 0.15],
    [0.95, 1.7, -0.35],
  ];
  return (
    <group>
      {towers.map(([x, height, z], index) => (
        <group key={index} position={[x, 0, z]}>
          <mesh position={[0, height / 2, 0]}>
            <boxGeometry args={[0.78, height, 0.78]} />
            <meshStandardMaterial color={index === 1 ? "#8aa3dc" : "#6f89c9"} flatShading />
          </mesh>
          <GlowWindow position={[0, height * 0.55, 0.41]} size={[0.14, height * 0.62, 0.04]} color="#9fd8ff" />
          <GlowWindow position={[0.41, height * 0.45, 0]} size={[0.04, height * 0.5, 0.14]} color="#9fd8ff" />
        </group>
      ))}
    </group>
  );
}

function BankBuildings() {
  return (
    <group>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[2.15, 1.24, 1.35]} />
        <meshStandardMaterial color="#8a7f5c" flatShading />
      </mesh>
      {[-0.7, 0, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.62, 0.72]}>
          <cylinderGeometry args={[0.11, 0.11, 1.2, 8]} />
          <meshStandardMaterial color="#c9bd93" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.45, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.5, 0.5, 2.35, 3]} />
        <meshStandardMaterial color="#a3966e" flatShading />
      </mesh>
      <mesh position={[0, 0.72, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.05, 24]} />
        <meshStandardMaterial color="#f3c74f" emissive="#f3c74f" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function HospitalBuildings() {
  return (
    <group>
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[1.55, 1.7, 1.3]} />
        <meshStandardMaterial color="#b9c4e2" flatShading />
      </mesh>
      <mesh position={[1.15, 0.45, 0]}>
        <boxGeometry args={[0.8, 0.9, 1.1]} />
        <meshStandardMaterial color="#98a6cc" flatShading />
      </mesh>
      <GlowWindow position={[0, 1.28, 0.67]} size={[0.5, 0.14, 0.05]} color="#ff6b6b" />
      <GlowWindow position={[0, 1.28, 0.67]} size={[0.14, 0.5, 0.05]} color="#ff6b6b" />
      <GlowWindow position={[-0.45, 0.6, 0.67]} size={[0.22, 0.3, 0.04]} color="#cfe3ff" />
      <GlowWindow position={[0.45, 0.6, 0.67]} size={[0.22, 0.3, 0.04]} color="#cfe3ff" />
    </group>
  );
}

function StartupBuildings() {
  return (
    <group>
      <mesh position={[-0.35, 0.8, 0]}>
        <boxGeometry args={[1.35, 1.6, 1.2]} />
        <meshStandardMaterial color="#8f7ac9" flatShading />
      </mesh>
      <GlowWindow position={[-0.35, 1.05, 0.62]} size={[0.9, 0.2, 0.04]} color="#e0aaff" />
      <GlowWindow position={[-0.35, 0.6, 0.62]} size={[0.9, 0.2, 0.04]} color="#e0aaff" />
      <group position={[0.95, 0, 0.25]}>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.28, 0.34, 1.5, 10]} />
          <meshStandardMaterial color="#d8dced" flatShading />
        </mesh>
        <mesh position={[0, 1.78, 0]}>
          <coneGeometry args={[0.28, 0.6, 10]} />
          <meshStandardMaterial color="#e2694f" flatShading />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <coneGeometry args={[0.2, 0.35, 8]} />
          <meshStandardMaterial color="#ffb35c" emissive="#ff8c42" emissiveIntensity={0.4} flatShading />
        </mesh>
      </group>
    </group>
  );
}

const BUILDINGS: Readonly<Record<string, () => React.JSX.Element>> = {
  home: HomeBuildings,
  financial: FinancialBuildings,
  bank: BankBuildings,
  hospital: HospitalBuildings,
  startup: StartupBuildings,
};

/* ------------------------------- island -------------------------------- */

type IslandProps = Readonly<{
  island: BoardIsland;
  onSelect: (islandId: string, focusTarget?: HTMLElement) => void;
  position: BoardPoint;
  radius: number;
  reducedMotion: boolean;
  statusLabel: string | null;
}>;

function Island({
  island,
  onSelect,
  position,
  radius,
  reducedMotion,
  statusLabel,
}: IslandProps) {
  const groupRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const isHighlighted = statusLabel !== null;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (group) {
      const targetY = hovered && !isHighlighted ? 0.22 : 0;
      group.position.y = reducedMotion
        ? targetY
        : group.position.y + (targetY - group.position.y) * Math.min(1, delta * 9);
    }
    const ring = ringRef.current;
    if (ring) {
      const material = ring.material as MeshStandardMaterial;
      // A painted trim ring in daylight: a soft lift on hover, a brighter
      // one for the current stop, never the night version's neon glow.
      material.emissiveIntensity = isHighlighted ? 0.55 : hovered ? 0.4 : 0.12;
    }
  });

  const Buildings = BUILDINGS[island.id] ?? HomeBuildings;

  return (
    <group position={[position.x, 0, position.z]}>
      <group ref={groupRef}>
        <group
          onClick={(event) => {
            event.stopPropagation();
            onSelect(island.id);
          }}
          onPointerOut={() => setHovered(false)}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHovered(true);
          }}
        >
          {/* platform: grassy top over a sun-warmed stone base */}
          <mesh position={[0, 0.41, 0]}>
            <cylinderGeometry args={[radius, radius * 0.96, 0.28, 7]} />
            <meshStandardMaterial color="#7fb86a" flatShading />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[radius * 0.96, radius * 0.62, 0.62, 7]} />
            <meshStandardMaterial color="#c3a877" flatShading />
          </mesh>
          {/* Buildings are proportioned for the large free-mode platforms;
              shrink them onto the smaller track corners. */}
          <group position={[0, PLATFORM_TOP_Y, 0]} scale={radius < 2 ? 0.72 : 1}>
            <Buildings />
          </group>
          {/* painted trim ring: a candy-colored rim, not a night glow */}
          <mesh position={[0, 0.42, 0]} ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius + 0.09, 0.045, 10, 48]} />
            <meshStandardMaterial
              color={island.accent}
              emissive={island.accent}
              emissiveIntensity={0.12}
              roughness={0.35}
            />
          </mesh>
        </group>
      </group>

      {/* label chip: real HTML button, so the board is keyboard-accessible */}
      <Html
        center
        position={[0, -0.55, radius * 0.82]}
        style={{ pointerEvents: "none" }}
        zIndexRange={[1, 0]}
      >
        <button
          className={`board-chip${isHighlighted ? " board-chip-current" : ""}`}
          data-board-destination={island.id}
          onClick={(event) => onSelect(island.id, event.currentTarget)}
          style={{ pointerEvents: "auto", borderColor: island.accent }}
          type="button"
        >
          <strong>{island.name}</strong>
          <span>{statusLabel ?? island.tagline}</span>
        </button>
      </Html>
    </group>
  );
}

/* -------------------------------- paths -------------------------------- */

function islandRimRadius(id: string): number {
  return id === HOME_ISLAND_ID ? 2.6 : 2.3;
}

/** Free mode's star of dotted paths, radiating from Home to each island. */
function PathDots({ reducedMotion }: Readonly<{ reducedMotion: boolean }>) {
  const dotsRef = useRef<Mesh[]>([]);

  const dots = useMemo(() => {
    const home = islandById(HOME_ISLAND_ID);
    const result: Array<{ position: [number, number, number]; phase: number }> = [];
    for (const island of BOARD_ISLANDS) {
      if (island.id === HOME_ISLAND_ID) continue;
      const span = Math.hypot(
        island.position.x - home.position.x,
        island.position.z - home.position.z,
      );
      // Only draw dots in the open water between the two platform rims.
      const startT = islandRimRadius(home.id) / span;
      const endT = 1 - islandRimRadius(island.id) / span;
      const count = 5;
      for (let i = 0; i <= count; i++) {
        const t = startT + ((endT - startT) * i) / count;
        result.push({
          position: [
            home.position.x + (island.position.x - home.position.x) * t,
            0.34,
            home.position.z + (island.position.z - home.position.z) * t,
          ],
          phase: t * 5,
        });
      }
    }
    return result;
  }, []);

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const elapsed = clock.getElapsedTime();
    dotsRef.current.forEach((dot, index) => {
      if (!dot) return;
      // A gentle sunlit sparkle, not a pulsing night beacon.
      const material = dot.material as MeshStandardMaterial;
      material.emissiveIntensity = 0.35 + Math.sin(elapsed * 2.4 - dots[index]!.phase) * 0.2;
    });
  });

  return (
    <group>
      {dots.map((dot, index) => (
        <mesh
          key={index}
          position={dot.position}
          ref={(mesh) => {
            if (mesh) dotsRef.current[index] = mesh;
          }}
        >
          <sphereGeometry args={[0.09, 10, 10]} />
          <meshStandardMaterial color="#f3c74f" emissive="#f3c74f" emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------- scene -------------------------------- */

function Water() {
  return (
    <mesh position={[0, -0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Warm, desaturated seafoam that sits near the cream --paper family,
          so the board's dominant field reads warm like the landing instead
          of the old saturated cool teal. */}
      <circleGeometry args={[46, 48]} />
      <meshStandardMaterial color="#a8ccbb" metalness={0.1} roughness={0.4} />
    </mesh>
  );
}

function ResponsiveStrategyCamera() {
  const { get, invalidate, size } = useThree();

  useLayoutEffect(() => {
    const { camera } = get();
    if (!(camera instanceof PerspectiveCamera)) return;

    const previousFov = camera.fov;
    camera.fov = verticalFovForAspect(size.width / size.height);
    camera.updateProjectionMatrix();
    invalidate();

    return () => {
      camera.fov = previousFov;
      camera.updateProjectionMatrix();
      invalidate();
    };
  }, [get, invalidate, size.height, size.width]);

  return null;
}

export default function BoardScene({
  currentIslandId,
  hop,
  mode,
  onSelect,
  onHopEnd,
  reducedMotion,
  reactionToken,
  selectedIslandId,
  standingAt,
}: BoardSceneProps) {
  const layout: ReadonlyArray<{ island: BoardIsland; position: BoardPoint; radius: number }> =
    BOARD_ISLANDS.map((island) => ({
      island,
      position: island.position,
      radius: island.id === HOME_ISLAND_ID ? 2.35 : 2.05,
    }));

  return (
    <Canvas
      camera={{ position: [0, 15.5, 19], fov: 30, near: 0.5, far: 110 }}
      dpr={[1, 2]}
      // With reduced motion every useFrame is static, so render on demand
      // (invalidated by interaction/state) instead of compositing 60fps forever.
      frameloop={reducedMotion ? "demand" : "always"}
    >
      {mode === "strategy" ? <ResponsiveStrategyCamera /> : null}

      {/* Wheel-zoom only: the view stays locked (no rotate/pan) so the board
          keeps its fixed 3/4 look, but you can pull back to see every corner
          building or lean in on a stop. Target matches the old lookAt point. */}
      <OrbitControls
        dampingFactor={0.12}
        // Damping needs a continuous loop; skip it under demand-mode frameloop.
        enableDamping={!reducedMotion}
        enablePan={false}
        enableRotate={false}
        enableZoom
        makeDefault
        maxDistance={42}
        minDistance={13}
        target={[0, -0.6, 0.2]}
      />

      {/* Sky and fog match the landing page's warm cream (--paper) so the
          board reads as the same sunlit world, not a separate night scene. */}
      <color args={["#f6f1da"]} attach="background" />
      <fog args={["#f6f1da", 48, 104]} attach="fog" />

      <hemisphereLight args={["#fffdf1", "#e7dfc1", 1.1]} />
      <directionalLight color="#fff6df" intensity={1.7} position={[6, 15, 8]} />
      {/* Soft sky-blue fill for shape, replacing the night version's purple. */}
      <directionalLight color="#dff2ef" intensity={0.35} position={[-8, 7, -6]} />

      <Water />
      {/* Grounds the floating islands with soft blob shadows on the water so
          nothing reads as pasted in. Rendered on the water plane just below
          the platforms; warm dark tint to match the daylight scene. */}
      <ContactShadows
        blur={2.2}
        color="#2e2818"
        far={7}
        opacity={0.55}
        position={[0, -0.86, 0]}
        resolution={1024}
        scale={46}
      />
      <PathDots reducedMotion={reducedMotion} />
      {layout.map(({ island, position, radius }) => (
        <Island
          island={island}
          key={island.id}
          onSelect={onSelect}
          position={position}
          radius={radius}
          reducedMotion={reducedMotion}
          statusLabel={
            mode === "strategy"
              ? island.id === selectedIslandId
                ? "Selected focus"
                : null
              : island.id === currentIslandId
                ? "Current location"
                : null
          }
        />
      ))}

      <Suspense fallback={null}>
        <Sprout3d
          hop={hop}
          onHopEnd={onHopEnd}
          reactionToken={reactionToken}
          reducedMotion={reducedMotion}
          standingAt={standingAt}
        />
      </Suspense>
    </Canvas>
  );
}
