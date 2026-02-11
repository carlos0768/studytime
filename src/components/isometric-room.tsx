'use client';

import React, { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrthographicCamera, Html } from '@react-three/drei';
import * as THREE from 'three';

/* ───────────────────────── Types ───────────────────────── */

interface RoomMember {
  user_id: string;
  display_name: string;
  status: string;
  studying_minutes: number;
}

interface IsometricRoomProps {
  members: (RoomMember | null)[];
  currentUserId: string;
  maxSlots: number;
}

interface ExitingMember {
  member: RoomMember;
  slotIndex: number;
  startTime: number;
  modelPath: string;
}

interface EnteringMember {
  member: RoomMember;
  slotIndex: number;
  startTime: number;
  modelPath: string;
}

/* ───────────────────── Exit Animation ──────────────────── */

const DOOR_POSITION: [number, number, number] = [4.0, 0, 0];
const TOTAL_EXIT_DURATION = 8750; // ms
const TOTAL_ENTER_DURATION = 6200; // ms
const ENTER_WALK_CYCLE_SPEED = 0.008;
const TORII_SCALE = 1.2;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getCharacterSeatPosition(slotIndex: number): THREE.Vector3 {
  const grid = GRID[slotIndex];
  if (!grid) return new THREE.Vector3(0, 0, 0);
  return new THREE.Vector3(grid[0], -0.15, grid[1] - 0.45);
}

function buildStationToDoorPath(slotIndex: number): THREE.Vector3[] {
  const startPos = getCharacterSeatPosition(slotIndex);
  const doorTarget = new THREE.Vector3(DOOR_POSITION[0], 0, DOOR_POSITION[2]);

  // Build waypoints to avoid collisions with desks/chairs
  const pts: THREE.Vector3[] = [startPos.clone()];
  const slotGrid = GRID[slotIndex];
  if (slotGrid) {
    const sx = slotGrid[0];
    const sz = slotGrid[1];
    if (sz > 0) {
      pts.push(new THREE.Vector3(sx, 0, sz + 1.0));
      pts.push(new THREE.Vector3(DOOR_POSITION[0], 0, sz + 1.0));
    } else if (sx < 0) {
      pts.push(new THREE.Vector3(sx, 0, sz - 0.8));
      pts.push(new THREE.Vector3(DOOR_POSITION[0], 0, sz - 0.8));
    }
  }
  pts.push(doorTarget.clone());
  pts.push(new THREE.Vector3(doorTarget.x + 4, 0, doorTarget.z));
  return pts;
}

/* ───────────────────── Character Models ──────────────────── */

const CHARACTER_MODELS = [
  '/models/character-a.glb',
  '/models/character-b.glb',
  '/models/character-c.glb',
  '/models/character-d.glb',
];

// Preload all models
CHARACTER_MODELS.forEach((path) => useGLTF.preload(path));

/* ──────────────── Station Grid (3D positions) ─────────────── */

const GRID: [number, number][] = [
  [-1.2, -0.8],
  [1.2, -0.8],
  [-1.2, 0.8],
  [1.2, 0.8],
];

/* ═══════════════════════════════════════════════════════════
   3D Components
   ═══════════════════════════════════════════════════════════ */

