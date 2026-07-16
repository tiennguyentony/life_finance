"use client";

import { Html, OrbitControls, useCursor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group, Mesh, PerspectiveCamera } from "three";

import { locationById } from "./locations";

/* The board stays in daylight regardless of app theme, like the toy art. */
const SKY = "#c9e7f4";
const GRASS = "#8fd07c";
const ROAD = "#5c6673";
const ROAD_LINE = "#e8edf1";
const TRUNK = "#8b6a4a";
const LEAF = "#5aa35f";
const BEACON = "#2f9e5b";

type SceneProps = Readonly<{
  activeLocationId: string | null;
  interactiveIds: readonly string[];
  visitedIds: readonly string[];
  paused: boolean;
  reducedMotion: boolean;
  onSelect: (locationId: string) => void;
}>;

function Box({
  position,
  size,
  color,
  rotationY = 0,
}: Readonly<{
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
  rotationY?: number;
}>) {
  return (
    <mesh position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <boxGeometry args={size as [number, number, number]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

function Tree({
  position,
  scale = 1,
}: Readonly<{ position: readonly [number, number]; scale?: number }>) {
  const [x, z] = position;
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.09, 0.12, 0.7, 6]} />
        <meshStandardMaterial color={TRUNK} flatShading />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <icosahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial color={LEAF} flatShading />
      </mesh>
    </group>
  );
}

function Cloud({
  position,
  drift,
  reducedMotion,
}: Readonly<{
  position: readonly [number, number, number];
  drift: number;
  reducedMotion: boolean;
}>) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    group.current.position.x =
      position[0] + Math.sin(clock.elapsedTime * 0.08 + drift) * 1.6;
  });
  return (
    <group position={position as [number, number, number]} ref={group}>
      {[
        [0, 0, 0, 0.75],
        [0.7, 0.12, 0.2, 0.5],
        [-0.7, 0.05, -0.1, 0.55],
      ].map(([x, y, z, r], index) => (
        <mesh key={index} position={[x!, y!, z!]}>
          <sphereGeometry args={[r!, 10, 10]} />
          <meshStandardMaterial color="#ffffff" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Beacon({ reducedMotion }: Readonly<{ reducedMotion: boolean }>) {
  const pin = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (pin.current && !reducedMotion) {
      pin.current.position.y = 2.7 + Math.sin(t * 2.2) * 0.18;
      pin.current.rotation.y = t * 1.2;
    }
    if (ring.current) {
      const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 2.2) * 0.08;
      ring.current.scale.setScalar(pulse);
    }
  });
  return (
    <group>
      <mesh position={[0, 2.7, 0]} ref={pin}>
        <coneGeometry args={[0.34, 0.9, 4]} />
        <meshStandardMaterial
          color={BEACON}
          emissive={BEACON}
          emissiveIntensity={0.45}
          flatShading
        />
      </mesh>
      <mesh position={[0, 0.06, 0]} ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1.2, 32]} />
        <meshStandardMaterial
          color={BEACON}
          emissive={BEACON}
          emissiveIntensity={0.5}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  );
}

function District({
  id,
  position,
  active,
  interactive,
  visited,
  reducedMotion,
  onSelect,
  children,
  labelHeight,
}: Readonly<{
  id: string;
  position: readonly [number, number];
  active: boolean;
  interactive: boolean;
  visited: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  children: React.ReactNode;
  labelHeight: number;
}>) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<Group>(null);
  useCursor(hovered && interactive);
  const location = locationById(id);

  useFrame(() => {
    if (!group.current) return;
    const target = hovered && interactive ? 1.045 : 1;
    const current = group.current.scale.x;
    const next = reducedMotion ? target : current + (target - current) * 0.16;
    group.current.scale.setScalar(next);
  });

  return (
    <group position={[position[0], 0, position[1]]}>
      <group
        onClick={(event) => {
          event.stopPropagation();
          if (interactive) onSelect(id);
        }}
        onPointerOut={() => setHovered(false)}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        ref={group}
      >
        {children}
      </group>
      {active ? <Beacon reducedMotion={reducedMotion} /> : null}
      <Html
        center
        position={[0, labelHeight, 0]}
        style={{ pointerEvents: "none" }}
        zIndexRange={[1, 0]}
      >
        <div
          className={`city-label${active ? " is-active" : ""}${
            hovered && interactive ? " is-hover" : ""
          }${visited ? " is-visited" : ""}`}
        >
          <strong>{location.name}</strong>
          <span>{visited ? "Settled" : location.tagline}</span>
        </div>
      </Html>
    </group>
  );
}

