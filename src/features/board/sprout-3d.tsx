"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";

import { hopArc, hopPose, type BoardPoint } from "./hop";

const SPROUT_URL = "/assets/characters/sprout/3d/sprout.glb";
/** The export is ~0.1 units tall; scale it to toy-figure size on the board. */
const SPROUT_SCALE = 13;
/** Feet rest on top of the island platform. */
const PLATFORM_TOP_Y = 0.55;

/** Points are final stand positions; the board layer decides platform offsets. */
export type HopRequest = Readonly<{ from: BoardPoint; to: BoardPoint }>;

type SproutProps = Readonly<{
  standingAt: BoardPoint;
  hop: HopRequest | null;
  onHopEnd: () => void;
  reactionToken: number;
  reducedMotion: boolean;
}>;

export function Sprout3d({
  standingAt,
  hop,
  onHopEnd,
  reactionToken,
  reducedMotion,
}: SproutProps) {
  const { scene } = useGLTF(SPROUT_URL);
  const groupRef = useRef<Group>(null);
  const squashRef = useRef<Group>(null);
  const hopStartRef = useRef<number | null>(null);
  const hopEndedRef = useRef(false);
  const reactionStartRef = useRef<number | null>(null);
  const reactionActiveRef = useRef(false);
  const previousReactionTokenRef = useRef(reactionToken);

  // A new hop request restarts the timeline; its start time is stamped on
  // the first animation frame so timing always follows the r3f clock.
  useEffect(() => {
    hopStartRef.current = null;
    hopEndedRef.current = false;
  }, [hop]);

  useEffect(() => {
    if (reactionToken === previousReactionTokenRef.current) return;
    previousReactionTokenRef.current = reactionToken;
    reactionStartRef.current = null;
    reactionActiveRef.current = true;
  }, [reactionToken]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    const squash = squashRef.current;
    if (!group || !squash) return;
    const elapsed = clock.getElapsedTime();

    if (hop && !hopEndedRef.current) {
      if (hopStartRef.current === null) hopStartRef.current = elapsed;
      const arc = hopArc(hop.from, hop.to);
      const progress = reducedMotion
        ? 1
        : ((elapsed - hopStartRef.current) * 1000) / arc.durationMs;
      const pose = hopPose(hop.from, hop.to, progress, { peak: arc.peak });
      group.position.set(pose.x, PLATFORM_TOP_Y + pose.y, pose.z);
      squash.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
      if (progress >= 1) {
        hopEndedRef.current = true;
        onHopEnd();
      }
      return;
    }

    if (reactionActiveRef.current) {
      if (reactionStartRef.current === null) reactionStartRef.current = elapsed;
      const reactionProgress = reducedMotion
        ? 1
        : Math.min(1, (elapsed - reactionStartRef.current) / 0.48);
      const reactionY = reducedMotion ? 0 : Math.sin(Math.PI * reactionProgress) * 0.22;
      group.position.set(
        standingAt.x,
        PLATFORM_TOP_Y + 0.04 + reactionY,
        standingAt.z,
      );
      squash.scale.set(1, 1, 1);
      if (reactionProgress >= 1) reactionActiveRef.current = false;
      return;
    }

    // Idle: a soft breathing bob. Oscillate around a slightly raised center
    // (no clamp) so it reads as breathing, not a repeated push-up off the floor.
    const bob = reducedMotion ? 0 : Math.sin(elapsed * 1.6) * 0.04;
    group.position.set(standingAt.x, PLATFORM_TOP_Y + 0.04 + bob, standingAt.z);
    squash.scale.set(1, 1, 1);
    group.rotation.y = reducedMotion ? 0 : Math.sin(elapsed * 0.9) * 0.08;
  });

  return (
    <group ref={groupRef} position={[standingAt.x, PLATFORM_TOP_Y, standingAt.z]}>
      {/* Squash-and-stretch scales around the feet (model origin) so the
          character deforms against the ground, not around its middle. */}
      <group ref={squashRef}>
        <primitive object={scene} scale={SPROUT_SCALE} />
      </group>
    </group>
  );
}

useGLTF.preload(SPROUT_URL);