function CharacterModel({
  modelPath,
  isStudying,
}: {
  modelPath: string;
  isStudying: boolean;
}) {
  const { scene } = useGLTF(modelPath);
  const ref = useRef<THREE.Group>(null);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }
    });
    return c;
  }, [scene]);

  // Apply sitting pose
  useEffect(() => {
    cloned.traverse((child) => {
      if (child.name === 'leg-left' || child.name === 'leg-right') {
        child.rotation.x = -Math.PI / 2;
      }
      if (child.name === 'arm-left' || child.name === 'arm-right') {
        if (isStudying) {
          child.rotation.x = -Math.PI / 6; // Arms forward to desk
        } else {
          child.rotation.x = -Math.PI / 2.5; // Arms raised holding phone
        }
      }
    });
  }, [cloned, isStudying]);

  // Gentle idle animation
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    if (isStudying) {
      ref.current.position.y = Math.sin(t * 1.5) * 0.02;
    } else {
      ref.current.position.y = Math.sin(t * 0.8) * 0.03;
      ref.current.rotation.y = Math.sin(t * 0.5) * 0.1;
    }
  });

  return (
    <group ref={ref} scale={0.5}>
      <primitive object={cloned} />
      {/* Smartphone in hands when not studying */}
      {!isStudying && (
        <group position={[0, 1.6, 0.7]}>
          <mesh rotation={[-Math.PI / 2.5, 0, 0]}>
            <boxGeometry args={[0.4, 0.06, 0.7]} />
            <meshStandardMaterial color="#222222" />
          </mesh>
          <mesh rotation={[-Math.PI / 2.5, 0, 0]} position={[0, 0.035, 0]}>
            <boxGeometry args={[0.32, 0.01, 0.58]} />
            <meshStandardMaterial color="#1a2a3a" emissive="#4a9eff" emissiveIntensity={0.6} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ── Desk ── */
function Desk({ hasMember, isStudying }: { hasMember: boolean; isStudying: boolean }) {
  return (
    <group position={[0, 0.25, 0.5]}>
      {/* Desk top */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.2, 0.06, 0.7]} />
        <meshStandardMaterial color="#54463a" />
      </mesh>
      {/* Legs */}
      {[[-0.5, -0.13, -0.25], [0.5, -0.13, -0.25], [-0.5, -0.13, 0.25], [0.5, -0.13, 0.25]].map(
        ([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={[0.06, 0.26, 0.06]} />
            <meshStandardMaterial color="#1c1c1c" />
          </mesh>
        )
      )}
      {/* Open textbook (studying) */}
      {hasMember && isStudying && (
        <group position={[0, 0.04, -0.05]}>
          <mesh position={[-0.14, 0, 0]} rotation={[0, 0, 0.05]}>
            <boxGeometry args={[0.26, 0.015, 0.34]} />
            <meshStandardMaterial color="#f0e8d8" />
          </mesh>
          <mesh position={[0.14, 0, 0]} rotation={[0, 0, -0.05]}>
            <boxGeometry args={[0.26, 0.015, 0.34]} />
            <meshStandardMaterial color="#ede5d3" />
          </mesh>
          <mesh position={[0, -0.005, 0]}>
            <boxGeometry args={[0.03, 0.025, 0.36]} />
            <meshStandardMaterial color="#8b4513" />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ── Chair ── */
function Chair() {
  return (
    <group position={[0, 0.2, -0.5]}>
      {/* Seat */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 0.06, 0.5]} />
        <meshStandardMaterial color="#1c1c1c" />
      </mesh>
      {/* Back */}
      <mesh position={[0, 0.25, -0.22]}>
        <boxGeometry args={[0.6, 0.44, 0.06]} />
        <meshStandardMaterial color="#161616" />
      </mesh>
      {/* Legs */}
      {[[-0.25, -0.13, -0.18], [0.25, -0.13, -0.18], [-0.25, -0.13, 0.18], [0.25, -0.13, 0.18]].map(
        ([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={[0.05, 0.26, 0.05]} />
            <meshStandardMaterial color="#181818" />
          </mesh>
        )
      )}
    </group>
  );
}

/* ── Name Label (HTML overlay) ── */
function NameLabel({
  name,
  isCurrentUser,
}: {
  name: string;
  isCurrentUser: boolean;
}) {
  return (
    <Html position={[0, 1.4, 0]} center sprite>
      <div
        style={{
          color: isCurrentUser ? 'rgb(180,210,190)' : 'rgba(255,255,255,0.55)',
          fontSize: '11px',
          fontWeight: isCurrentUser ? 600 : 400,
          fontFamily: "'Noto Sans JP', sans-serif",
          whiteSpace: 'nowrap',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {name.length > 8 ? name.slice(0, 7) + '…' : name}
      </div>
    </Html>
  );
}

/* ── Exit Door (right edge wall) ── */
function ExitDoor() {
  return (
    <group position={[DOOR_POSITION[0], 0, DOOR_POSITION[2]]} scale={[TORII_SCALE, TORII_SCALE, TORII_SCALE]}>
      {/* Main posts */}
      <mesh position={[0.02, 0.95, -0.65]}>
        <boxGeometry args={[0.18, 1.9, 0.18]} />
        <meshStandardMaterial color="#b02a2a" />
      </mesh>
      <mesh position={[0.02, 0.95, 0.65]}>
        <boxGeometry args={[0.18, 1.9, 0.18]} />
        <meshStandardMaterial color="#b02a2a" />
      </mesh>

      {/* Kasagi (top beam) */}
      <mesh position={[0.08, 1.98, 0]}>
        <boxGeometry args={[0.34, 0.1, 1.72]} />
        <meshStandardMaterial color="#b02a2a" />
      </mesh>
      {/* Shimaki (secondary beam) */}
      <mesh position={[0.02, 1.82, 0]}>
        <boxGeometry args={[0.24, 0.09, 1.42]} />
        <meshStandardMaterial color="#8f1f1f" />
      </mesh>

      {/* Nuki (lower tie beam) */}
      <mesh position={[0.02, 1.2, 0]}>
        <boxGeometry args={[0.2, 0.08, 1.28]} />
        <meshStandardMaterial color="#7b1616" />
      </mesh>

      {/* Gakuzuka (center plaque) */}
      <mesh position={[0.16, 1.66, 0]}>
        <boxGeometry args={[0.05, 0.3, 0.34]} />
        <meshStandardMaterial color="#2a2320" />
      </mesh>
      <mesh position={[0.175, 1.66, 0]}>
        <boxGeometry args={[0.008, 0.24, 0.24]} />
        <meshStandardMaterial color="#d2b15b" emissive="#6a5520" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

/* ── Exiting Character (animated) ── */
function ExitingCharacter({
  exitingMember,
  onComplete,
}: {
  exitingMember: ExitingMember;
  onComplete: () => void;
}) {
  const { scene } = useGLTF(exitingMember.modelPath);
  const groupRef = useRef<THREE.Group>(null);
  const legLeftRef = useRef<THREE.Object3D | null>(null);
  const legRightRef = useRef<THREE.Object3D | null>(null);
  const completedRef = useRef(false);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }
    });
    return c;
  }, [scene]);

  // Cache leg references
  useEffect(() => {
    cloned.traverse((child) => {
      if (child.name === 'leg-left') legLeftRef.current = child;
      if (child.name === 'leg-right') legRightRef.current = child;
      // Start seated
      if (child.name === 'leg-left' || child.name === 'leg-right') {
        child.rotation.x = -Math.PI / 2;
      }
    });
  }, [cloned]);

  // Station position in world space
  const waypoints = useMemo(
    () => buildStationToDoorPath(exitingMember.slotIndex),
    [exitingMember.slotIndex]
  );
  const startPos = waypoints[0];

  // Compute total path length for constant-speed walking
  const { segLengths, totalLength } = useMemo(() => {
    const lengths: number[] = [];
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const d = waypoints[i].distanceTo(waypoints[i - 1]);
      lengths.push(d);
      total += d;
    }
    return { segLengths: lengths, totalLength: total };
  }, [waypoints]);

  useFrame(() => {
    if (!groupRef.current || completedRef.current) return;

    const elapsed = Date.now() - exitingMember.startTime;
    const group = groupRef.current;

    if (elapsed >= TOTAL_EXIT_DURATION) {
      completedRef.current = true;
      onComplete();
      return;
    }

    const STAND_END = 1500;

    if (elapsed < STAND_END) {
      // Phase 1: Stand up
      const t = easeInOutCubic(elapsed / STAND_END);
      const legAngle = -Math.PI / 2 * (1 - t);
      if (legLeftRef.current) legLeftRef.current.rotation.x = legAngle;
      if (legRightRef.current) legRightRef.current.rotation.x = legAngle;
      group.position.set(startPos.x, t * 0.15, startPos.z);
    } else {
      // Phase 2: Walk along waypoints at constant speed
      const walkT = (elapsed - STAND_END) / (TOTAL_EXIT_DURATION - STAND_END);
      const targetDist = walkT * totalLength;

      // Find which segment we're on
      let accumulated = 0;
      let posX = startPos.x;
      let posZ = startPos.z;
      let dirX = 0;
      let dirZ = 0;
      for (let i = 0; i < segLengths.length; i++) {
        if (accumulated + segLengths[i] >= targetDist) {
          const segT = (targetDist - accumulated) / segLengths[i];
          const from = waypoints[i];
          const to = waypoints[i + 1];
          posX = from.x + (to.x - from.x) * segT;
          posZ = from.z + (to.z - from.z) * segT;
          dirX = to.x - from.x;
          dirZ = to.z - from.z;
          break;
        }
        accumulated += segLengths[i];
        // Past all segments — clamp to end
        if (i === segLengths.length - 1) {
          const last = waypoints[waypoints.length - 1];
          posX = last.x;
          posZ = last.z;
          const prev = waypoints[waypoints.length - 2];
          dirX = last.x - prev.x;
          dirZ = last.z - prev.z;
        }
      }

      group.position.set(posX, 0.15, posZ);
      // Face movement direction
      if (dirX !== 0 || dirZ !== 0) {
        group.rotation.y = Math.atan2(dirX, dirZ);
      }
      // Walking leg cycle
      const walkCycle = Math.sin((elapsed - STAND_END) * 0.012) * 0.5;
      if (legLeftRef.current) legLeftRef.current.rotation.x = walkCycle;
      if (legRightRef.current) legRightRef.current.rotation.x = -walkCycle;
    }
  });

  return (
    <group ref={groupRef} position={[startPos.x, 0, startPos.z]}>
      <group scale={0.5}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

/* ── Entering Character (animated) ── */
function EnteringCharacter({
  enteringMember,
  onComplete,
}: {
  enteringMember: EnteringMember;
  onComplete: () => void;
}) {
  const { scene } = useGLTF(enteringMember.modelPath);
  const groupRef = useRef<THREE.Group>(null);
  const legLeftRef = useRef<THREE.Object3D | null>(null);
  const legRightRef = useRef<THREE.Object3D | null>(null);
  const torsoRef = useRef<THREE.Object3D | null>(null);
  const headRef = useRef<THREE.Object3D | null>(null);
  const armLeftRef = useRef<THREE.Object3D | null>(null);
  const armRightRef = useRef<THREE.Object3D | null>(null);
  const completedRef = useRef(false);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }
    });
    return c;
  }, [scene]);

  useEffect(() => {
    cloned.traverse((child) => {
      if (child.name === 'leg-left') legLeftRef.current = child;
      if (child.name === 'leg-right') legRightRef.current = child;
      if (child.name === 'torso') torsoRef.current = child;
      if (child.name === 'head') headRef.current = child;
      if (child.name === 'arm-left') armLeftRef.current = child;
      if (child.name === 'arm-right') armRightRef.current = child;
    });
  }, [cloned]);

  const route = useMemo(() => {
    const stationToDoor = buildStationToDoorPath(enteringMember.slotIndex);
    return [...stationToDoor].reverse();
  }, [enteringMember.slotIndex]);
  const seatedPos = route[route.length - 1];

  const {
    toBowPath,
    toBowSegLengths,
    toBowTotalLength,
    afterBowPath,
    afterBowSegLengths,
    afterBowTotalLength,
    bowFacing,
    bowPoint,
  } = useMemo(() => {
    const pathToDoor =
      route.length >= 2 ? [route[0], route[1]] : [route[0], route[0]];
    const pathInside = route.length >= 2 ? route.slice(1) : [route[0], route[0]];

    const calcMetrics = (path: THREE.Vector3[]) => {
      const lengths: number[] = [];
      let total = 0;
      for (let i = 1; i < path.length; i++) {
        const d = path[i].distanceTo(path[i - 1]);
        lengths.push(d);
        total += d;
      }
      return { lengths, total };
    };

    const outsidePoint = pathToDoor[0] ?? new THREE.Vector3();
    const doorPoint = pathToDoor[1] ?? outsidePoint;
    // 鳥居より手前（外側）で一礼する
    const bowPointVec = new THREE.Vector3(
      outsidePoint.x + (doorPoint.x - outsidePoint.x) * 0.58,
      0,
      outsidePoint.z + (doorPoint.z - outsidePoint.z) * 0.58
    );
    const toRoomX = doorPoint.x - bowPointVec.x;
    const toRoomZ = doorPoint.z - bowPointVec.z;
    const facing =
      toRoomX !== 0 || toRoomZ !== 0 ? Math.atan2(toRoomX, toRoomZ) : 0;

    const pathToBow = [outsidePoint.clone(), bowPointVec.clone()];
    const pathAfterBow = [bowPointVec.clone(), ...pathInside.map((p) => p.clone())];
    const toBow = calcMetrics(pathToBow);
    const afterBow = calcMetrics(pathAfterBow);

    return {
      toBowPath: pathToBow,
      toBowSegLengths: toBow.lengths,
      toBowTotalLength: toBow.total,
      afterBowPath: pathAfterBow,
      afterBowSegLengths: afterBow.lengths,
      afterBowTotalLength: afterBow.total,
      bowFacing: facing,
      bowPoint: bowPointVec,
    };
  }, [route]);

  const samplePath = (
    path: THREE.Vector3[],
    segLengths: number[],
    targetDist: number
  ) => {
    let accumulated = 0;
    let posX = path[0].x;
    let posZ = path[0].z;
    let dirX = 0;
    let dirZ = 0;

    for (let i = 0; i < segLengths.length; i++) {
      if (accumulated + segLengths[i] >= targetDist) {
        const segT =
          segLengths[i] === 0 ? 1 : (targetDist - accumulated) / segLengths[i];
        const from = path[i];
        const to = path[i + 1];
        posX = from.x + (to.x - from.x) * segT;
        posZ = from.z + (to.z - from.z) * segT;
        dirX = to.x - from.x;
        dirZ = to.z - from.z;
        return { posX, posZ, dirX, dirZ };
      }
      accumulated += segLengths[i];
    }

    const last = path[path.length - 1];
    const prev = path[path.length - 2] ?? last;
    return {
      posX: last.x,
      posZ: last.z,
      dirX: last.x - prev.x,
      dirZ: last.z - prev.z,
    };
  };

  const resetUpperBodyPose = () => {
    if (torsoRef.current) torsoRef.current.rotation.x = 0;
    if (headRef.current) headRef.current.rotation.x = 0;
    if (armLeftRef.current) armLeftRef.current.rotation.x = 0;
    if (armRightRef.current) armRightRef.current.rotation.x = 0;
  };

  useFrame(() => {
    if (!groupRef.current || completedRef.current) return;

    const elapsed = Date.now() - enteringMember.startTime;
    const group = groupRef.current;

    if (elapsed >= TOTAL_ENTER_DURATION) {
      completedRef.current = true;
      onComplete();
      return;
    }

    const SIT_DURATION = 900;
    const BOW_DURATION = 1100;
    const walkBudget = Math.max(TOTAL_ENTER_DURATION - SIT_DURATION - BOW_DURATION, 0);
    const moveTotalLength = toBowTotalLength + afterBowTotalLength;
    const WALK_TO_BOW_DURATION =
      walkBudget === 0 || moveTotalLength === 0
        ? 0
        : Math.round((walkBudget * toBowTotalLength) / moveTotalLength);
    const WALK_AFTER_BOW_DURATION = Math.max(walkBudget - WALK_TO_BOW_DURATION, 0);
    const BOW_START = WALK_TO_BOW_DURATION;
    const WALK_AFTER_BOW_START = BOW_START + BOW_DURATION;
    const SIT_START = WALK_AFTER_BOW_START + WALK_AFTER_BOW_DURATION;

    if (elapsed < WALK_TO_BOW_DURATION) {
      const walkT =
        WALK_TO_BOW_DURATION === 0 ? 1 : elapsed / WALK_TO_BOW_DURATION;
      const targetDist = walkT * toBowTotalLength;
      const { posX, posZ, dirX, dirZ } = samplePath(
        toBowPath,
        toBowSegLengths,
        targetDist
      );
      group.position.set(posX, 0.15, posZ);
      if (dirX !== 0 || dirZ !== 0) {
        group.rotation.y = Math.atan2(dirX, dirZ);
      }
      resetUpperBodyPose();
      const walkCycle = Math.sin(elapsed * ENTER_WALK_CYCLE_SPEED) * 0.5;
      if (legLeftRef.current) legLeftRef.current.rotation.x = walkCycle;
      if (legRightRef.current) legRightRef.current.rotation.x = -walkCycle;
      return;
    }

    if (elapsed < WALK_AFTER_BOW_START) {
      const bowT = (elapsed - BOW_START) / BOW_DURATION;
      const downRatio = 0.45;
      const holdRatio = 0.25;
      let bowWave = 0;
      if (bowT < downRatio) {
        bowWave = easeInOutCubic(bowT / downRatio);
      } else if (bowT < downRatio + holdRatio) {
        bowWave = 1;
      } else {
        bowWave = 1 - easeInOutCubic((bowT - downRatio - holdRatio) / (1 - downRatio - holdRatio));
      }

      group.position.set(
        bowPoint.x,
        0.15 - bowWave * 0.03,
        bowPoint.z
      );
      group.rotation.y = bowFacing;

      // 「胴体を折る」お辞儀
      const torsoBend = bowWave * 0.72;
      const kneeBend = bowWave * 0.08;
      // +X が前傾方向なので、正方向に倒す
      if (torsoRef.current) torsoRef.current.rotation.x = torsoBend;
      // 首だけ軽く戻して、過度な前のめりを抑える
      if (headRef.current) headRef.current.rotation.x = -torsoBend * 0.2;
      if (armLeftRef.current) armLeftRef.current.rotation.x = -torsoBend * 0.05;
      if (armRightRef.current) armRightRef.current.rotation.x = -torsoBend * 0.05;
      if (legLeftRef.current) legLeftRef.current.rotation.x = -kneeBend;
      if (legRightRef.current) legRightRef.current.rotation.x = -kneeBend;
      return;
    }

    if (elapsed < SIT_START) {
      const walkAfterBowT =
        WALK_AFTER_BOW_DURATION === 0
          ? 1
          : (elapsed - WALK_AFTER_BOW_START) / WALK_AFTER_BOW_DURATION;
      const targetDist = walkAfterBowT * afterBowTotalLength;
      const { posX, posZ, dirX, dirZ } = samplePath(
        afterBowPath,
        afterBowSegLengths,
        targetDist
      );
      group.position.set(posX, 0.15, posZ);
      if (dirX !== 0 || dirZ !== 0) {
        group.rotation.y = Math.atan2(dirX, dirZ);
      }
      resetUpperBodyPose();
      const walkCycle = Math.sin(elapsed * ENTER_WALK_CYCLE_SPEED) * 0.5;
      if (legLeftRef.current) legLeftRef.current.rotation.x = walkCycle;
      if (legRightRef.current) legRightRef.current.rotation.x = -walkCycle;
      return;
    }

    const sitT = easeInOutCubic((elapsed - SIT_START) / SIT_DURATION);
    group.position.set(seatedPos.x, 0.15 * (1 - sitT), seatedPos.z);
    group.rotation.y = 0;
    resetUpperBodyPose();
    const legAngle = -Math.PI / 2 * sitT;
    if (legLeftRef.current) legLeftRef.current.rotation.x = legAngle;
    if (legRightRef.current) legRightRef.current.rotation.x = legAngle;
  });

  return (
    <group ref={groupRef} position={[route[0].x, 0.15, route[0].z]}>
      <group scale={0.5}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

/* ── Station (desk + chair + character) ── */
function Station({
  member,
  index,
  currentUserId,
  position,
}: {
  member: RoomMember | null;
  index: number;
  currentUserId: string;
  position: [number, number];
}) {
  const modelPath = CHARACTER_MODELS[index % CHARACTER_MODELS.length];
  const isStudying = member?.status === 'studying';

  return (
    <group position={[position[0], 0, position[1]]}>
      <Chair />
      {member && (
        <>
          <group position={[0, -0.15, -0.45]}>
            <CharacterModel modelPath={modelPath} isStudying={isStudying ?? false} />
          </group>
          <NameLabel
            name={member.display_name}
            isCurrentUser={member.user_id === currentUserId}
          />
        </>
      )}
      <Desk hasMember={!!member} isStudying={isStudying === true} />
    </group>
  );
}

/* ── Camera Setup ── */
function CameraSetup() {
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();

  // Responsive zoom: scale down on narrow screens
  const zoom = useMemo(() => {
    const minDim = Math.min(size.width, size.height);
    if (minDim < 400) return 50;
    if (minDim < 600) return 60;
    return 80;
  }, [size.width, size.height]);

  useFrame(() => {
    if (cameraRef.current) {
      cameraRef.current.lookAt(0, 0.5, 0);
      cameraRef.current.zoom = zoom;
      cameraRef.current.updateProjectionMatrix();
    }
  });

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      zoom={zoom}
      position={[10, 10, 10]}
      near={0.1}
      far={100}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Exported Component
   ═══════════════════════════════════════════════════════════ */

export function IsometricRoom({ members, currentUserId, maxSlots }: IsometricRoomProps) {
  // Stable user_id → slot mapping (persists across re-renders)
  const slotMapRef = useRef<Map<string, number>>(new Map());
  const prevSlotMapRef = useRef<Map<string, number>>(new Map());
  const lastSeenSlotRef = useRef<Map<string, number>>(new Map());
  const prevMembersMapRef = useRef<Map<string, RoomMember>>(new Map());
  const [exitingMembers, setExitingMembers] = useState<Map<string, ExitingMember>>(new Map());
  const [enteringMembers, setEnteringMembers] = useState<Map<string, EnteringMember>>(new Map());
  const prevUserIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedPresenceRef = useRef(false);

  // Build stable slot assignments: each user keeps their first-assigned slot
  const stableSlots = useMemo(() => {
    const slotMap = slotMapRef.current;
    const numSlots = Math.min(maxSlots, 4);

    // Snapshot current slotMap before mutation (for exit detection)
    prevSlotMapRef.current = new Map(slotMap);

    // Collect active member user_ids
    const activeMembers = members.filter((m): m is RoomMember => m !== null);
    const activeIds = new Set(activeMembers.map((m) => m.user_id));

    // Remove users no longer present from slotMap
    for (const [uid] of slotMap) {
      if (!activeIds.has(uid)) {
        slotMap.delete(uid);
      }
    }

    // Assign slots to new members using first available slot
    for (const m of activeMembers) {
      if (!slotMap.has(m.user_id)) {
        const usedSlots = new Set(slotMap.values());
        for (let s = 0; s < numSlots; s++) {
          if (!usedSlots.has(s)) {
            slotMap.set(m.user_id, s);
            break;
          }
        }
      }
    }

    // Build slots array
    const slots: { idx: number; member: RoomMember | null; position: [number, number] }[] = [];
    for (let i = 0; i < numSlots; i++) {
      slots.push({
        idx: i,
        member: null,
        position: (GRID[i] ?? [0, 0]) as [number, number],
      });
    }
    for (const m of activeMembers) {
      const slot = slotMap.get(m.user_id);
      if (slot !== undefined && slot < numSlots) {
        slots[slot].member = m;
        // 退出検知時に参照できるよう、最新のスロットを保持しておく
        lastSeenSlotRef.current.set(m.user_id, slot);
      }
    }

    return slots;
  }, [members, maxSlots]);

  // Detect exits by comparing user_id sets
  useLayoutEffect(() => {
    const activeMembers = members.filter((m): m is RoomMember => m !== null);
    const activeMemberMap = new Map<string, RoomMember>();
    for (const m of activeMembers) {
      activeMemberMap.set(m.user_id, m);
    }
    const currentIds = new Set(activeMembers.map((m) => m.user_id));

    // 初回同期では入室アニメを発火しない。
    // これにより「新規参加者本人の画面」では参加直後の入室アニメを表示しない。
    if (!hasHydratedPresenceRef.current) {
      if (!currentUserId || currentIds.has(currentUserId)) {
        hasHydratedPresenceRef.current = true;
      }
      prevUserIdsRef.current = currentIds;
      prevMembersMapRef.current = activeMemberMap;
      return;
    }

    const prevIds = prevUserIdsRef.current;

    const newExiting = new Map(exitingMembers);
    const newEntering = new Map(enteringMembers);
    let changedExiting = false;
    let changedEntering = false;

    // Users who left
    for (const uid of prevIds) {
      if (!currentIds.has(uid) && !newExiting.has(uid)) {
        if (newEntering.has(uid)) {
          newEntering.delete(uid);
          changedEntering = true;
          continue;
        }
        // Use the snapshot taken before cleanup
        const slotIndex =
          prevSlotMapRef.current.get(uid) ??
          lastSeenSlotRef.current.get(uid);
        const prevMember = prevMembersMapRef.current.get(uid);
        if (slotIndex !== undefined) {
          newExiting.set(uid, {
            member: prevMember ?? { user_id: uid, display_name: '', status: 'away', studying_minutes: 0 },
            slotIndex,
            startTime: Date.now(),
            modelPath: CHARACTER_MODELS[slotIndex % CHARACTER_MODELS.length],
          });
          changedExiting = true;
        }
      }
    }

    // Users who re-joined — cancel exit animation
    for (const uid of currentIds) {
      if (newExiting.has(uid)) {
        newExiting.delete(uid);
        changedExiting = true;
      }
    }

    // Users who joined — play enter animation from door to slot
    for (const uid of currentIds) {
      if (!prevIds.has(uid) && !newEntering.has(uid)) {
        const slotIndex = slotMapRef.current.get(uid);
        const member = activeMemberMap.get(uid);
        if (slotIndex !== undefined && member) {
          newEntering.set(uid, {
            member,
            slotIndex,
            startTime: Date.now(),
            modelPath: CHARACTER_MODELS[slotIndex % CHARACTER_MODELS.length],
          });
          changedEntering = true;
        }
      }
    }

    // If user disappeared while entering, clear stale animation
    for (const uid of newEntering.keys()) {
      if (!currentIds.has(uid)) {
        newEntering.delete(uid);
        changedEntering = true;
      }
    }

    if (changedExiting) {
      setExitingMembers(newExiting);
    }
    if (changedEntering) {
      setEnteringMembers(newEntering);
    }

    prevUserIdsRef.current = currentIds;
    // Store current members for next diff
    prevMembersMapRef.current = activeMemberMap;
  }, [members, enteringMembers, exitingMembers, currentUserId]);

  const handleExitComplete = useCallback((userId: string) => {
    setExitingMembers((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  const handleEnterComplete = useCallback((userId: string) => {
    setEnteringMembers((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  const enteringUserIds = useMemo(
    () => new Set(Array.from(enteringMembers.keys())),
    [enteringMembers]
  );

  return (
    <div className="w-full h-full select-none">
      <Canvas
        shadows
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <CameraSetup />

        {/* Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[5, 8, 3]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />

        {/* Floor */}
        <group position={[0, -0.01, 0]}>
          {/* Fill */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[8, 6]} />
            <meshBasicMaterial color="#d4956a" transparent opacity={0.06} />
          </mesh>
          {/* Border edges (4 lines) */}
          {[
            { pos: [0, 0.001, -3] as const, args: [8, 0.03] as const },
            { pos: [0, 0.001, 3] as const, args: [8, 0.03] as const },
            { pos: [-4, 0.001, 0] as const, args: [0.03, 6] as const },
            { pos: [4, 0.001, 0] as const, args: [0.03, 6] as const },
          ].map(({ pos, args }, i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], pos[1], pos[2]]}>
              <planeGeometry args={[args[0], args[1]]} />
              <meshBasicMaterial color="#e8854a" transparent opacity={0.5} />
            </mesh>
          ))}
          {/* Corner glow dots */}
          {[[-4, -3], [4, -3], [-4, 3], [4, 3]].map(([x, z], i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.002, z]}>
              <circleGeometry args={[0.08, 16]} />
              <meshBasicMaterial color="#e8854a" transparent opacity={0.8} />
            </mesh>
          ))}
        </group>

        {/* Scene */}
        <Suspense fallback={null}>
          {stableSlots.map(({ idx, member, position }) => {
            const hiddenDuringEnter =
              member !== null && enteringUserIds.has(member.user_id);
            return (
              <Station
                key={idx}
                member={hiddenDuringEnter ? null : member}
                index={idx}
                currentUserId={currentUserId}
                position={position}
              />
            );
          })}
          <ExitDoor />
          {Array.from(enteringMembers.entries()).map(([userId, em]) => (
            <EnteringCharacter
              key={userId}
              enteringMember={em}
              onComplete={() => handleEnterComplete(userId)}
            />
          ))}
          {Array.from(exitingMembers.entries()).map(([userId, em]) => (
            <ExitingCharacter
              key={userId}
              exitingMember={em}
              onComplete={() => handleExitComplete(userId)}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}