function Ground() {
  return (
    <group>
      <mesh position={[0, -0.09, 0]}>
        <cylinderGeometry args={[11.5, 11.5, 0.18, 48]} />
        <meshStandardMaterial color={GRASS} flatShading />
      </mesh>
      {/* Road cross */}
      <mesh position={[0, 0.01, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[21, 1.7]} />
        <meshStandardMaterial color={ROAD} />
      </mesh>
      <mesh position={[-0.6, 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[21, 1.7]} />
        <meshStandardMaterial color={ROAD} />
      </mesh>
      {[-8, -5, -2, 1, 4, 7].map((offset) => (
        <mesh
          key={`h${offset}`}
          position={[offset, 0.02, 0.4]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[1.1, 0.14]} />
          <meshStandardMaterial color={ROAD_LINE} />
        </mesh>
      ))}
      {[-7, -4, 2, 5, 8].map((offset) => (
        <mesh
          key={`v${offset}`}
          position={[-0.6, 0.02, offset]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        >
          <planeGeometry args={[1.1, 0.14]} />
          <meshStandardMaterial color={ROAD_LINE} />
        </mesh>
      ))}
    </group>
  );
}

/** Apartment towers of The Heights. */
function HeightsBlock() {
  return (
    <group>
      <Box color="#e8a87c" position={[-0.8, 0.9, 0.2]} size={[1.5, 1.8, 1.5]} />
      <Box color="#c97b4e" position={[-0.8, 1.95, 0.2]} size={[1.7, 0.3, 1.7]} />
      <Box color="#f0c9a8" position={[0.9, 1.3, -0.3]} size={[1.4, 2.6, 1.4]} />
      <Box color="#d9925f" position={[0.9, 2.75, -0.3]} size={[1.6, 0.3, 1.6]} />
      <Box color="#f7e2cf" position={[0.2, 0.45, 1.3]} size={[1.1, 0.9, 0.9]} />
    </group>
  );
}

function TransitBlock() {
  return (
    <group>
      <Box color="#7cc4e8" position={[0, 0.55, 0]} size={[2.9, 1.1, 1.6]} />
      <mesh position={[0, 1.35, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.8, 0.8, 2.9, 12, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#4a90b8" flatShading />
      </mesh>
      <Box color="#5c6673" position={[0, 0.12, 1.35]} size={[3.4, 0.24, 0.7]} />
      <Box color="#f2d16b" position={[-1.1, 0.5, 1.35]} size={[0.7, 0.5, 0.45]} />
      <Box color="#f2d16b" position={[0.2, 0.5, 1.35]} size={[0.7, 0.5, 0.45]} />
    </group>
  );
}

function PromenadeBlock() {
  const shops: readonly (readonly [string, string])[] = [
    ["#f2789f", "#c94f77"],
    ["#ffd166", "#d9a63f"],
    ["#8ac6d1", "#5e99a6"],
  ];
  return (
    <group>
      {shops.map(([wall, roof], index) => (
        <group key={wall} position={[(index - 1) * 1.35, 0, index === 1 ? -0.3 : 0]}>
          <Box color={wall} position={[0, 0.55, 0]} size={[1.15, 1.1, 1.15]} />
          <Box color={roof} position={[0, 1.2, 0]} size={[1.3, 0.22, 1.3]} />
          <Box color="#fff6e8" position={[0, 0.45, 0.6]} size={[0.7, 0.5, 0.06]} />
        </group>
      ))}
    </group>
  );
}

function HospitalBlock() {
  return (
    <group>
      <Box color="#f4f7f8" position={[0, 0.95, 0]} size={[2.4, 1.9, 1.9]} />
      <Box color="#dfe7ea" position={[0, 2.0, 0]} size={[2.6, 0.24, 2.1]} />
      <Box color="#e25555" position={[0, 1.45, 1.0]} size={[0.7, 0.22, 0.06]} />
      <Box color="#e25555" position={[0, 1.45, 1.0]} size={[0.22, 0.7, 0.06]} />
      <Box color="#f4f7f8" position={[1.6, 0.45, 0.4]} size={[0.9, 0.9, 1.0]} />
    </group>
  );
}

function BankBlock() {
  return (
    <group>
      <Box color="#f0c75e" position={[0, 1.7, 0]} size={[1.7, 3.4, 1.7]} />
      <Box color="#d9a63f" position={[0, 3.55, 0]} size={[1.9, 0.3, 1.9]} />
      <mesh position={[0, 4.05, 0]}>
        <coneGeometry args={[0.9, 0.7, 4]} />
        <meshStandardMaterial color="#a67c2e" flatShading />
      </mesh>
      <Box color="#fff2cf" position={[0, 0.8, 0.9]} size={[1.0, 1.6, 0.12]} />
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.8, 1.0]}>
          <cylinderGeometry args={[0.09, 0.11, 1.6, 6]} />
          <meshStandardMaterial color="#e5b84e" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function OfficeBlock() {
  return (
    <group>
      <Box color="#9db8e8" position={[0, 1.5, 0]} size={[1.5, 3.0, 1.5]} />
      <Box color="#7d9ed6" position={[0, 3.1, 0]} size={[1.65, 0.2, 1.65]} />
      <Box color="#c3d4f2" position={[0, 1.5, 0.78]} size={[1.1, 2.4, 0.05]} />
    </group>
  );
}

function ParkBlock() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.7, 24]} />
        <meshStandardMaterial color="#7ec06c" />
      </mesh>
      <mesh position={[0.5, 0.05, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.65, 20]} />
        <meshStandardMaterial color="#7cc4e8" />
      </mesh>
      <Tree position={[-0.8, -0.5]} />
      <Tree position={[-0.2, 0.9]} scale={0.8} />
      <Tree position={[1.1, -0.7]} scale={0.9} />
    </group>
  );
}

const DISTRICT_BLOCKS: Readonly<
  Record<string, { position: readonly [number, number]; labelHeight: number; block: React.ReactNode }>
> = {
  heights: { position: [-5.2, -3.2], labelHeight: 3.9, block: <HeightsBlock /> },
  transit: { position: [-5.4, 3.4], labelHeight: 3.1, block: <TransitBlock /> },
  promenade: { position: [4.9, 3.6], labelHeight: 2.6, block: <PromenadeBlock /> },
  hospital: { position: [5.1, -3.0], labelHeight: 3.4, block: <HospitalBlock /> },
  bank: { position: [0.6, -5.6], labelHeight: 5.2, block: <BankBlock /> },
  office: { position: [2.0, 1.9], labelHeight: 4.2, block: <OfficeBlock /> },
  park: { position: [-2.0, -2.4], labelHeight: 2.4, block: <ParkBlock /> },
};

const EXTRA_TREES: readonly (readonly [number, number, number])[] = [
  [-8.3, -1.2, 1], [-7.9, 5.6, 0.85], [-2.6, 5.9, 1], [2.6, 6.1, 0.8],
  [7.9, 1.2, 0.9], [8.4, -1.4, 0.8], [2.9, -6.9, 0.9], [-3.4, -6.4, 0.85],
  [-6.9, -5.6, 0.75], [7.2, 5.4, 0.75],
];

/** Widens the lens on narrow viewports so the whole board stays in frame. */
function AdaptiveFov() {
  const getState = useThree((state) => state.get);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  useEffect(() => {
    const aspect = width / height;
    const camera = getState().camera as PerspectiveCamera;
    camera.fov = aspect < 0.9 ? 52 : aspect < 1.4 ? 42 : 33;
    camera.updateProjectionMatrix();
  }, [getState, width, height]);
  return null;
}

function CityWorld(props: SceneProps) {
  const { activeLocationId, interactiveIds, visitedIds, paused, reducedMotion, onSelect } = props;
  return (
    <group>
      <ambientLight intensity={0.95} />
      <directionalLight intensity={1.35} position={[8, 14, 6]} />
      <directionalLight color="#ffe9c4" intensity={0.35} position={[-9, 6, -4]} />
      <Ground />
      {Object.entries(DISTRICT_BLOCKS).map(([id, meta]) => (
        <District
          active={!paused && activeLocationId === id}
          id={id}
          interactive={!paused && interactiveIds.includes(id)}
          key={id}
          labelHeight={meta.labelHeight}
          onSelect={onSelect}
          position={meta.position}
          reducedMotion={reducedMotion}
          visited={visitedIds.includes(id)}
        >
          {meta.block}
        </District>
      ))}
      {EXTRA_TREES.map(([x, z, s]) => (
        <Tree key={`${x}:${z}`} position={[x, z]} scale={s} />
      ))}
      <Cloud drift={0} position={[-6, 7.4, -2]} reducedMotion={reducedMotion} />
      <Cloud drift={2.4} position={[4, 8.2, 3]} reducedMotion={reducedMotion} />
      <Cloud drift={4.1} position={[1, 7.0, -6]} reducedMotion={reducedMotion} />
    </group>
  );
}

export default function CityScene(props: SceneProps) {
  const { paused, reducedMotion } = props;
  /* Rotate only as a cinematic backdrop behind overlays; the board holds
   * still while the player is aiming at districts. */
  const controls = useMemo(
    () => ({
      autoRotate: paused && !reducedMotion,
      autoRotateSpeed: 0.45,
    }),
    [paused, reducedMotion],
  );
  return (
    <Canvas
      camera={{ position: [15, 13, 15], fov: 33 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
    >
      <color args={[SKY]} attach="background" />
      <fog args={[SKY, 34, 60]} attach="fog" />
      <AdaptiveFov />
      <CityWorld {...props} />
      <OrbitControls
        autoRotate={controls.autoRotate}
        autoRotateSpeed={controls.autoRotateSpeed}
        enableDamping
        enablePan={false}
        enableZoom
        maxDistance={30}
        maxPolarAngle={1.22}
        minDistance={13}
        minPolarAngle={0.78}
        target={[0, 0.6, 0]}
      />
    </Canvas>
  );
}
